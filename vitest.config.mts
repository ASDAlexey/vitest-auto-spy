import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

// auto-spy uses Angular TestBed (provideAutoSpy / injectSpy) → needs the
// Analog Angular plugin + zoneless vitest-angular setup.
export default defineConfig(() => ({
  plugins: [angular({ tsconfig: 'tsconfig.spec.json' })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    // Per-file isolation so the IoC observable registry starts empty in the
    // "core without rxjs" spec regardless of test-file order.
    isolate: true,
    coverage: {
      provider: 'v8' as const,
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'lcov'],
      // Measure the real implementation under src/lib/** plus the public entry
      // barrels. Pure type-only files contribute no executable statements.
      // `src/bun.ts` is excluded: it imports `bun:test`, which only resolves
      // under the Bun runtime — its adapter logic is covered via `bun-adapter.ts`.
      include: ['src/lib/**/*.ts', 'src/auto-spy.ts', 'src/index.ts', 'src/node.ts', 'src/rxjs.ts', 'src/angular.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
}));
