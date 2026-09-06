import { defineConfig } from 'vitest/config';

// The cross-library benchmarks pull in five competitor packages, so they get their own config and
// their own script: `npm run bench` stays a measurement of this package alone and keeps running in
// a checkout that never installed them.
export default defineConfig({
  test: {
    include: [],
    // A case is a `test()` since Vitest 5, so it is subject to the test timeout; the benchmark
    // budgets here (and `--precise`, which doubles them) run well past the 60 s default.
    testTimeout: 900_000,
    benchmark: {
      include: ['bench/vs-libraries.bench.ts'],
      // Not about the warning: the export-getter *tracker* Vitest 5 installs to produce it wraps
      // every cross-module export in a counting getter, inside the timed body. Measured on this
      // repository it inflated every spy-creating arm by 1.5-1.8x (createAutoMock 1.88 -> 3.42 us)
      // while leaving the no-spy control untouched, and switching it off reproduces the Vitest 4
      // numbers within 4%. Flip it back to false when the warning itself is what is wanted.
      suppressExportGetterWarnings: true,
    },
  },
});
