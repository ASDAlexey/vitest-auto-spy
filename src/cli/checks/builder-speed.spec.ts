import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { checkBuilderSpeed } from './builder-speed';

afterEach(() => {
  removeTempRepos();
});

const manifests = (versions: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(versions).map(([name, version]) => [`node_modules/${name}/package.json`, JSON.stringify({ version })]));

const workspace = (targets: Record<string, Record<string, unknown>>): string =>
  JSON.stringify({
    projects: Object.fromEntries(
      Object.entries(targets).map(([project, options]) => [
        project,
        { root: `projects/${project}`, architect: { test: { builder: '@angular/build:unit-test', options } } },
      ]),
    ),
  });

interface Setup {
  readonly targets?: Record<string, Record<string, unknown>>;
  readonly versions?: Record<string, string>;
  readonly files?: Record<string, string>;
}

const BASE_VERSIONS = {
  '@angular/build': '22.2.0',
  vitest: '5.0.0',
  '@vitest/coverage-istanbul': '5.0.0',
  jsdom: '27.0.0',
  'happy-dom': '20.0.0',
};

const run = ({ targets = { app: {} }, versions = BASE_VERSIONS, files = {} }: Setup): Finding[] =>
  checkBuilderSpeed(
    readProfile(createTempRepo({ 'package.json': '{}', 'angular.json': workspace(targets), ...manifests(versions), ...files })),
  );

const checksOf = (findings: readonly Finding[]): string[] => findings.map((finding) => finding.check);

const without = (name: string): Record<string, string> => Object.fromEntries(Object.entries(BASE_VERSIONS).filter(([key]) => key !== name));

const istanbulConfig = "export default defineConfig({ test: { coverage: { provider: 'istanbul' } } });";

describe('angular-build-istanbul-module-cache', () => {
  it('names the runner config that picks istanbul, and the CI cache it needs', () => {
    const findings = run({
      targets: { app: { runnerConfig: './vitest-base.config.mts' } },
      versions: { ...BASE_VERSIONS, '@vitest/coverage-v8': '5.0.0' },
      files: {
        'vitest-base.config.mts': istanbulConfig,
        '.github/workflows/ci.yml': 'steps:\n  - run: npx ng test --coverage\n',
      },
    });

    expect(findings).toEqual([
      {
        check: 'angular-build-istanbul-module-cache',
        severity: 'info',
        file: 'vitest-base.config.mts',
        message:
          "`app:test` in angular.json collects coverage with istanbul through `@angular/build:unit-test` (vitest-base.config.mts sets `coverage.provider: 'istanbul'`), and no runner config of it turns on `fsModuleCache`: every run instruments every file again. On an Angular 22.2 suite of 700 spec files on Vitest 5, the module cache took an istanbul coverage run under the builder from 24.55 s to 13.20 s (−46 %), and from 27.01 s to 15.85 s (−41 %) with the builder cache off, as it is on CI; with v8 it gained nothing, since the builder has already bundled the code.",
        fix: expect.stringMatching(
          /^Add `fsModuleCache: true` to the `test` block of vitest-base\.config\.mts\. Persist `node_modules\/\.vitest-cache` between CI runs/,
        ),
      },
    ]);
  });

  it('tells targets without a runner config to name one, in one finding for all of them', () => {
    const [finding, ...rest] = run({ targets: { app: {}, admin: { runnerConfig: true } } });

    expect(rest).toEqual([]);
    expect(finding?.file).toBe('angular.json');
    expect(finding?.message).toContain('`app:test` in angular.json, `admin:test` in angular.json collects coverage');
    expect(finding?.message).toContain('(only `@vitest/coverage-istanbul` is installed, so the builder picks istanbul)');
    expect(finding?.fix).toBe(
      'Add `"runnerConfig": "vitest-base.config.mts"` to the options of `app:test` in angular.json, `admin:test` in angular.json, and export `defineConfig({ test: { fsModuleCache: true } })` from that file.',
    );
  });

  it('stays quiet for a browser target, where the gain was never measured', () => {
    expect(run({ targets: { app: { browsers: ['firefox'] } }, versions: without('@vitest/coverage-istanbul') })).toEqual([]);
    expect(run({ targets: { app: { browsers: ['ChromeHeadless', 1] } } })).toEqual([]);
    expect(
      run({
        targets: { app: { browsers: ['chromium'], runnerConfig: './vitest-base.config.mts' } },
        files: { 'vitest-base.config.mts': istanbulConfig },
      }),
    ).toEqual([]);
    expect(run({ targets: { app: { browsers: 'chromium' } } })[0]?.message).toContain(
      '(only `@vitest/coverage-istanbul` is installed, so the builder picks istanbul)',
    );
  });

  it('finds the runner config `true` means, in the project root first', () => {
    const [finding] = run({
      targets: { app: { runnerConfig: true } },
      files: { 'projects/app/vitest-base.config.ts': istanbulConfig, 'vitest-base.config.mts': '' },
    });

    expect(finding?.file).toBe('projects/app/vitest-base.config.ts');
  });

  it('stays quiet once the cache is on, on v8, before Vitest 5 and before @angular/build 21', () => {
    const quiet = (setup: Setup): string[] => checksOf(run(setup)).filter((check) => check !== 'angular-build-happy-dom');
    const named = { app: { runnerConfig: 'vitest-base.config.mts' } };

    expect(quiet({ targets: named, files: { 'vitest-base.config.mts': 'export default { test: { fsModuleCache: true } };' } })).toEqual([]);
    expect(
      quiet({ targets: named, files: { 'vitest-base.config.mts': "export default { test: { coverage: { provider: 'v8' } } };" } }),
    ).toEqual([]);
    expect(quiet({ versions: { ...BASE_VERSIONS, '@vitest/coverage-v8': '5.0.0' } })).toEqual([]);
    expect(quiet({ versions: { ...BASE_VERSIONS, vitest: '4.1.11' } })).toEqual([]);
    expect(quiet({ versions: without('vitest') })).toEqual([]);
    expect(quiet({ versions: { ...BASE_VERSIONS, '@angular/build': '20.3.37' } })).toEqual([]);
    expect(quiet({ versions: without('@angular/build') })).toEqual([]);
    expect(quiet({ targets: {} })).toEqual([]);
  });

  it('reads a missing runner config as setting nothing, and adds no CI advice when CI keeps the cache', () => {
    const [finding] = run({
      targets: { app: { runnerConfig: 'missing.config.mts' }, admin: { runnerConfig: false } },
      files: { '.gitlab-ci.yml': 'cache:\n  paths:\n    - node_modules/\n' },
    });

    expect(finding?.file).toBe('missing.config.mts');
    expect(finding?.fix).toBe('Add `fsModuleCache: true` to the `test` block of missing.config.mts.');
  });
});

