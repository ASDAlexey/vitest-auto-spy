/**
 * The two tables under the phase table: the files and the test bodies that are over the gate's
 * budget, and nothing else.
 *
 * They used to be a top ten — the ten most expensive files and the ten slowest bodies of any run —
 * and on a real suite that turned out to be a list of the largest files. Measured on a 2 023-file
 * consumer suite, the top of it was a 234-test component spec at 8.6 ms a test and a 209-test
 * service spec at 5 ms, neither of which anyone should open, while nothing on the screen said which
 * rows the gate would fail a pipeline over. So a row is printed only when the gate would take it as
 * a candidate, under the same budgets, and each row carries the budget it is over.
 *
 * The rows come from `fileBudget` and `--max-test-ms`, the functions the gate itself uses, and
 * `--gate-only` narrows them the same way: a table that disagreed with the verdict printed under it
 * would be worse than no table. Numbers go first and the path last, whole, so an 80-column CI log
 * still shows a path that can be copied.
 */
import type { Painter } from '../paint';
import { painterFor, wrapText } from '../paint';
import type { PerfBaseline } from '../perf-baseline';
import type { PerfRun } from '../perf-data';
import { formatMs } from '../perf-data';
import type { GateOptions } from '../perf-gate';
import { GATE_DEFAULTS, fileBudget, isJudged, measuredFiles, medianFileMs, medianTestMs } from '../perf-gate';
import { TABLE_INDENT, drawTable } from '../table';

/** A file whose bodies add up to more than the gate allows it. */
export interface FileOverBudget {
  /** Repository-relative path, the way the gate keys its files. */
  readonly file: string;
  /** Time in the test bodies of this file. */
  readonly ms: number;
  readonly budget: number;
  readonly testCount: number;
  /** `ms` per finished body, and 0 when the file finished none — there is no average of nothing. */
  readonly perTest: number;
  /** How many median tests of the run one test of this file costs; 0 when there is no average. */
  readonly timesMedian: number;
  /** Its share of the median file now against the share the baseline recorded; `undefined` when it has none. */
  readonly grewBy?: number;
}

/** One test body over `--max-test-ms`. Only a version 2 report carries any of these. */
export interface BodyOverBudget {
  readonly file: string;
  /** Vitest's full name: every parent suite, then the test. */
  readonly name: string;
  readonly ms: number;
}

export interface HotspotOptions {
  /** Rows per table. */
  readonly limit: number;
  /** The budgets the rows are judged against — the gate's own. */
  readonly gate: GateOptions;
  /** Terminal color. Left out, the environment decides: `NO_COLOR`, `FORCE_COLOR` and whether stdout is a terminal. */
  readonly colors?: boolean;
  /** A committed baseline, which adds a column saying how much each file grew against it. */
  readonly baseline?: PerfBaseline;
}

export const HOTSPOT_DEFAULTS: HotspotOptions = { limit: 10, gate: GATE_DEFAULTS };

/** What a per-test column shows for a file that finished no body. Never `Infinity`, never `NaN`. */
const NO_VALUE = '—';

/** The files the gate would take as candidates, the most expensive first. */
export function filesOverBudget(run: PerfRun, cwd: string, gate: GateOptions, limit: number, baseline?: PerfBaseline): FileOverBudget[] {
  const measured = measuredFiles(run, cwd);
  const medianTest = medianTestMs(measured.values());
  const medianFile = medianFileMs(measured.values());
  const found: FileOverBudget[] = [];

  for (const [file, entry] of measured) {
    const budget = fileBudget(entry, medianTest, gate);

    if (isJudged(file, gate.only) && entry.tests > 0 && entry.tests >= budget) {
      const perTest = entry.testCount > 0 ? entry.tests / entry.testCount : 0;
      const was = baseline?.files[file];

      found.push({
        file,
        ms: entry.tests,
        budget,
        testCount: entry.testCount,
        perTest,
        timesMedian: medianTest > 0 ? perTest / medianTest : 0,
        ...(was === undefined || was <= 0 || medianFile <= 0 ? {} : { grewBy: entry.tests / medianFile / was }),
      });
    }
  }

  return found.sort((a, b) => b.ms - a.ms || a.file.localeCompare(b.file)).slice(0, Math.max(0, limit));
}

/** The bodies over `--max-test-ms`, the slowest first. */
export function bodiesOverBudget(run: PerfRun, cwd: string, gate: GateOptions, limit: number): BodyOverBudget[] {
  const found: BodyOverBudget[] = [];

  for (const [file, measured] of measuredFiles(run, cwd)) {
    if (isJudged(file, gate.only)) {
      found.push(
        ...measured.cases.filter((entry) => entry.ms >= gate.maxTestMs).map((entry) => ({ file, name: entry.name, ms: entry.ms })),
      );
    }
  }

  return found.sort((a, b) => b.ms - a.ms || a.file.localeCompare(b.file) || a.name.localeCompare(b.name)).slice(0, Math.max(0, limit));
}

