import { globSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createTempRepo, removeTempRepos } from '../../cli/temp-repo';
import { builderConfigs } from './builder-targets';

afterEach(removeTempRepos);

describe('builderConfigs shared benches', () => {
  function bench(builder: string): string {
    const test = {
      builder,
      options: {
        include: ['apps/**/*.spec.ts', 'libs/**/*.spec.ts'],
        exclude: ['libs/excluded/**'],
        runnerConfig: 'runner.ts',
      },
      configurations: { smoke: { include: ['smoke/*.spec.ts'], runnerConfig: 'smoke.ts' } },
    };
    return createTempRepo({
      'package.json': '{}',
      'angular.json': JSON.stringify({
        projects: {
          bench: {
            root: 'tools/bench',
            sourceRoot: '.',
            architect: { test },
          },
        },
      }),
      'tools/bench/package.json': JSON.stringify({ builders: './builders.json' }),
      'tools/bench/builders.json': JSON.stringify({ builders: { test: { implementation: './test.mjs' } } }),
      'tools/bench/test.mjs':
        "const { executeUnitTestBuilder } = await import('@angular/build'); yield* executeUnitTestBuilder(options, context);",
      'apps/web/src/page.spec.ts': '',
      'libs/feature/service.spec.ts': '',
      'libs/excluded/service.spec.ts': '',
      'smoke/page.spec.ts': '',
    });
  }

  it('associates a canonical bench with specs outside its project root, respecting include and exclude', () => {
    const root = bench('@angular/build:unit-test');
    expect(builderConfigs(join(root, 'apps/web/src/page.spec.ts'))).toEqual([join(root, 'runner.ts')]);
    expect(builderConfigs(join(root, 'apps/web/src/page.ts'))).toEqual([]);
    expect(builderConfigs(join(root, 'libs/feature/service.spec.ts'))).toEqual([join(root, 'runner.ts')]);
    expect(builderConfigs(join(root, 'libs/excluded/service.spec.ts'))).toEqual([]);
    expect(builderConfigs(join(root, 'smoke/page.spec.ts'))).toEqual([join(root, 'smoke.ts')]);
  });

  it('associates the same specs with a local wrapper that delegates to Angular', () => {
    const root = bench('./tools/bench:test');
    expect(builderConfigs(join(root, 'apps/web/src/page.spec.ts'))).toEqual([join(root, 'runner.ts')]);
    expect(builderConfigs(join(root, 'libs/excluded/service.spec.ts'))).toEqual([]);
  });

  it.each([
    ['brace globs', ['**/*.{spec,test}.ts']],
    ['extglobs', ['**/*.@(spec|test).@(ts|tsx)']],
    ['character classes', ['src/[ab].spec.ts']],
    ['static directories', ['src']],
    ['source filenames', ['src/a.ts']],
  ])('associates specs selected through %s', (_label, include) => {
    const root = createTempRepo({
      'angular.json': JSON.stringify({
        projects: {
          app: {
            root: '',
            sourceRoot: '.',
            architect: { test: { builder: '@angular/build:unit-test', options: { include } } },
          },
        },
      }),
      'src/a.ts': '',
      'src/a.spec.ts': '',
      'other/c.spec.ts': '',
    });

    expect(builderConfigs(join(root, 'src/a.spec.ts'))).toEqual([undefined]);
    if (!include[0]?.startsWith('**/')) {
      expect(builderConfigs(join(root, 'other/c.spec.ts'))).toEqual([]);
    }
  });

  it('applies excludes when include uses its Angular default', () => {
    const root = createTempRepo({
      'angular.json': JSON.stringify({
        projects: {
          app: {
            root: '',
            sourceRoot: '.',
            architect: {
              test: { builder: '@angular/build:unit-test', options: { exclude: ['src/excluded/**'] } },
            },
          },
        },
      }),
      'src/a.spec.ts': '',
      'src/a.ts': '',
      'src/excluded/a.spec.ts': '',
    });

    expect(builderConfigs(join(root, 'src/a.spec.ts'))).toEqual([undefined]);
    expect(builderConfigs(join(root, 'src/a.ts'))).toEqual([]);
    expect(builderConfigs(join(root, 'src/excluded/a.spec.ts'))).toEqual([]);
  });

  it('selects unsaved lintText files without extending ordinary globs outside the source root', () => {
    const root = createTempRepo({
      'angular.json': JSON.stringify({
        projects: {
          app: {
            root: 'app',
            sourceRoot: 'app/src',
            architect: {
              test: { builder: '@angular/build:unit-test', options: { exclude: ['excluded/**'] } },
            },
          },
        },
      }),
      'app/src/': '',
    });

    expect(builderConfigs(join(root, 'app/src/unsaved.spec.ts'))).toEqual([undefined]);
    expect(builderConfigs(join(root, 'app/src/unsaved.ts'))).toEqual([]);
    expect(builderConfigs(join(root, 'app/src/excluded/unsaved.spec.ts'))).toEqual([]);
    expect(builderConfigs(join(root, 'docs/unsaved.spec.ts'))).toEqual([]);
  });

  it('normalizes source-root prefixes, supports question globs and handles invalid selection values conservatively', () => {
    const project = (include: unknown, exclude: unknown): string => {
      return createTempRepo({
        'angular.json': JSON.stringify({
          projects: {
            app: {
              root: 'apps/web',
              sourceRoot: 'apps/web/src',
              architect: {
                test: {
                  builder: '@angular/build:unit-test',
                  options: { include, exclude },
                },
              },
            },
          },
        }),
        'apps/web/src/a.spec.ts': '',
      });
    };
    const selected = project(['./apps/web/src/?.spec.ts'], [null]);
    expect(builderConfigs(join(selected, 'apps/web/src/a.spec.ts'))).toEqual([undefined]);
    const invalid = project(false, []);
    expect(builderConfigs(join(invalid, 'apps/web/src/a.spec.ts'))).toEqual([]);
    const invalidPattern = project([null], []);
    expect(builderConfigs(join(invalidPattern, 'apps/web/src/a.spec.ts'))).toEqual([]);
    const noExcludes = project(['**/*.spec.ts'], false);
    expect(builderConfigs(join(noExcludes, 'apps/web/src/a.spec.ts'))).toEqual([undefined]);
  });

  function selection(include: string[], exclude: string[] = []): string {
    return createTempRepo({
      'angular.json': JSON.stringify({
        projects: {
          app: {
            root: 'app',
            sourceRoot: 'app/src',
            architect: { test: { builder: '@angular/build:unit-test', options: { include, exclude } } },
          },
        },
      }),
      'app/src/existing.spec.ts': '',
    });
  }

  it('matches question globs against unsaved files and permits explicit selections outside the source root', () => {
    const root = selection(['?.spec.ts', '../../docs/?.spec.ts']);

    expect(builderConfigs(join(root, 'app/src/a.spec.ts'))).toEqual([undefined]);
    expect(builderConfigs(join(root, 'app/src/long.spec.ts'))).toEqual([]);
    expect(builderConfigs(join(root, 'docs/b.spec.ts'))).toEqual([undefined]);
  });

  it('retains uncertain runner context for complex unsaved-file includes and excludes', () => {
    const included = selection(['**/*.{spec,test}.ts']);
    const excluded = selection(['**/*.spec.ts'], ['**/*.@(spec|test).ts']);

    expect(builderConfigs(join(included, 'app/src/new.spec.ts'))).toEqual([undefined]);
    expect(builderConfigs(join(included, 'docs/new.spec.ts'))).toEqual([]);
    expect(builderConfigs(join(excluded, 'app/src/new.spec.ts'))).toEqual([undefined]);
  });

  it('retains runner context when the filesystem globber rejects a selection', () => {
    const pattern = 'a'.repeat(65_537);
    const root = selection([pattern]);

    expect(() => globSync(pattern, { cwd: join(root, 'app/src') })).toThrow('pattern is too long');
    expect(builderConfigs(join(root, 'app/src/existing.spec.ts'))).toEqual([undefined]);
  });
});
