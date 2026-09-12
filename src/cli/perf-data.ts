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

/** The page every message from this command points at. Deep links are anchors on it. */
export const PERF_DOCS = 'https://asdalexey.github.io/vitest-auto-spy/core/performance';

export const PERF_FORMAT_VERSION = 2;

/**
 * Every version this build reads. Version 2 added the per-test data the gate judges; a version 1
 * report simply carries none, which is a report with fewer findings in it rather than a bad one.
 */
const READABLE_VERSIONS: readonly number[] = [1, 2];

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

const FILE_PHASES: readonly (readonly [PhaseName, FileKey])[] = [
  ['environment', 'environment'],
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

function parseFile(value: unknown): PerfFile | undefined {
  if (!isRecord(value) || typeof value['file'] !== 'string') {
    return undefined;
  }

  return {
    file: value['file'],
    environment: numberAt(value, 'environment') ?? 0,
    prepare: numberAt(value, 'prepare') ?? 0,
    setup: numberAt(value, 'setup') ?? 0,
    imports: numberAt(value, 'imports') ?? 0,
    tests: numberAt(value, 'tests') ?? 0,
    testCount: numberAt(value, 'testCount') ?? 0,
    cases: parseCases(value['cases']),
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

/** The six phases, largest share first. A phase with no time is kept — its absence is information. */
export function phasesOf(run: PerfRun): Phase[] {
  const raw: readonly (readonly [PhaseName, number])[] = [
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
