/**
 * The generated entry-point table.
 *
 * The point of these cases is that nothing here is a list of names: the table comes out of a
 * `package.json` written by the spec, so a table that went stale would have to go stale in the
 * fixture too. The `entryFor` cases pin the precedence — root, then the repository's own entry,
 * then a name only one entry exports — and the one case that must answer `undefined`, which is the
 * name two non-root entries both export.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createTempRepo, removeTempRepos } from '../temp-repo';
import type { EntryMap } from './entry-map';
import { buildEntryMap, entryFor, exportedNames, findPackageRoot, namesFromClause, pickTarget, resolveTarget } from './entry-map';

afterEach(() => {
  removeTempRepos();
});

const MANIFEST = JSON.stringify({
  name: 'vitest-auto-spy',
  exports: {
    '.': { types: './dist/index.d.ts', import: './dist/index.js' },
    './angular': './dist/angular.js',
    './rxjs': './dist/rxjs.js',
    './vue': './dist/vue.js',
    './svelte': './dist/svelte.js',
    './styles/*': './dist/styles/*',
  },
});

function packageWith(files: Readonly<Record<string, string>>): string {
  return createTempRepo({ 'package.json': MANIFEST, ...files });
}

describe('pickTarget', () => {
  it('prefers types, then import, then default, then require', () => {
    expect(pickTarget('./x.js')).toBe('./x.js');
    expect(pickTarget({ import: { types: './a.d.ts', default: './a.js' } })).toBe('./a.d.ts');
    expect(pickTarget({ require: './a.cjs' })).toBe('./a.cjs');
    expect(pickTarget(42)).toBeUndefined();
    expect(pickTarget({ browser: './b.js' })).toBeUndefined();
  });
});

describe('resolveTarget', () => {
  it('falls back from an unbuilt dist to the sources beside it', () => {
    const root = packageWith({ 'src/index.ts': '' });

    expect(resolveTarget(root, './dist/index.d.ts')).toBe(`${root}/src/index.ts`);
    expect(resolveTarget(root, './dist/missing.js')).toBeUndefined();
  });

  it('takes the built file when it is there', () => {
    const root = packageWith({ 'dist/index.d.ts': '' });

    expect(resolveTarget(root, './dist/index.d.ts')).toBe(`${root}/dist/index.d.ts`);
  });
});

describe('namesFromClause', () => {
  it('reads the exported name, not the local one', () => {
    expect(namesFromClause('a, b as c, type D, type E as F, default as g, ')).toEqual(['a', 'c', 'D', 'F', 'g']);
  });
});

describe('exportedNames', () => {
  it('follows export * through the barrels and ignores what it cannot resolve', () => {
    const root = packageWith({
      'src/index.ts': [
        "export * from './lib/core';",
        "export * from 'rxjs';",
        "export * from './lib/gone';",
        'export declare const own: number;',
      ].join('\n'),
      'src/lib/core.ts': ['export { a, b as c } from "./deep";', 'export type Spy = number;', '// export function commented(): void;'].join(
        '\n',
      ),
    });

    expect(exportedNames(`${root}/src/index.ts`).sort()).toEqual(['Spy', 'a', 'c', 'own']);
  });

  it('answers nothing for a missing file, a file already seen, or a barrel deeper than the limit', () => {
    const root = packageWith({ 'src/a.ts': "export * from './a';\nexport const one = 1;" });

    expect(exportedNames(`${root}/nope.ts`)).toEqual([]);
    expect(exportedNames(`${root}/src/a.ts`, new Set([`${root}/src/a.ts`]))).toEqual([]);
    expect(exportedNames(`${root}/src/a.ts`, new Set(), 0)).toEqual([]);
    expect(exportedNames(`${root}/src/a.ts`)).toEqual(['one']);
  });
});

describe('buildEntryMap', () => {
  it('keys every exported name by the specifiers that export it, skipping wildcard subpaths', () => {
    const root = packageWith({
      'src/index.ts': 'export declare const asSpy: unknown;\nexport type Spy = number;',
      'src/angular.ts': 'export declare const provideAutoSpy: unknown;\nexport declare const asSpy: unknown;',
      'src/rxjs.ts': "export declare const nextWith: unknown;\nexport { nextWith } from './lib/next';",
      'src/vue.ts': 'export declare const shared: unknown;',
      'src/svelte.ts': 'export declare const shared: unknown;',
    });
    const map = buildEntryMap(root);

    expect(map?.byName.get('Spy')).toEqual(['vitest-auto-spy']);
    expect(map?.byName.get('asSpy')).toEqual(['vitest-auto-spy', 'vitest-auto-spy/angular']);
    expect(map?.byName.get('shared')).toEqual(['vitest-auto-spy/vue', 'vitest-auto-spy/svelte']);
    // Named twice by the same entry, listed once.
    expect(map?.byName.get('nextWith')).toEqual(['vitest-auto-spy/rxjs']);
    expect(map?.source).toContain('vitest-auto-spy-cli-');
  });

  it('answers undefined for no root, unreadable json, no exports map, and an export map that yields nothing', () => {
    expect(buildEntryMap(undefined)).toBeUndefined();
    expect(buildEntryMap(createTempRepo({ 'package.json': '{ not json' }))).toBeUndefined();
    expect(buildEntryMap(createTempRepo({ 'package.json': '{ "name": "x" }' }))).toBeUndefined();
    expect(buildEntryMap(packageWith({}))).toBeUndefined();
  });
});

describe('findPackageRoot', () => {
  it('finds an installed copy from a nested directory, and falls back when there is none', () => {
    const root = createTempRepo({ 'node_modules/vitest-auto-spy/package.json': MANIFEST, 'apps/web/src/': '' });

    expect(findPackageRoot(`${root}/apps/web/src`, undefined)).toBe(`${root}/node_modules/vitest-auto-spy`);
    expect(findPackageRoot('/', 'fallback')).toBe('fallback');
  });
});

describe('entryFor', () => {
  const map: EntryMap = {
    source: 'test',
    byName: new Map([
      ['Spy', ['vitest-auto-spy']],
      ['expectEmission', ['vitest-auto-spy/rxjs', 'vitest-auto-spy']],
      ['provideAutoSpy', ['vitest-auto-spy/angular', 'vitest-auto-spy/nestjs']],
      ['mockSignalProp', ['vitest-auto-spy/angular']],
      ['shared', ['vitest-auto-spy/vue', 'vitest-auto-spy/svelte']],
    ]),
  };

  it('prefers the root, then the repository entry, then the only entry that has it', () => {
    expect(entryFor(map, 'expectEmission', 'vitest-auto-spy/angular')).toBe('vitest-auto-spy');
    expect(entryFor(map, 'provideAutoSpy', 'vitest-auto-spy/angular')).toBe('vitest-auto-spy/angular');
    expect(entryFor(map, 'mockSignalProp', 'vitest-auto-spy')).toBe('vitest-auto-spy/angular');
  });

  it('refuses to choose between two non-root entries, and reports nothing for an unknown name', () => {
    expect(entryFor(map, 'shared', 'vitest-auto-spy/angular')).toBeUndefined();
    expect(entryFor(map, 'createSpyObj', 'vitest-auto-spy')).toBeUndefined();
  });
});
