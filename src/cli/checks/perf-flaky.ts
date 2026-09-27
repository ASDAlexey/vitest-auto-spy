/** Findings `perf` makes on every run however cheap: tests that passed only on a retry, and the heap after each file. */
import { relative } from 'node:path';

import { toPosix } from '../fs-scan';
import type { PerfFile } from '../perf-data';
import { formatMs } from '../perf-data';
import { packageOf } from '../perf-profile';
import type { Finding } from '../report';

const FLAKY_FIX = [
  'A test that needs a retry to pass depends on something outside itself: a real timer, the order the tests ran in, state another test left behind,',
  'or an `await` that settles on a schedule. Run the file on its own with `--retry=0 --sequence.shuffle` until it fails, and fix that instead of',
  'keeping the retry.',
].join(' ');

/** Vitest times a retried test from its first attempt to its pass, so the failed attempts cannot be subtracted — only counted. */
function attemptsNote(retries: number | undefined): string {
  if (retries === undefined) {
    return `Its failed attempts are counted in this file's time, so the gate judges it slower than it is.`;
  }

  return `Its ${retries === 1 ? '1 failed attempt is' : `${retries} failed attempts are`} counted in this file's time, so the gate judges it slower than it is.`;
}

/** What the one retried test cost across its attempts, when the report recorded its body. */
function attemptsCost(file: PerfFile, names: readonly string[]): string {
  const [name] = names;
  const body = file.cases.find((entry) => entry.name === name);

  if (names.length !== 1 || body === undefined || file.retries === undefined) {
    return '';
  }

  return ` It took ${formatMs(body.ms)} across its ${file.retries + 1} attempts.`;
}

