import { afterEach, describe, expect, it } from 'vitest';

import { createTempRepo, removeTempRepos } from '../temp-repo';
import { vitestGlobals } from './globals';

afterEach(() => {
  removeTempRepos();
});

describe('vitestGlobals', () => {
  it('has no answer for a runner other than Vitest', () => {
    expect(vitestGlobals({ cwd: createTempRepo({}), files: [], runner: 'bun' })).toBeUndefined();
  });

  it('reads globals off any Vitest or Vite config in the tree, and defaults to off', () => {
    const cwd = createTempRepo({
      'vitest.config.mts': 'export default { test: { globals: false } };',
      'packages/a/vite.config.ts': 'export default { test: { globals: true } };',
    });

    expect(vitestGlobals({ cwd, files: ['vitest.config.mts', 'packages/a/vite.config.ts'], runner: 'vitest' })).toBe(true);
    expect(vitestGlobals({ cwd, files: ['vitest.config.mts'], runner: 'vitest' })).toBe(false);
    expect(vitestGlobals({ cwd, files: ['gone/vitest.config.ts', 'src/a.spec.ts'], runner: 'vitest' })).toBe(false);
  });

  it('takes the Angular unit-test builder as globals on', () => {
    const cwd = createTempRepo({ 'angular.json': '{ "builder": "@angular/build:unit-test" }' });

    expect(vitestGlobals({ cwd, files: [], runner: 'vitest' })).toBe(true);
    expect(vitestGlobals({ cwd: createTempRepo({ 'angular.json': '{}' }), files: [], runner: 'vitest' })).toBe(false);
  });
});
