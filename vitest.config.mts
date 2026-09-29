import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

// auto-spy uses Angular TestBed (provideAutoSpy / injectSpy) → needs the
// Analog Angular plugin + zoneless vitest-angular setup.
export default defineConfig({
  plugins: [angular({ tsconfig: 'tsconfig.spec.json' })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    // The CLI reads the per-user git excludes; the developer's own must not prune the temp repos.
    env: { GIT_CONFIG_GLOBAL: '/nonexistent/gitconfig', XDG_CONFIG_HOME: '/nonexistent' },
    include: ['src/**/*.spec.ts'],
    // The invariant specs need `--expose-gc` and a process to themselves; they run under
    // `vitest.invariants.config.mts` (`npm run test:invariants`), never in this suite.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/invariants/**'],
    // Per-file isolation is the default run, but nothing in the suite depends on it any more: the
    // two specs that exercise an empty registry (`core-standalone`, `mock-adapter`) now empty and
    // restore it themselves. `npm run test:shared-env` proves that by running everything with
    // `isolate: false` on `threads`, several workers, `setupAutoSpy()` in the setup file and a
    // shuffled file order — the mode `setupAutoSpy()` exists for.
    isolate: true,
    coverage: {
      // Istanbul, not v8: re-measured on Vitest 5.0.2, v8 still drops merged blocks (a different
      // branch % every run) and runs out of heap serially. Numbers in DECISIONS.md, 2026-09-29.
      provider: 'istanbul' as const,
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'lcov'],
      // Measure the real implementation under src/lib/** plus the public entry
      // barrels. Pure type-only files contribute no executable statements.
      // `src/bun.ts` and `src/node.ts` are excluded: they import `bun:test` /
      // `node:test`, which only resolve under their own runtimes (Vitest cannot
      // bundle the built-in `node:test`) — their adapter logic is covered via
      // `bun-adapter.ts` / `node-adapter.ts`.
      include: [
        'src/lib/**/*.ts',
        // The CLI, minus `src/cli.ts` itself: that file is three lines of process wiring around
        // `runCli`, and the only way to execute it is to spawn a process.
        'src/cli/**/*.ts',
        'src/auto-spy.ts',
        'src/index.ts',
        'src/rxjs.ts',
        'src/jasmine.ts',
        'src/angular.ts',
        'src/setup.ts',
        'src/eslint-plugin.ts',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
