import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { declaredUpTree, declaredVitestMajor, installedVersionOf, textsOf } from './vitest-5-facts';

afterEach(() => {
  removeTempRepos();
});

describe('the installed-version lookup in a monorepo', () => {
  const monorepo = (root: Record<string, string> = {}): string =>
    createTempRepo({
      'package.json': JSON.stringify({ private: true, workspaces: ['packages/*'], devDependencies: { vitest: '^5' } }),
      'node_modules/vitest/package.json': JSON.stringify({ version: '5.0.2' }),
      'packages/app/package.json': JSON.stringify({ name: 'app' }),
      'packages/app/src/a.spec.ts': '',
      ...root,
    });

  it('finds the hoisted install from a workspace package, as Node does', () => {
    const root = monorepo();

    expect(installedVersionOf(join(root, 'packages/app'), 'vitest')).toBe('5.0.2');
    expect(installedVersionOf(join(root, 'packages/app'), 'not-installed-anywhere')).toBeUndefined();
  });

  it('prefers the nearest install over the hoisted one', () => {
    const root = monorepo({ 'packages/app/node_modules/vitest/package.json': JSON.stringify({ version: '4.1.0' }) });

    expect(installedVersionOf(join(root, 'packages/app'), 'vitest')).toBe('4.1.0');
  });

  it('reads the runner as declared when the workspace root declares it', () => {
    const root = monorepo();

    expect(declaredVitestMajor(readProfile(join(root, 'packages/app')))).toBe(5);
    expect(declaredUpTree(readProfile(join(root, 'packages/app')), 'jest')).toBe(false);
  });

  it('stops at the repository root rather than reading a manifest above it', () => {
    const root = createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '^5' } }),
      'repo/.git/HEAD': '',
      'repo/package.json': JSON.stringify({ name: 'repo' }),
      'other/pnpm-workspace.yaml': '',
      'other/app/package.json': '{}',
    });

    expect(declaredUpTree(readProfile(join(root, 'repo')), 'vitest')).toBe(false);
    expect(declaredUpTree(readProfile(join(root, 'other/app')), 'vitest')).toBe(false);
  });
});

describe('textsOf', () => {
  it('reads only the files the predicate picks, and skips one that vanished since the scan', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'vitest.config.ts': 'export default {};',
      'vite.config.ts': 'export default {};',
      'src/a.ts': '',
    });
    const graph = buildGraph(readProfile(root), 0);

    rmSync(join(root, 'vite.config.ts'));

    expect(textsOf(graph, (file) => file.endsWith('.config.ts'))).toEqual([{ file: 'vitest.config.ts', text: 'export default {};' }]);
  });
});
