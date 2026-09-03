import { defineConfig } from 'vitest/config';

// The memory harness is a `vitest run` file, not a `vitest bench` one: `bench` measures wall clock
// and has no notion of a heap delta. Two things here are load-bearing rather than taste:
//
//  - `pool: 'forks'`. `--expose-gc` is a V8 flag, and `new Worker({ execArgv })` rejects V8 flags
//    outright (`ERR_WORKER_INVALID_EXEC_ARGV`), so the threads pool cannot carry it at all.
//  - one worker, no file parallelism. A retained-heap reading is a property of one process, and a
//    second file allocating in the same one would land inside somebody's baseline.
export default defineConfig({
  test: {
    include: ['bench/memory.bench.ts'],
    pool: 'forks',
    execArgv: ['--expose-gc'],
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
  },
});
