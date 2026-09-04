import { defineConfig } from 'vitest/config';

// Architecture invariants: heap plateau and teardown shape. Run with `npm run test:invariants`.
//
// Same two load-bearing choices as `vitest.bench.memory.config.mts`:
//
//  - `pool: 'forks'`. `--expose-gc` is a V8 flag and `new Worker({ execArgv })` rejects V8 flags
//    outright (`ERR_WORKER_INVALID_EXEC_ARGV`), so the threads pool cannot carry it at all.
//  - one worker, no file parallelism. A heap reading and a timing are both properties of one
//    process, and a second file allocating in it would land inside somebody's baseline.
//
// No Angular plugin and no `src/test-setup.ts`: these specs import the plain `src/index` entry, and
// a TestBed would only add allocations nobody here is measuring.
export default defineConfig({
  test: {
    include: ['src/invariants/**/*.spec.ts'],
    pool: 'forks',
    execArgv: ['--expose-gc'],
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
