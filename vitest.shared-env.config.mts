import { mergeConfig } from 'vitest/config';

import base from './vitest.config.mts';

// The library's whole reason for shipping `setupAutoSpy()` is that a suite may run with ONE shared
// environment (`isolate: false`), where an un-restored property patch, a leftover spy or a registry
// left in a non-default state leaks straight into the next file. This config runs the same suite
// that way — one worker, one module graph — so that promise is proven rather than asserted.
//
// Coverage is off here: the default run is the one that carries the 100% gate, and instrumenting a
// second full pass buys nothing.
export default mergeConfig(base, {
  test: {
    isolate: false,
    fileParallelism: false,
    poolOptions: { threads: { singleThread: true } },
    coverage: { enabled: false },
  },
});
