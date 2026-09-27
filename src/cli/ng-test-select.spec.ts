import { afterEach, describe, expect, it } from 'vitest';

import { affectedSpecs, compressIncludes, discoveredFiles, parseShard, shardFiles, withoutInclude } from './ng-test-select';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

describe('parseShard', () => {
  it('reads <index>/<count> and refuses anything outside 1..count', () => {
    expect(parseShard('2/4')).toEqual({ index: 2, count: 4 });
    expect(parseShard(' 1/1 ')).toEqual({ index: 1, count: 1 });
    expect(parseShard('0/4')).toBeUndefined();
    expect(parseShard('5/4')).toBeUndefined();
    expect(parseShard('1/0')).toBeUndefined();
    expect(parseShard('1-4')).toBeUndefined();
    expect(parseShard('a/b')).toBeUndefined();
  });
});

describe('shardFiles', () => {
  const files = Array.from({ length: 11 }, (_, index) => `src/app/f${index}.spec.ts`);

  it('runs every file exactly once across the shards, in near-equal parts', () => {
    const parts = [1, 2, 3, 4].map((index) => shardFiles(files, { index, count: 4 }));

    expect(parts.map((part) => part.length)).toEqual([3, 3, 3, 2]);
    expect(parts.flat().sort()).toEqual([...files].sort());
  });

  it('does not depend on the order the builder listed the files in', () => {
    expect(shardFiles([...files].reverse(), { index: 2, count: 3 })).toEqual(shardFiles(files, { index: 2, count: 3 }));
  });

  it('leaves a shard empty when there are more shards than files', () => {
    expect(shardFiles(['a.spec.ts'], { index: 2, count: 2 })).toEqual([]);
  });
});

describe('discoveredFiles', () => {
  it('reads the list under the header and nothing else', () => {
    const output = ['Some warning', 'Discovered test files:', '  src/app/a.spec.ts', '  src/app/b.test.ts', '', 'trailing noise'].join(
      '\n',
    );

    expect(discoveredFiles(output)).toEqual(['src/app/a.spec.ts', 'src/app/b.test.ts']);
    expect(discoveredFiles('Discovered test files:\r\n')).toEqual([]);
  });

  it('answers undefined when the builder printed no list', () => {
    expect(discoveredFiles('Error: Unknown argument: list-tests')).toBeUndefined();
  });
});

describe('compressIncludes', () => {
  const universe = [
    'src/app/cart/cart.spec.ts',
    'src/app/cart/line/line.spec.ts',
    'src/app/cart/cart.test.ts',
    'src/app/user/user.spec.ts',
    'src/app/user/user-card.spec.ts',
    'src/[legacy]/old.spec.ts',
    'src/[legacy]/older.spec.ts',
  ];

  it('folds the topmost directory whose every spec of that suffix is selected into one glob', () => {
    expect(
      compressIncludes(['src/app/cart/cart.spec.ts', 'src/app/cart/line/line.spec.ts', 'src/app/user/user.spec.ts'], universe),
    ).toEqual(['src/app/cart/**/*.spec.ts', 'src/app/user/user.spec.ts']);
  });

  it('keeps a suffix of its own, and never folds a directory whose name a glob would misread', () => {
    expect(compressIncludes(['src/app/cart/cart.test.ts', 'src/[legacy]/old.spec.ts', 'src/[legacy]/older.spec.ts'], universe)).toEqual([
      'src/**/*.test.ts',
      'src/[legacy]/old.spec.ts',
      'src/[legacy]/older.spec.ts',
    ]);
    expect(compressIncludes(['top.spec.ts'], ['top.spec.ts', 'README.md'])).toEqual(['top.spec.ts']);
  });
});

describe('withoutInclude', () => {
  it('drops both spellings of --include and keeps everything else in order', () => {
    expect(withoutInclude(['--coverage', '--include', 'src/a', '--include=src/b', '--reporters=default'])).toEqual([
      '--coverage',
      '--reporters=default',
    ]);
  });
});

const WORKSPACE = {
  'package.json': JSON.stringify({ devDependencies: { '@angular/build': '22.2.0', vitest: '5.0.2' } }),
  'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@shared/*': ['src/shared/*'] } } }),
  'src/test-setup.ts': "import './testing/global-stub';\n",
  'src/testing/global-stub.ts': 'export const stub = 1;\n',
  'src/shared/format.ts': 'export const format = (value: string) => value;\n',
  'src/app/user.service.ts':
    "import { Injectable } from '@angular/core';\nimport { format } from '@shared/format';\nexport class UserService {}\n",
  'src/app/user.service.spec.ts': "import { UserService } from './user.service';\n",
  'src/app/user-card.component.ts':
    "import { UserService } from './user.service';\n@Component({ templateUrl: './user-card.component.html' })\nexport class UserCard {}\n",
  'src/app/user-card.component.html': '<p>user</p>\n',
  'src/app/user-card.component.spec.ts': "import { UserCard } from './user-card.component';\n",
  'src/app/clock.spec.ts': "describe('clock', () => {});\n",
  'README.md': '# app\n',
};

function affected(changed: readonly string[], setup: readonly string[] = ['src/test-setup.ts']) {
  const profile = readProfile(createTempRepo(WORKSPACE));

  return affectedSpecs(profile, changed, setup);
}

function specsOf(result: ReturnType<typeof affected>): string[] {
  return result.all ? ['<all>'] : [...result.specs].sort();
}

describe('affectedSpecs', () => {
  it('follows the importers up from a changed file to every spec that reaches it', () => {
    expect(specsOf(affected(['src/app/user.service.ts']))).toEqual(['src/app/user-card.component.spec.ts', 'src/app/user.service.spec.ts']);
  });

  it('follows a compilerOptions.paths alias the way the relative imports are followed', () => {
    expect(specsOf(affected(['src/shared/format.ts']))).toEqual(['src/app/user-card.component.spec.ts', 'src/app/user.service.spec.ts']);
  });

  it('seeds a template from the component that names it', () => {
    expect(specsOf(affected(['src/app/user-card.component.html']))).toEqual(['src/app/user-card.component.spec.ts']);
  });

  it('runs a changed spec itself, and nothing for a file no spec reaches', () => {
    expect(specsOf(affected(['src/app/clock.spec.ts', 'README.md']))).toEqual(['src/app/clock.spec.ts']);
  });

  it('runs everything when a config or a lockfile changed', () => {
    expect(affected(['angular.json'])).toEqual({ all: true, reason: 'angular.json changed' });
    expect(affected(['tsconfig.spec.json']).all).toBe(true);
    expect(affected(['vitest-base.config.mts']).all).toBe(true);
    expect(affected(['package-lock.json']).all).toBe(true);
  });

  it('runs everything when a change reaches the setup files', () => {
    expect(affected(['src/testing/global-stub.ts'])).toEqual({
      all: true,
      reason: 'src/testing/global-stub.ts changed, and every spec loads it through the setup files',
    });
    expect(specsOf(affected(['src/testing/global-stub.ts'], []))).toEqual([]);
  });
});
