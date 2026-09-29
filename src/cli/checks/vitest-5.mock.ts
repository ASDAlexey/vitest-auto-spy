import type { Severity } from '../report';

export const REMOVED_ON_VITEST_5: [Severity, string, string][] = [
  [
    'error',
    'src/a.spec.ts',
    'Calls `describe.sequential`, `it.sequential` (lines 1, 2), which Vitest 5 removed: collecting the file throws `TypeError: … is not a function`.',
  ],
  [
    'error',
    'src/b.spec.ts',
    'Calls `test.skip.sequential` (line 1), which Vitest 5 removed: collecting the file throws `TypeError: … is not a function`.',
  ],
  [
    'error',
    'src/reporter.ts',
    'Imports `vitest/reporters`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
  ],
  [
    'error',
    'src/reporter.ts',
    'Imports `vitest/coverage`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
  ],
  [
    'error',
    'src/reporter.ts',
    'Imports `vitest/environments`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
  ],
  [
    'error',
    'src/runner.ts',
    'Imports `vitest/runners`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
  ],
  [
    'error',
    'src/runner.ts',
    'Imports `vitest/suite`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
  ],
  [
    'error',
    'src/runner.ts',
    'Imports `vitest/mocker`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
  ],
  ['error', 'package.json', 'The `bench` script passes `--outputJson`, which Vitest 5 removed: the command stops with `Unknown option`.'],
  ['error', 'package.json', 'The `bench` script passes `--compare`, which Vitest 5 removed: the command stops with `Unknown option`.'],
  ['error', 'vitest.config.ts', 'Sets `benchmark.outputJson`, which Vitest 5 removed: nothing reads the key, and no warning says so.'],
  ['error', 'vitest.config.ts', 'Sets `benchmark.compare`, which Vitest 5 removed: nothing reads the key, and no warning says so.'],
  [
    'warning',
    'vitest.config.ts',
    '`poolOptions` was removed in Vitest 4: Vitest prints one deprecation line and runs without every option inside it, so the pool is configured by the defaults.',
  ],
];
