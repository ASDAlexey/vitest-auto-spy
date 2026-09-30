import { configDefaults, mergeConfig } from 'vitest/config';

import base from './vitest.config.mts';

// Stryker instruments the source itself; istanbul on top would double the work and fight it.
export default mergeConfig(base, {
  test: {
    coverage: { enabled: false },
    // Stryker runs `test.concurrent` one test at a time to attribute coverage; these specs gate two
    // tests on each other and deadlock when they cannot overlap.
    exclude: [...configDefaults.exclude, 'src/lib/setup-teardown.spec.ts', 'src/lib/unconfigured-reads-concurrent.spec.ts'],
  },
});
