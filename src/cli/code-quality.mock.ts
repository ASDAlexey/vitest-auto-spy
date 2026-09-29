import { join } from 'node:path';

import type { PerfFile, PerfRun } from './perf-data';

export const measuredRun = (root: string, slow: Partial<PerfFile>): PerfRun => ({
  version: 2,
  root,
  transform: 0,
  wall: 1_000,
  failed: 0,
  files: [
    ...Array.from({ length: 9 }, (_unused, index) => ({
      file: join(root, `src/ordinary-${index}.spec.ts`),
      environment: 0,
      prepare: 0,
      setup: 0,
      imports: 0,
      tests: 100,
      testCount: 10,
      cases: [],
    })),
    {
      file: join(root, 'src/slow.spec.ts'),
      environment: 0,
      prepare: 0,
      setup: 0,
      imports: 0,
      tests: 100,
      testCount: 10,
      cases: [],
      ...slow,
    },
  ],
});
