/**
 * Where a perf report comes from: a file the consumer already has, one run of their own Vitest with
 * the shipped reporter attached, or the command this repository actually measures its suite with.
 *
 * The bare run is `process.execPath node_modules/vitest/vitest.mjs` rather than `npx vitest` or the
 * `.bin` shim — `npx` is a second install path that can resolve a different version, and the shim
 * is a `.cmd` on Windows. The reporter is passed as a plain filesystem path, so it needs no export
 * subpath of its own; `--reporter=default` is kept alongside it, or the run would look hung. On
 * Vitest 5 `--experimental.diagnostics=false` goes with them: its own after-run hints would repeat
 * the advice `perf` prints next.
 *
 * `--command` exists because the bare run is not always this repository's suite — see
 * `checks/perf-harness`. There the command owns the configuration, so the reporter cannot be pushed
 * in from here; its path arrives in the environment and the consumer's config attaches it.
 */
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { bareRunWouldMeasureSomethingElse } from './checks/perf-harness';
import { BARE_RUN_DOCS, NOTHING_TO_READ_DOCS } from './docs';
import { isDirectory, parseJsonc, pathExists, readTextFile, removeFile, toPosix } from './fs-scan';
import type { PerfRun } from './perf-data';
import { PERF_ISOLATE_ENV, PERF_OUTPUT_ENV, PERF_PROFILE_ENV, PERF_REPORTER_ENV, parsePerfRun, whyNotAPerfRun } from './perf-data';
import { measuredFiles } from './perf-gate';
import { describeMerge, mergeRuns, readRuns, resolveReportPaths } from './perf-merge';
import type { ProfileSummary } from './perf-profile';
import { takeProfiles } from './perf-profiler';
import type { Profile } from './profile';
import { isRecord } from './profile';
import { ownPackageRoot } from './self';

export interface SpawnOutcome {
  readonly status: number;
}

export interface SpawnRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  /** `--command`: the string is a shell line, not a program and its arguments. */
  readonly shell: boolean;
}

export type Spawn = (request: SpawnRequest) => SpawnOutcome;

function spawnWith(stdout: number | 'inherit'): Spawn {
  return (request) => {
    const result = spawnSync(request.command, [...request.args], {
      cwd: request.cwd,
      env: { ...process.env, ...request.env },
      stdio: ['inherit', stdout, 'inherit'],
      shell: request.shell,
    });

    return { status: result.status ?? 1 };
  };
}

/** The real one. Output is inherited: the consumer watches their own suite run. */
export const spawnProcess: Spawn = spawnWith('inherit');

/** For `--format json`: the suite still prints, on stderr, so stdout carries one JSON document and nothing else. */
export const spawnToStderr: Spawn = spawnWith(2);

export interface PerfRunOptions {
  readonly cwd: string;
  /** Read once by the caller and shared, so nothing here scans the repository a second time. */
  readonly profile: Profile;
  /** `--json`: read this report instead of running anything. */
  readonly json: string | undefined;
  /** `--out`: keep the report at this path instead of deleting it. */
  readonly out: string | undefined;
  /** `--command`: the shell line that runs this repository's suite. */
  readonly command: string | undefined;
  /** Passed through to Vitest as its file filter, or substituted into `{paths}` of a command. */
  readonly paths: readonly string[];
  /** Where the run leaves a CPU profile per spec file. Only the confirmation pass asks for one. */
  readonly profileDir?: string;
  /** `--profile-dir`: keep each profile the confirmation pass records here, as a `.cpuprofile`. */
  readonly keepProfiles?: string;
  /** `--ab-isolate`: run every project with this `isolate`, whatever its config says. */
  readonly isolate?: boolean;
  /** A bare run under this Vitest config, relative to `cwd`: the one a handed-over report recorded. */
  readonly config?: string;
}

export interface PerfMeasured {
  readonly ok: true;
  readonly run: PerfRun;
  /** What was read, when that is worth a line: several reports merged, or one of them unreadable. */
  readonly note?: string;
  /** The suite itself exited non-zero. The timings are still real, so the report is still printed. */
  readonly runFailed: boolean;
  /** What each CPU profile says, by the absolute path of its spec file, when the run was asked for them. */
  readonly profiles?: ReadonlyMap<string, ProfileSummary>;
  /** `--command`, which says what ran the suite even when the report was read from `--json`. */
  readonly command?: string;
  /** Milliseconds from starting the process to its exit, when this command ran it: what Vitest's own clock cannot see. */
  readonly endToEnd?: number;
}

