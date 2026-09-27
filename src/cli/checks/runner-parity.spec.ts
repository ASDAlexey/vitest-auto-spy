import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { checkAnalogTestBed, checkRunnerDom } from './runner-parity';

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
        { root: `libs/${project}`, architect: { test: { builder: '@angular/build:unit-test', options } } },
      ]),
    ),
  });

const BASE_VERSIONS = { '@angular/build': '22.2.0', vitest: '5.0.0', jsdom: '27.0.0', 'happy-dom': '20.0.0' };

interface Setup {
  readonly targets?: Record<string, Record<string, unknown>>;
  readonly versions?: Record<string, string>;
  readonly files?: Record<string, string>;
}

const repo = ({ targets = { app: {} }, versions = BASE_VERSIONS, files = {} }: Setup): ReturnType<typeof readProfile> =>
  readProfile(
    createTempRepo({
      'package.json': '{}',
      'angular.json': workspace(targets),
      ...manifests(versions),
      ...files,
    }),
  );

const runDom = (setup: Setup): Finding[] => {
  const profile = repo(setup);

  return checkRunnerDom(profile, buildGraph(profile));
};

const runTestBed = (setup: Setup): Finding[] => {
  const profile = repo(setup);

  return checkAnalogTestBed(profile, buildGraph(profile));
};

const jsdomConfig = "import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { environment: 'jsdom' } });\n";

describe('runner-dom-differs-from-builder', () => {
  it('warns that the runner config tests a different DOM than the builder', () => {
    expect(runDom({ files: { 'vitest.config.ts': jsdomConfig } })).toEqual([
      {
        check: 'runner-dom-differs-from-builder',
        severity: 'warning',
        file: 'vitest.config.ts',
        message:
          "vitest.config.ts sets `environment: 'jsdom'`, while `app:test` in angular.json runs through `@angular/build:unit-test` on happy-dom, which the builder picks whenever it resolves and the target's runner config does not set `environment`. `vitest run` and the IDE test one DOM, `ng test` / `nx test` another, so a spec can pass in one and fail in the other. On a 48-file Angular suite switching the runner config to happy-dom took Duration from 1.37 s to 1.10 s (−20 %), suite green.",
        fix: "Set `environment: 'happy-dom'` in the `test` block of vitest.config.ts. A spec that needs jsdom keeps it with a `// @vitest-environment jsdom` comment at its top.",
      },
    ]);
  });

  it('matches a per-library config to the targets under its directory only', () => {
    const findings = runDom({ targets: { app: {}, admin: {} }, files: { 'libs/admin/vite.config.mts': jsdomConfig } });

    expect(findings.map(({ file }) => file)).toEqual(['libs/admin/vite.config.mts']);
    expect(findings[0]?.message).toContain('while `admin:test` in angular.json runs');
    expect(runDom({ targets: { app: {}, admin: {} }, files: { 'vitest.config.ts': jsdomConfig } })[0]?.message).toContain(
      '`app:test` in angular.json, `admin:test` in angular.json run through',
    );
    expect(runDom({ targets: { app: {} }, files: { 'libs/admin/vite.config.mts': jsdomConfig } })).toEqual([]);
  });

  it('counts a target whose own runner config picks happy-dom, and skips one that picks jsdom or runs in a browser', () => {
    const happy = "export default { test: { environment: 'happy-dom' } };";
    const jsdom = "export default { test: { environment: 'jsdom' } };";

    expect(
      runDom({
        targets: { app: { runnerConfig: 'vitest-base.config.ts' } },
        files: { 'vitest.config.ts': jsdomConfig, 'vitest-base.config.ts': happy },
      }),
    ).toHaveLength(1);
    expect(
      runDom({
        targets: { app: { runnerConfig: 'vitest-base.config.ts' } },
        files: { 'vitest.config.ts': jsdomConfig, 'vitest-base.config.ts': jsdom },
      }),
    ).toEqual([]);
    expect(runDom({ targets: { app: { browsers: ['chromium'] } }, files: { 'vitest.config.ts': jsdomConfig } })).toEqual([]);
  });

  it('leaves out the config the builder itself reads', () => {
    expect(runDom({ targets: { app: { runnerConfig: 'vitest.config.ts' } }, files: { 'vitest.config.ts': jsdomConfig } })).toEqual([]);
  });

  it('stays quiet without both DOMs, without a builder target, and for a config already on happy-dom', () => {
    const files = { 'vitest.config.ts': jsdomConfig };
    const without = (name: string): Record<string, string> =>
      Object.fromEntries(Object.entries(BASE_VERSIONS).filter(([key]) => key !== name));

    expect(runDom({ files, versions: without('happy-dom') })).toEqual([]);
    expect(runDom({ files, versions: without('jsdom') })).toEqual([]);
    expect(runDom({ files, targets: {} })).toEqual([]);
    expect(runDom({ files: { 'vitest.config.ts': "export default { test: { environment: 'happy-dom' } };" } })).toEqual([]);
    expect(runDom({ files: { 'vitest.config.ts': "// environment: 'jsdom'\nexport default {};" } })).toEqual([]);
  });
});

