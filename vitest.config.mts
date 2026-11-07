import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

// The CLI reads the per-user git excludes; the developer's own must not prune the temp repos.
const env = { GIT_CONFIG_GLOBAL: '/nonexistent/gitconfig', XDG_CONFIG_HOME: '/nonexistent' };

// The invariant specs need `--expose-gc` and a process to themselves; they run under
// `vitest.invariants.config.mts` (`npm run test:invariants`), never in this suite.
const exclude = ['**/node_modules/**', '**/dist/**', 'src/invariants/**'];

// Neither the DOM nor Angular: these run on `node`, without jsdom and the TestBed setup.
const nodeSpecs = ['src/cli/**/*.spec.ts', 'src/lib/eslint/**/*.spec.ts'];

const plugins = [angular({ tsconfig: 'tsconfig.spec.json' })];

const coverage = {
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
  exclude: ['**/*.mock.ts'],
  thresholds: {
    lines: 100,
    functions: 100,
    branches: 100,
    statements: 100,
  },
};

/**
 * Every spec in one jsdom project: what `shared-env`, `happy-dom` and `mutation` extend.
 *
 * `vmThreads` is named rather than left to the Analog plugin's default: `threads` runs this suite
 * about 2.5 times slower, mostly in environment setup. A VM pool gives every file a fresh context,
 * so `isolate` has no effect here; `npm run test:shared-env` is the lane that shares one.
 */
export const singleProject = defineConfig({
  plugins,
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'vmThreads',
    setupFiles: ['src/test-setup.ts'],
    env,
    include: ['src/**/*.spec.ts'],
    exclude,
  },
});

export default defineConfig({
  test: {
    coverage,
    projects: [
      {
        ...singleProject,
        test: { ...singleProject.test, name: 'dom', exclude: [...exclude, ...nodeSpecs] },
      },
      {
        // The same transform as the dom project, so istanbul maps a shared module identically in both.
        plugins,
        test: { name: 'node', globals: true, environment: 'node', pool: 'vmThreads', env, include: nodeSpecs },
      },
    ],
  },
});