export interface PerfUnavailable {
  readonly ok: false;
  readonly error: string;
}

export type PerfSource = PerfMeasured | PerfUnavailable;

/** Re-measures a subset of the suite, for the gate's confirmation pass. */
export type Remeasure = (paths: readonly string[]) => PerfSource;

/**
 * `{paths}` — the files of a confirmation pass — and `{paths:<prefix>}` for a harness that wants
 * a flag of its own in front of each one (`npm test -- {paths:--include=}`). Without the token a
 * command cannot be narrowed, and the gate says so rather than re-running the whole suite.
 */
const PATHS_TOKEN = /{paths(?::([^}]*))?}/g;

/** `dist/perf-reporter.js` inside this package, or `undefined` when the install has no build. */
export function reporterPath(root: string | undefined): string | undefined {
  if (root === undefined) {
    return undefined;
  }

  const built = join(root, 'dist', 'perf-reporter.js');

  return pathExists(built) ? built : undefined;
}

export function commandTakesPaths(command: string): boolean {
  return new RegExp(PATHS_TOKEN.source).test(command);
}

/**
 * One path, quoted for the shell `spawnSync` will use.
 *
 * Two shells, two rules, and getting the second one wrong is invisible rather than loud: `cmd.exe`
 * treats `'` as an ordinary character, so a POSIX-quoted path reaches the harness with the quotes
 * still on it, matches no file, and the confirmation pass comes back having measured nothing —
 * which the gate reports as "could not confirm" rather than as a broken command.
 */
export function shellQuote(path: string, platform: string = process.platform): string {
  if (platform === 'win32') {
    return `"${path.replace(/"/g, '""')}"`;
  }

  return `'${path.replace(/'/g, "'\\''")}'`;
}

export function withPaths(command: string, paths: readonly string[]): string {
  return command.replace(PATHS_TOKEN, (_token, prefix: string | undefined) =>
    paths.map((path) => `${prefix ?? ''}${shellQuote(path)}`).join(' '),
  );
}

function runEnv(options: PerfRunOptions, target: string, reporter: string): Record<string, string> {
  return {
    [PERF_OUTPUT_ENV]: target,
    [PERF_REPORTER_ENV]: reporter,
    ...(options.profileDir === undefined ? {} : { [PERF_PROFILE_ENV]: options.profileDir }),
    ...(options.isolate === undefined ? {} : { [PERF_ISOLATE_ENV]: String(options.isolate) }),
  };
}

/** Runs the process and times it from outside, which is the only clock that sees a build before Vitest starts. */
function timed(spawn: Spawn, request: SpawnRequest): { readonly outcome: SpawnOutcome; readonly ms: number } {
  const started = performance.now();
  const outcome = spawn(request);

  return { outcome, ms: performance.now() - started };
}

function failed(error: string): PerfUnavailable {
  return { ok: false, error };
}

/**
 * One report, or every report a sharded pipeline wrote.
 *
 * The plural is not a convenience: a rule that judges a file against the median of the run it is in
 * judges it against a quarter of the evidence when the suite was sharded four ways, and every shard
 * of a GitLab pipeline writes into a different build directory, so the four reports do not even
 * agree on where the repository is. `mergeRuns` settles both — see `perf-merge.ts`.
 */
function fromFile(value: string, cwd: string): PerfSource {
  const paths = resolveReportPaths(value, cwd);
  const { inputs, failed: unreadable } = readRuns(paths);

  if (inputs.length === 0) {
    return failed(unreadableReport(value, unreadable, cwd));
  }

  const merged = mergeRuns(inputs);
  const note = inputs.length === 1 && unreadable.length === 0 ? undefined : describeMerge(merged, paths.length);

  // A handed-over report is the one shape with no exit code to read, which is why the reporter
  // records the count: a red suite is measured until its timeouts, and the gate must refuse it.
  return { ok: true, run: merged.run, runFailed: merged.run.failed > 0, ...(note === undefined ? {} : { note }) };
}

