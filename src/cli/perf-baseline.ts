/**
 * The ratchet: a committed record of how expensive every spec file was, and the reason it is not
 * written in milliseconds.
 *
 * The gate in `perf-gate.ts` catches a file that is slow in absolute terms, and that is the only
 * kind of slowness a single run can see. It is blind to the regression that actually accumulates:
 * a file that took 300 ms last month and takes 900 ms today, under every budget the whole way, one
 * `beforeEach` at a time. Nobody reviews that in a diff — the seconds arrive in ones and the suite
 * is twenty minutes long a year later.
 *
 * Catching it needs a number from the past, and that is where milliseconds stop working. The
 * baseline is committed, so it is recorded on somebody's laptop and compared on a runner that is
 * two to five times slower, sharing a host with three other jobs; every file is then "1.8× worse"
 * and the ratchet reports the hardware. So what is stored is each file's **ratio to the median file
 * of its own run**. A slower machine raises the numerator and the denominator together and the
 * ratio survives it, while a file that went from 3× the median to 9× the median did so because of
 * something in the repository — which is the only kind of finding worth committing a file for.
 *
 * Three rules follow from the same caution, and they are what keeps the ratchet from being switched
 * off in its first week:
 *
 * - **A file that ran no test body is not recorded and never reported.** Zero milliseconds because
 *   a shard skipped the file looks exactly like zero milliseconds because the file is fast, and
 *   recording the first as the second turns the next full run into a wall of regressions.
 * - **Absent is not a finding, in either direction.** A file the baseline does not know is new, and
 *   a file this run did not measure was somebody else's shard. {@link baselineDrift} reports both so
 *   a caller can say so out loud instead of failing on it.
 * - **A ratio alone cannot fail anything.** A suite whose median file is 4 ms has files at 20× the
 *   median that are 80 ms long, and nothing there is a defect. The absolute floor is what keeps the
 *   ratchet quiet about a fast suite's own fastest outlier.
 */
import { parseJsonc, readTextFile, writeTextFile } from './fs-scan';
import type { PerfFile, PerfRun } from './perf-data';
import { measuredFiles, medianFileMs } from './perf-gate';
import { isRecord } from './profile';

/** The format the file on disk is written in. There has only ever been one, and it is refused if it differs. */
export const PERF_BASELINE_VERSION = 1;

/** Where --update-baseline writes when no path was given. Committed on purpose: its whole value is the diff. */
export const DEFAULT_BASELINE_FILE = 'perf-baseline.json';

/** How many decimals a recorded ratio keeps. Three is under the noise and keeps the diff readable. */
const RATIO_PRECISION = 1_000;

export interface PerfBaseline {
  readonly version: number;
  /** The median file of the run this was recorded from, in ms. Informational: comparisons use ratios. */
  readonly median: number;
  /** Repository-relative path → that file's test-body time as a multiple of the run's median. */
  readonly files: Readonly<Record<string, number>>;
}

/** One file that got slower relative to its own run, which is the only kind of slower that travels. */
export interface BaselineRegression {
  /** Repository-relative path, the same key the baseline is written with. */
  readonly file: string;
  /** What this run measured for the file's test bodies, in ms. */
  readonly ms: number;
  /** This run's ratio of that file to this run's median file. */
  readonly ratio: number;
  /** The ratio the baseline recorded for it. */
  readonly wasRatio: number;
  /** `ratio / wasRatio` — how many times worse the file is relative to the suite around it. */
  readonly grewBy: number;
}

export interface BaselineOptions {
  /** How many times its recorded ratio a file has to reach before it is a regression. Default 2. */
  readonly factor: number;
  /** Absolute floor in ms: below this the file is noise whatever the ratio did. Default 500. */
  readonly floorMs: number;
}

/**
 * Doubling is the threshold because a ratio is already relative: it takes a real change in the file
 * to double, and the 500 ms floor is where a spec file stops being indistinguishable from the
 * scheduler.
 */
export const BASELINE_DEFAULTS: BaselineOptions = {
  factor: 2,
  floorMs: 500,
};

/** Whether the file executed anything at all. A collected-but-skipped file is not evidence of speed. */
function hasRun(file: PerfFile): boolean {
  return file.testCount > 0 || file.tests > 0;
}

function roundRatio(ratio: number): number {
  return Math.round(ratio * RATIO_PRECISION) / RATIO_PRECISION;
}

/**
 * A recorded ratio, or `undefined` when the value is not one. `Infinity` is reachable from valid
 * JSON — `1e999` parses to it — so finiteness is checked rather than assumed, and a negative time
 * is refused because nothing this measures can go backwards.
 */
function ratioOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function numberAt(record: Record<string, unknown>, key: string): number | undefined {
  return ratioOf(record[key]);
}

