/**
 * The JSON `perf` reads, and the six phases it is summed into.
 *
 * Vitest prints these numbers once, on the summary line — `Duration 8.91s (transform 26.20s, setup
 * 14.70s, import 55.27s, tests 27.24s, environment 155.65s)` — as ANSI-coloured, locale-dependent
 * prose. The same values live on every file task, which is where the shipped reporter reads them
 * from; nothing here parses terminal output.
 */
import { parseJsonc } from './fs-scan';
import { isRecord } from './profile';

/** Names the file the shipped reporter writes. A path cannot be passed to a reporter on the CLI. */
export const PERF_OUTPUT_ENV = 'VITEST_AUTO_SPY_PERF_OUT';

/**
 * Where `--command` leaves the path of the shipped reporter, so a configuration this package does
 * not own can attach it without hard-coding a path into the repository.
 */
export const PERF_REPORTER_ENV = 'VITEST_AUTO_SPY_PERF_REPORTER';

/**
 * Where a confirmation pass wants CPU profiles left. Set, the reporter adds `dist/perf-profiler.js`
 * to every project's `setupFiles` and records every test body of the file rather than the slow ones.
 */
export const PERF_PROFILE_ENV = 'VITEST_AUTO_SPY_PERF_PROFILE';

/** The page every message from this command points at. Deep links are anchors on it. */
export const PERF_DOCS = 'https://asdalexey.github.io/vitest-auto-spy/core/performance';

export const PERF_FORMAT_VERSION = 3;

/**
 * Every version this build reads. Version 2 added the per-test data the gate judges, version 3 the
 * flaky tests and the heap; an older report simply carries none of it, which is a report with fewer
 * findings in it rather than a bad one.
 */
const READABLE_VERSIONS: readonly number[] = [1, 2, 3];

/**
 * Below this, a test body is not evidence of anything: 40 ms is the machine rather than somebody's
 * decision, and carrying all of them would make the report of a 12 000-test suite larger than the
 * suite. It is also the floor under `--max-test-ms` — nothing below it was written down to compare.
 */
export const CASE_FLOOR_MS = 100;

/** How many slow bodies one file contributes. A file with six of them has one problem, not six. */
export const CASES_PER_FILE = 5;

/** One test body, named and timed. `name` is Vitest's `fullName`: every parent suite, then the test. */
export interface PerfCase {
  readonly name: string;
  readonly ms: number;
}

/** A module the spec imported itself, with everything under it. */
export interface PerfImport {
  /** Absolute path, as Vitest resolved it. */
  readonly module: string;
  readonly ms: number;
}

export interface PerfFile {
  /** Absolute module id, exactly as Vitest reported it. */
  readonly file: string;
  readonly environment: number;
  readonly prepare: number;
  readonly setup: number;
  readonly imports: number;
  readonly tests: number;
  /**
   * How many test bodies in this file actually finished — a collected-but-skipped test is not one.
   * Zero means the file ran nothing, and the difference between a suite that is fast and a suite
   * that did not happen is the whole reason this number is in the report.
   */
  readonly testCount: number;
  /** The slowest bodies in the file, over `CASE_FLOOR_MS`, longest first. */
  readonly cases: readonly PerfCase[];
  /** Tests that passed only on a retry, by full name. Absent when there were none. */
  readonly flaky?: readonly string[];
  /** Heap used after the file, in bytes. Only a run with `logHeapUsage` records it. */
  readonly heap?: number;
  /** The spec's heaviest direct imports. Only a run that collects import durations records them. */
  readonly slowImports?: readonly PerfImport[];
}

export interface PerfRun {
  /** Which version of this format the report was written in; 1 has no per-test data. */
  readonly version: number;
  /** Vitest's project root, so a reader can relativise `file` even from another directory. */
  readonly root: string;
  /** Transform time for the whole run: Vitest tracks it per run, not per file. */
  readonly transform: number;
  /** Wall clock of the run. The phase sums are CPU time across workers and exceed it. */
  readonly wall: number;
  /**
   * How many files failed. A handed-over report is the one shape where the command cannot see the
   * suite's exit code, and the gate must refuse a red run — a failed test is measured until its
   * timeout, and 30 s of timeout looks exactly like 30 s of slow code.
   */
  readonly failed: number;
  readonly files: readonly PerfFile[];
}

export type PhaseName = 'environment' | 'import' | 'prepare' | 'setup' | 'tests' | 'transform';

export interface Phase {
  readonly name: PhaseName;
  readonly ms: number;
  /** Fraction of the summed phase time, 0–1. */
  readonly share: number;
}

/** The five phases Vitest measures per file. `transform` is the sixth and is a whole-run number. */
type FileKey = 'environment' | 'imports' | 'prepare' | 'setup' | 'tests';

/** `environment` is not among them: it is measured once per worker, not once per file — see `environmentOf`. */
const FILE_PHASES: readonly (readonly [PhaseName, FileKey])[] = [
  ['import', 'imports'],
  ['tests', 'tests'],
  ['setup', 'setup'],
  ['prepare', 'prepare'],
];

function numberAt(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseCases(value: unknown): PerfCase[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cases: PerfCase[] = [];

  for (const entry of value) {
    if (isRecord(entry) && typeof entry['name'] === 'string') {
      cases.push({ name: entry['name'], ms: numberAt(entry, 'ms') ?? 0 });
    }
  }

  return cases;
}

function parseImports(value: unknown): PerfImport[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry) && typeof entry['module'] === 'string')
    .map((entry) => ({ module: String(entry['module']), ms: numberAt(entry, 'ms') ?? 0 }));
}