function unreadableReport(value: string, unreadable: readonly string[], cwd: string): string {
  if (unreadable.length === 0) {
    return `--json ${value} matches no report file. Point it at the file \`perf --out\` or the perf reporter wrote.\nDocs: ${NOTHING_TO_READ_DOCS}`;
  }

  const reasons = unreadable.map((path) => `${relative(cwd, path)} ${whyNotAPerfRun(readTextFile(path))}`);
  const [first] = reasons;

  return [
    reasons.length === 1 ? `Cannot read the perf report: ${String(first)}.` : `Cannot read any of the ${reasons.length} perf reports:`,
    ...(reasons.length === 1 ? [] : reasons.map((reason) => `  ${reason}`)),
    'Point --json at the file `perf --out` or the perf reporter wrote.',
    `Docs: ${NOTHING_TO_READ_DOCS}`,
  ].join('\n');
}

/** The report a run left behind, or the reason there is nothing to read. Shared by both runners. */
function collect(
  target: string,
  options: PerfRunOptions,
  spawned: { readonly outcome: SpawnOutcome; readonly ms: number },
  missing: (status: number) => string,
): PerfSource {
  const text = readTextFile(target);
  const profiles = options.profileDir === undefined ? undefined : takeProfiles(options.profileDir, options.cwd, options.keepProfiles);

  if (options.out === undefined) {
    removeFile(target);
  }

  const run = text === undefined ? undefined : parsePerfRun(text);

  if (run === undefined) {
    return failed(missing(spawned.outcome.status));
  }

  return {
    ok: true,
    run,
    runFailed: spawned.outcome.status !== 0,
    endToEnd: spawned.ms,
    ...(profiles === undefined ? {} : { profiles }),
  };
}

/** The file name `--out` gets when it names a directory. */
export const OUT_FILE_NAME = 'perf-report.json';

/**
 * `--out`, absolute. The reporter writes it from the spawned process, which a harness may start in
 * another directory, and this process reads it back, so a relative path would name two files.
 */
export function outPath(out: string, cwd: string): string {
  const path = resolve(cwd, out);

  return isDirectory(path) || /[/\\]$/.test(out) ? join(path, OUT_FILE_NAME) : path;
}

/**
 * Where the report goes. The process id is in the name because two `perf` runs sharing one report
 * path erase each other's work, and the second one then reports a command that wrote nothing.
 */
function targetPath(options: PerfRunOptions): string {
  return options.out === undefined ? defaultTarget(options) : outPath(options.out, options.cwd);
}

function defaultTarget(options: PerfRunOptions): string {
  return join(options.cwd, 'node_modules', '.cache', 'vitest-auto-spy', `perf-${process.pid}.json`);
}

/** The major version of the Vitest a bare run starts, read from the manifest beside its entry. */
function vitestMajor(cwd: string): number | undefined {
  const manifest = parseJsonc(readTextFile(join(cwd, 'node_modules', 'vitest', 'package.json')) ?? '');
  const match = isRecord(manifest) && typeof manifest['version'] === 'string' ? /^(\d+)\./.exec(manifest['version']) : null;

  return match === null ? undefined : Number(match[1]);
}

/** Flags only a Vitest of this major understands; an older one would reject them as unknown. */
function versionFlags(cwd: string): string[] {
  return (vitestMajor(cwd) ?? 0) >= 5 ? ['--experimental.diagnostics=false'] : [];
}

/**
 * `--config` for a run under a recorded config. Coverage is switched off: its thresholds fail a run of
 * a few files, and a body the gate judges should not pay for instrumentation it cannot fix.
 */
function configArgs(config: string | undefined): string[] {
  return config === undefined ? [] : ['--config', config, '--coverage.enabled=false'];
}

