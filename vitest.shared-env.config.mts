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
    // `fileParallelism: false` is what actually produces the shared environment: it forces
    // `maxWorkers` to 1, so every file lands in the same worker and pays for jsdom + the zoneless
    // TestBed once instead of once per file. This used to also carry
    // `poolOptions: { threads: { singleThread: true } }` — Vitest 4 removed `test.poolOptions`
    // entirely (it warned `was removed in Vitest 4` on every run and was silently ignored), and the
    // top-level flag above already covers it.
    fileParallelism: false,
    coverage: { enabled: false },
  },
});