function parseNames(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function parseFile(value: unknown): PerfFile | undefined {
  if (!isRecord(value) || typeof value['file'] !== 'string') {
    return undefined;
  }

  const flaky = parseNames(value['flaky']);
  const heap = numberAt(value, 'heap');
  const slowImports = parseImports(value['slowImports']);

  return {
    file: value['file'],
    environment: numberAt(value, 'environment') ?? 0,
    prepare: numberAt(value, 'prepare') ?? 0,
    setup: numberAt(value, 'setup') ?? 0,
    imports: numberAt(value, 'imports') ?? 0,
    tests: numberAt(value, 'tests') ?? 0,
    testCount: numberAt(value, 'testCount') ?? 0,
    cases: parseCases(value['cases']),
    ...(flaky.length === 0 ? {} : { flaky }),
    ...(heap === undefined ? {} : { heap }),
    ...(slowImports.length === 0 ? {} : { slowImports }),
  };
}

/**
 * A perf report, or `undefined` when the text is not one. Validated field by field rather than
 * trusted: `--json` points at a file somebody else wrote, possibly with a different version.
 */
export function parsePerfRun(text: string): PerfRun | undefined {
  const parsed = parseJsonc(text);

  if (!isRecord(parsed) || !Array.isArray(parsed['files'])) {
    return undefined;
  }

  const version = numberAt(parsed, 'version');

  if (version === undefined || !READABLE_VERSIONS.includes(version)) {
    return undefined;
  }

  const files: PerfFile[] = [];

  for (const entry of parsed['files']) {
    const file = parseFile(entry);

    if (file !== undefined) {
      files.push(file);
    }
  }

  return {
    version,
    root: typeof parsed['root'] === 'string' ? parsed['root'] : '',
    transform: numberAt(parsed, 'transform') ?? 0,
    wall: numberAt(parsed, 'wall') ?? 0,
    failed: numberAt(parsed, 'failed') ?? 0,
    files,
  };
}

function sumOf(run: PerfRun, key: FileKey): number {
  return run.files.reduce((total, file) => total + file[key], 0);
}

/** How many test bodies the run finished. Zero is the difference between fast and not run at all. */
export function testsRunOf(run: PerfRun): number {
  return run.files.reduce((total, file) => total + file.testCount, 0);
}

/**
 * Whether the report describes a run that measured nothing.
 *
 * The case it exists for is a bare `vitest run` in a repository whose suite is built by something
 * else: every file is collected, every one of them fails on `describe is not defined` or an
 * unresolved alias, and the phase table then shows a plausible-looking 55 s of CPU time that is
 * entirely transform and environment. Timings of a run in which no test body executed are not a
 * measurement of anything, and printing them as one is worse than printing nothing.
 *
 * A version 1 report carries no test counts, so it is judged by the only evidence it has.
 */
export function measuredNothing(run: PerfRun): boolean {
  if (run.files.length === 0) {
    return true;
  }

  /**
   * Both, not either. A version 2 report can honestly carry no per-test rows — the reporter treats
   * the test collection as optional on purpose, so a runner that exposes none still produces a
   * report — and a run of nothing but skipped files finishes no body either. Accusing those of not
   * having happened is the same class of mistake as printing a failure as a measurement, in the
   * other direction; the case this guard exists for has zero of both.
   */
  return testsRunOf(run) === 0 && sumOf(run, 'tests') === 0;
}

/**
 * The middle value, or the mean of the two middle ones. An empty list has no median and answers 0,
 * through the same two fallbacks rather than through a branch of its own.
 */
export function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle] ?? 0;
  const low = sorted[sorted.length % 2 === 1 ? middle : middle - 1] ?? 0;

  return (high + low) / 2;
}

/**
 * What the run spent building environments, counted once per worker rather than once per file.
 *
 * Vitest measures it once: `_environmentTime` is a module-scope variable set inside
 * `setupBaseEnvironment`, which runs per worker, and `runBaseTests` then copies it into
 * `state.durations.environment` for **every** file that worker runs. Summing the per-file numbers
 * therefore multiplies one start-up by the files behind it — on a 672-file shard across 13 workers
 * that is 126.4 s against the 2.44 s actually spent, inflated 51.7×, which is enough to make the
 * phase dominate any report with many files per worker.
 *
 * Files of one worker carry the identical float, so the distinct values are the environments the run
 * built. Two workers landing on the same `performance.now()` difference would be counted once; that
 * undercounts by one environment where the alternative overcounts by the file count.
 */
export function environmentOf(files: readonly PerfFile[]): number {
  return [...new Set(files.map((file) => file.environment))].reduce((total, ms) => total + ms, 0);
}

/** The six phases, largest share first. A phase with no time is kept — its absence is information. */
export function phasesOf(run: PerfRun): Phase[] {
  const raw: readonly (readonly [PhaseName, number])[] = [
    ['environment', environmentOf(run.files)],
    ...FILE_PHASES.map(([name, key]): readonly [PhaseName, number] => [name, sumOf(run, key)]),
    ['transform', run.transform],
  ];
  const total = raw.reduce((sum, [, ms]) => sum + ms, 0);

  return raw
    .map(([name, ms]) => ({ name, ms, share: total === 0 ? 0 : ms / total }))
    .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name));
}

export function totalOf(phases: readonly Phase[]): number {
  return phases.reduce((sum, phase) => sum + phase.ms, 0);
}

export function shareOf(phases: readonly Phase[], name: PhaseName): number {
  return phases.find((phase) => phase.name === name)?.share ?? 0;
}

/** Milliseconds the way Vitest prints them, so the two reports can be read side by side. */
export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}
