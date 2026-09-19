/**
 * The gate's verdict as one table: each candidate, its two readings against its budget, and what the
 * gate made of it. The findings under it say why; this says which, in a form a reader can scan.
 */
import type { Painter } from './paint';
import { formatMs } from './perf-data';
import type { GateCheck, GateOutcome, GateRow } from './perf-gate';
import { drawTable } from './table';

const KIND: Record<GateCheck, string> = {
  'perf-gate-regression': 'grew',
  'perf-gate-slow-file': 'file',
  'perf-gate-slow-test': 'test',
  'perf-gate-wall': 'run',
};

/** The outcomes that fail the run, which is what the red is for. */
const FAILS: ReadonlySet<GateOutcome> = new Set(['confirmed', 'over budget', 'single reading']);

/** The last two levels of a full name: the `describe` a reader searches for and the `it` inside it. */
export function shortName(name: string): string {
  return name.split(' > ').slice(-2).join(' > ');
}

function where(row: GateRow): string {
  if (row.file === undefined) {
    return '(the whole run)';
  }

  return row.name === undefined ? row.file : `${row.file} › ${shortName(row.name)}`;
}

export function formatVerdict(rows: readonly GateRow[], paint: Painter): string[] {
  if (rows.length === 0) {
    return [];
  }

  const fails = rows.map((row) => FAILS.has(row.outcome));
  const failing = fails.filter(Boolean).length;
  const table = drawTable(
    [
      { head: 'kind', cells: rows.map((row) => KIND[row.check]), left: true },
      { head: 'first', cells: rows.map((row) => formatMs(row.ms)) },
      { head: 'again', cells: rows.map((row) => (row.again === undefined ? '—' : formatMs(row.again))) },
      { head: 'budget', cells: rows.map((row) => formatMs(row.budget)) },
      {
        head: 'verdict',
        cells: rows.map((row) => row.outcome),
        left: true,
        paint: (cell: string, index: number): string => (fails[index] === true ? paint.red(cell) : paint.dim(cell)),
      },
      { head: 'where', cells: rows.map(where), left: true },
    ],
    paint,
  );

  return [`perf gate verdict — ${rows.length} judged, ${failing} ${failing === 1 ? 'fails' : 'fail'} the run`, ...table];
}
