import { afterEach, describe, expect, it } from 'vitest';

import type { Profile } from '../profile';
import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { hasRootConfig } from './perf-harness';
import { checkVitest5ClearMocks, checkVitest5Removed } from './vitest-5';
import { ciConfigs, configKeys, declaredVitestMajor, installedVersionOf, isBelow, passesFlag, stringValue } from './vitest-5-facts';
import { cachesPath, checkModuleCachePersisted, checkVitest5Available, lowestVersion } from './vitest-5-upgrade';

afterEach(() => {
  removeTempRepos();
});

const manifest = (name: string, version: string): Record<string, string> => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({ version }),
});

const repo = (vitest: string | undefined, files: Record<string, string> = {}, packageJson: object = {}): Profile =>
  readProfile(
    createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '*' }, ...packageJson }),
      ...(vitest === undefined ? {} : manifest('vitest', vitest)),
      ...files,
    }),
  );

const removedIn = (profile: Profile): Finding[] => checkVitest5Removed(profile, buildGraph(profile));
const clearMocksIn = (profile: Profile): Finding[] => checkVitest5ClearMocks(profile, buildGraph(profile));
const cacheIn = (profile: Profile): Finding[] => checkModuleCachePersisted(profile, buildGraph(profile));

const unitTestTarget = JSON.stringify({ projects: { app: { root: '', architect: { test: { builder: '@angular/build:unit-test' } } } } });

describe('configKeys', () => {
  it('reads each key with the object keys around it, through arrays, past comments and strings', () => {
    const text = [
      'export default defineConfig({',
      '  // clearMocks: true',
      "  test: { experimental: { fsModuleCache: true, fsModuleCachePath: '.cache/vitest' },",
      "    projects: [{ test: { name: 'a:b', clearMocks: false } }],",
      '  },',
      '});',
    ].join('\n');

    expect(configKeys('vitest.config.ts', text).map((key) => [key.path, key.value])).toEqual([
      ['test', "{ experimental: { fsModuleCache: true, fsModuleCachePath: '.cache/vitest' },"],
      ['test.experimental', "{ fsModuleCache: true, fsModuleCachePath: '.cache/vitest' },"],
      ['test.experimental.fsModuleCache', "true, fsModuleCachePath: '.cache/vitest' },"],
      ['test.experimental.fsModuleCachePath', "'.cache/vitest' },"],
      ['test.projects', "[{ test: { name: 'a:b', clearMocks: false } }],"],
      ['test.test', "{ name: 'a:b', clearMocks: false } }],"],
      ['test.test.name', "'a:b', clearMocks: false } }],"],
      ['test.test.clearMocks', 'false } }],'],
    ]);
    expect(configKeys('a.ts', 'x: 1').map((key) => key.value)).toEqual(['1']);
  });

  it('reads a quoted value and nothing else', () => {
    expect(configKeys('a.ts', "a: 'dir/x',\nb: dir").map(stringValue)).toEqual(['dir/x', undefined]);
  });
});

