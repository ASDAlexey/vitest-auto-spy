/**
 * Terminal color for the CLI's own tables and cards, and the width arithmetic that has to ignore it.
 *
 * One place decides whether color is wanted, because two renderers deciding it differently print
 * one report half in color. `NO_COLOR` (its presence), `FORCE_COLOR=0` and `TERM=dumb` all mean no;
 * any other `FORCE_COLOR` means yes, and without one the answer is whether stdout is a terminal.
 */

export interface Painter {
  red(text: string): string;
  yellow(text: string): string;
  cyan(text: string): string;
  bold(text: string): string;
  dim(text: string): string;
}

export const ESC = String.fromCharCode(27);

const wrap =
  (open: string): ((text: string) => string) =>
  (text) =>
    `${ESC}[${open}m${text}${ESC}[0m`;

export const TERMINAL: Painter = { red: wrap('31'), yellow: wrap('33'), cyan: wrap('36'), bold: wrap('1'), dim: wrap('2') };

const same = (text: string): string => text;

export const MONOCHROME: Painter = { red: same, yellow: same, cyan: same, bold: same, dim: same };

/**
 * A pipe or a file gets no escapes unless `FORCE_COLOR` asks for them: a harness that captures this
 * output and repaints it line by line would otherwise nest its own colors around ours.
 */
export function colorWanted(env: NodeJS.ProcessEnv, isTTY: boolean = process.stdout.isTTY === true): boolean {
  if (env['NO_COLOR'] !== undefined || env['FORCE_COLOR'] === '0' || env['TERM'] === 'dumb') {
    return false;
  }

  return env['FORCE_COLOR'] !== undefined || isTTY;
}

export function painterFor(colors: boolean | undefined): Painter {
  return (colors ?? colorWanted(process.env)) ? TERMINAL : MONOCHROME;
}

const ESCAPES = new RegExp(`${ESC}\\[[\\d;]*m`, 'g');

export function stripColor(text: string): string {
  return text.replace(ESCAPES, '');
}

export function padEnd(text: string, width: number): string {
  return `${text}${' '.repeat(Math.max(0, width - stripColor(text).length))}`;
}

export function padStart(text: string, width: number): string {
  return `${' '.repeat(Math.max(0, width - stripColor(text).length))}${text}`;
}

/** Where a report is laid out when nothing says how wide the reader is: an 80-column CI log. */
export const FALLBACK_WIDTH = 80;

const MIN_WIDTH = 40;

/** Past this a line of prose is harder to read, not easier, however wide the terminal is. */
const MAX_WIDTH = 120;

function positive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function outputWidth(
  env: NodeJS.ProcessEnv = process.env,
  stdout: { readonly isTTY?: boolean; readonly columns?: number } = process.stdout,
): number {
  const columns = stdout.isTTY === true ? positive(stdout.columns) : undefined;

  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, columns ?? positive(Number(env['COLUMNS'])) ?? FALLBACK_WIDTH));
}

/** Greedy word wrap with a hanging indent. A word wider than the line keeps a line of its own, whole — a URL is never cut. */
export function wrapText(text: string, width: number, indent: string, firstIndent: string = indent): string[] {
  return text.split('\n').flatMap((paragraph, index) => wrapLine(paragraph, width, indent, index === 0 ? firstIndent : indent));
}

function wrapLine(text: string, width: number, indent: string, firstIndent: string): string[] {
  const lines: string[] = [];
  let current = firstIndent;
  let empty = true;

  for (const word of text.split(' ').filter((part) => part !== '')) {
    if (!empty && stripColor(current).length + 1 + stripColor(word).length > width) {
      lines.push(current);
      current = indent;
      empty = true;
    }

    current = empty ? `${current}${word}` : `${current} ${word}`;
    empty = false;
  }

  lines.push(current);

  return lines;
}