export function flakyFindings(measured: ReadonlyMap<string, PerfFile>, failOnFlaky: boolean): Finding[] {
  return [...measured].flatMap(([path, file]): Finding[] => {
    const names = file.flaky ?? [];

    return names.length === 0
      ? []
      : [
          {
            check: 'perf-flaky',
            severity: failOnFlaky ? 'error' : 'warning',
            file: path,
            message: `${names.length === 1 ? '1 test' : `${names.length} tests`} passed only after a retry: ${names.map((name) => `\`${name}\``).join(', ')}.${attemptsCost(file, names)}`,
            fix: `${FLAKY_FIX} ${attemptsNote(file.retries)}`,
          },
        ];
  });
}

const HEAP_LIST = 5;

/** A module whose first evaluation took less than this is too small to account for megabytes of heap. */
const LOAD_FLOOR_MS = 50;

/** How many first-loaded modules one file names. */
const LOAD_NAMES = 3;

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

type Timed = PerfFile & { readonly heap: number; readonly start: number; readonly lane: number };

interface Grown {
  readonly path: string;
  readonly file: Timed;
  readonly grew: number;
}

/**
 * What each file added to the heap of the worker that ran it, over the file before it there. Under
 * `isolate: false` a lane keeps one worker, so the lane and the start order are the worker's files in
 * order; Vitest 5.0's `workerId` is new for every file and groups nothing. `undefined` when the run
 * isolated its files or the report places none of them.
 */
function heapGrowth(measured: ReadonlyMap<string, PerfFile>, reused: boolean): Grown[] | undefined {
  const lanes = new Map<number, [string, Timed][]>();
  const timed = [...measured].filter(
    (entry): entry is [string, Timed] => entry[1].heap !== undefined && entry[1].start !== undefined && entry[1].lane !== undefined,
  );

  for (const entry of timed) {
    lanes.set(entry[1].lane, [...(lanes.get(entry[1].lane) ?? []), entry]);
  }

  if (!reused || ![...lanes.values()].some((files) => files.length > 1)) {
    return undefined;
  }

  const grown: Grown[] = [];

  for (const files of lanes.values()) {
    files
      .sort((a, b) => a[1].start - b[1].start)
      .reduce((before, after) => {
        grown.push({ path: after[0], file: after[1], grew: after[1].heap - before[1].heap });

        return after;
      });
  }

  return grown.filter(({ grew }) => grew > 0);
}

/** The modules a file evaluated first in its worker that took long enough to matter, by package where there is one. */
function firstLoadNames(file: PerfFile, cwd: string): string[] {
  const names = (file.firstLoads ?? [])
    .filter((entry) => entry.ms >= LOAD_FLOOR_MS)
    .sort((a, b) => b.ms - a.ms || a.module.localeCompare(b.module))
    .map((entry) => packageOf(entry.module) ?? toPosix(relative(cwd, entry.module)));

  return [...new Set(names)].slice(0, LOAD_NAMES);
}

interface Attributed {
  readonly path: string;
  /** Heap the file kept beyond what loading its modules explains. */
  readonly retained: number;
  /** Heap charged to the modules it evaluated first. */
  readonly loaded: number;
  readonly names: readonly string[];
}

/** The middle reading, the higher of the two middle ones: a collection that ran mid-file only ever lowers one. */
function upperMedian(values: readonly number[]): number {
  return Math.max(...[...values].sort((a, b) => a - b).slice(0, Math.floor(values.length / 2) + 1));
}

/**
 * Splits each file's growth into the first load of its modules and what the spec kept. Each lane loads
 * a module once, so the files that loaded the same one first give one reading each of what it costs,
 * and a file at more than twice that kept the rest. With a single reading the whole growth is the load.
 */
function attribute(growth: readonly Grown[], cwd: string): Attributed[] {
  const byModule = new Map<string, (Grown & { readonly names: readonly string[] })[]>();
  const attributed: Attributed[] = [];

  for (const entry of growth) {
    const names = firstLoadNames(entry.file, cwd);
    const [key] = names;

    if (key === undefined) {
      attributed.push({ path: entry.path, retained: entry.grew, loaded: 0, names });
    } else {
      byModule.set(key, [...(byModule.get(key) ?? []), { ...entry, names }]);
    }
  }

  for (const group of byModule.values()) {
    const cost = upperMedian(group.map((entry) => entry.grew));

    for (const { path, grew, names } of group) {
      attributed.push(grew > 2 * cost ? { path, retained: grew - cost, loaded: cost, names } : { path, retained: 0, loaded: grew, names });
    }
  }

  return attributed;
}

function largest(attributed: readonly Attributed[], bytes: (entry: Attributed) => number): Attributed[] {
  return attributed
    .filter((entry) => bytes(entry) > 0)
    .sort((a, b) => bytes(b) - bytes(a) || a.path.localeCompare(b.path))
    .slice(0, HEAP_LIST);
}

const quoted = (names: readonly string[]): string => names.map((name) => `\`${name}\``).join(', ');

function retainedFinding(attributed: readonly Attributed[]): Finding[] {
  const listed = largest(attributed, (entry) => entry.retained).map(
    ({ path, retained, loaded, names }) =>
      `${path} +${formatBytes(retained)}${loaded === 0 ? '' : ` beyond the first load of ${quoted(names)}`}`,
  );

  return listed.length === 0
    ? []
    : [
        {
          check: 'perf-heap',
          severity: 'info',
          message: `Heap each file added to its worker, over the file that ran before it there, largest first: ${listed.join(', ')}.`,
          fix: 'Under `isolate: false` a worker runs file after file, so what a file leaves behind stays for every file after it. Start with the file at the top: module-level state, a global it patched and did not restore, a subscription or timer it never closed.',
        },
      ];
}

function loadFinding(attributed: readonly Attributed[]): Finding[] {
  const listed = largest(attributed, (entry) => entry.loaded).map(
    ({ path, loaded, names }) =>
      `${path}: first load of ${quoted(names)} in this worker (+${formatBytes(loaded)}), not retained by the spec`,
  );

  return listed.length === 0
    ? []
    : [
        {
          check: 'perf-heap',
          severity: 'info',
          message: `Heap growth that comes with modules a worker evaluated for the first time, largest first: ${listed.join('; ')}.`,
          fix: 'Under `isolate: false` a worker evaluates a module once and keeps it for every file after it, so the first file in a lane to import it pays for it, and another lane order names another file. That is the module cache rather than a leak. To shrink it, import the module directly instead of through a barrel, or mock it in the specs that only pass through it.',
        },
      ];
}

/** Heap is read after each file, so under `isolate: false` it carries the files before it in the worker too. */
export function heapFindings(measured: ReadonlyMap<string, PerfFile>, reused = false, cwd = ''): Finding[] {
  const growth = heapGrowth(measured, reused);

  if (growth !== undefined && growth.length > 0) {
    const attributed = attribute(growth, cwd);

    return [...retainedFinding(attributed), ...loadFinding(attributed)];
  }

  const ranked = [...measured]
    .filter((entry): entry is [string, PerfFile & { heap: number }] => entry[1].heap !== undefined)
    .sort((a, b) => b[1].heap - a[1].heap || a[0].localeCompare(b[0]));

  if (ranked.length === 0) {
    return [];
  }

  return [
    {
      check: 'perf-heap',
      severity: 'info',
      message: `Heap used after the file, largest first: ${ranked
        .slice(0, HEAP_LIST)
        .map(([path, file]) => `${path} ${formatBytes(file.heap)}`)
        .join(', ')}.`,
      fix: `Under \`isolate: false\` a file's number also carries every file that ran before it in the same worker, so a file that stays high with isolation on is the one that allocates.`,
    },
  ];
}