describe('the facts', () => {
  it('reads a flag only when it is passed on, not turned off', () => {
    expect(passesFlag('vitest run --fsModuleCache', 'fsModuleCache')).toBe(true);
    expect(passesFlag('vitest --experimental.fsModuleCache=true run', 'experimental.fsModuleCache')).toBe(true);
    expect(passesFlag('vitest --clearMocks=false', 'clearMocks')).toBe(false);
    expect(passesFlag('vitest --clearMocks false', 'clearMocks')).toBe(false);
    expect(passesFlag('vitest --no-clearMocks', 'clearMocks')).toBe(false);
    expect(passesFlag('vitest --compareX', 'compare')).toBe(false);
  });

  it('reads versions defensively', () => {
    const root = createTempRepo({ ...manifest('a', '1.2.3'), 'node_modules/b/package.json': '{"version":1}' });

    expect(installedVersionOf(root, 'a')).toBe('1.2.3');
    expect(installedVersionOf(root, 'b')).toBeUndefined();
    expect(isBelow(undefined, [1, 0, 0])).toBe(false);
    expect(isBelow('0.9.0', [1, 0, 0])).toBe(true);
    expect(declaredVitestMajor(repo('5.0.2'))).toBe(5);
    expect(declaredVitestMajor(repo('5.0.2', {}, { devDependencies: {} }))).toBeUndefined();
  });

  it('lists the CI configs it can read', () => {
    const profile = repo('4.1.11', {
      '.github/workflows/ci.yml': 'a',
      '.gitlab-ci.yml': 'b',
      '.circleci/config.yml': 'c',
      'other.yml': 'd',
    });

    expect(ciConfigs(profile).map(({ file }) => file)).toEqual(['.circleci/config.yml', '.github/workflows/ci.yml', '.gitlab-ci.yml']);
    expect(ciConfigs({ ...profile, files: ['.gitlab-ci.yml', '.github/workflows/gone.yml'] }).map(({ file }) => file)).toEqual([
      '.gitlab-ci.yml',
    ]);
  });
});

describe('vitest-5-removed', () => {
  const sources = {
    'src/reporter.ts': [
      "import type { Reporter } from 'vitest/reporters';",
      "import { BaseCoverageProvider } from 'vitest/coverage';",
      "const environments = await import('vitest/environments');",
      'const text = "import { x } from \'vitest/snapshot\'";',
    ].join('\n'),
    'src/runner.ts': "const { VitestTestRunner } = require('vitest/runners');\nimport 'vitest/suite';\nimport 'vitest/mocker';",
    'src/a.spec.ts': "describe.sequential('a', () => {\n  it.sequential('b', () => {});\n});",
    'src/b.spec.ts': "test.skip.sequential('c', () => {});\nconst note = 'describe.sequential';",
    'vitest.config.ts':
      'export default { test: { benchmark: { outputJson: "a.json", compare: "b.json" }, poolOptions: { forks: { singleFork: true } } } };',
  };
  const scripts = {
    scripts: { bench: 'vitest bench --outputJson=bench.json --compare base.json', other: 'tool --compare x', test: 'vitest run' },
  };

  it('reports everything Vitest 5 removed as an error on Vitest 5', () => {
    const findings = removedIn(repo('5.0.2', sources, scripts));

    expect(findings.map(({ severity, file, message }) => [severity, file, message])).toEqual([
      [
        'error',
        'src/a.spec.ts',
        'Calls `describe.sequential`, `it.sequential` (lines 1, 2), which Vitest 5 removed: collecting the file throws `TypeError: … is not a function`.',
      ],
      [
        'error',
        'src/b.spec.ts',
        'Calls `test.skip.sequential` (line 1), which Vitest 5 removed: collecting the file throws `TypeError: … is not a function`.',
      ],
      [
        'error',
        'src/reporter.ts',
        'Imports `vitest/reporters`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
      ],
      [
        'error',
        'src/reporter.ts',
        'Imports `vitest/coverage`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
      ],
      [
        'error',
        'src/reporter.ts',
        'Imports `vitest/environments`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
      ],
      [
        'error',
        'src/runner.ts',
        'Imports `vitest/runners`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
      ],
      [
        'error',
        'src/runner.ts',
        'Imports `vitest/suite`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
      ],
      [
        'error',
        'src/runner.ts',
        'Imports `vitest/mocker`, which Vitest 5 removed: the specifier stops resolving, for the runner and for `tsc` alike.',
      ],
      [
        'error',
        'package.json',
        'The `bench` script passes `--outputJson`, which Vitest 5 removed: the command stops with `Unknown option`.',
      ],
      ['error', 'package.json', 'The `bench` script passes `--compare`, which Vitest 5 removed: the command stops with `Unknown option`.'],
      ['error', 'vitest.config.ts', 'Sets `benchmark.outputJson`, which Vitest 5 removed: nothing reads the key, and no warning says so.'],
      ['error', 'vitest.config.ts', 'Sets `benchmark.compare`, which Vitest 5 removed: nothing reads the key, and no warning says so.'],
      [
        'warning',
        'vitest.config.ts',
        '`poolOptions` was removed in Vitest 4: Vitest prints one deprecation line and runs without every option inside it, so the pool is configured by the defaults.',
      ],
    ]);
    expect([...new Set(findings.map(({ fix }) => fix))]).toEqual([
      'Drop `.sequential`. Where a suite or the config runs tests concurrently, pass `{ concurrent: false }` to opt this one out; the option works on Vitest 4 already.',
      'Import from `vitest/node` instead; it exports the same names from Vitest 4.1 on.',
      'Import from `vitest/runtime` instead; it exports the same names from Vitest 4.1 on.',
      'Use `TestRunner` from `vitest` instead; it is exported from Vitest 4.1 on.',
      'Use the static methods on `TestRunner` from `vitest` instead.',
      'Import from the `@vitest/mocker` package directly.',
      'Use `--reporter=json --outputFile=<path>` instead.',
      'Pass `writeResult` as a per-bench option to persist a result, and read it back with `bench.from()`; Vitest 5 has no flag for it.',
      'Move the options to the top level (`maxWorkers`, `isolate`, `execArgv`, …); the pool-rework section of the Vitest 4 migration guide maps each one.',
    ]);
  });

  it('turns the same into notes for the upgrade on Vitest 4', () => {
    const findings = removedIn(repo('4.1.11', sources, scripts));

    expect(findings.filter(({ severity }) => severity === 'info')).toHaveLength(12);
    expect(findings[0]?.message).toBe(
      'Calls `describe.sequential`, `it.sequential` (lines 1, 2), which Vitest 5 removes: after the upgrade collecting the file throws `TypeError: … is not a function`.',
    );
    expect(findings.at(-1)?.severity).toBe('warning');
  });

  it('stays quiet before Vitest 4, without Vitest, and on a clean repository', () => {
    expect(removedIn(repo('3.2.4', sources, scripts))).toEqual([]);
    expect(removedIn(repo(undefined, sources, scripts))).toEqual([]);
    expect(removedIn(repo('5.0.2', { 'src/a.spec.ts': "import { describe } from 'vitest';" }))).toEqual([]);
  });
});

