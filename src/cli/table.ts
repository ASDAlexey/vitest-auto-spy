/**
 * The CLI's tables: numbers right-aligned in front, the one free-text column last and never cut, so
 * a path can be copied out of any log however narrow it is.
 */
import type { Painter } from './paint';
import { padEnd, padStart, stripColor } from './paint';

export interface TableColumn {
  readonly head: string;
  readonly cells: readonly string[];
  /** Numbers are right-aligned; the default. */
  readonly left?: boolean;
  /** Paints one cell after it is padded, so the width math never sees the escapes. */
  readonly paint?: (cell: string, row: number) => string;
}

export const TABLE_INDENT = '  ';

const GAP = '  ';

function widthOf(column: TableColumn): number {
  return column.cells.reduce((widest, cell) => Math.max(widest, stripColor(cell).length), column.head.length);
}

export function drawTable(columns: readonly TableColumn[], paint: Painter): string[] {
  const last = columns.length - 1;

  return columns
    .map((column, index) => {
      const width = widthOf(column);
      const fit = (text: string): string => (column.left !== true ? padStart(text, width) : index === last ? text : padEnd(text, width));

      return [
        column.head === '' ? fit('') : paint.dim(fit(column.head)),
        ...column.cells.map((cell, row) => (column.paint === undefined ? fit(cell) : column.paint(fit(cell), row))),
      ];
    })
    .reduce<string[]>(
      (lines, texts) => texts.map((text, row) => (lines[row] === undefined ? `${TABLE_INDENT}${text}` : `${lines[row]}${GAP}${text}`)),
      [],
    )
    .map((line) => line.trimEnd());
}

const PARTIAL = '▏▎▍▌▋▊▉';

/** A horizontal bar `cells` wide at a share of 1, in eighths of a cell. */
export function bar(share: number, cells: number): string {
  const eighths = Math.round(Math.min(Math.max(share, 0), 1) * cells * 8);

  return `${'█'.repeat(Math.floor(eighths / 8))}${eighths % 8 === 0 ? '' : PARTIAL.charAt((eighths % 8) - 1)}`;
}