const setupFile = (call: string, specifier = 'setupTestBed'): string =>
  `import { ${specifier} } from '@analogjs/vitest-angular/setup-testbed';\n\n${call};\n`;

describe('analog-testbed-laxer-than-builder', () => {
  it('warns about a bare setupTestBed() and gives the call the builder makes', () => {
    expect(runTestBed({ files: { 'src/test-setup.ts': setupFile('setupTestBed()') } })).toEqual([
      {
        check: 'analog-testbed-laxer-than-builder',
        severity: 'warning',
        file: 'src/test-setup.ts',
        message:
          'src/test-setup.ts calls `setupTestBed()` from `@analogjs/vitest-angular/setup-testbed` without `errorOnUnknownElements` and `errorOnUnknownProperties`, which Analog leaves off, while `app:test` in angular.json runs through `@angular/build:unit-test`, whose TestBed turns both on. A misspelt element or binding in a template passes `vitest run` and fails `ng test` / `nx test`.',
        fix: 'Call `setupTestBed({ errorOnUnknownElements: true, errorOnUnknownProperties: true })`, the TestBed the builder sets up.',
      },
    ]);
  });

  it('names only the flag an options object leaves out, through a renamed import too', () => {
    const [finding] = runTestBed({
      files: { 'src/test-setup.ts': setupFile('setup({ zoneless: true, errorOnUnknownElements: true })', 'setupTestBed as setup') },
    });

    expect(finding?.message).toContain('without `errorOnUnknownProperties`, which');
    expect(finding?.fix).toBe("Add `errorOnUnknownProperties: true` to the options of `setupTestBed(…)`, as the builder's TestBed has it.");
  });

  it('stays quiet once both flags are written, for options it cannot read, and without a builder target', () => {
    const strict = setupFile('setupTestBed({ errorOnUnknownElements: true, errorOnUnknownProperties: false })');

    expect(runTestBed({ files: { 'src/test-setup.ts': strict } })).toEqual([]);
    expect(runTestBed({ files: { 'src/test-setup.ts': setupFile('setupTestBed(options)') } })).toEqual([]);
    expect(runTestBed({ files: { 'src/test-setup.ts': setupFile('setupTestBed()') }, targets: {} })).toEqual([]);
  });

  it('ignores a quoted import, a file that never calls it and a setupTestBed from elsewhere', () => {
    const quoted = 'const text = "import { setupTestBed } from \'@analogjs/vitest-angular/setup-testbed\'";\nsetupTestBed();\n';
    const foreign = "import { setupTestBed } from './local';\nsetupTestBed();\n";
    const uncalled = "import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';\nexport { setupTestBed };\n";
    const other = "import { something } from '@analogjs/vitest-angular/setup-testbed';\nsomething();\n";

    expect(
      runTestBed({ files: { 'src/a.ts': quoted, 'src/b.ts': foreign, 'src/c.ts': uncalled, 'src/d.ts': other, 'src/local.ts': '' } }),
    ).toEqual([]);
  });
});
