import { join } from 'node:path';

import type { BaselineRequest } from './perf';
import { BASELINE_DEFAULTS } from './perf-baseline';
import type { PerfRun } from './perf-data';
import { file, run } from './perf-fixtures';
import type { PerfSource } from './perf-run';

export const NO_TEST_BODY = { tests: 0, testCount: 0 } as const;

export const measuredRun = (root: string, slow: number): PerfRun =>
  run({
    root,
    wall: 5_000,
    files: [
      ...Array.from({ length: 9 }, (_unused, index) => file(join(root, `src/ordinary-${index}.spec.ts`), { tests: 100, testCount: 10 })),
      file(join(root, 'src/grew.spec.ts'), { tests: slow, testCount: 10 }),
    ],
  });

export const perfSource = (root: string, slow = 300): PerfSource => ({ ok: true, run: measuredRun(root, slow), runFailed: false });

export const baselineRequest = (path: string, update: boolean): BaselineRequest => ({ path, update, options: BASELINE_DEFAULTS });
