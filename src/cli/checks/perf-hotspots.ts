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
 * Three decisions are the rest of the design.
 *
 * **One set of numbers.** The rows come from `fileBudget` and `--max-test-ms`, the functions the gate
 * itself uses, and `--gate-only` narrows them the same way. A table that disagreed with the verdict
 * printed under it would be worse than no table.
 *
 * **The file names its bodies.** A test's identity is two-part — the file it lives in and its own
 * name — so the bodies table prints the file once, whole, and its names under it; a name that still
 * does not fit loses its head, where the suites around the test are, and keeps the test. A file path
 * is cut in the middle and on segment boundaries: the first segment names the project, the last
 * names the file.
 *
 * **Width is counted on what the terminal shows.** A cut path carries a dimmed ellipsis, and padding
 * that counted the escape sequence around it pulled every cut row eight columns to the left of its
 * neighbours. `NO_COLOR` (or `FORCE_COLOR=0`, or `TERM=dumb`) turns color off.
 */
import type { Painter } from '../paint';
import { padEnd, padStart, painterFor } from '../paint';
import type { PerfRun } from '../perf-data';
import { formatMs } from '../perf-data';
import type { GateOptions } from '../perf-gate';
import { GATE_DEFAULTS, fileBudget, isJudged, measuredFiles, medianTestMs } from '../perf-gate';

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
  /** Columns the tables are laid out for. A path wider than its column loses its middle, never its ends. */
  readonly width: number;
  /** The budgets the rows are judged against — the gate's own. */
  readonly gate: GateOptions;
  /** Terminal color. Left out, the environment decides: `NO_COLOR`, `FORCE_COLOR=0` and `TERM=dumb` mean no. */
  readonly colors?: boolean;
}

export const HOTSPOT_DEFAULTS: HotspotOptions = { limit: 10, width: 140, gate: GATE_DEFAULTS };

/** What a per-test column shows for a file that finished no body. Never `Infinity`, never `NaN`. */
const NO_PER_TEST = '—';

const INDENT = '  ';

/** Space between two columns, so a right-aligned number never touches the cell in front of it. */
const GAP = 4;

const ELLIPSIS = '…';

