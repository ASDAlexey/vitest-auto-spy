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
    benchmark: {
      include: ['bench-angular/*.bench.ts'],
    },
  },
});
