import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { checkTsconfigMockFiles } from './tsconfig-mock-files';

afterEach(() => {
  removeTempRepos();
});

const LIB_CONFIG = JSON.stringify({ include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts', 'src/test-setup.ts'] });

const findingsIn = (files: Record<string, string>): Finding[] =>
  checkTsconfigMockFiles(readProfile(createTempRepo({ 'package.json': '{}', ...files })));

const shippedBy = (files: Record<string, string>): (string | undefined)[] => findingsIn(files).map(({ file }) => file);

describe('checkTsconfigMockFiles', () => {
  it('warns about a mock file a library config compiles though it leaves the specs out', () => {
    const [finding] = findingsIn({
      'libs/ui/tsconfig.lib.json': LIB_CONFIG,
      'libs/ui/src/button.ts': '',
      'libs/ui/src/button.spec.ts': '',
      'libs/ui/src/button.mock.ts': '',
      'libs/other/src/other.mock.ts': '',
    });

    expect(finding).toEqual({
      check: 'tsconfig-ships-mock-file',
      severity: 'warning',
      file: 'libs/ui/tsconfig.lib.json',
      message:
        'This build config leaves the specs out but compiles their test data into the output: libs/ui/src/button.mock.ts ships with the package.',
      fix: 'Exclude the test data beside the specs: `"exclude": ["src/**/*.mock.ts"]`, next to the spec patterns already there.',
    });
  });

  it('reports the specs and the test data a library config without any exclude compiles, in the style of its include', () => {
    const [finding] = findingsIn({
      'libs/data/tsconfig.lib.json': JSON.stringify({ include: ['src/**/*.ts'] }),
      'libs/data/src/lib/x.ts': '',
      'libs/data/src/lib/x.spec.ts': '',
      'libs/data/src/lib/x.mock.ts': '',
      'libs/data/src/__tests__/helpers.ts': '',
    });

    expect(finding).toMatchObject({ check: 'tsconfig-ships-mock-file', severity: 'warning', file: 'libs/data/tsconfig.lib.json' });
    expect(finding?.message).toBe(
      'This build config has no `exclude`, so it compiles the specs and their test data into the output: libs/data/src/__tests__/helpers.ts, libs/data/src/lib/x.spec.ts, libs/data/src/lib/x.mock.ts ship with the package.',
    );
    expect(finding?.fix).toBe(
      'Leave the tests out of the build: `"exclude": ["src/**/__tests__/**", "src/**/*.spec.ts", "src/**/*.mock.ts"]`.',
    );
  });

  it('derives the glob prefix from a file or directory include, and from none', () => {
    const fixOf = (config: object): string | undefined =>
      findingsIn({ 'tsconfig.build.json': JSON.stringify(config), 'src/a.spec.ts': '' })[0]?.fix;

    expect(fixOf({ include: ['src/index.ts', 'src/a.spec.ts'] })).toContain('["src/**/*.spec.ts"]');
    expect(fixOf({ include: ['./src/'] })).toContain('["src/**/*.spec.ts"]');
    expect(fixOf({})).toContain('["**/*.spec.ts"]');
    expect(shippedBy({ 'tsconfig.json': JSON.stringify({ include: ['src'] }), 'src/a.spec.ts': '' })).toEqual([]);
  });

  it('lists the first few files and one exclude glob per kind of test data', () => {
    const [finding] = findingsIn({
      'tsconfig.build.json': JSON.stringify({ exclude: ['**/*.test.*'] }),
      'src/a.mock.ts': '',
      'src/b.mocks.tsx': '',
      'src/c.fixture.mts': '',
      'src/__mocks__/fs.ts': '',
      'src/d.mock.ts': '',
    });

    expect(finding?.message).toContain(': src/__mocks__/fs.ts, src/a.mock.ts, src/b.mocks.tsx and 2 more ship with the package.');
    expect(finding?.fix).toContain('`"exclude": ["**/__mocks__/**", "**/*.mock.ts", "**/*.mocks.tsx", "**/*.fixture.mts"]`');
  });

  it('is satisfied by an exclude that names the test data, by glob or by directory', () => {
    expect(
      shippedBy({
        'tsconfig.lib.json': JSON.stringify({ include: ['src'], exclude: ['src/**/*.spec.ts', '**/*.mock.ts', 'src/testing'] }),
        'src/a.mock.ts': '',
        'src/testing/users.fixtures.ts': '',
      }),
    ).toEqual([]);
  });

  it('leaves alone a config that ships nothing or is not a build config', () => {
    const mock = { 'src/a.mock.ts': '' };

    expect(shippedBy({ 'tsconfig.lib.json': LIB_CONFIG, 'src/a.ts': '' })).toEqual([]);
    expect(shippedBy({ 'tsconfig.lib.json': LIB_CONFIG, 'src/a.spec.ts': '' })).toEqual([]);
    expect(shippedBy({ ...mock, 'tsconfig.app.json': LIB_CONFIG, 'tsconfig.spec.json': LIB_CONFIG })).toEqual([]);
    expect(
      shippedBy({ ...mock, 'tsconfig.lib.json': JSON.stringify({ compilerOptions: { noEmit: true }, exclude: ['**/*.spec.ts'] }) }),
    ).toEqual([]);
    expect(shippedBy({ ...mock, 'tsconfig.lib.json': LIB_CONFIG, 'ng-package.json': '{}' })).toEqual([]);
    expect(
      shippedBy({ ...mock, 'tsconfig.json': JSON.stringify({ include: ['src'], exclude: ['src/type-tests/seam.test-d.ts'] }) }),
    ).toEqual([]);
    expect(shippedBy({ ...mock, 'tsconfig.json': JSON.stringify({ include: ['src'] }) })).toEqual([]);
    expect(shippedBy({ ...mock, 'tsconfig.lib.json': JSON.stringify({ files: ['src/index.ts'], exclude: ['**/*.spec.ts'] }) })).toEqual([]);
  });

  it('inherits include and exclude through a relative extends, and does not judge a config another one extends', () => {
    expect(
      shippedBy({
        'tsconfig.base.json': JSON.stringify({ exclude: ['libs/**/__tests__'] }),
        'libs/a/tsconfig.lib.json': JSON.stringify({ extends: ['@tsconfig/strictest', '../../tsconfig.base'], include: ['src'] }),
        'libs/a/src/a.mock.ts': '',
        'libs/b/tsconfig.lib.json': JSON.stringify({ extends: './tsconfig.one.json' }),
        'libs/b/tsconfig.one.json': JSON.stringify({ extends: './tsconfig.two.json', include: ['src'], exclude: ['src/**/*.spec.ts'] }),
        'libs/b/tsconfig.two.json': JSON.stringify({ extends: './tsconfig.one.json' }),
        'libs/b/src/b.mock.ts': '',
      }),
    ).toEqual(['libs/a/tsconfig.lib.json', 'libs/b/tsconfig.lib.json']);
  });

  it('reads nothing from an extends that is missing or not a file', () => {
    expect(
      shippedBy({
        'tsconfig.lib.json': JSON.stringify({ extends: ['./missing.json', './folder'], exclude: ['**/*.spec.ts'] }),
        'folder.json/': '',
        'src/a.mock.ts': '',
      }),
    ).toEqual(['tsconfig.lib.json']);
  });
});
