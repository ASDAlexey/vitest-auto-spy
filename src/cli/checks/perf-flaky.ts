/** Findings `perf` makes on every run however cheap: tests that passed only on a retry, and the heap after each file. */
import type { PerfFile } from '../perf-data';
import { formatMs } from '../perf-data';
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

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

type Timed = PerfFile & { readonly heap: number; readonly start: number; readonly lane: number };

/**
 * What each file added to the heap of the worker that ran it, over the file before it there. Under
 * `isolate: false` a lane keeps one worker, so the lane and the start order are the worker's files in
 * order; Vitest 5.0's `workerId` is new for every file and groups nothing. `undefined` when the run
 * isolated its files or the report places none of them.
 */
function heapGrowth(measured: ReadonlyMap<string, PerfFile>, reused: boolean): [string, number][] | undefined {
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

  const grown: [string, number][] = [];

  for (const files of lanes.values()) {
    files
      .sort((a, b) => a[1].start - b[1].start)
      .reduce((before, after) => {
        grown.push([after[0], after[1].heap - before[1].heap]);

        return after;
      });
  }

  return grown.filter(([, grew]) => grew > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Heap is read after each file, so under `isolate: false` it carries the files before it in the worker too. */
export function heapFindings(measured: ReadonlyMap<string, PerfFile>, reused = false): Finding[] {
  const growth = heapGrowth(measured, reused);

  if (growth !== undefined && growth.length > 0) {
    return [
      {
        check: 'perf-heap',
        severity: 'info',
        message: `Heap each file added to its worker, over the file that ran before it there, largest first: ${growth
          .slice(0, HEAP_LIST)
          .map(([path, grew]) => `${path} +${formatBytes(grew)}`)
          .join(', ')}.`,
        fix: 'Under `isolate: false` a worker runs file after file, so what a file leaves behind stays for every file after it. Start with the file at the top: module-level state, a global it patched and did not restore, a subscription or timer it never closed.',
      },
    ];
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
