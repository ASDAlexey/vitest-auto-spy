/**
 * `perf` on a suite that runs through `@angular/build:unit-test` or the Analog Vite plugin: the
 * advice has to name the runner config the builder reads, leave alone what the builder decided, and
 * never suggest a command or a cache that fails there.
 */
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildGraph } from './checks/graph';
import { analysePerf, renderPerf } from './perf';
import type { BuilderRun, PerfContext } from './perf-builder';
import { builderCommand, builderImport, perfContext, runnerConfigHome, targetLabel, unavailableUnder } from './perf-builder';
import { domEngineFindings, isolationFindings, transformFindings, vitestDoctorFindings, workerFindings } from './perf-config';
import type { PerfRun, Phase } from './perf-data';
import { PERF_OUTPUT_ENV, PERF_PROFILE_ENV, PERF_REPORTER_ENV } from './perf-data';
import { file, ordinary, recorder, run } from './perf-fixtures';
import { GATE_DEFAULTS } from './perf-gate';
import type { PerfSource } from './perf-run';
import { readPerfRun } from './perf-run';
import { readProfile } from './profile';
import type { Finding } from './report';
import { createTempRepo, removeTempRepos } from './temp-repo';

beforeEach(() => {
  vi.stubEnv('NO_COLOR', '1');
  vi.stubEnv(PERF_OUTPUT_ENV, undefined);
  vi.stubEnv(PERF_PROFILE_ENV, undefined);
  vi.stubEnv(PERF_REPORTER_ENV, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  removeTempRepos();
});

const phase = (name: Phase['name'], share: number): Phase => ({ name, ms: share * 10_000, share });

const onFive = (over: Partial<PerfRun> = {}): PerfRun => run({ vitest: '5.0.2', ...over });

const installed = (name: string, version: string): Record<string, string> => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({ name, version }),
});

const angularJson = (options: Record<string, unknown> = {}, builder = '@angular/build:unit-test'): string =>
  JSON.stringify({ projects: { app: { root: '', architect: { test: { builder, options } } } } });

/** A workspace whose suite runs through the builder, on `@angular/build` 22.2 unless told otherwise. */
const workspace = (over: Record<string, string> = {}, options: Record<string, unknown> = {}, version = '22.2.0'): string =>
  createTempRepo({
    'package.json': JSON.stringify({ scripts: { test: 'ng test' }, devDependencies: { vitest: '^5' } }),
    'angular.json': angularJson(options),
    ...installed('@angular/build', version),
    ...over,
  });

const contextOf = (root: string, command?: string): PerfContext => perfContext(readProfile(root), command);

const builderOf = (root: string, command?: string): BuilderRun => {
  const builder = contextOf(root, command).builder;

  if (builder === undefined) {
    throw new Error('expected a builder run');
  }

  return builder;
};

const graphOf = (root: string): ReturnType<typeof buildGraph> => buildGraph(readProfile(root));

