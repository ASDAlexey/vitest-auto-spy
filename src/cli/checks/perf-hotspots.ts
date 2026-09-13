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
 * Four decisions are the whole design.
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
 *
 * **The file names its bodies.** A test's identity is two-part — the file it lives in and its own
 * name — and one `file › name` column pays for both out of a single width, cutting each into an
 * ellipsis that answers neither half. The bodies table prints the file once, whole, and its names
 * under it; a name that still does not fit loses its head, where the suites around the test are,
 * and keeps the test. A file path is cut in the middle and on segment boundaries: the first segment
 * names the project, the last names the file, and the middle is directories a reader can
 * reconstruct — losing the middle reads as a path, losing either end reads as nothing.
 *
 * **Color is spent on what has a budget.** The one unconditional number in these tables is the
 * per-body budget — the same second the gate fails a body for — so a body, or a file's `ms/test`,
 * at or over it is red. A file's total is not colored, because the file budget is relative to the
 * run's median and this table does not know it. Headers and the ellipsis of a cut cell are dimmed:
 * scaffolding, quieter than what it carries. `NO_COLOR` (or `FORCE_COLOR=0`, or `TERM=dumb`) turns
 * all of it off.
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
  /** Columns the tables are laid out for. A path wider than its column loses its middle, never its ends. */
  readonly width: number;
  /** Terminal color. Left out, the environment decides: `NO_COLOR`, `FORCE_COLOR=0` and `TERM=dumb` mean no. */
  readonly colors?: boolean;
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

const RED = '\u001b[31m';
const DIM = '\u001b[2m';
const OFF = '\u001b[0m';

interface Painter {
  red(text: string): string;
  dim(text: string): string;
}

const MONOCHROME: Painter = { red: (text) => text, dim: (text) => text };

const TERMINAL: Painter = {
  red: (text) => `${RED}${text}${OFF}`,
  dim: (text) => `${DIM}${text}${OFF}`,
};

/** Presence of `NO_COLOR` is the convention; `FORCE_COLOR=0` and `TERM=dumb` are the other two ways a terminal says no. */
function colorWanted(env: NodeJS.ProcessEnv): boolean {
  return env['NO_COLOR'] === undefined && env['FORCE_COLOR'] !== '0' && env['TERM'] !== 'dumb';
}

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
 * Keeps both ends, cutting whole segments out of the middle. `apps/web/…/tv/channel-card.component.spec.ts`
 * still names the project and the file; `…/src/app/modules/tv/channel-card.component.spec.ts` names
 * neither. Falls back to a tail cut for the two shapes the middle cannot serve — no separator at
 * all, or a file name alone wider than what is left.
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

/**
 * One flexible label column, then right-aligned numbers — the padding `formatPhases` does by hand,
 * with the constants taken out, so that a 120-character path cannot push the numbers out of line.
 */
function table(
  label: Column,
  numbers: readonly Column[],
  width: number,
  truncate: (cell: string, columnWidth: number) => string,
  decorate: Decorated,
): string {
  const spent = numbers.reduce((sum, column) => sum + widthOf(column.head, column.cells) + GAP, 0);
  const labelWidth = Math.max(Math.min(widthOf(label.head, label.cells), width - INDENT.length - spent), label.head.length);
  const laid = [
    { width: labelWidth, left: true, texts: [label.head, ...label.cells.map((cell) => truncate(cell, labelWidth))] },
    ...numbers.map((column) => ({ width: widthOf(column.head, column.cells) + GAP, left: false, texts: [column.head, ...column.cells] })),
  ];

  return laid
    .reduce<string[]>(
      (lines, column, current) =>
        column.texts.map(
          (text, index) =>
            `${lines[index] ?? INDENT}${decorate(index, current, column.left ? text.padEnd(column.width) : text.padStart(column.width))}`,
        ),
      [],
    )
    .join('\n');
}

