/**
 * Where a perf report comes from: a file the consumer already has, one run of their own Vitest with
 * the shipped reporter attached, or the command this repository actually measures its suite with.
 *
 * The bare run is `process.execPath node_modules/vitest/vitest.mjs` rather than `npx vitest` or the
 * `.bin` shim — `npx` is a second install path that can resolve a different version, and the shim
 * is a `.cmd` on Windows. The reporter is passed as a plain filesystem path, so it needs no export
 * subpath of its own; `--reporter=default` is kept alongside it, or the run would look hung.
 *
 * `--command` exists because the bare run is not always this repository's suite — see
 * `checks/perf-harness`. There the command owns the configuration, so the reporter cannot be pushed
 * in from here; its path arrives in the environment and the consumer's config attaches it.
 */
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

import { bareRunWouldMeasureSomethingElse } from './checks/perf-harness';
import { BARE_RUN_DOCS, NOTHING_TO_READ_DOCS } from './docs';
import { pathExists, readTextFile, removeFile } from './fs-scan';
import type { PerfRun } from './perf-data';
import { PERF_OUTPUT_ENV, PERF_PROFILE_ENV, PERF_REPORTER_ENV, parsePerfRun, whyNotAPerfRun } from './perf-data';
import { describeMerge, mergeRuns, readRuns, resolveReportPaths } from './perf-merge';
import type { CpuProfile } from './perf-profile';
import { takeProfiles } from './perf-profiler';
import type { Profile } from './profile';
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
}

export interface PerfMeasured {
  readonly ok: true;
  readonly run: PerfRun;
  /** What was read, when that is worth a line: several reports merged, or one of them unreadable. */
  readonly note?: string;
  /** The suite itself exited non-zero. The timings are still real, so the report is still printed. */
  readonly runFailed: boolean;
  /** CPU profiles by the absolute path of their spec file, when the run was asked for them. */
  readonly profiles?: ReadonlyMap<string, CpuProfile>;
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

function profileEnv(options: PerfRunOptions): Record<string, string> {
  return options.profileDir === undefined ? {} : { [PERF_PROFILE_ENV]: options.profileDir };
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
  keep: boolean,
  outcome: SpawnOutcome,
  missing: (status: number) => string,
  profileDir?: string,
): PerfSource {
  const text = readTextFile(target);
  const profiles = profileDir === undefined ? undefined : takeProfiles(profileDir);

  if (!keep) {
    removeFile(target);
  }

  const run = text === undefined ? undefined : parsePerfRun(text);

  if (run === undefined) {
    return failed(missing(outcome.status));
  }

  return { ok: true, run, runFailed: outcome.status !== 0, ...(profiles === undefined ? {} : { profiles }) };
}

/**
 * Where the report goes. The process id is in the name because two `perf` runs sharing one report
 * path erase each other's work, and the second one then reports a command that wrote nothing.
 */
function targetPath(options: PerfRunOptions): string {
  return options.out ?? join(options.cwd, 'node_modules', '.cache', 'vitest-auto-spy', `perf-${process.pid}.json`);
}

function fromRun(options: PerfRunOptions, spawn: Spawn, packageRoot: string | undefined): PerfSource {
  const entry = join(options.cwd, 'node_modules', 'vitest', 'vitest.mjs');
  const reporter = reporterPath(packageRoot);
  const mismatch = bareRunWouldMeasureSomethingElse(options.profile);

  if (mismatch !== undefined) {
    return failed(mismatch);
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

  const outcome = spawn({
    command: process.execPath,
    args: [entry, 'run', '--reporter=default', `--reporter=${reporter}`, '--logHeapUsage', ...options.paths],
    cwd: options.cwd,
    env: { [PERF_OUTPUT_ENV]: target, [PERF_REPORTER_ENV]: reporter, ...profileEnv(options) },
    shell: false,
  });

  return collect(
    target,
    options.out !== undefined,
    outcome,
    (status) =>
      status === 0
        ? `\`vitest run\` exited 0 but wrote no perf report, so the perf reporter did not run. Reinstall vitest-auto-spy.\nDocs: ${NOTHING_TO_READ_DOCS}`
        : `\`vitest run\` exited ${status} before writing a perf report, so the run itself failed. Make it pass, then measure again.\nDocs: ${NOTHING_TO_READ_DOCS}`,
    options.profileDir,
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
  const outcome = spawn({
    command: line,
    args: [],
    cwd: options.cwd,
    env: { [PERF_OUTPUT_ENV]: target, [PERF_REPORTER_ENV]: reporter, ...profileEnv(options) },
    shell: true,
  });

  return collect(target, options.out !== undefined, outcome, (status) => commandWroteNothing(line, status), options.profileDir);
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
  if (options.json !== undefined) {
    return fromFile(options.json, options.cwd);
  }

  return options.command === undefined ? fromRun(options, spawn, packageRoot) : fromCommand(options, options.command, spawn, packageRoot);
}

/**
 * How the gate re-measures its suspects, or `undefined` when this source cannot be narrowed.
 *
 * A `--command` decides it on its own: with `{paths}` in it the harness can be asked for a few
 * files, without it the only way to repeat the run is to repeat all of it. `--json` on its own is a
 * past run nobody can go back to — but `--json` **with** a command is the ordinary CI shape, where
 * the first reading is the report the suite already wrote and the second one is a fresh scoped run.
 */
export function perfRemeasure(
  options: PerfRunOptions,
  spawn: Spawn = spawnProcess,
  packageRoot: string | undefined = ownPackageRoot(),
): Remeasure | undefined {
  if (options.command !== undefined && !commandTakesPaths(options.command)) {
    return undefined;
  }

  if (options.command === undefined && options.json !== undefined) {
    return undefined;
  }

  const profileDir = join(options.cwd, 'node_modules', '.cache', 'vitest-auto-spy', `profiles-${process.pid}`);

  return (paths) => readPerfRun({ ...options, json: undefined, out: undefined, paths, profileDir }, spawn, packageRoot);
}
