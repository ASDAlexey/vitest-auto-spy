import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

// The Angular benchmark project, deliberately separate from `vitest.bench.config.mts`.
//
// That config carries no plugin and no setup on purpose: the spy numbers it produces must not
// include the Angular transform or a `TestBed` bootstrap. This one is the opposite — every figure
// it reports is a `TestBed` figure, so it needs the Analog plugin, jsdom and the zoneless
// `initTestEnvironment` the spec suite uses. Keeping the two configs apart is what lets each be
// honest; do not merge them.
export default defineConfig({
  // `include` is not redundant with the tsconfig: without it the plugin leaves the benchmark file
  // out of its TypeScript program, Angular falls back to compiling the decorators with the JIT
  // compiler at run time, and JIT does not process `input()` initializers — every `setInput` then
  // fails with NG0303 and every size in the table silently measures a childless component.
  plugins: [angular({ tsconfig: 'tsconfig.bench-angular.json', include: ['**/bench-angular/**/*.bench.ts'] })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: [],
    // A case is a `test()` since Vitest 5, so it is subject to the test timeout; the benchmark
    // budgets here (and `--precise`, which doubles them) run well past the 60 s default.
    testTimeout: 900_000,
    benchmark: {
      include: ['bench-angular/*.bench.ts'],
      // Not about the warning: the export-getter *tracker* Vitest 5 installs to produce it wraps
      // every cross-module export in a counting getter, inside the timed body. Measured on this
      // repository it inflated every spy-creating arm by 1.5-1.8x (createAutoMock 1.88 -> 3.42 us)
      // while leaving the no-spy control untouched, and switching it off reproduces the Vitest 4
      // numbers within 4%. Flip it back to false when the warning itself is what is wanted.
      suppressExportGetterWarnings: true,
    },
  },
});