function fromRun(options: PerfRunOptions, spawn: Spawn, packageRoot: string | undefined): PerfSource {
  const entry = join(options.cwd, 'node_modules', 'vitest', 'vitest.mjs');
  const reporter = reporterPath(packageRoot);
  const mismatch = options.config === undefined ? bareRunWouldMeasureSomethingElse(options.profile) : undefined;

  if (mismatch !== undefined) {
    return failed(mismatch);
  }

  if (options.config !== undefined && !pathExists(resolve(options.cwd, options.config))) {
    return failed(
      `The report was measured with the Vitest config ${options.config}, and there is no such file in ${options.cwd}. Run the gate in the checkout the report was written for, or pass --command.\nDocs: ${NOTHING_TO_READ_DOCS}`,
    );
  }

  if (!pathExists(entry)) {
    return failed(
      `No Vitest is installed in ${options.cwd}, so there is nothing to run. Install vitest there, then measure again.\nDocs: ${NOTHING_TO_READ_DOCS}`,
    );
  }

  if (reporter === undefined) {
    return failed(
      `The perf reporter this package ships, dist/perf-reporter.js, is missing from the install. Reinstall vitest-auto-spy.\nDocs: ${NOTHING_TO_READ_DOCS}`,
    );
  }

  const target = targetPath(options);

  removeFile(target);

  const spawned = timed(spawn, {
    command: process.execPath,
    args: [
      entry,
      'run',
      ...configArgs(options.config),
      '--reporter=default',
      `--reporter=${reporter}`,
      '--logHeapUsage',
      ...versionFlags(options.cwd),
      ...options.paths,
    ],
    cwd: options.cwd,
    env: runEnv(options, target, reporter),
    shell: false,
  });

  return collect(target, options, spawned, (status) =>
    status === 0
      ? `\`vitest run\` exited 0 but wrote no perf report, so the perf reporter did not run. Reinstall vitest-auto-spy.\nDocs: ${NOTHING_TO_READ_DOCS}`
      : `\`vitest run\` exited ${status} before writing a perf report, so the run itself failed. Make it pass, then measure again.\nDocs: ${NOTHING_TO_READ_DOCS}`,
  );
}

function fromCommand(options: PerfRunOptions, command: string, spawn: Spawn, packageRoot: string | undefined): PerfSource {
  const reporter = reporterPath(packageRoot);

  /**
   * A measured run must not start a measurement of its own.
   *
   * `--command` exports `PERF_OUTPUT_ENV` into the command it runs, and a repository whose `test`
   * script ends in `vitest-auto-spy perf --command 'npm test'` would then recurse: every level a
   * whole suite, once per candidate. Both levels would also write the same default report path, so
   * the inner one erases the outer one's report and the outer one reports a command that wrote
   * nothing. The variable being set already is exactly the evidence that we are inside one.
   */
  if (process.env[PERF_OUTPUT_ENV] !== undefined && options.out === undefined) {
    return failed(
      `${PERF_OUTPUT_ENV} is already set, so this is a run inside a measured run, and --command would start a second measurement. Run \`perf\` from outside the suite.\nDocs: ${NOTHING_TO_READ_DOCS}`,
    );
  }

  if (reporter === undefined) {
    return failed(
      `The perf reporter this package ships, dist/perf-reporter.js, is missing from the install. Reinstall vitest-auto-spy.\nDocs: ${NOTHING_TO_READ_DOCS}`,
    );
  }

  const target = targetPath(options);

  removeFile(target);

  const line = withPaths(command, options.paths);
  const spawned = timed(spawn, {
    command: line,
    args: [],
    cwd: options.cwd,
    env: runEnv(options, target, reporter),
    shell: true,
  });

  return collect(target, options, spawned, (status) => commandWroteNothing(line, status));
}

function commandWroteNothing(line: string, status: number): string {
  if (status !== 0) {
    return `\`${line}\` exited ${status} before writing a perf report, so the run itself failed. Make it pass, then measure again.\nDocs: ${NOTHING_TO_READ_DOCS}`;
  }

  return [
    `\`${line}\` exited 0 but wrote no perf report, so the Vitest config it reaches does not attach the perf reporter. Add it where that config declares \`reporters\`:`,
    `  const perf = process.env['${PERF_REPORTER_ENV}'];`,
    "  reporters: perf === undefined ? ['default'] : ['default', perf],",
    `Docs: ${BARE_RUN_DOCS}`,
  ].join('\n');
}

export function readPerfRun(
  options: PerfRunOptions,
  spawn: Spawn = spawnProcess,
  packageRoot: string | undefined = ownPackageRoot(),
): PerfSource {
  const command = options.command;

  if (command === undefined) {
    return options.json === undefined ? fromRun(options, spawn, packageRoot) : fromFile(options.json, options.cwd);
  }

  const source = options.json === undefined ? fromCommand(options, command, spawn, packageRoot) : fromFile(options.json, options.cwd);

  return source.ok ? { ...source, command } : source;
}

