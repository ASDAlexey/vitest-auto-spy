/**
 * The two questions a reader opens a perf report with, and the only ones nothing in it answers:
 * which of my spec files cost the most, and which of my test bodies do.
 *
 * The phase table is a total — it says `tests` is 38 s and stops there — and every other finding in
 * the report fires from a *rule*: this file needs no DOM, that one reaches its subject through a
 * barrel. Both are worth printing, and neither is the ordinary question. A suite of 1 700 files and
 * 12 000 bodies has a shape, the report already carries it file by file, and until this module
 * nothing put it on the screen.
 *
 * Two decisions are the whole design.
 *
 * **Per-test cost is the column that changes the conversation.** A file whose bodies add up to 6 s
 * is not a defect when 400 tests shared them; the same 6 s over three tests is. Total time sorts the
 * table, because total time is what a reader wants less of, but the cost of one body is what says
 * whether a file is heavy or merely large — so the two are printed side by side and neither is
 * offered alone. A file that finished no body has no per-test cost at all, and says so rather than
 * dividing by zero and printing a word no reader can act on.
 *
 * **Below a floor there is no table.** Nothing here is a finding and nothing here fails a build, so
 * the only thing these rows can cost is the reader's attention. A suite whose slowest file spent
 * 40 ms in its bodies has no hotspot, and printing its top ten anyway is how a reader learns to skip
 * the section in the reports where it would have mattered.
 */
import type { PerfRun } from '../perf-data';
import { CASE_FLOOR_MS, formatMs, formatShare } from '../perf-data';
import { measuredFiles } from '../perf-gate';

/** One spec file's bill: what all of its bodies cost, and what one of them cost on average. */
export interface Hotspot {
  /** Repository-relative path, the way the gate keys its files. */
  readonly file: string;
  /** Time in the test bodies of this file. */
  readonly ms: number;
  readonly testCount: number;
  /** `ms` per finished body, and 0 when the file finished none — there is no average of nothing. */
  readonly perTest: number;
}

/** One test body, named by the file it lives in. Only a version 2 report carries any of these. */
export interface CaseHotspot {
  readonly file: string;
  /** Vitest's full name: every parent suite, then the test. */
  readonly name: string;
  readonly ms: number;
}

export interface HotspotOptions {
  /** Rows per table. */
  readonly limit: number;
  /** The slowest file has to reach this before either table is printed at all. */
  readonly floorMs: number;
  /** Columns the tables are laid out for. A path wider than its column loses its head, not its tail. */
  readonly width: number;
}

/**
 * Ten rows, a one-second floor, 140 columns.
 *
 * Ten is what a reader acts on: the eleventh slowest file in a suite is somebody else's afternoon.
 * One second is where a file's bodies stop being the machine and start being a decision somebody
 * made — it is also the gate's own per-body budget, so the two halves of this command agree about
 * what "slow" is worth mentioning. 140 is the width every other table in this repository assumes.
 */
export const HOTSPOT_DEFAULTS: HotspotOptions = { limit: 10, floorMs: 1_000, width: 140 };

/** What the `ms/test` column shows for a file that finished no body. Never `Infinity`, never `NaN`. */
const NO_PER_TEST = '—';

const INDENT = '  ';

/** Space between two columns, so a right-aligned number never touches the cell in front of it. */
const GAP = 4;

const ELLIPSIS = '…';

/** The files whose test bodies cost the most, slowest first. */
export function fileHotspots(run: PerfRun, cwd: string, limit: number): Hotspot[] {
  const found: Hotspot[] = [];

  for (const [file, measured] of measuredFiles(run, cwd)) {
    if (measured.tests > 0) {
      found.push({
        file,
        ms: measured.tests,
        testCount: measured.testCount,
        perTest: measured.testCount > 0 ? measured.tests / measured.testCount : 0,
      });
    }
  }

  return found.sort((a, b) => b.ms - a.ms || a.file.localeCompare(b.file)).slice(0, Math.max(0, limit));
}

/** The slowest individual test bodies the report carries, slowest first. */
export function caseHotspots(run: PerfRun, cwd: string, limit: number): CaseHotspot[] {
  const found: CaseHotspot[] = [];

  for (const [file, measured] of measuredFiles(run, cwd)) {
    for (const entry of measured.cases) {
      found.push({ file, name: entry.name, ms: entry.ms });
    }
  }

  return found.sort((a, b) => b.ms - a.ms || a.file.localeCompare(b.file) || a.name.localeCompare(b.name)).slice(0, Math.max(0, limit));
}

