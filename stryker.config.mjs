/**
 * Mutation testing over the spy core — the modules every spy a consumer creates runs through:
 * `npm run test:mutation`. Not part of `npm run check`: a full run takes about 20 minutes, so CI runs
 * it in `mutation.yml`, incrementally.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  plugins: ['@stryker-mutator/vitest-runner', './scripts/stryker-vitest-runner.mjs'],
  testRunner: 'vitest-5',
  vitest: { configFile: 'vitest.mutation.config.mts' },
  mutate: [
    'src/lib/function-spy.ts',
    'src/lib/fast-spy.ts',
    'src/lib/fast-mock-state.ts',
    'src/lib/create-spy-from-class.ts',
    'src/lib/create-spy-from-instance.ts',
    'src/lib/args-map.ts',
    'src/lib/auto-mock.ts',
    'src/lib/create-mock.ts',
    'src/lib/mock-deep.ts',
    'src/lib/prop-mock.ts',
    'src/lib/accessor-spy.ts',
    'src/lib/constructor-spy.ts',
    'src/lib/observable-spy.ts',
    'src/lib/spy-defaults.ts',
  ],
  ignorePatterns: [
    '/.claude',
    '/coverage',
    '/coverage-*',
    '/docs',
    '/docs-site/node_modules',
    '/docs-site/.vitepress/cache',
    '/docs-site/.vitepress/dist',
    '/articles',
    '/tasks',
    '/review',
    '/bench-results*.json',
    '/.cache',
    '/.vitest',
    '/reports',
  ],
  disableTypeChecks: 'src/**/*.ts',
  coverageAnalysis: 'perTest',
  // 91.04 % on 2026-09-29, on an idle machine. Raise the floor as survivors are killed.
  thresholds: { high: 95, low: 90, break: 90 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  incrementalFile: 'reports/mutation/stryker-incremental.json',
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
