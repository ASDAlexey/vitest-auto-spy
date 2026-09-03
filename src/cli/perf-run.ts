/**
 * Where a perf report comes from: a file the consumer already has, or one run of their own Vitest
 * with the shipped reporter attached.
 *
 * The run is `process.execPath node_modules/vitest/vitest.mjs` rather than `npx vitest` or the
 * `.bin` shim — `npx` is a second install path that can resolve a different version, and the shim
 * is a `.cmd` on Windows. The reporter is passed as a plain filesystem path, so it needs no export
 * subpath of its own; `--reporter=default` is kept alongside it, or the run would look hung.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { pathExists, readTextFile, removeFile } from './fs-scan';
import type { PerfRun } from './perf-data';
import { PERF_DOCS, PERF_FORMAT_VERSION, PERF_OUTPUT_ENV, parsePerfRun } from './perf-data';
import { ownPackageRoot } from './self';

export interface SpawnOutcome {
  readonly status: number;
}

export type Spawn = (command: string, args: readonly string[], cwd: string, env: Readonly<Record<string, string>>) => SpawnOutcome;

/** The real one. Output is inherited: the consumer watches their own suite run. */
export const spawnProcess: Spawn = (command, args, cwd, env) => {
  const result = spawnSync(command, [...args], { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });

  return { status: result.status ?? 1 };
};

export interface PerfRunOptions {
  readonly cwd: string;
  /** `--json`: read this report instead of running anything. */
  readonly json: string | undefined;
  /** `--out`: keep the report at this path instead of deleting it. */
  readonly out: string | undefined;
  /** Passed through to Vitest as its file filter. */
  readonly paths: readonly string[];
}

export interface PerfMeasured {
  readonly ok: true;
  readonly run: PerfRun;
  /** The suite itself exited non-zero. The timings are still real, so the report is still printed. */
  readonly runFailed: boolean;
}

export interface PerfUnavailable {
  readonly ok: false;
  readonly error: string;
}

export type PerfSource = PerfMeasured | PerfUnavailable;

/** `dist/perf-reporter.js` inside this package, or `undefined` when the install has no build. */
export function reporterPath(root: string | undefined): string | undefined {
  if (root === undefined) {
    return undefined;
  }

  const built = join(root, 'dist', 'perf-reporter.js');

  return pathExists(built) ? built : undefined;
}

function failed(error: string): PerfUnavailable {
  return { ok: false, error };
}

function fromFile(path: string): PerfSource {
  const text = readTextFile(path);
  const run = text === undefined ? undefined : parsePerfRun(text);

  if (run === undefined) {
    return failed(
      `Not a perf report: ${path}. It must be JSON in version ${PERF_FORMAT_VERSION} of the format \`vitest-auto-spy perf --out\` writes.\nDocs: ${PERF_DOCS}`,
    );
  }

  return { ok: true, run, runFailed: false };
}

function fromRun(options: PerfRunOptions, spawn: Spawn, packageRoot: string | undefined): PerfSource {
  const entry = join(options.cwd, 'node_modules', 'vitest', 'vitest.mjs');
  const reporter = reporterPath(packageRoot);

  if (!pathExists(entry)) {
    return failed(
      `No Vitest is installed in ${options.cwd}, so there is nothing to measure.\nInstall it, or pass --json <path>.\nDocs: ${PERF_DOCS}`,
    );
  }

  if (reporter === undefined) {
    return failed(
      `This package ships the perf reporter as dist/perf-reporter.js and it is not there. Reinstall vitest-auto-spy.\nDocs: ${PERF_DOCS}`,
    );
  }

  const target = options.out ?? join(options.cwd, 'node_modules', '.cache', 'vitest-auto-spy', 'perf.json');

  removeFile(target);

  const outcome = spawn(process.execPath, [entry, 'run', '--reporter=default', `--reporter=${reporter}`, ...options.paths], options.cwd, {
    [PERF_OUTPUT_ENV]: target,
  });
  const text = readTextFile(target);

  if (options.out === undefined) {
    removeFile(target);
  }

  const run = text === undefined ? undefined : parsePerfRun(text);

  if (run === undefined) {
    return failed(
      `The Vitest run exited ${outcome.status} and wrote no perf report. Fix the run first, then measure it.\nDocs: ${PERF_DOCS}`,
    );
  }

  return { ok: true, run, runFailed: outcome.status !== 0 };
}

export function readPerfRun(
  options: PerfRunOptions,
  spawn: Spawn = spawnProcess,
  packageRoot: string | undefined = ownPackageRoot(),
): PerfSource {
  return options.json === undefined ? fromRun(options, spawn, packageRoot) : fromFile(options.json);
}
