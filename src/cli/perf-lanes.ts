/**
 * How the run used its worker lanes, from Vitest 5's `concurrencyId` and each file's start time: how
 * busy the lanes were, and the file still running after every other lane had gone idle.
 */
import type { PerfFile } from './perf-data';
import { formatMs, formatShare } from './perf-data';
import type { Finding } from './report';

/** The share of the run's span one file may run alone before it is the run's wall clock. */
const LONG_POLE_SHARE = 0.3;

/** Below this the tail is scheduling noise, whatever its share — the floor Vitest 5's own hints use. */
const LONG_POLE_MS = 2_000;

export interface LongPole {
  /** Repository-relative path. */
  readonly file: string;
  /** How long it ran after every other lane had finished. */
  readonly aloneMs: number;
}

export interface LaneSummary {
  readonly lanes: number;
  /** From the first file's start to the last file's end. */
  readonly spanMs: number;
  /** Busy time over lanes × span, 0–1. */
  readonly busy: number;
  readonly longPole?: LongPole;
}

interface Placed {
  readonly path: string;
  readonly lane: number;
  readonly start: number;
  readonly end: number;
}

/** The environment is left out: it belongs to the worker, and a reused worker does not pay it per file. */
function busyOf(file: PerfFile): number {
  return file.prepare + file.setup + file.imports + file.tests;
}

function placed(measured: ReadonlyMap<string, PerfFile>): Placed[] {
  const found: Placed[] = [];

  for (const [path, file] of measured) {
    if (file.lane !== undefined && file.start !== undefined) {
      found.push({ path, lane: file.lane, start: file.start, end: file.start + busyOf(file) });
    }
  }

  return found;
}

/** The lanes, or `undefined` for a report that does not place its files on them. */
export function lanesOf(measured: ReadonlyMap<string, PerfFile>): LaneSummary | undefined {
  const files = placed(measured);

  if (files.length === 0) {
    return undefined;
  }

  const ends = new Map<number, number>();

  for (const file of files) {
    ends.set(file.lane, Math.max(ends.get(file.lane) ?? file.end, file.end));
  }

  const first = Math.min(...files.map((file) => file.start));
  const last = files.reduce((latest, file) => (file.end > latest.end ? file : latest));
  const spanMs = last.end - first;
  const busy = files.reduce((total, file) => total + file.end - file.start, 0);
  const others = [...ends].filter(([lane]) => lane !== last.lane).map(([, end]) => end);
  const aloneMs = others.length === 0 ? 0 : last.end - Math.max(...others);

  return {
    lanes: ends.size,
    spanMs,
    busy: spanMs <= 0 ? 1 : busy / (ends.size * spanMs),
    ...(aloneMs > 0 ? { longPole: { file: last.path, aloneMs } } : {}),
  };
}

/** One line under the header: the lanes, how busy they were, and who finished alone. */
export function formatLanes(summary: LaneSummary): string {
  const pole =
    summary.longPole === undefined ? '' : `; ${summary.longPole.file} ran alone for the last ${formatMs(summary.longPole.aloneMs)}`;

  return `${summary.lanes} ${summary.lanes === 1 ? 'lane' : 'lanes'} busy ${formatShare(summary.busy)} of the ${formatMs(summary.spanMs)} span${pole}`;
}

export function longPoleFindings(summary: LaneSummary | undefined): Finding[] {
  const pole = summary?.longPole;

  if (summary === undefined || pole === undefined || pole.aloneMs < LONG_POLE_MS || pole.aloneMs < LONG_POLE_SHARE * summary.spanMs) {
    return [];
  }

  return [
    {
      check: 'perf-long-pole',
      severity: 'info',
      file: pole.file,
      message: `Still running ${formatMs(pole.aloneMs)} after every other lane had gone idle — ${formatShare(pole.aloneMs / summary.spanMs)} of the run's ${formatMs(summary.spanMs)} span ran on this file alone, and the ${summary.lanes} lanes were busy ${formatShare(summary.busy)} of it.`,
      fix: "Split the file so its tests can spread over several lanes, or keep Vitest's results cache between CI runs: the sequencer starts the files it knows are slow first, and a slow file started last is the run's wall clock.",
    },
  ];
}