describe('perfContext, telling a builder run from a plain one', () => {
  it('is a plain run without a target, a command or a test script', () => {
    const root = createTempRepo({ 'package.json': '{}' });

    expect(contextOf(root)).toEqual({ builderWorkspace: false });
  });

  it('is a builder run when the command or the test script it calls runs ng or nx', () => {
    const scripted = createTempRepo({ 'package.json': JSON.stringify({ scripts: { 'test:ci': 'npx nx test app' } }) });

    expect(contextOf(scripted, 'npm run test:ci').builder?.target).toBeUndefined();
    expect(contextOf(scripted, 'npx ng test').builderWorkspace).toBe(true);
    expect(contextOf(scripted, 'npm run missing').builder).toBeUndefined();
  });

  it('is a builder run for a workspace with a target, no root config, and a test script that is not Vitest', () => {
    expect(contextOf(workspace({ 'package.json': '{}' })).builder).toBeDefined();
    expect(contextOf(workspace({ 'package.json': JSON.stringify({ scripts: { test: 'node run.mjs' } }) })).builder).toBeDefined();
  });

  it('is a plain run in a builder workspace measured through its own Vitest config or command', () => {
    const rooted = workspace({ 'vitest.config.ts': 'export default {};\n' }, {}, '22.2.0');

    expect(contextOf(rooted, 'npx vitest run')).toEqual({ builderWorkspace: true });
    expect(contextOf(workspace({ 'package.json': '{}', 'vitest.config.ts': '' })).builder).toBeUndefined();
  });

  it('takes the runner config from --runner-config in the command before the target', () => {
    const root = workspace({}, { runnerConfig: 'vitest-base.config.ts' });

    expect(builderOf(root, "npx ng run app:test --runner-config='./vitest-ist.config.mts'").runnerConfig).toBe('vitest-ist.config.mts');
    expect(builderOf(root, 'npx ng test --runnerConfig vitest-ci.config.ts').runnerConfig).toBe('vitest-ci.config.ts');
    expect(builderOf(root).runnerConfig).toBe('vitest-base.config.ts');
  });

  it("reads the target's runner config: a path, the vitest-base config `true` finds, or the one `true` would look for", () => {
    const named = workspace({}, { runnerConfig: './tools/vitest.runner.ts' });
    const found = workspace({ 'vitest-base.config.ts': 'export default {};\n' }, { runnerConfig: true });
    const missing = workspace({}, { runnerConfig: true });
    const unnamed = workspace({}, { runnerConfig: false });

    expect(builderOf(named).runnerConfig).toBe('tools/vitest.runner.ts');
    expect(builderOf(found).runnerConfig).toBe('vitest-base.config.ts');
    expect(builderOf(missing).runnerConfig).toBe('vitest-base.config.mts');
    expect(builderOf(unnamed).runnerConfig).toBeUndefined();
  });

  it('picks the target the command names, by project and target, by project, or the first', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'angular.json': JSON.stringify({
        projects: {
          admin: { root: 'projects/admin', architect: { test: { builder: '@angular/build:unit-test' } } },
          shop: {
            root: 'projects/shop',
            architect: {
              test: { builder: '@angular/build:unit-test' },
              'test-ci': { builder: '@angular/build:unit-test', options: { runnerConfig: 'ci.config.ts' } },
            },
          },
        },
      }),
    });

    expect(targetLabel(builderOf(root, 'npx ng run shop:test-ci'))).toBe('`shop:test-ci`');
    expect(targetLabel(builderOf(root, 'npx ng run shop:unknown'))).toBe('`shop:test`');
    expect(targetLabel(builderOf(root, 'ng test shop'))).toBe('`shop:test`');
    expect(targetLabel(builderOf(root, 'ng test'))).toBe('`admin:test`');
  });

  it('reads the version, the isolate option, happy-dom and the Analog plugin off the workspace', () => {
    const old = workspace({}, { isolate: true }, '20.3.37');
    const current = workspace({ ...installed('happy-dom', '20.14.5'), ...installed('@analogjs/vite-plugin-angular', '2.7.5') });
    const declared = workspace({
      'package.json': JSON.stringify({ scripts: { test: 'ng test' }, devDependencies: { 'happy-dom': '^20' } }),
    });

    expect(builderOf(old)).toMatchObject({ version: '20.3.37', configurable: false, isolateOption: true, happyDom: false });
    expect(builderOf(current)).toMatchObject({ configurable: true, isolateOption: false, happyDom: true });
    expect(contextOf(current).analog).toBe('2.7.5');
    expect(builderOf(declared).happyDom).toBe(true);
  });
});

describe('naming the builder for a reader', () => {
  it('names the command, the target and the runner config home', () => {
    const root = createTempRepo({ 'package.json': '{}', 'angular.json': angularJson({}, '@nx/angular:unit-test') });
    const builder = builderOf(root);

    expect(builderCommand(builder)).toBe('npx nx run app:test');
    expect(builderCommand({ ...builder, target: undefined })).toBe('npx ng test');
    expect(targetLabel({ ...builder, target: undefined })).toBe('the unit-test target');
    expect(runnerConfigHome(builder)).toBe(
      'a runner config — `app:test` names none, so add `"runnerConfig": "vitest-base.config.mts"` to its options in angular.json first —',
    );
    expect(runnerConfigHome({ ...builder, target: undefined })).toBe(
      'a runner config — the unit-test target names none, so add `"runnerConfig": "vitest-base.config.mts"` to its options first —',
    );
    expect(runnerConfigHome({ ...builder, runnerConfig: 'vitest.ci.ts' })).toBe('vitest.ci.ts');
    expect(unavailableUnder({ ...builder, version: '20.3.37' }, '`maxWorkers`')).toBe(
      '`maxWorkers` cannot reach Vitest through @angular/build 20.3.37: it reads no runner config before 21. Upgrade to 21 or later to make this change.',
    );
  });
});

