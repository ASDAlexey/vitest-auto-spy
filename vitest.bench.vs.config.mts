import { defineConfig } from 'vitest/config';

// The cross-library benchmarks pull in three competitor packages, so they get their own config and
// their own script: `npm run bench` stays a measurement of this package alone and keeps running in
// a checkout that never installed them.
export default defineConfig({
  test: {
    include: [],
    benchmark: {
      include: ['bench/vs-libraries.bench.ts'],
    },
  },
});
