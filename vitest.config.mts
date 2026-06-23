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
    coverage: {
      provider: 'v8' as const,
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'lcov'],
      // Measure the real implementation under src/lib/** (plus the public barrel),
      // not just the re-export entry point. Pure type-only files contribute no
      // executable statements.
      include: ['src/lib/**/*.ts', 'src/auto-spy.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
}));
