/**
 * The generated entry-point table.
 *
 * The point of these cases is that nothing here is a list of names: the table comes out of a
 * `package.json` written by the spec, so a table that went stale would have to go stale in the
 * fixture too. The `chooseEntry` cases pin the precedence — root, then the repository's own entry,
 * then a name only one entry exports, then what the file itself says — and the one case that must
 * answer `absent`, which is a name the table does not have at all.
 *
 * The multi-entry cases carry the weight. `provideAutoSpy` is exported by five entries and by
 * neither the root nor a plain repository's own entry, and answering "no entry point exports it"
 * there was a lie that left every migrated spec still importing the legacy package.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createTempRepo, removeTempRepos } from '../temp-repo';
import type { FileHint } from './entry-hint';
import { NO_HINT } from './entry-hint';
import type { EntryMap } from './entry-map';
import {
  buildEntryMap,
  chooseEntry,
  entryFor,
  exportedNames,
  findPackageRoot,
  namesFromClause,
  pickTarget,
  resolveTarget,
} from './entry-map';

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

  // The root entry re-exports its whole public type surface as `export type * from './lib/types'`.
  // A walker that only knows the value form loses `Spy<T>` and every type beside it, the import
  // transform then decides it cannot place the name, and the spec is left on `jest-auto-spies`. The
  // gap only shows where `dist` is absent and the sources are read, which is how CI runs — so it
  // survived a green local suite. Pin both spellings.
  it('follows the type-only form of export * as well as the value form', () => {
    const root = packageWith({
      'src/index.ts': ["export type * from './lib/types';", "export * from './lib/values';"].join('\n'),
      'src/lib/types.ts': 'export type Spy = number;',
      'src/lib/values.ts': 'export const createSpyFromClass = 1;',
    });

    expect(exportedNames(`${root}/src/index.ts`).sort()).toEqual(['Spy', 'createSpyFromClass']);
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

describe('chooseEntry', () => {
  const map: EntryMap = {
    source: 'test',
    byName: new Map([
      ['Spy', ['vitest-auto-spy']],
      ['expectEmission', ['vitest-auto-spy/rxjs', 'vitest-auto-spy']],
      ['mockSignalProp', ['vitest-auto-spy/angular']],
      // The real shapes, read off the installed package: several entries, and no root among them.
      [
        'provideAutoSpy',
        [
          'vitest-auto-spy/bun-angular',
          'vitest-auto-spy/jasmine',
          'vitest-auto-spy/angular',
          'vitest-auto-spy/nestjs',
          'vitest-auto-spy/vue',
        ],
      ],
      ['injectSpy', ['vitest-auto-spy/bun-angular', 'vitest-auto-spy/angular', 'vitest-auto-spy/nestjs']],
      ['shared', ['vitest-auto-spy/vue', 'vitest-auto-spy/svelte']],
      ['tick', ['vitest-auto-spy/node', 'vitest-auto-spy/console']],
    ]),
  };

  const hint = (over: Partial<FileHint>): FileHint => ({ ...NO_HINT, ...over });

  it('prefers the root, then the repository entry, then the only entry that has it', () => {
    expect(chooseEntry(map, 'expectEmission', 'vitest-auto-spy/angular', NO_HINT)).toEqual({ kind: 'chosen', entry: 'vitest-auto-spy' });
    expect(chooseEntry(map, 'provideAutoSpy', 'vitest-auto-spy/nestjs', NO_HINT)).toEqual({
      kind: 'chosen',
      entry: 'vitest-auto-spy/nestjs',
    });
    expect(chooseEntry(map, 'mockSignalProp', 'vitest-auto-spy', NO_HINT)).toEqual({ kind: 'chosen', entry: 'vitest-auto-spy/angular' });
  });

  it('answers absent only for a name the table really does not have', () => {
    expect(chooseEntry(map, 'createSpyObj', 'vitest-auto-spy', NO_HINT)).toEqual({ kind: 'absent' });
  });

  it('takes the entry the file already imports from, over everything else it could weigh', () => {
    expect(chooseEntry(map, 'provideAutoSpy', 'vitest-auto-spy', hint({ imported: ['vitest-auto-spy/vue'] }))).toEqual({
      kind: 'chosen',
      entry: 'vitest-auto-spy/vue',
    });
  });

  it('takes the framework the file is written against, and the runtime the repository runs', () => {
    expect(chooseEntry(map, 'provideAutoSpy', 'vitest-auto-spy', hint({ framework: 'nestjs' }))).toEqual({
      kind: 'chosen',
      entry: 'vitest-auto-spy/nestjs',
    });
    expect(chooseEntry(map, 'injectSpy', 'vitest-auto-spy', hint({ framework: 'angular' }))).toEqual({
      kind: 'chosen',
      entry: 'vitest-auto-spy/angular',
    });
    // The same Angular helper under `bun test`: `/angular` there registers the Vitest adapter.
    expect(chooseEntry(map, 'injectSpy', 'vitest-auto-spy/bun', hint({ framework: 'angular' }))).toEqual({
      kind: 'chosen',
      entry: 'vitest-auto-spy/bun-angular',
    });
  });

  it('guesses, and says so, when neither the repository nor the file decides', () => {
    expect(chooseEntry(map, 'provideAutoSpy', 'vitest-auto-spy', NO_HINT)).toEqual({
      kind: 'guessed',
      entry: 'vitest-auto-spy/angular',
      candidates: map.byName.get('provideAutoSpy'),
    });
    expect(chooseEntry(map, 'provideAutoSpy', 'vitest-auto-spy/bun', NO_HINT)).toMatchObject({
      kind: 'guessed',
      entry: 'vitest-auto-spy/bun-angular',
    });
  });

  it('guesses too when the framework the file names is not one of the candidates', () => {
    expect(chooseEntry(map, 'shared', 'vitest-auto-spy', hint({ framework: 'nestjs' }))).toMatchObject({
      kind: 'guessed',
      entry: 'vitest-auto-spy/vue',
    });
  });

  it('keeps every candidate when none of them matches the runtime, and breaks a rank tie by name', () => {
    expect(chooseEntry(map, 'shared', 'vitest-auto-spy/bun', NO_HINT)).toMatchObject({ entry: 'vitest-auto-spy/vue' });
    expect(chooseEntry(map, 'tick', 'vitest-auto-spy', NO_HINT)).toMatchObject({ entry: 'vitest-auto-spy/console' });
  });

  it('answers entryFor with the decided entry, and undefined only for a name that is absent', () => {
    expect(entryFor(map, 'shared', 'vitest-auto-spy/angular')).toBe('vitest-auto-spy/vue');
    expect(entryFor(map, 'createSpyObj', 'vitest-auto-spy')).toBeUndefined();
  });
});
