import { defineConfig } from 'vitest/config';

// Benchmarks hit the plain core (`src/lib/**`) and need neither the Angular
// plugin nor the jsdom/TestBed setup the spec config carries — a lean config
// keeps the bench numbers free of that transform/setup overhead.
export default defineConfig({
  test: {
    include: [],
    benchmark: {
      include: ['bench/**/*.bench.ts'],
    },
  },
});