function fileSection(files: readonly Hotspot[], total: number, width: number, floorMs: number, paint: Painter): string[] {
  const listed = files.reduce((sum, hotspot) => sum + hotspot.ms, 0);
  const overBudget = new Set(files.flatMap((hotspot, index) => (hotspot.testCount > 0 && hotspot.perTest >= floorMs ? [index + 1] : [])));
  const drawn = table(
    { head: 'file', cells: files.map((hotspot) => hotspot.file) },
    [
      { head: 'time', cells: files.map((hotspot) => formatMs(hotspot.ms)) },
      { head: 'ms/test', cells: files.map((hotspot) => (hotspot.testCount === 0 ? NO_PER_TEST : formatMs(hotspot.perTest))) },
      { head: 'share', cells: files.map((hotspot) => formatShare(hotspot.ms / total)) },
    ],
    width,
    (cell, columnWidth) => truncatePath(cell, columnWidth, paint),
    (row, column, padded) => (row === 0 ? paint.dim(padded) : column === 2 && overBudget.has(row) ? paint.red(padded) : padded),
  );
  const counted = files.length === 1 ? 'That one file is' : `Those ${files.length} files are`;
  const prose = [
    `${INDENT}${counted} ${formatMs(listed)} of the ${formatMs(total)} this run spent in test bodies — ${formatShare(listed / total)} of it.`,
    `${INDENT}\`time\` is what the file costs, \`ms/test\` what one test in it costs, and the second is the one that says whether to open the file:`,
    `${INDENT}400 tests sharing 6.00s is a large file, 3 tests sharing 6.00s is a slow one. A file that finished no test shows ${NO_PER_TEST}.`,
  ].join('\n');

  return ['slowest files — what every body in the file cost, and what one of them cost', drawn, prose];
}

function caseSection(cases: readonly CaseHotspot[], width: number, floorMs: number, paint: Painter): string[] {
  if (cases.length === 0) {
    return [];
  }

  const timeWidth =
    widthOf(
      'time',
      cases.map((entry) => formatMs(entry.ms)),
    ) + GAP;
  const nameWidth = Math.max(width - 2 * INDENT.length - timeWidth, 'test'.length);
  const groups = new Map<string, CaseHotspot[]>();

  for (const entry of cases) {
    const bucket = groups.get(entry.file);
    bucket === undefined ? groups.set(entry.file, [entry]) : bucket.push(entry);
  }

  const lines: string[] = [];

  for (const [file, entries] of groups) {
    lines.push(`${INDENT}${truncatePath(file, width - INDENT.length, paint)}`);

    for (const entry of entries) {
      const time = formatMs(entry.ms).padStart(timeWidth);
      lines.push(
        `${INDENT}${INDENT}${truncateLeft(entry.name, nameWidth, paint).padEnd(nameWidth)}${entry.ms >= floorMs ? paint.red(time) : time}`,
      );
    }
  }

  return [
    `slowest test bodies — a body under ${formatMs(CASE_FLOOR_MS)} is not in the report at all, so a fast one is absent rather than cheap`,
    lines.join('\n'),
  ];
}

/** Both tables, or an empty string when the run is too small for either to be worth printing. */
export function formatHotspots(run: PerfRun, cwd: string, options: Partial<HotspotOptions> = {}): string {
  const { limit, floorMs, width, colors } = { ...HOTSPOT_DEFAULTS, ...options };
  const paint = withColors(colors ?? colorWanted(process.env));
  const files = fileHotspots(run, cwd, limit);
  const [slowest] = files;

  if (slowest === undefined || slowest.ms < floorMs) {
    return '';
  }

  const sections = [
    ...fileSection(files, totalTestMs(run, cwd), width, floorMs, paint),
    ...caseSection(caseHotspots(run, cwd, limit), width, floorMs, paint),
  ];

  return sections.join('\n\n');
}

function withColors(on: boolean): Painter {
  return on ? TERMINAL : MONOCHROME;
}

/**
 * Why there is no table, for the caller that asked for one by name.
 *
 * The floor is right and stays, but it is a decision the reader cannot see: `--top 15` answering with
 * nothing reads as a broken flag, and "the tables are missing" is the one question this module's own
 * silence cannot answer. Printed only when the rows were asked for explicitly.
 */
export function hotspotFloorNote(run: PerfRun, cwd: string, floorMs: number = HOTSPOT_DEFAULTS.floorMs): string {
  const [slowest] = fileHotspots(run, cwd, 1);

  return slowest === undefined
    ? 'No hotspot tables: no file in this run finished a test body, so there is nothing to rank.'
    : `No hotspot tables: the slowest file spent ${formatMs(slowest.ms)} in its test bodies, under the ${formatMs(floorMs)} floor. ` +
        'Below it a ranking is the reader’s attention spent on the machine rather than on a decision somebody made.';
}