describe('angular-build-happy-dom', () => {
  const happyDom = (setup: Setup): Finding[] => run(setup).filter((finding) => finding.check === 'angular-build-happy-dom');

  it('suggests installing happy-dom where the builder would pick it by itself', () => {
    expect(happyDom({ versions: without('happy-dom') })).toEqual([
      {
        check: 'angular-build-happy-dom',
        severity: 'info',
        file: 'package.json',
        message:
          '`app:test` in angular.json runs on jsdom 27.0.0 only because `happy-dom` is not installed: from @angular/build 21 the builder picks happy-dom by itself whenever it resolves, unless the runner config sets `environment`. On an Angular 22.2 suite of 700 spec files happy-dom took 4.6 % off the wall time and 6 % off the resident memory of the run.',
        fix: '`npm i -D happy-dom`; no config line is needed. happy-dom implements less of the platform than jsdom, so run the suite once and keep jsdom (uninstall happy-dom) if a spec depends on what it lacks.',
      },
    ]);
  });

  it('stays quiet once happy-dom is there, without jsdom, with an environment or browsers, and before 21', () => {
    const versions = without('happy-dom');

    expect(happyDom({})).toEqual([]);
    expect(happyDom({ versions: without('jsdom') })).toEqual([]);
    expect(
      happyDom({
        versions,
        targets: { app: { runnerConfig: 'vitest-base.config.mts' } },
        files: { 'vitest-base.config.mts': "export default { test: { environment: 'jsdom' } };" },
      }),
    ).toEqual([]);
    expect(happyDom({ versions, targets: { app: { browsers: ['chromium'] } } })).toEqual([]);
    expect(happyDom({ versions: { ...versions, '@angular/build': '20.3.37' } })).toEqual([]);
  });
});