describe('builderImport', () => {
  const spec = 'src/app/features/f000/f000.component.spec.ts';

  it("names a spec's own bundle after the spec, and leaves out chunks and bundles of other specs", () => {
    expect(builderImport('/w/spec-app-features-f000-f000.component.js', spec, 'x')).toBe(`${spec}, bundled with its imports`);
    expect(builderImport('/w/spec-src-app-features-f000-f000.component.js', spec, 'x')).toBe(`${spec}, bundled with its imports`);
    expect(builderImport('/w/spec-app-features-f001-f001.component.js', spec, 'x')).toBeUndefined();
    expect(builderImport('/w/chunk-ABCD1234.js', spec, 'x')).toBeUndefined();
  });

  it('keeps every other module, packages included, as it was named', () => {
    expect(builderImport('/w/node_modules/pkg/spec-x.js', spec, 'pkg')).toBe('pkg');
    expect(builderImport('/w/src/app/util.ts', spec, 'src/app/util.ts')).toBe('src/app/util.ts');
  });
});

describe('the settings findings under the builder', () => {
  const overhead = [phase('environment', 0.5), phase('tests', 0.5)];
  const dominant = [phase('transform', 0.5), phase('import', 0.5)];
  const waited = (over: Partial<PerfRun> = {}): PerfRun =>
    onFive({ files: [file('/repo/src/a.spec.ts', { fetch: 3_000 }), file('/repo/src/b.spec.ts', { fetch: 1_500 })], ...over });

  it('names the runner config the run reads, not the first config file in the tree', () => {
    const root = workspace(
      { 'vite.config.ts': 'export default {};\n', 'vitest-base.config.mts': 'export default {};\n' },
      { runnerConfig: true },
    );
    const context = contextOf(root, 'npx ng test --runner-config=vitest-ist.config.mts');

    expect(transformFindings(dominant, graphOf(root), waited(), context)[0]?.fix).toContain(
      'Set `fsModuleCache: true` in vitest-ist.config.mts:',
    );
    expect(workerFindings(120_000, graphOf(root), onFive(), 16, context)[0]?.fix).toContain('set `maxWorkers: 8` in vitest-ist.config.mts');
  });

  it('says to point the target at a runner config when it names none', () => {
    const root = workspace();
    const [finding] = transformFindings(dominant, graphOf(root), waited(), contextOf(root));

    expect(finding?.fix).toContain(
      'Set `fsModuleCache: true` in a runner config — `app:test` names none, so add `"runnerConfig": "vitest-base.config.mts"` to its options in angular.json first —:',
    );
  });

  it('says the setting is not available on a builder that reads no runner config', () => {
    const root = workspace({}, {}, '20.3.37');
    const context = contextOf(root);

    expect(transformFindings(dominant, graphOf(root), waited(), context)[0]?.fix).toBe(
      '`fsModuleCache: true` cannot reach Vitest through @angular/build 20.3.37: it reads no runner config before 21. Upgrade to 21 or later to make this change.',
    );
    expect(workerFindings(120_000, graphOf(root), onFive(), 16, context)[0]?.fix).toContain('`maxWorkers` cannot reach Vitest');
  });

  it("does not count the builder's own `isolate` as the user's", () => {
    const root = workspace({ 'vitest-base.config.ts': 'export default { test: { isolate: true } };\n' }, { runnerConfig: true });
    const isolated = onFive({ config: { isolate: true, pool: 'forks', provided: ['isolate', 'environment'] } });
    const [finding] = isolationFindings(overhead, graphOf(root), readProfile(root), isolated, 8, contextOf(root));

    expect(finding?.fix).toMatch(/^Try `isolate: false` in vitest-base\.config\.ts and keep it only if/);
    expect(isolationFindings(overhead, graphOf(root), readProfile(root), isolated, 8)).toEqual([]);
  });

  it('points at the target option when the target turned isolation on itself', () => {
    const root = workspace({}, { isolate: true });
    const isolated = onFive({ config: { isolate: true, provided: ['isolate'] } });
    const [finding] = isolationFindings(overhead, graphOf(root), readProfile(root), isolated, 8, contextOf(root));

    expect(finding?.fix).toMatch(/^Try `"isolate": false` on `app:test` in angular\.json and keep it only if/);
    expect(
      isolationFindings(overhead, graphOf(root), readProfile(root), isolated, 8, contextOf(root, 'npx ng test --runner-config=x.ts')),
    ).toEqual([expect.objectContaining({ check: 'perf-isolation' })]);
  });

  it('keeps the plain advice when the target that set isolation cannot be found', () => {
    const root = createTempRepo({ 'package.json': '{}', ...installed('@angular/build', '22.2.0') });
    const context = contextOf(root, 'npx ng test');
    const builder = context.builder as BuilderRun;
    const [finding] = isolationFindings(overhead, graphOf(root), readProfile(root), onFive({ config: { isolate: true } }), 8, {
      ...context,
      builder: { ...builder, isolateOption: true },
    });

    expect(finding?.fix).toContain('Try `isolate: false` in a runner config — the unit-test target names none');
  });
});