/** What the whole repository spent in test bodies: the denominator every share here is taken over. */
function totalTestMs(run: PerfRun, cwd: string): number {
  return [...measuredFiles(run, cwd).values()].reduce((total, file) => total + file.tests, 0);
}

/**
 * Keeps the tail. The head of a path is directories a reader already knows they are in, and the head
 * of a test name is the suites around it; the file name and the test itself are at the other end.
 */
function truncateLeft(text: string, width: number): string {
  return text.length <= width ? text : `${ELLIPSIS}${text.slice(text.length - width + ELLIPSIS.length)}`;
}

function widthOf(head: string, cells: readonly string[]): number {
  return cells.reduce((widest, cell) => Math.max(widest, cell.length), head.length);
}

interface Column {
  readonly head: string;
  readonly cells: readonly string[];
}

/**
 * One flexible label column, then right-aligned numbers — the padding `formatPhases` does by hand,
 * with the constants taken out, so that a 120-character path cannot push the numbers out of line.
 */
function table(label: Column, numbers: readonly Column[], width: number): string {
  const spent = numbers.reduce((sum, column) => sum + widthOf(column.head, column.cells) + GAP, 0);
  const labelWidth = Math.max(Math.min(widthOf(label.head, label.cells), width - INDENT.length - spent), label.head.length);
  const laid = [
    { width: labelWidth, left: true, texts: [label.head, ...label.cells.map((cell) => truncateLeft(cell, labelWidth))] },
    ...numbers.map((column) => ({ width: widthOf(column.head, column.cells) + GAP, left: false, texts: [column.head, ...column.cells] })),
  ];

  return laid
    .reduce<string[]>(
      (lines, column) =>
        column.texts.map(
          (text, index) => `${lines[index] ?? INDENT}${column.left ? text.padEnd(column.width) : text.padStart(column.width)}`,
        ),
      [],
    )
    .join('\n');
}

function fileSection(files: readonly Hotspot[], total: number, width: number): string[] {
  const listed = files.reduce((sum, hotspot) => sum + hotspot.ms, 0);
  const drawn = table(
    { head: 'file', cells: files.map((hotspot) => hotspot.file) },
    [
      { head: 'time', cells: files.map((hotspot) => formatMs(hotspot.ms)) },
      { head: 'ms/test', cells: files.map((hotspot) => (hotspot.testCount === 0 ? NO_PER_TEST : formatMs(hotspot.perTest))) },
      { head: 'share', cells: files.map((hotspot) => formatShare(hotspot.ms / total)) },
    ],
    width,
  );
  const counted = files.length === 1 ? 'That one file is' : `Those ${files.length} files are`;
  const prose = [
    `${INDENT}${counted} ${formatMs(listed)} of the ${formatMs(total)} this run spent in test bodies — ${formatShare(listed / total)} of it.`,
    `${INDENT}\`time\` is what the file costs, \`ms/test\` what one test in it costs, and the second is the one that says whether to open the file:`,
    `${INDENT}400 tests sharing 6.00s is a large file, 3 tests sharing 6.00s is a slow one. A file that finished no test shows ${NO_PER_TEST}.`,
  ].join('\n');

  return ['slowest files — what every body in the file cost, and what one of them cost', drawn, prose];
}

function caseSection(cases: readonly CaseHotspot[], width: number): string[] {
  if (cases.length === 0) {
    return [];
  }

  return [
    `slowest test bodies — a body under ${formatMs(CASE_FLOOR_MS)} is not in the report at all, so a fast one is absent rather than cheap`,
    table(
      { head: 'test', cells: cases.map((entry) => `${entry.file} › ${entry.name}`) },
      [{ head: 'time', cells: cases.map((entry) => formatMs(entry.ms)) }],
      width,
    ),
  ];
}

/** Both tables, or an empty string when the run is too small for either to be worth printing. */
export function formatHotspots(run: PerfRun, cwd: string, options: Partial<HotspotOptions> = {}): string {
  const { limit, floorMs, width } = { ...HOTSPOT_DEFAULTS, ...options };
  const files = fileHotspots(run, cwd, limit);
  const [slowest] = files;

  if (slowest === undefined || slowest.ms < floorMs) {
    return '';
  }

  return [...fileSection(files, totalTestMs(run, cwd), width), ...caseSection(caseHotspots(run, cwd, limit), width)].join('\n\n');
}