describe('vitest-5-deprecated', () => {
  const files = { 'scripts/run.ts': 'await vitest.experimental_clearCache();\nawait vitest.experimental_parseSpecifications(specs);' };

  it('names the new call on Vitest 5, where nothing warns at run time', () => {
    expect(removedIn(repo('5.0.2', files)).map(({ check, severity, message, fix }) => [check, severity, message, fix])).toEqual([
      [
        'vitest-5-deprecated',
        'info',
        'Calls `experimental_clearCache`, which Vitest 5 deprecated without a warning at run time: only the type says so.',
        'Call `clearCache` instead; it takes the same arguments.',
      ],
      [
        'vitest-5-deprecated',
        'info',
        'Calls `experimental_parseSpecifications`, which Vitest 5 deprecated without a warning at run time: only the type says so.',
        'Call `parseSpecifications` instead; it takes the same arguments.',
      ],
    ]);
  });

  it('stays quiet on Vitest 4, which has no other name for them', () => {
    expect(removedIn(repo('4.1.11', files))).toEqual([]);
  });
});

describe('vitest-5-clear-mocks', () => {
  it('calls an explicit `clearMocks: true` a restatement on Vitest 5', () => {
    const findings = clearMocksIn(
      repo('5.0.2', {
        'vitest.config.ts': 'export default { test: { clearMocks: true, projects: [{ test: { clearMocks: true } }] } };',
        'vite.config.ts': 'export default { test: { clearMocks: false } };',
      }),
    );

    expect(findings).toEqual([
      {
        check: 'vitest-5-clear-mocks',
        severity: 'info',
        file: 'vitest.config.ts',
        message: '`clearMocks: true` is the default from Vitest 5, so this line restates it.',
        fix: 'Delete it; nothing changes either way. It is `clearMocks: false` that needs writing out now, in a suite that relies on call history surviving from one test to the next.',
      },
    ]);
  });

  it('warns a Vitest 4 suite that never decided, with the builder variant where one runs it', () => {
    const [plain] = clearMocksIn(repo('4.1.11', { 'vitest.config.ts': 'export default { test: {} };' }));
    const [builder] = clearMocksIn(repo('4.1.11', { 'angular.json': unitTestTarget }));

    expect(plain).toEqual({
      check: 'vitest-5-clear-mocks',
      severity: 'info',
      message:
        'Vitest 5 turns `clearMocks` on by default, and no config here sets it: after the upgrade every mock’s call history is cleared before each test, and a test that counts calls made in `beforeAll` or in an earlier `it` starts failing.',
      fix: "Price it before upgrading: `npx vitest run --clearMocks` on Vitest 4 runs the suite the way Vitest 5 will. Then fix what breaks, or keep today's behaviour with `clearMocks: false`.",
    });
    expect(builder?.fix).toBe(
      "Price it before upgrading: `npx vitest run --clearMocks` on Vitest 4 runs the suite the way Vitest 5 will. Under `@angular/build:unit-test`, set `clearMocks: true` in the runner config for that one run instead. Then fix what breaks, or keep today's behaviour with `clearMocks: false`.",
    );
  });

  it('stays quiet where the suite decided already, and outside Vitest 4 and 5', () => {
    expect(clearMocksIn(repo('4.1.11', { 'vitest.config.ts': 'export default { test: { clearMocks: false } };' }))).toEqual([]);
    expect(clearMocksIn(repo('4.1.11', { 'vitest.config.ts': 'export default { test: { mockReset: true } };' }))).toEqual([]);
    expect(clearMocksIn(repo('4.1.11', { 'vitest.config.ts': 'export default { test: { mockReset: false } };' }))).toHaveLength(1);
    expect(clearMocksIn(repo('4.1.11', {}, { scripts: { test: 'vitest run --no-clearMocks' } }))).toEqual([]);
    expect(clearMocksIn(repo('3.2.4'))).toEqual([]);
    expect(clearMocksIn(repo(undefined))).toEqual([]);
  });
});

