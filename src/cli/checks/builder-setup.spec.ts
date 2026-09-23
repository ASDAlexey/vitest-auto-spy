import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { checkBuilderSetup } from './builder-setup';
import { unitTestTargets } from './unit-test-targets';

afterEach(() => {
  removeTempRepos();
});

const json = (value: unknown): string => JSON.stringify(value);

const nxProject = (test: Record<string, unknown>): string =>
  json({ name: 'client', targets: { test, lint: { executor: '@nx/eslint:lint' } } });

const vitestConfig = "export default { test: { sequence: { setupFiles: 'list' }, setupFiles: ['src/test-setup.ts'] } };";

describe('checkBuilderSetup', () => {
  it('reports an Nx unit-test target that names no setup file its project keeps in the Vitest config', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'nx.json': json({ targetDefaults: { '@nx/angular:unit-test': { options: { providersFile: 'test-providers.ts' } } } }),
      'libs/client/project.json': nxProject({ executor: '@nx/angular:unit-test', options: { watch: false } }),
      'libs/client/vitest.config.ts': vitestConfig,
      'libs/client/src/test-setup.ts': '',
    });
    const [finding, ...rest] = checkBuilderSetup(readProfile(root));

    expect(rest).toEqual([]);
    expect(finding?.check).toBe('builder-setup-unreached');
    expect(finding?.file).toBe('libs/client/project.json');
    expect(finding?.message).toContain('`client:test` runs through `@nx/angular:unit-test`');
    expect(finding?.message).toContain('`libs/client/src/test-setup.ts`, found in the `setupFiles` of libs/client/vitest.config.ts');
    expect(finding?.fix).toContain('"setupFiles": ["libs/client/src/test-setup.ts"]');
  });

  it('falls back to the conventional setup file of an Angular CLI project', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'angular.json': json({ projects: { app: { root: 'projects/app/', architect: { test: { builder: '@angular/build:unit-test' } } } } }),
      'projects/app/src/test-setup.ts': '',
    });

    expect(checkBuilderSetup(readProfile(root)).map((finding) => finding.message)).toEqual([
      expect.stringContaining('`projects/app/src/test-setup.ts`, found in its conventional place'),
    ]);
  });

  it('stays quiet once the target, a configuration or the workspace defaults name the setup or a runner config', () => {
    const files = { 'package.json': '{}', 'libs/client/src/test-setup.ts': '' };
    const quiet = (extra: Record<string, string>): number => checkBuilderSetup(readProfile(createTempRepo({ ...files, ...extra }))).length;

    expect(quiet({ 'libs/client/project.json': nxProject({ executor: '@nx/angular:unit-test', options: { setupFiles: ['x.ts'] } }) })).toBe(
      0,
    );
    expect(
      quiet({
        'libs/client/project.json': nxProject({ executor: '@nx/angular:unit-test', configurations: { ci: { runnerConfig: true } } }),
      }),
    ).toBe(0);
    expect(
      quiet({
        'nx.json': json({ targetDefaults: { test: { executor: '@nx/angular:unit-test', options: { runnerConfig: 'vitest.config.ts' } } } }),
        'libs/client/project.json': nxProject({}),
      }),
    ).toBe(0);
    expect(quiet({ 'libs/client/project.json': nxProject({ executor: '@nx/angular:unit-test', options: { runnerConfig: false } }) })).toBe(
      1,
    );
  });

  it('stays quiet with nothing to run, and for targets of other builders', () => {
    const quiet = (extra: Record<string, string>): number =>
      checkBuilderSetup(readProfile(createTempRepo({ 'package.json': '{}', ...extra }))).length;

    expect(quiet({ 'libs/client/project.json': nxProject({ executor: '@nx/angular:unit-test' }) })).toBe(0);
    expect(quiet({ 'libs/client/project.json': nxProject({ executor: '@nx/vitest:test' }), 'libs/client/src/test-setup.ts': '' })).toBe(0);
    expect(
      quiet({
        'angular.json': json({ projects: { app: { architect: { test: { builder: '@angular/build:karma' } } } } }),
        'src/test-setup.ts': '',
      }),
    ).toBe(0);
  });
});

describe('unitTestTargets', () => {
  it('reads both workspace shapes and survives what is not a target', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'workspace.json': json({ projects: { app: { targets: { test: { builder: '@angular/build:unit-test' }, broken: 1 } }, odd: 3 } }),
      'project.json': json({ targets: { test: { executor: '@nx/angular:unit-test', configurations: { ci: 2 } } } }),
      'nx.json': '[]',
      'libs/broken/project.json': '{ not json',
    });

    expect(unitTestTargets(readProfile(root)).map(({ file, project, root: at, name }) => [file, project, at, name])).toEqual([
      ['workspace.json', 'app', '', 'test'],
      ['project.json', '', '', 'test'],
    ]);
  });
});