/**
 * The baseline this run would record: every file that ran something, as a multiple of the run's
 * median file.
 *
 * A run whose median is 0 records no files. Every ratio in it would be a division by zero, and a
 * baseline of zeros is worse than an absent one — it claims every file is free and makes the next
 * comparison report the whole suite.
 */
export function buildBaseline(run: PerfRun, cwd: string): PerfBaseline {
  const measured = measuredFiles(run, cwd);
  const median = medianFileMs(measured.values());
  const files: Record<string, number> = {};

  if (median > 0) {
    for (const [path, file] of measured) {
      if (hasRun(file)) {
        files[path] = roundRatio(file.tests / median);
      }
    }
  }

  return { version: PERF_BASELINE_VERSION, median: Math.round(median), files };
}

/**
 * The file as it is committed: keys in one order, paths sorted, one trailing newline. A report that
 * reorders itself produces a diff on every run and stops being reviewed.
 */
export function formatBaseline(baseline: PerfBaseline): string {
  const files: Record<string, number> = {};

  for (const [path, ratio] of Object.entries(baseline.files).sort(([a], [b]) => a.localeCompare(b))) {
    files[path] = ratio;
  }

  return `${JSON.stringify({ version: baseline.version, median: baseline.median, files }, undefined, 2)}\n`;
}

/**
 * A baseline, or `undefined` when the text is not one. Validated field by field rather than trusted:
 * the file is committed, so it is hand-edited, merged and resolved by hand, and a wrong version of
 * it must read as "no baseline" instead of as a suite that regressed everywhere. Entries that are
 * not finite, non-negative numbers are dropped — one broken line is not a reason to lose the rest.
 */
export function parseBaseline(text: string): PerfBaseline | undefined {
  const parsed = parseJsonc(text);

  if (!isRecord(parsed) || numberAt(parsed, 'version') !== PERF_BASELINE_VERSION || !isRecord(parsed['files'])) {
    return undefined;
  }

  const files: Record<string, number> = {};

  for (const [path, value] of Object.entries(parsed['files'])) {
    const ratio = ratioOf(value);

    if (ratio !== undefined) {
      files[path] = ratio;
    }
  }

  return { version: PERF_BASELINE_VERSION, median: numberAt(parsed, 'median') ?? 0, files };
}

/** The baseline at `path`, or `undefined` when there is no readable one there. */
export function readBaseline(path: string): PerfBaseline | undefined {
  const text = readTextFile(path);

  return text === undefined ? undefined : parseBaseline(text);
}

/** Writes the baseline in its committed form, creating the parent directories. */
export function writeBaseline(path: string, baseline: PerfBaseline): void {
  writeTextFile(path, formatBaseline(baseline));
}

/**
 * Every file this run measured that the baseline knew and that is now far worse relative to its own
 * run, largest growth first.
 *
 * Both conditions have to hold: the ratio has to have grown by `factor`, **and** the file has to be
 * over `floorMs`. A recorded ratio of 0 is never compared — it would make any measurement an
 * infinite regression — and neither is anything at all when this run's median is 0, because then
 * there is no denominator to speak of.
 */
export function baselineRegressions(run: PerfRun, cwd: string, baseline: PerfBaseline, options: BaselineOptions): BaselineRegression[] {
  const measured = measuredFiles(run, cwd);
  const median = medianFileMs(measured.values());

  if (median <= 0) {
    return [];
  }

  const found: BaselineRegression[] = [];

  for (const [path, file] of measured) {
    const wasRatio = baseline.files[path];

    if (!hasRun(file) || wasRatio === undefined || wasRatio <= 0) {
      continue;
    }

    const ratio = file.tests / median;

    if (ratio >= wasRatio * options.factor && file.tests >= options.floorMs) {
      found.push({ file: path, ms: file.tests, ratio, wasRatio, grewBy: ratio / wasRatio });
    }
  }

  return found.sort((a, b) => b.grewBy - a.grewBy || a.file.localeCompare(b.file));
}

/**
 * What the two sides disagree about: files the baseline knows and this run did not measure, and
 * files this run measured that the baseline does not know. Neither is a failure — the first is a
 * shard that did not run them, the second is new specs — but a caller that cannot name them leaves
 * the reader wondering which of the two happened.
 */
export function baselineDrift(run: PerfRun, cwd: string, baseline: PerfBaseline): { readonly missing: string[]; readonly added: string[] } {
  const ran = new Set([...measuredFiles(run, cwd)].filter(([, file]) => hasRun(file)).map(([path]) => path));
  const known = new Set(Object.keys(baseline.files));

  return {
    missing: [...known].filter((path) => !ran.has(path)).sort((a, b) => a.localeCompare(b)),
    added: [...ran].filter((path) => !known.has(path)).sort((a, b) => a.localeCompare(b)),
  };
}