describe('the DOM engine under the builder', () => {
  const dominant = [phase('environment', 0.6), phase('tests', 0.4)];
  const jsdom = onFive({ config: { environment: 'jsdom', provided: ['isolate', 'environment'] } });

  it('advises installing happy-dom, since the builder picks it by itself', () => {
    const root = workspace();
    const [finding] = domEngineFindings(dominant, graphOf(root), jsdom, contextOf(root));

    expect(finding?.message).toMatch(/^@angular\/build runs this suite on `jsdom` because `happy-dom` is not installed/);
    expect(finding?.fix).toMatch(/^Try `npm i -D happy-dom`: the builder picks it over `jsdom` by itself, with no config line\./);
    expect(domEngineFindings(dominant, graphOf(root), onFive(), contextOf(root))).toHaveLength(1);
    expect(domEngineFindings(dominant, graphOf(root), jsdom, contextOf(root, 'ng test --runner-config=absent.config.ts'))[0]?.fix).toMatch(
      /^Try `npm i -D happy-dom`/,
    );
  });

  it('names the runner config when that is what sets jsdom', () => {
    const root = workspace({ 'vitest-base.config.ts': "export default { test: { environment: 'jsdom' } };\n" }, { runnerConfig: true });
    const [finding] = domEngineFindings(dominant, graphOf(root), jsdom, contextOf(root));

    expect(finding?.message).toMatch(/^vitest-base\.config\.ts sets `environment: 'jsdom'`/);
  });

  it('stays quiet before 21, with happy-dom installed, or on another environment', () => {
    const old = workspace({}, {}, '20.3.37');
    const withHappy = workspace(installed('happy-dom', '20.14.5'));
    const plain = workspace({ 'vitest-base.config.ts': 'export default {};\n' }, { runnerConfig: true });

    expect(domEngineFindings(dominant, graphOf(old), jsdom, contextOf(old))).toEqual([]);
    expect(domEngineFindings(dominant, graphOf(withHappy), jsdom, contextOf(withHappy))).toEqual([]);
    expect(domEngineFindings(dominant, graphOf(plain), onFive({ config: { environment: 'node' } }), contextOf(plain))).toEqual([]);
  });

  it('stays quiet on a plain run whose config names no jsdom', () => {
    const root = createTempRepo({ 'package.json': '{}', 'vitest.config.ts': 'export default {};\n' });

    expect(domEngineFindings(dominant, graphOf(root), onFive())).toEqual([]);
  });
});

