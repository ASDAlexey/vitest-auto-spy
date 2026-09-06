import { defineConfig } from 'vitest/config';

// The smoke lane's config: the same plumbing as `vitest.bench.config.mts`, pointed at the one
// throwaway bench file. It exists so the harness can be exercised end to end in seconds — see
// `scripts/bench-smoke.mjs`.
export default defineConfig({
  test: {
    include: [],
    testTimeout: 300_000,
    benchmark: {
      include: ['bench/smoke.bench.ts'],
      suppressExportGetterWarnings: true,
    },
  },
});
