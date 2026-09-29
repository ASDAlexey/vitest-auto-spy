import { mergeConfig } from 'vitest/config';

import base from './vitest.config.mts';

// The library's whole reason for shipping `setupAutoSpy()` is that a suite may run with a shared
// environment (`isolate: false`), where an un-restored property patch, a leftover spy or a registry
// left in a non-default state leaks straight into the next file. This config runs the same suite
// that way, so that promise is proven rather than asserted:
//
// - `pool: 'threads'`, named: the Analog plugin defaults the pool to `vmThreads`, which gives every
//   file a fresh context whatever `isolate` says, so the lane used to share nothing at all.
// - several workers, each running a long run of files in one module graph and one global;
// - `setupAutoSpy()` in the setup file, as a consumer's setup file calls it;
// - files shuffled with a fixed seed. Another order: `npm run test:shared-env -- --sequence.seed=<n>`.
//
// Coverage is off here: the default run is the one that carries the 100% gate.
export default mergeConfig(base, {
  test: {
    pool: 'threads',
    isolate: false,
    maxWorkers: 4,
    setupFiles: ['src/test-setup.shared-env.ts'],
    sequence: { shuffle: { files: true, tests: false }, seed: 20260929 },
    coverage: { enabled: false },
  },
});
