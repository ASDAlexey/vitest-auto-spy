/**
 * What the CLI decides about a repository before it writes a word. Everything specialised in the
 * managed block — the entry, the adapter bullet, the setup file named for the rxjs import — is
 * downstream of these five detections, so a wrong one is a block that confidently states a lie.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { extractSetupFiles, isRecord, readProfile, resolveEntry } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const manifest = (value: Record<string, unknown>): string => JSON.stringify(value);

describe('readProfile', () => {
  it('survives a missing and a malformed package.json', () => {
    expect(readProfile(createTempRepo({})).runner).toBe('vitest');
    expect(readProfile(createTempRepo({ 'package.json': '{ not json' })).framework).toBe('none');
    expect(readProfile(createTempRepo({ 'package.json': '"a string"' })).entry).toBe('vitest-auto-spy');
  });

  it('ignores non-string entries in the dependency maps', () => {
    const root = createTempRepo({ 'package.json': manifest({ dependencies: { rxjs: { version: '7' } }, scripts: [] }) });

    expect(readProfile(root).hasRxjs).toBe(false);
    expect(readProfile(root).scripts).toEqual({});
  });

  it('lets the test script decide the runner before any other script does', () => {
    const root = createTempRepo({
      'package.json': manifest({ scripts: { test: 'vitest run', 'test:bun': 'bun test ./src' } }),
    });

    expect(readProfile(root).runner).toBe('vitest');
  });

  it('falls back to another script, then to the dependencies', () => {
    const bun = createTempRepo({ 'package.json': manifest({ scripts: { ci: 'bun test' } }) });
    const node = createTempRepo({ 'package.json': manifest({ scripts: { ci: 'node --test' } }) });
    const byDependency = createTempRepo({ 'package.json': manifest({ devDependencies: { vitest: '^4' } }) });
    const byTypes = createTempRepo({ 'package.json': manifest({ devDependencies: { '@types/bun': '^1' } }) });

    expect(readProfile(bun).runner).toBe('bun');
    expect(readProfile(node).runner).toBe('node');
    expect(readProfile(byDependency).runner).toBe('vitest');
    expect(readProfile(byTypes).runner).toBe('bun');
  });

  it('names the framework from the dependency that proves it', () => {
    const frameworks: [string, string][] = [
      ['@angular/core', 'angular'],
      ['@nestjs/core', 'nestjs'],
      ['svelte', 'svelte'],
      ['vue', 'vue'],
      ['react', 'react'],
    ];

    for (const [dependency, framework] of frameworks) {
      const root = createTempRepo({ 'package.json': manifest({ dependencies: { [dependency]: '^1' } }) });

      expect(readProfile(root).framework).toBe(framework);
    }
  });

  it('reads the setup file out of the runner config, and falls back to the conventional paths', () => {
    const configured = createTempRepo({
      'package.json': manifest({}),
      'vitest.config.ts': `export default { test: { setupFiles: ['./src/vitest.setup.ts'] } };`,
    });
    const conventional = createTempRepo({ 'package.json': manifest({}), 'src/test-setup.ts': '' });
    const neither = createTempRepo({ 'package.json': manifest({}) });

    expect(readProfile(configured).setupFiles).toEqual(['src/vitest.setup.ts']);
    expect(readProfile(conventional).setupFiles).toEqual(['src/test-setup.ts']);
    expect(readProfile(neither).setupFiles).toEqual([]);
  });

  it('skips a config that declares no setup file at all', () => {
    const root = createTempRepo({
      'package.json': manifest({}),
      'vitest.config.ts': 'export default { test: {} };',
      'vite.config.ts': `export default { test: { setupFiles: 'src/setup.ts' } };`,
    });

    expect(readProfile(root).setupFiles).toEqual(['src/setup.ts']);
  });

  it('reports the Angular and rxjs dependencies the block asks about', () => {
    const root = createTempRepo({
      'package.json': manifest({ devDependencies: { '@angular/core': '^21', rxjs: '^7' } }),
      'src/app.ts': '',
    });
    const profile = readProfile(root);

    expect(profile.hasAngular).toBe(true);
    expect(profile.hasRxjs).toBe(true);
    expect(profile.files).toContain('src/app.ts');
  });
});

describe('resolveEntry', () => {
  it('lets the runner outrank the framework', () => {
    expect(resolveEntry('bun', 'angular')).toBe('vitest-auto-spy/bun-angular');
    expect(resolveEntry('bun', 'react')).toBe('vitest-auto-spy/bun');
    expect(resolveEntry('node', 'angular')).toBe('vitest-auto-spy/node');
    expect(resolveEntry('vitest', 'nestjs')).toBe('vitest-auto-spy/nestjs');
    expect(resolveEntry('vitest', 'vue')).toBe('vitest-auto-spy/vue');
    expect(resolveEntry('vitest', 'svelte')).toBe('vitest-auto-spy/svelte');
    expect(resolveEntry('vitest', 'react')).toBe('vitest-auto-spy/react');
    expect(resolveEntry('vitest', 'none')).toBe('vitest-auto-spy');
  });
});

describe('extractSetupFiles', () => {
  it('reads an array, a single string and nothing at all', () => {
    expect(extractSetupFiles(`setupFiles: ['a.ts', "b.ts"]`)).toEqual(['a.ts', 'b.ts']);
    expect(extractSetupFiles('setupFiles: `c.ts`')).toEqual(['c.ts']);
    expect(extractSetupFiles('environment: "jsdom"')).toEqual([]);
    expect(extractSetupFiles('setupFiles: []')).toEqual([]);
  });
});

describe('isRecord', () => {
  it('separates a plain object from an array, null and a primitive', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });
});
