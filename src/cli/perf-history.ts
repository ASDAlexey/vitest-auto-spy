/**
 * The baseline as JSON Lines, one run per line: a file regresses only at `factor` × its mean share and
 * above every share recorded for it, so CI can keep it in a cache without a commit or a network.
 */
import { parseJsonc, readTextFile, writeTextFile } from './fs-scan';
import type { CliIo } from './main';
import type { BaselineOptions, BaselineRegression } from './perf-baseline';
import { buildBaseline, hasRun } from './perf-baseline';
import type { PerfRun } from './perf-data';
import type { GateCandidate } from './perf-gate';
import { measuredFiles, medianFileMs } from './perf-gate';
import { isRecord } from './profile';

export const PERF_HISTORY_VERSION = 1;

/** Runs kept; older lines fall off the top on every append. */
export const HISTORY_LIMIT = 30;

/** Fewer recorded runs than this is not a history of that file yet, and says nothing about it. */
export const HISTORY_MIN_RUNS = 3;

export interface HistoryEntry {
  readonly version: number;
  /** ISO timestamp of the recording. */
  readonly at: string;
  readonly commit?: string;
  readonly median: number;
  /** Repository-relative path → share of that run's median file, as in the baseline. */
  readonly files: Readonly<Record<string, number>>;
}

export interface HistoryRegression extends BaselineRegression {
  /** How many recorded runs knew the file. */
  readonly runs: number;
  readonly mean: number;
  readonly max: number;
}

export function isHistoryPath(path: string): boolean {
  return path.endsWith('.jsonl');
}

function parseEntry(line: string): HistoryEntry | undefined {
  const parsed = parseJsonc(line);

  if (!isRecord(parsed) || parsed['version'] !== PERF_HISTORY_VERSION || typeof parsed['at'] !== 'string' || !isRecord(parsed['files'])) {
    return undefined;
  }

  const files: Record<string, number> = {};

  for (const [path, value] of Object.entries(parsed['files'])) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      files[path] = value;
    }
  }

  const median = parsed['median'];
  const commit = parsed['commit'];

  return {
    version: PERF_HISTORY_VERSION,
    at: parsed['at'],
    ...(typeof commit === 'string' ? { commit } : {}),
    median: typeof median === 'number' && Number.isFinite(median) ? median : 0,
    files,
  };
}

/** Every readable line, oldest first. A line broken by a cancelled job is skipped, not fatal. */
export function readHistory(path: string): HistoryEntry[] {
  const text = readTextFile(path) ?? '';

  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(parseEntry)
    .filter((entry): entry is HistoryEntry => entry !== undefined);
}

export function historyEntry(run: PerfRun, cwd: string, at: Date, env: Readonly<Record<string, string | undefined>>): HistoryEntry {
  const baseline = buildBaseline(run, cwd);
  const commit = env['CI_COMMIT_SHA'] ?? env['GITHUB_SHA'];

  return {
    version: PERF_HISTORY_VERSION,
    at: at.toISOString(),
    ...(commit === undefined || commit === '' ? {} : { commit }),
    median: baseline.median,
    files: baseline.files,
  };
}

/** Appends one run and keeps the last `limit`; answers how many runs the file now holds. */
export function appendHistory(path: string, entry: HistoryEntry, limit: number = HISTORY_LIMIT): number {
  const kept = [...readHistory(path), entry].slice(-limit);

  writeTextFile(path, `${kept.map((each) => JSON.stringify(each)).join('\n')}\n`);

  return kept.length;
}

function sharesOf(entries: readonly HistoryEntry[], path: string): number[] {
  return entries.map((entry) => entry.files[path]).filter((share): share is number => share !== undefined);
}

export function historyRegressions(
  run: PerfRun,
  cwd: string,
  entries: readonly HistoryEntry[],
  options: BaselineOptions,
): HistoryRegression[] {
  const measured = measuredFiles(run, cwd);
  const median = medianFileMs(measured.values());

  if (median <= 0) {
    return [];
  }

  const found: HistoryRegression[] = [];

  for (const [path, file] of measured) {
    const shares = sharesOf(entries, path);
    const mean = shares.reduce((sum, share) => sum + share, 0) / Math.max(shares.length, 1);
    const max = Math.max(0, ...shares);
    const ratio = file.tests / median;

    if (!hasRun(file) || shares.length < HISTORY_MIN_RUNS || mean <= 0 || file.tests < options.floorMs) {
      continue;
    }

    if (ratio >= mean * options.factor && ratio > max) {
      found.push({ file: path, ms: file.tests, ratio, wasRatio: mean, grewBy: ratio / mean, runs: shares.length, mean, max });
    }
  }

  return found.sort((a, b) => b.grewBy - a.grewBy || a.file.localeCompare(b.file));
}

/** Files this run measured that no recorded run knew, and files the latest run knew that this one did not measure. */
export function historyDrift(
  run: PerfRun,
  cwd: string,
  entries: readonly HistoryEntry[],
): { readonly missing: string[]; readonly added: string[] } {
  const ran = [...measuredFiles(run, cwd)].filter(([, file]) => hasRun(file)).map(([path]) => path);
  const known = new Set(entries.flatMap((entry) => Object.keys(entry.files)));
  const latest = Object.keys(entries.at(-1)?.files ?? {});
  const measured = new Set(ran);

  return {
    missing: latest.filter((path) => !measured.has(path)).sort((a, b) => a.localeCompare(b)),
    added: ran.filter((path) => !known.has(path)).sort((a, b) => a.localeCompare(b)),
  };
}

/** What grew past its history, as candidates the gate confirms like any other, in this run's milliseconds. */
export function historyCandidates(run: PerfRun, cwd: string, path: string, options: BaselineOptions, io: CliIo): GateCandidate[] {
  const entries = readHistory(path);

  if (entries.length === 0) {
    io.err(`\nwarning  No history to compare against at ${path}. Record runs into it with --update-baseline.`);

    return [];
  }

  const median = medianFileMs(measuredFiles(run, cwd).values());
  const drift = historyDrift(run, cwd, entries);

  io.out(
    `\nperf history: ${entries.length} recorded runs; ${drift.added.length} files this run measured are new to it, ${drift.missing.length} the latest run knew were not measured here. A file needs ${HISTORY_MIN_RUNS} recorded runs before it can regress.`,
  );

  return historyRegressions(run, cwd, entries, options).map((regression) => ({
    check: 'perf-gate-regression' as const,
    against: 'history' as const,
    file: regression.file,
    ms: regression.ms,
    budget: Math.max(regression.mean * options.factor, regression.max) * median,
    grewBy: regression.grewBy,
    budgetNote: `${options.factor}× its mean share over ${regression.runs} recorded runs, and above the largest of them, from ${path}`,
  }));
}