export function times(ratio: number): string {
  return ratio >= 10 ? `${Math.round(ratio)}×` : `${ratio.toFixed(1)}×`;
}

function shownOf(shown: number, total: number): string {
  return shown < total ? `, the ${shown} most expensive shown` : '';
}

/** How many files the run measured that the gate may judge — the "of N" in each table's title. */
function judgedCount(run: PerfRun, cwd: string, gate: GateOptions): number {
  return [...measuredFiles(run, cwd).keys()].filter((file) => isJudged(file, gate.only)).length;
}

/** The budgets every row below is judged against, stated once and checkable against the numbers in it. */
export function budgetLine(gate: GateOptions, medianTest: number, width: number): string[] {
  return wrapText(
    `budgets: a test body ${formatMs(gate.maxTestMs)} (--max-test-ms); a file's bodies the largest of ${formatMs(gate.maxFileMs)} (--max-file-ms), ${gate.maxFileTests} median tests (--max-file-tests, ${formatMs(gate.maxFileTests * medianTest)} here) and ${gate.factor}× the median test for each of its tests (--factor).`,
    width,
    TABLE_INDENT,
    '',
  );
}

function fileSection(all: readonly FileOverBudget[], judged: number, options: HotspotOptions, paint: Painter): string[] {
  const files = all.slice(0, Math.max(0, options.limit));

  if (files.length === 0) {
    return [];
  }

  const table = drawTable(
    [
      { head: 'time', cells: files.map((entry) => formatMs(entry.ms)), paint: (cell): string => paint.red(cell) },
      { head: 'budget', cells: files.map((entry) => formatMs(entry.budget)) },
      { head: 'over', cells: files.map((entry) => times(entry.ms / entry.budget)) },
      { head: 'tests', cells: files.map((entry) => String(entry.testCount)) },
      { head: 'ms/test', cells: files.map((entry) => (entry.testCount === 0 ? NO_VALUE : formatMs(entry.perTest))) },
      { head: '×median', cells: files.map((entry) => (entry.testCount === 0 ? NO_VALUE : times(entry.timesMedian))) },
      ...(options.baseline === undefined
        ? []
        : [{ head: 'vs base', cells: files.map((entry) => (entry.grewBy === undefined ? 'new' : times(entry.grewBy))) }]),
      { head: 'file', cells: files.map((entry) => entry.file), left: true },
    ],
    paint,
  );

  return [
    `files over budget — ${all.length} of ${judged}${shownOf(files.length, all.length)}; the gate re-measures these and fails on them`,
    ...table,
  ];
}

function bodySection(all: readonly BodyOverBudget[], options: HotspotOptions, paint: Painter): string[] {
  const bodies = all.slice(0, Math.max(0, options.limit));

  if (bodies.length === 0) {
    return [];
  }

  const groups = new Map<string, BodyOverBudget[]>();

  for (const entry of bodies) {
    const bucket = groups.get(entry.file);
    bucket === undefined ? groups.set(entry.file, [entry]) : bucket.push(entry);
  }

  const timeWidth = Math.max(...bodies.map((entry) => formatMs(entry.ms).length));
  const lines = [...groups].flatMap(([file, entries]) => [
    `${TABLE_INDENT}${file}`,
    ...entries.map((entry) => `${TABLE_INDENT}${TABLE_INDENT}${paint.red(formatMs(entry.ms).padStart(timeWidth))}  ${entry.name}`),
  ]);

  return [
    `test bodies over budget — ${all.length}${shownOf(bodies.length, all.length)}, each over --max-test-ms ${formatMs(options.gate.maxTestMs)}`,
    ...lines,
  ];
}

/** Both tables, or an empty string when nothing in the run is over its budget. */
export function formatHotspots(run: PerfRun, cwd: string, options: Partial<HotspotOptions> = {}): string {
  const resolved: HotspotOptions = { ...HOTSPOT_DEFAULTS, ...options };
  const paint = painterFor(resolved.colors);
  const files = fileSection(
    filesOverBudget(run, cwd, resolved.gate, Number.POSITIVE_INFINITY, resolved.baseline),
    judgedCount(run, cwd, resolved.gate),
    resolved,
    paint,
  );
  const bodies = bodySection(bodiesOverBudget(run, cwd, resolved.gate, Number.POSITIVE_INFINITY), resolved, paint);

  return [files, bodies]
    .filter((section) => section.length > 0)
    .map((section) => section.join('\n'))
    .join('\n\n');
}

/** The one line printed instead of the tables when nothing is over budget and no gate will say so. */
export function nothingOverBudgetNote(gate: GateOptions = GATE_DEFAULTS, runFailed = false): string {
  const verdict = runFailed
    ? 'The suite did not pass, though, and --gate does not judge a red run: fix it before reading this as an all-clear.'
    : 'Nothing here would fail --gate.';

  return `Nothing over budget: no file over its budget and no test body over ${formatMs(gate.maxTestMs)}. ${verdict}`;
}
