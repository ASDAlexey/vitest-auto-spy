/**
 * Terminal color for the CLI's own tables and cards, and the width arithmetic that has to ignore it.
 *
 * One place decides whether color is wanted, because two renderers deciding it differently print
 * one report half in color. `NO_COLOR` (its presence), `FORCE_COLOR=0` and `TERM=dumb` all mean no.
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

export function colorWanted(env: NodeJS.ProcessEnv): boolean {
  return env['NO_COLOR'] === undefined && env['FORCE_COLOR'] !== '0' && env['TERM'] !== 'dumb';
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