describe('the module cache under the Analog plugin', () => {
  const dominant = [phase('transform', 0.5), phase('import', 0.5)];
  const waited = onFive({ files: [file('/repo/src/a.spec.ts', { fetch: 3_000 })] });
  const CONFIG = "import angular from '@analogjs/vite-plugin-angular';\nexport default { plugins: [angular()] };\n";
  const STYLED = "@Component({ selector: 'x-card', template: '', styles: [':host { display: block }'] })\nexport class Card {}\n";
  const analog = (version: string | undefined, over: Record<string, string> = {}): string =>
    createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '^5' } }),
      'vitest.config.ts': CONFIG,
      'src/card.ts': STYLED,
      ...(version === undefined ? {} : installed('@analogjs/vite-plugin-angular', version)),
      ...over,
    });

  it('warns instead of advising the cache, with the error the warm run fails on', () => {
    const root = analog('2.7.5');
    const [finding] = transformFindings(dominant, graphOf(root), waited, contextOf(root));

    expect(finding?.severity).toBe('warning');
    expect(finding?.message).toContain(
      'under @analogjs/vite-plugin-angular 2.7.5 a component with inline `styles` breaks the second, warm run',
    );
    expect(finding?.message).toContain("`Cannot find module '/@id/__x00__virtual:angular:jit:style:inline;<hash>'`");
    expect(finding?.fix).toBe(
      'Leave `fsModuleCache` off while the suite runs through @analogjs/vite-plugin-angular 2.7.5, and measure again after upgrading it.',
    );
  });

  it('warns without a version when the plugin is not installed where the report was read', () => {
    const root = analog(undefined);

    expect(transformFindings(dominant, graphOf(root), waited, contextOf(root))[0]?.fix).toBe(
      'Leave `fsModuleCache` off while the suite runs through @analogjs/vite-plugin-angular, and measure again after upgrading it.',
    );
  });

  it('warns on a newer plugin too, since no release is measured to fix it, and advises plainly without inline styles', () => {
    const newer = analog('3.0.0');
    const unstyled = analog('2.7.5', {
      'src/card.ts': "@Component({ selector: 'x-card', templateUrl: './card.html' })\nexport class Card {}\n",
    });

    expect(transformFindings(dominant, graphOf(newer), waited, contextOf(newer))[0]).toMatchObject({ severity: 'warning' });
    expect(transformFindings(dominant, graphOf(unstyled), waited, contextOf(unstyled))[0]).toMatchObject({ severity: 'info' });
  });

  it('keeps the advice under the builder, where no Analog virtual module is involved', () => {
    const root = workspace(
      { 'vitest-base.config.ts': CONFIG, 'src/card.ts': STYLED, ...installed('@analogjs/vite-plugin-angular', '2.7.5') },
      { runnerConfig: true },
    );
    const [finding] = transformFindings(dominant, graphOf(root), waited, contextOf(root));

    expect(finding).toMatchObject({ severity: 'info' });
    expect(finding?.fix).toContain('Set `fsModuleCache: true` in vitest-base.config.ts');
  });

  it('does not send the warning to `vitest doctor`', () => {
    const root = analog('2.7.5');
    const warning = transformFindings(dominant, graphOf(root), waited, contextOf(root));

    expect(vitestDoctorFindings(waited, warning, contextOf(root))).toEqual([]);
  });
});

