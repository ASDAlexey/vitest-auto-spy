import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { type KeyValue, SettingsReader, keyValue } from './setup-options';

afterEach(() => {
  removeTempRepos();
});

const CALL = 'setup(';

/** What the first `setup(…)` call in `src/setup.ts` sets for each key asked. */
const read = (files: Record<string, string>, keys: readonly string[]): Record<string, KeyValue['kind'] | string> => {
  const profile = readProfile(createTempRepo({ 'package.json': '{}', ...files }));
  const reader = new SettingsReader(buildGraph(profile));
  const text = files['src/setup.ts'] ?? '';
  const settings = reader.valueAt(reader.withText('src/setup.ts', text), text.indexOf(CALL) + CALL.length);

  return Object.fromEntries(
    keys.map((key) => {
      const value = keyValue(settings, key);

      return [key, value.kind === 'value' ? value.text : value.kind];
    }),
  );
};

describe('SettingsReader', () => {
  it('reads an object literal key by key, a later key or spread overriding an earlier one', () => {
    expect(
      read(
        {
          'src/setup.ts': [
            "const BASE = { a: true, b: true, 'c': { deep: [1, 2] } };",
            "setup({ ...BASE, b: false, d: undefined, e: null, f /* shorthand */, g: 'x' /* note */, h() {}, 0: 1, });",
          ].join('\n'),
        },
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      ),
    ).toEqual({ a: 'true', b: 'false', c: '{ deep: [1, 2] }', d: 'unset', e: 'unset', f: 'unknown', g: "'x'", h: 'unset' });
  });

  it('lets a key written after an unreadable spread stand, and an empty call set nothing', () => {
    expect(read({ 'src/setup.ts': 'setup({ a: true, ...make(), b: true });' }, ['a', 'b'])).toEqual({ a: 'unknown', b: 'true' });
    expect(read({ 'src/setup.ts': 'setup({ a: true, [key]: 1, b: true });' }, ['a', 'b'])).toEqual({ a: 'unknown', b: 'true' });
    expect(read({ 'src/setup.ts': 'setup( );' }, ['a'])).toEqual({ a: 'unset' });
    expect(read({ 'src/setup.ts': 'setup({ a: undefined });' }, ['a'])).toEqual({ a: 'unset' });
  });

  it('reads a declaration with a type annotation or assertion, and nothing it cannot follow', () => {
    const declared = (declaration: string, call = 'setup(OPTIONS)'): string =>
      String(read({ 'src/setup.ts': `${declaration}\n${call};` }, ['a'])['a']);

    expect(declared('const OPTIONS: Options = { a: true } as const')).toBe('true');
    expect(declared('let OPTIONS = { a: true } satisfies Parameters<typeof setup>[0];')).toBe('true');
    expect(declared('var $OPTIONS = { a: true }', 'setup(\n  $OPTIONS\n)')).toBe('true');
    expect(declared('const OPTIONS = { a: true }.x')).toBe('unknown');
    expect(declared('const OPTIONS = make()')).toBe('unknown');
    expect(declared('const OPTIONS = { a: true }', 'setup(isCi ? OPTIONS : {})')).toBe('unknown');
    expect(declared('', 'setup(UNDECLARED)')).toBe('unknown');
    expect(declared('const A = B; const B = A', 'setup(A)')).toBe('unknown');
    expect(read({ 'src/setup.ts': 'setup({ a: true' }, ['a'])).toEqual({ a: 'unknown' });
  });

  it('sees through Object.freeze and parentheses, and nothing chained after them', () => {
    const declared = (declaration: string, call = 'setup(OPTIONS)'): string =>
      String(read({ 'src/setup.ts': `${declaration}\n${call};` }, ['a'])['a']);

    expect(declared('const OPTIONS = Object.freeze({ a: true }) as const')).toBe('true');
    expect(declared('const OPTIONS = ({ a: true } satisfies Options)')).toBe('true');
    expect(declared('const OPTIONS = { a: true }', 'setup(Object . freeze(( OPTIONS )))')).toBe('true');
    expect(declared('const OPTIONS = Object.freeze({ a: true }).a')).toBe('unknown');
    expect(declared('const OPTIONS = (a) => a')).toBe('unknown');
    expect(read({ 'src/setup.ts': 'setup(Object.freeze({ a: true }' }, ['a'])).toEqual({ a: 'unknown' });
  });

  it('follows an import to the module that exports the value, through re-exports and a default', () => {
    const imported = (files: Record<string, string>): string => String(read(files, ['a'])['a']);

    expect(
      imported({
        'src/setup.ts': "import { OPTIONS } from './options';\nsetup(OPTIONS);",
        'src/options.ts': 'export const OPTIONS = { a: true };',
      }),
    ).toBe('true');
    expect(
      imported({
        'src/setup.ts': "import { SHARED as OPTIONS, other } from './barrel';\nsetup(OPTIONS);",
        'src/barrel.ts': "export * from './none';\nexport * from './renamed';",
        'src/none.ts': 'export const unrelated = 1;',
        'src/renamed.ts': "const LOCAL = { a: 'x' };\nexport { LOCAL as SHARED, type Other };",
      }),
    ).toBe("'x'");
    expect(
      imported({
        'src/setup.ts': "import OPTIONS, { type Unused } from './default';\nsetup(OPTIONS);",
        'src/default.ts': "export { BASE } from './base';\nexport default BASE_COPY;\nconst BASE_COPY = { a: false };",
        'src/base.ts': 'export const BASE = {};',
      }),
    ).toBe('false');
    expect(
      imported({
        'src/setup.ts': "import { BASE } from './default';\nsetup(BASE);",
        'src/default.ts': "export { BASE } from './base';",
        'src/base.ts': 'export const BASE = { a: 1 };',
      }),
    ).toBe('1');
  });

  it('follows a tsconfig paths alias through the files the graph resolved it to', () => {
    expect(
      read(
        {
          'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@test/*': ['src/test/*'] } } }),
          'src/setup.ts': "import { helper } from './helper';\nimport { OPTIONS } from '@test/options';\nsetup(OPTIONS);",
          'src/helper.ts': 'export const helper = 1;',
          'src/test/options.ts': 'export const OPTIONS = { a: true };',
        },
        ['a'],
      ),
    ).toEqual({ a: 'true' });
  });

  it('gives up, as unknown, on a module it cannot read or follow', () => {
    const unknown = (files: Record<string, string>): void => {
      expect(read(files, ['a'])).toEqual({ a: 'unknown' });
    };

    unknown({ 'src/setup.ts': "import { OPTIONS } from 'some-package';\nsetup(OPTIONS);" });
    unknown({ 'src/setup.ts': "import { OPTIONS } from './missing';\nsetup(OPTIONS);", 'src/other.ts': '' });
    unknown({ 'src/setup.ts': "import OPTIONS from './options.json';\nsetup(OPTIONS);", 'src/options.json': '{ "a": true }' });
    unknown({ 'src/setup.ts': "import OPTIONS from './named';\nsetup(OPTIONS);", 'src/named.ts': 'export const a = 1;' });
    unknown({
      'src/setup.ts': "import { OPTIONS } from './a';\nsetup(OPTIONS);",
      'src/a.ts': "export * from './b';",
      'src/b.ts': "export * from './a';",
    });
    unknown({ 'src/setup.ts': "import { OPTIONS } from './a';\nsetup(OPTIONS);", 'src/a.ts': "export * from './b';", 'src/b.ts': '' });
  });
});