/** The report's root when it is this checkout, or the working directory standing in for another one. */
function localRoot(root: string, cwd: string): string {
  const here = relative(cwd, root);

  return root !== '' && !here.startsWith('..') && !isAbsolute(here) ? root : cwd;
}

/** The `--config` each measured file ran with, relative to `cwd`, by repository-relative path. */
function recordedConfigs(recorded: PerfRun, cwd: string): Map<string, string> {
  const root = localRoot(recorded.root, cwd);
  const configs = new Map<string, string>();

  for (const [path, file] of measuredFiles(recorded, cwd)) {
    const configFile = file.configFile ?? recorded.configFile;

    if (configFile !== undefined) {
      configs.set(path, toPosix(relative(cwd, resolve(root, configFile))));
    }
  }

  return configs;
}

/** Several scoped runs read back as one, so the gate sees a single second reading. */
function mergeMeasured(measured: readonly PerfMeasured[]): PerfMeasured {
  return {
    ok: true,
    run: mergeRuns(measured.map((each, index) => ({ path: String(index), run: each.run }))).run,
    runFailed: measured.some((each) => each.runFailed),
    profiles: new Map(measured.flatMap((each) => [...new Map(each.profiles)])),
  };
}

/**
 * One bare run per config the suspects were measured under, each over its own files only. Reports
 * of two suites that run under two configs cannot be confirmed by one run of either.
 */
function underRecordedConfigs(configs: ReadonlyMap<string, string>, remeasure: (paths: string[], config: string) => PerfSource): Remeasure {
  return (paths) => {
    const groups = new Map<string, string[]>();

    for (const path of paths) {
      const config = configs.get(path);

      if (config !== undefined) {
        groups.set(config, [...(groups.get(config) ?? []), path]);
      }
    }

    if (groups.size === 0) {
      return failed(
        `None of the files to re-measure is in a report that recorded its Vitest config. Pass --command to re-measure them.\nDocs: ${NOTHING_TO_READ_DOCS}`,
      );
    }

    const measured: PerfMeasured[] = [];

    for (const [config, group] of groups) {
      const source = remeasure(group, config);

      if (!source.ok) {
        return source;
      }

      measured.push(source);
    }

    return mergeMeasured(measured);
  };
}

/**
 * How the gate re-measures its suspects, or `undefined` when this source cannot be narrowed.
 *
 * A `--command` decides it on its own: with `{paths}` in it the harness can be asked for a few
 * files, without it the only way to repeat the run is to repeat all of it. `--json` **with** a
 * command is the ordinary CI shape, where the first reading is the report the suite already wrote
 * and the second one is a fresh scoped run. `--json` alone re-runs Vitest bare under the config
 * each report `recorded`; a report from before the config was recorded is a past run nobody can go
 * back to.
 */
export function perfRemeasure(
  options: PerfRunOptions,
  spawn: Spawn = spawnProcess,
  packageRoot: string | undefined = ownPackageRoot(),
  recorded?: PerfRun,
): Remeasure | undefined {
  if (options.command !== undefined && !commandTakesPaths(options.command)) {
    return undefined;
  }

  const profileDir = join(options.cwd, 'node_modules', '.cache', 'vitest-auto-spy', `profiles-${process.pid}`);
  const scoped = { ...options, json: undefined, out: undefined, profileDir };

  if (options.command === undefined && options.json !== undefined) {
    const configs = recorded === undefined ? new Map<string, string>() : recordedConfigs(recorded, options.cwd);

    return configs.size === 0
      ? undefined
      : underRecordedConfigs(configs, (paths, config) => readPerfRun({ ...scoped, paths, config }, spawn, packageRoot));
  }

  return (paths) => readPerfRun({ ...scoped, paths }, spawn, packageRoot);
}

/**
 * How `--ab-isolate` runs the suite a second time, or `undefined` when this source cannot: `--json`
 * alone is a past run. The second run keeps nothing: no `--out`, no profiles, the same paths.
 */
export function perfAbIsolate(
  options: PerfRunOptions,
  spawn: Spawn,
  packageRoot: string | undefined = ownPackageRoot(),
): ((isolate: boolean) => PerfSource) | undefined {
  if (options.command === undefined && options.json !== undefined) {
    return undefined;
  }

  return (isolate) => readPerfRun({ ...options, json: undefined, out: undefined, isolate }, spawn, packageRoot);
}