describe('vitest-5-available', () => {
  const available = (profile: Profile): Finding | undefined => checkVitest5Available(profile)[0];

  it('says what the upgrade buys when nothing holds it back', () => {
    expect(available(repo('4.1.11', { '.nvmrc': 'lts/*', '.github/workflows/ci.yml': 'node-version: 24 # >= 22.14' }))).toEqual({
      check: 'vitest-5-available',
      severity: 'info',
      message:
        'Vitest 4.1.11 is installed, and nothing in this repository holds back Vitest 5. On an Angular 22.2 suite of 700 spec files with coverage, Vitest 5 took the run from 16.50 s to 8.91 s with v8 (−46 %) and from 37.07 s to 23.92 s with istanbul (−35.5 %); without coverage the two majors are level.',
      fix: 'Upgrade `vitest` and every `@vitest/*` package to 5 together, then read `vitest-5-clear-mocks`: Vitest 5 clears mocks before each test by default. The measurement: https://asdalexey.github.io/vitest-auto-spy/core/performance#vitest-5-under-the-angular-unit-test-builder',
    });
  });

  it('names what holds it back instead', () => {
    const finding = available(
      repo(
        '4.1.11',
        {
          'angular.json': unitTestTarget,
          ...manifest('@angular/build', '22.1.7'),
          ...manifest('@analogjs/vite-plugin-angular', '2.7.4'),
          ...manifest('@analogjs/vitest-angular', '2.7.5'),
          ...manifest('vite', '6.3.5'),
          '.nvmrc': 'v20.11.0',
          '.node-version': '22.12.0',
          '.github/workflows/ci.yml': 'jobs:\n  a:\n    steps:\n      - node-version: [22.x, 24]\n',
          '.gitlab-ci.yml': 'test:\n  image: registry.example/library/node:20-alpine\n',
        },
        { private: true, engines: { node: '>=20.19 || >=22.12' } },
      ),
    );

    expect(finding?.message).toBe(
      'Vitest 5 is out, and this repository cannot take it yet: @angular/build 22.1.7, whose `@angular/build:unit-test` does not run Vitest 5; @analogjs/vite-plugin-angular 2.7.4; vite 6.3.5; Node `>=20.19 || >=22.12` in package.json; Node `v20.11.0` in .nvmrc; Node `[22.x, 24]` in .github/workflows/ci.yml; Node `20` in .gitlab-ci.yml.',
    );
    expect(finding?.fix).toBe(
      'Upgrade @angular/build to 22.2.0 or newer, the first release whose unit-test builder runs Vitest 5. Upgrade @analogjs/vite-plugin-angular to 2.7.5 or newer. Upgrade vite to 6.4 or newer, the floor Vitest 5 requires. Raise the Node version in package.json to 22.12 or newer, the floor Vitest 5 requires. Raise the Node version in .nvmrc to 22.12 or newer, the floor Vitest 5 requires. Raise the Node version in .github/workflows/ci.yml to 22.12 or newer, the floor Vitest 5 requires. Raise the Node version in .gitlab-ci.yml to 22.12 or newer, the floor Vitest 5 requires. On an Angular 22.2 suite of 700 spec files with coverage, Vitest 5 took the run from 16.50 s to 8.91 s with v8 (−46 %) and from 37.07 s to 23.92 s with istanbul (−35.5 %); without coverage the two majors are level. https://asdalexey.github.io/vitest-auto-spy/core/performance#vitest-5-under-the-angular-unit-test-builder',
    );
  });

  it('ignores an old builder with no unit-test target and the engines of a published package', () => {
    expect(
      available(repo('4.1.11', { ...manifest('@angular/build', '22.1.7') }, { engines: { node: '>=18' }, private: false }))?.message,
    ).toContain('nothing in this repository holds back Vitest 5');
  });

  it('reads a repository without a manifest of its own', () => {
    const root = createTempRepo(manifest('vitest', '4.1.11'));

    expect(checkVitest5Available({ ...readProfile(root), dependencies: { vitest: '*' } })).toHaveLength(1);
  });

  it('stays quiet outside Vitest 4', () => {
    expect(checkVitest5Available(repo('5.0.2'))).toEqual([]);
    expect(checkVitest5Available(repo('3.2.4'))).toEqual([]);
    expect(checkVitest5Available(repo(undefined))).toEqual([]);
  });

  it('reads the lowest version a range admits', () => {
    expect(lowestVersion('^22.12.0 || >=24')).toEqual([22, 12, 0]);
    expect(lowestVersion('22.x')).toEqual([22, 0, 0]);
    expect(lowestVersion('lts/*')).toBeUndefined();
  });
});