/** The files the gate would take as candidates, the most expensive first. */
export function filesOverBudget(run: PerfRun, cwd: string, gate: GateOptions, limit: number): FileOverBudget[] {
  const measured = measuredFiles(run, cwd);
  const medianTest = medianTestMs(measured.values());
  const found: FileOverBudget[] = [];

  for (const [file, entry] of measured) {
    const budget = fileBudget(entry, medianTest, gate);

    if (isJudged(file, gate.only) && entry.tests > 0 && entry.tests >= budget) {
      const perTest = entry.testCount > 0 ? entry.tests / entry.testCount : 0;

      found.push({
        file,
        ms: entry.tests,
        budget,
        testCount: entry.testCount,
        perTest,
        timesMedian: medianTest > 0 ? perTest / medianTest : 0,
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

/**
 * Keeps the tail. The head of a test name is the suites around it; the test itself is at the other
 * end, and it is the half a reader acts on.
 */
function truncateLeft(text: string, width: number, paint: Painter): string {
  if (text.length <= width) {
    return text;
  }

  return `${paint.dim(ELLIPSIS)}${text.slice(text.length - width + ELLIPSIS.length)}`;
}

/**
 * Keeps both ends, cutting whole segments out of the middle. Falls back to a tail cut for the two
 * shapes the middle cannot serve — no separator at all, or a file name alone wider than what is left.
 */
function truncatePath(path: string, width: number, paint: Painter): string {
  if (path.length <= width) {
    return path;
  }

  const first = path.indexOf('/');

  if (first === -1) {
    return truncateLeft(path, width, paint);
  }

  const head = path.slice(0, first);
  const rest = path.slice(first + 1).split('/');
  const budget = width - head.length - 3; // head + '/' + ellipsis + '/'
  const tail: string[] = [];
  let used = 0;

  for (const segment of [...rest].reverse()) {
    const next = used === 0 ? segment.length : used + 1 + segment.length;

    if (next > budget) {
      break;
    }

    tail.unshift(segment);
    used = next;
  }

  if (tail.length === 0) {
    return truncateLeft(path, width, paint);
  }

  return `${head}/${paint.dim(ELLIPSIS)}/${tail.join('/')}`;
}

function widthOf(head: string, cells: readonly string[]): number {
  return cells.reduce((widest, cell) => Math.max(widest, cell.length), head.length);
}

interface Column {
  readonly head: string;
  readonly cells: readonly string[];
}

/** A cell already padded to its column, and the color it is carried in — width math happens on the raw text. */
type Decorated = (row: number, column: number, padded: string) => string;

/** One flexible label column, then right-aligned numbers, so a 120-character path cannot push the numbers out of line. */
function table(label: Column, numbers: readonly Column[], width: number, paint: Painter, decorate: Decorated): string {
  const spent = numbers.reduce((sum, column) => sum + widthOf(column.head, column.cells) + GAP, 0);
  const labelWidth = Math.max(Math.min(widthOf(label.head, label.cells), width - INDENT.length - spent), label.head.length);
  const laid = [
    { width: labelWidth, left: true, texts: [label.head, ...label.cells.map((cell) => truncatePath(cell, labelWidth, paint))] },
    ...numbers.map((column) => ({ width: widthOf(column.head, column.cells) + GAP, left: false, texts: [column.head, ...column.cells] })),
  ];

  return laid
    .reduce<string[]>(
      (lines, column, current) =>
        column.texts.map(
          (text, index) =>
            `${lines[index] ?? INDENT}${decorate(index, current, column.left ? padEnd(text, column.width) : padStart(text, column.width))}`,
        ),
      [],
    )
    .join('\n');
}

function times(ratio: number): string {
  return ratio >= 10 ? `${Math.round(ratio)}×` : `${ratio.toFixed(1)}×`;
}

function fileSection(files: readonly FileOverBudget[], medianTest: number, options: HotspotOptions, paint: Painter): string[] {
  if (files.length === 0) {
    return [];
  }

  const { gate } = options;
  const drawn = table(
    { head: 'file', cells: files.map((entry) => entry.file) },
    [
      { head: 'time', cells: files.map((entry) => formatMs(entry.ms)) },
      { head: 'budget', cells: files.map((entry) => formatMs(entry.budget)) },
      { head: 'ms/test', cells: files.map((entry) => (entry.testCount === 0 ? NO_PER_TEST : formatMs(entry.perTest))) },
      { head: 'vs median test', cells: files.map((entry) => (entry.testCount === 0 ? NO_PER_TEST : times(entry.timesMedian))) },
    ],
    options.width,
    paint,
    (row, column, padded) => (row === 0 ? paint.dim(padded) : column === 1 ? paint.red(padded) : padded),
  );
  const note = [
    `${INDENT}\`budget\` is the largest of --max-file-ms ${formatMs(gate.maxFileMs)}, --max-file-tests ${gate.maxFileTests} × the median test of this run (${formatMs(medianTest)}),`,
    `${INDENT}and --factor ${gate.factor} × that median for each test in the file. A large file of ordinary tests is never here.`,
  ].join('\n');

  return [`files over budget — ${files.length === 1 ? 'the one' : 'the ones'} the gate re-measures and fails on`, drawn, note];
}

function bodySection(bodies: readonly BodyOverBudget[], options: HotspotOptions, paint: Painter): string[] {
  if (bodies.length === 0) {
    return [];
  }

  const timeWidth =
    widthOf(
      'time',
      bodies.map((entry) => formatMs(entry.ms)),
    ) + GAP;
  const nameWidth = Math.max(options.width - 2 * INDENT.length - timeWidth, 'test'.length);
  const groups = new Map<string, BodyOverBudget[]>();

  for (const entry of bodies) {
    const bucket = groups.get(entry.file);
    bucket === undefined ? groups.set(entry.file, [entry]) : bucket.push(entry);
  }

  const lines: string[] = [];

  for (const [file, entries] of groups) {
    lines.push(`${INDENT}${truncatePath(file, options.width - INDENT.length, paint)}`);

    for (const entry of entries) {
      lines.push(
        `${INDENT}${INDENT}${padEnd(truncateLeft(entry.name, nameWidth, paint), nameWidth)}${paint.red(padStart(formatMs(entry.ms), timeWidth))}`,
      );
    }
  }

  return [`test bodies over budget — each one over --max-test-ms ${formatMs(options.gate.maxTestMs)}`, lines.join('\n')];
}

/** Both tables, or an empty string when nothing in the run is over its budget. */
export function formatHotspots(run: PerfRun, cwd: string, options: Partial<HotspotOptions> = {}): string {
  const resolved = { ...HOTSPOT_DEFAULTS, ...options };
  const paint = painterFor(resolved.colors);
  const sections = [
    ...fileSection(
      filesOverBudget(run, cwd, resolved.gate, resolved.limit),
      medianTestMs(measuredFiles(run, cwd).values()),
      resolved,
      paint,
    ),
    ...bodySection(bodiesOverBudget(run, cwd, resolved.gate, resolved.limit), resolved, paint),
  ];

  return sections.join('\n\n');
}

/** The one line printed instead of the tables when nothing is over budget and no gate will say so. */
export function nothingOverBudgetNote(gate: GateOptions = GATE_DEFAULTS): string {
  return `Nothing over budget: no file over its budget and no test body over ${formatMs(gate.maxTestMs)}. Nothing here would fail --gate.`;
}