describe('vitestDoctorFindings under the builder', () => {
  const isolation: Finding[] = [{ check: 'perf-isolation', severity: 'info', message: '', fix: '' }];

  it('offers an A/B through ng test instead of `npx vitest doctor`', () => {
    const named = workspace({}, { runnerConfig: 'vitest-base.config.ts' });
    const unnamed = workspace();
    const [withConfig] = vitestDoctorFindings(onFive(), isolation, contextOf(named));
    const [withoutConfig] = vitestDoctorFindings(onFive(), isolation, contextOf(unnamed));

    expect(withConfig?.check).toBe('perf-vitest-doctor');
    expect(withConfig?.message).toContain('`npx vitest doctor` cannot measure anything');
    expect(withConfig?.message).toContain('`describe is not defined`');
    expect(withConfig?.fix).toBe(
      'Before keeping a change suggested above, put it in a copy of vitest-base.config.ts and time `npx ng run app:test --watch=false --runner-config=<variant>` against `npx ng run app:test --watch=false --runner-config=vitest-base.config.ts`, a few rounds each, alternating.',
    );
    expect(withoutConfig?.fix).toContain('put it in a runner config of its own and time');
    expect(withoutConfig?.fix).toContain('against `npx ng run app:test --watch=false`, a few');
  });

  it('says nothing about `vitest doctor` in a builder workspace measured another way, or before 21', () => {
    const rooted = workspace({ 'vitest.config.ts': 'export default {};\n' });
    const old = workspace({}, {}, '20.3.37');

    expect(vitestDoctorFindings(onFive(), isolation, contextOf(rooted, 'npx vitest run'))).toEqual([]);
    expect(vitestDoctorFindings(onFive(), isolation, contextOf(old))).toEqual([]);
  });
});

describe('analysePerf and renderPerf on a builder run', () => {
  const BARREL_SPEC = "import { add } from './lib';\n\nit('adds', () => expect(add(1, 2)).toBe(3));\n";

  it('gives no barrel advice: esbuild resolved the barrels before Vitest imported anything', () => {
    const files = {
      'src/lib/add.ts': 'export const add = (a: number, b: number): number => a + b;\n',
      'src/lib/sub.ts': 'export const sub = (a: number, b: number): number => a - b;\n',
      'src/lib/index.ts': "export * from './add';\nexport * from './sub';\n",
      'src/a.spec.ts': BARREL_SPEC,
    };
    const plain = createTempRepo({ 'package.json': '{}', 'vitest.config.ts': 'export default {};\n', ...files });
    const builder = workspace(files);
    const heavy = (root: string): PerfRun => run({ root, files: [file(join(root, 'src/a.spec.ts'), { imports: 9_000, testCount: 1 })] });
    const checks = (root: string): string[] => analysePerf(heavy(root), readProfile(root)).findings.map((finding) => finding.check);

    expect(checks(plain)).toContain('perf-import');
    expect(checks(builder)).not.toContain('perf-import');
  });

  it('prints the spec bundle under its spec and leaves the chunks out of the confirmed evidence', () => {
    const root = workspace();
    const slowPath = join(root, 'src/app/slow.spec.ts');
    const source: PerfSource = {
      ok: true,
      run: run({ root, files: [...ordinary(root), file(slowPath, { tests: 9_000, testCount: 30 })] }),
      runFailed: false,
      command: 'npx ng test --include={paths}',
    };
    const remeasure = (): PerfSource => ({
      ok: true,
      runFailed: false,
      run: run({
        root,
        files: [
          file(slowPath, {
            tests: 8_000,
            testCount: 30,
            slowImports: [
              { module: join(root, 'spec-app-slow.js'), ms: 1_240 },
              { module: join(root, 'chunk-ABCD1234.js'), ms: 900 },
              { module: join(root, 'node_modules/@angular/core/fesm2022/core.mjs'), ms: 310 },
            ],
          }),
        ],
      }),
    });
    const io = recorder();

    renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } });

    const out = io.stdout.join('\n');

    expect(out).toContain('1.24s  src/app/slow.spec.ts, bundled with its imports');
    expect(out).toContain('310ms  @angular/core');
    expect(out).not.toContain('chunk-ABCD1234');
  });
});

describe('readPerfRun keeps the command beside a report it read', () => {
  const REPORT = JSON.stringify(run({ files: [file('/r/a.spec.ts', { tests: 1 })] }));
  const options = (root: string, json: string) => ({
    cwd: root,
    profile: readProfile(root),
    json,
    out: undefined,
    command: 'npx ng test',
    paths: [],
  });

  it('carries --command on a report read from --json, and passes a failure through', () => {
    const root = createTempRepo({ 'package.json': '{}', 'perf.json': REPORT });

    expect(readPerfRun(options(root, join(root, 'perf.json')))).toMatchObject({ ok: true, command: 'npx ng test' });
    expect(readPerfRun(options(root, join(root, 'missing.json')))).toMatchObject({ ok: false });
  });
});