describe('fs-module-cache-not-persisted', () => {
  const ci = { '.github/workflows/ci.yml': 'steps:\n  - uses: actions/setup-node@v4\n    with:\n      cache: npm\n' };

  it('reports a cache that CI never keeps, at the path the version uses', () => {
    const [finding] = cacheIn(repo('5.0.2', { ...ci, 'vitest.config.ts': 'export default { test: { fsModuleCache: true } };' }));

    expect(finding).toEqual({
      check: 'fs-module-cache-not-persisted',
      severity: 'warning',
      file: 'vitest.config.ts',
      message:
        '`fsModuleCache` is on, and no CI config caches `node_modules/.vitest-cache`: every CI run (.github/workflows/ci.yml) starts with an empty module cache and pays the full transform, so the cache only ever helps locally.',
      fix: 'Persist `node_modules/.vitest-cache` between CI runs — for GitHub Actions an `actions/cache` step with that path and a key on the lockfile hash (`cache: npm` in `setup-node` stores only the npm download cache). `npm ci` deletes `node_modules` before it installs, so with it set `fsModuleCachePath` to a directory outside `node_modules` and cache that one.',
    });
    expect(
      cacheIn(repo('4.1.11', { ...ci, 'vitest.config.ts': 'export default { test: { experimental: { fsModuleCache: true } } };' }))[0]
        ?.message,
    ).toContain('`node_modules/.experimental-vitest-cache`');
    expect(cacheIn(repo('5.0.2', ci, { scripts: { test: 'vitest run --fsModuleCache' } }))[0]?.file).toBe('package.json');
    expect(cacheIn(repo('4.1.11', ci, { scripts: { test: 'vitest run --experimental.fsModuleCache' } }))).toHaveLength(1);
    expect(
      cacheIn(
        repo('5.0.2', { ...ci, 'vitest.config.ts': "export default { fsModuleCache: true, fsModuleCachePath: './.cache/vitest' };" }),
      )[0]?.message,
    ).toContain('`./.cache/vitest`');
  });

  it('stays quiet when CI keeps it, when it is off, without CI, and before Vitest 4', () => {
    const on = { 'vitest.config.ts': 'export default { test: { fsModuleCache: true } };' };

    expect(cacheIn(repo('5.0.2', { ...on, '.github/workflows/ci.yml': 'path: |\n  node_modules\n' }))).toEqual([]);
    expect(cacheIn(repo('5.0.2', { ...on, '.gitlab-ci.yml': 'cache:\n  paths:\n    - node_modules/.vitest-cache/\n' }))).toEqual([]);
    expect(cacheIn(repo('5.0.2', { ...ci, 'vitest.config.ts': 'export default { test: { fsModuleCache: false } };' }))).toEqual([]);
    expect(cacheIn(repo('5.0.2', on))).toEqual([]);
    expect(cacheIn(repo('3.2.4', { ...ci, ...on }))).toEqual([]);
    expect(cacheIn(repo(undefined, { ...ci, ...on }))).toEqual([]);
  });

  it('matches the directory or one above it as a path, not as a substring', () => {
    expect(cachesPath('path: node_modules', 'node_modules/.vitest-cache')).toBe(true);
    expect(cachesPath("paths: ['**/.vitest-cache']", 'node_modules/.vitest-cache')).toBe(true);
    expect(cachesPath('path: ./.cache/vitest/**', './.cache/vitest')).toBe(true);
    expect(cachesPath('path: my_node_modules', 'node_modules/.vitest-cache')).toBe(false);
    expect(cachesPath('key: node_modules-${{ hashFiles() }}', 'node_modules/.vitest-cache')).toBe(false);
  });
});

describe('hasRootConfig and the workspace file', () => {
  it('counts a workspace file only on the Vitest majors that read one', () => {
    const workspace = { 'vitest.workspace.ts': 'export default [];' };

    expect(hasRootConfig(repo('3.2.4', workspace).cwd)).toBe(true);
    expect(hasRootConfig(repo('3.2.4', { 'vitest.projects.mts': 'export default [];' }).cwd)).toBe(true);
    expect(hasRootConfig(repo(undefined, workspace).cwd)).toBe(true);
    expect(hasRootConfig(repo('4.1.11', workspace).cwd)).toBe(false);
    expect(hasRootConfig(repo('5.0.2', { ...workspace, 'vitest.config.ts': '' }).cwd)).toBe(true);
  });
});
