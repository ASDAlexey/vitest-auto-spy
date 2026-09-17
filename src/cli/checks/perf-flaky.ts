/** Findings `perf` makes on every run however cheap: tests that passed only on a retry, and the heap after each file. */
import type { PerfFile } from '../perf-data';
import { PERF_DOCS } from '../perf-data';
import { GATE_DOCS } from '../perf-gate';
import type { Finding } from '../report';

const FLAKY_FIX = [
  'A test that needs a retry to pass depends on something outside itself: a real timer, the order the tests ran in, state another test left behind,',
  'or an `await` that settles on a schedule. Run the file on its own with `--retry=0 --sequence.shuffle` until it fails, and fix that instead of',
  `keeping the retry. Its failed attempts are counted in this file's time, so the gate judges it slower than it is. Background: ${GATE_DOCS}`,
].join(' ');

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
            message: `${names.length === 1 ? '1 test' : `${names.length} tests`} passed only after a retry: ${names.map((name) => `\`${name}\``).join(', ')}.`,
            fix: FLAKY_FIX,
          },
        ];
  });
}

const HEAP_LIST = 5;

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/** Heap is read after each file, so under `isolate: false` it carries the files before it in the worker too. */
export function heapFindings(measured: ReadonlyMap<string, PerfFile>): Finding[] {
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
      fix: `Under \`isolate: false\` a file's number also carries every file that ran before it in the same worker, so a file that stays high with isolation on is the one that allocates. Background: ${PERF_DOCS}#memory-under-isolate-false`,
    },
  ];
}
