/**
 * `perf`, end to end and rule by rule.
 *
 * Two things are pinned harder than the rest. The **DOM-free rule** is pinned from both sides on
 * every input that could make it wrong, because a false positive there is somebody's suite failing
 * on `document is not defined` — the rule is allowed to say "undecided" about anything, and never
 * allowed to be wrong. And the **numbers** are pinned to what the reporter read, because a perf
 * tool that rounds, guesses or invents is worse than no perf tool.
 */
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { findBarrelImports, isBarrel, reachOf } from './checks/barrels';
import { DOM_FREE_RULE, findDomFreeSpecs, packageOf, readAliases } from './checks/dom-free';
import { buildGraph } from './checks/graph';
import { pathExists, readTextFile, writeTextFile } from './fs-scan';
import type { CliIo } from './main';
import { analysePerf, declaresNoIsolation, formatPhases, measuredFiles, nothingToDo, renderPerf } from './perf';
import type { PerfFile, PerfRun } from './perf-data';
import { PERF_OUTPUT_ENV, formatMs, formatShare, parsePerfRun, phasesOf, shareOf, totalOf } from './perf-data';
import PerfReporter from './perf-reporter';
import type { PerfTestModule } from './perf-reporter';
import type { Spawn } from './perf-run';
import { readPerfRun, reporterPath, spawnProcess } from './perf-run';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const file = (path: string, over: Partial<PerfFile> = {}): PerfFile => ({
  file: path,
  environment: 0,
  prepare: 0,
  setup: 0,
  imports: 0,
  tests: 0,
  ...over,
});

const run = (over: Partial<PerfRun> = {}): PerfRun => ({ version: 1, root: '/repo', transform: 0, wall: 0, files: [], ...over });

const checks = (findings: readonly { check: string }[]): string[] => findings.map((finding) => finding.check);

interface Recorder extends CliIo {
  readonly stdout: string[];
  readonly stderr: string[];
}

function recorder(): Recorder {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return { stdout, stderr, out: (line) => stdout.push(line), err: (line) => stderr.push(line) };
}

const CLEAN_SPEC = `import { expect, it } from 'vitest';\nimport { add } from './add';\n\nit('adds', () => {\n  expect(add(1, 2)).toBe(3);\n});\n`;

const CLEAN_SOURCE = `export function add(a: number, b: number): number {\n  return a + b;\n}\n`;

/** A repository whose specs are all provably DOM-free, plus one that is provably not. */
function cleanRepo(specCount: number, over: Readonly<Record<string, string>> = {}): string {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }),
    'src/add.ts': CLEAN_SOURCE,
  };

  for (let index = 0; index < specCount; index += 1) {
    files[`src/case-${index}.spec.ts`] = CLEAN_SPEC;
  }

  return createTempRepo({ ...files, ...over });
}

/** A run in which environment setup dominates and every spec cost the same. */
function heavyRun(root: string, specs: readonly string[], environment: number): PerfRun {
  return run({
    root,
    transform: 100,
    wall: 1_000,
    files: specs.map((spec) => file(join(root, spec), { environment, tests: 10 })),
  });
}

describe('parsePerfRun', () => {
  it('reads a report the reporter wrote', () => {
    const parsed = parsePerfRun(JSON.stringify(run({ root: '/r', transform: 12, wall: 34, files: [file('/r/a.spec.ts', { tests: 5 })] })));

    expect(parsed?.transform).toBe(12);
    expect(parsed?.wall).toBe(34);
    expect(parsed?.files[0]?.tests).toBe(5);
  });

  it('defaults every number it cannot read, and keeps the files it can', () => {
    const parsed = parsePerfRun('{"version":1,"files":[{"file":"/r/a.spec.ts","tests":"nope","setup":null},7,{"nofile":1}]}');

    expect(parsed?.root).toBe('');
    expect(parsed?.transform).toBe(0);
    expect(parsed?.files).toEqual([file('/r/a.spec.ts')]);
  });

  it('refuses anything that is not a report of the version it understands', () => {
    expect(parsePerfRun('not json')).toBeUndefined();
    expect(parsePerfRun('[]')).toBeUndefined();
    expect(parsePerfRun('{"version":2,"files":[]}')).toBeUndefined();
    expect(parsePerfRun('{"version":1}')).toBeUndefined();
    expect(parsePerfRun('{"version":"1","files":[]}')).toBeUndefined();
    expect(parsePerfRun('{"version":1e999,"files":[]}')).toBeUndefined();
  });

  it('drops a number JSON overflowed to Infinity rather than carrying it into the table', () => {
    expect(parsePerfRun('{"version":1,"transform":1e999,"files":[]}')?.transform).toBe(0);
  });
});

describe('phasesOf', () => {
  it('sums the five per-file phases and carries transform, largest first', () => {
    const phases = phasesOf(
      run({ transform: 40, files: [file('/r/a.spec.ts', { environment: 100, imports: 20, tests: 30, setup: 5, prepare: 5 })] }),
    );

    expect(phases.map((phase) => phase.name)).toEqual(['environment', 'transform', 'tests', 'import', 'prepare', 'setup']);
    expect(totalOf(phases)).toBe(200);
    expect(shareOf(phases, 'environment')).toBe(0.5);
  });

  it('gives every phase a zero share when nothing was measured, and breaks the tie by name', () => {
    const phases = phasesOf(run());

    expect(phases.map((phase) => phase.name)).toEqual(['environment', 'import', 'prepare', 'setup', 'tests', 'transform']);
    expect(phases.every((phase) => phase.share === 0)).toBe(true);
    expect(shareOf(phases, 'import')).toBe(0);
    expect(shareOf([], 'import')).toBe(0);
  });
});

describe('formatMs', () => {
  it('switches to seconds at a second, the way Vitest prints it', () => {
    expect(formatMs(0)).toBe('0ms');
    expect(formatMs(999.4)).toBe('999ms');
    expect(formatMs(8_910)).toBe('8.91s');
    expect(formatShare(0.5602)).toBe('56.0%');
  });
});

describe('PerfReporter', () => {
  const module = (moduleId: string): PerfTestModule => ({
    moduleId,
    diagnostic: () => ({ environmentSetupDuration: 1, prepareDuration: 2, collectDuration: 3, setupDuration: 4, duration: 5 }),
  });

  it('maps every diagnostic Vitest exposes onto the report', () => {
    const reporter = new PerfReporter();

    reporter.onInit({ config: { root: '/repo' }, state: { transformTime: 77 } });

    const report = reporter.report([module('/repo/a.spec.ts')]);

    expect(report.root).toBe('/repo');
    expect(report.transform).toBe(77);
    expect(report.files).toEqual([{ file: '/repo/a.spec.ts', environment: 1, prepare: 2, setup: 4, imports: 3, tests: 5 }]);
  });

  it('still reports when it was never initialised', () => {
    const report = new PerfReporter().report([]);

    expect(report.root).toBe('');
    expect(report.transform).toBe(0);
  });

  it('writes the report to the file the environment names', () => {
    const root = createTempRepo({ 'package.json': '{}' });
    const target = join(root, 'out', 'perf.json');
    const reporter = new PerfReporter();

    process.env[PERF_OUTPUT_ENV] = target;

    try {
      reporter.onInit({ config: { root }, state: { transformTime: 1 } });
      reporter.onTestRunEnd([module(join(root, 'a.spec.ts'))]);
    } finally {
      delete process.env[PERF_OUTPUT_ENV];
    }

    expect(parsePerfRun(readTextFile(target) ?? '')?.files).toHaveLength(1);
  });

  it('refuses to run with nowhere to write', () => {
    const reporter = new PerfReporter();

    process.env[PERF_OUTPUT_ENV] = '';

    try {
      expect(() => reporter.onTestRunEnd([])).toThrow(PERF_OUTPUT_ENV);
    } finally {
      delete process.env[PERF_OUTPUT_ENV];
    }

    expect(() => reporter.onTestRunEnd([])).toThrow(PERF_OUTPUT_ENV);
  });
});

describe('spawnProcess', () => {
  it('reports the exit status of the child', () => {
    expect(spawnProcess(process.execPath, ['-e', ''], process.cwd(), {}).status).toBe(0);
  });

  it('reports a failure to start as a non-zero status', () => {
    expect(spawnProcess(join(process.cwd(), 'no-such-binary'), [], process.cwd(), {}).status).toBe(1);
  });
});

describe('reporterPath', () => {
  it('is the built file inside this package, and nothing when there is no package', () => {
    const root = createTempRepo({ 'dist/perf-reporter.js': '' });

    expect(reporterPath(root)).toBe(join(root, 'dist', 'perf-reporter.js'));
    expect(reporterPath(join(root, 'empty'))).toBeUndefined();
    expect(reporterPath(undefined)).toBeUndefined();
  });
});

describe('readPerfRun', () => {
  const REPORT = JSON.stringify(run({ files: [file('/r/a.spec.ts', { tests: 1 })] }));

  it('reads a report a previous run wrote', () => {
    const root = createTempRepo({ 'package.json': '{}', 'perf.json': REPORT });
    const source = readPerfRun({ cwd: root, json: join(root, 'perf.json'), out: undefined, paths: [] });

    expect(source.ok && source.run.files).toHaveLength(1);
  });

  it('says so when --json points at something that is not one', () => {
    const root = createTempRepo({ 'package.json': '{}', 'perf.json': '{}' });

    expect(readPerfRun({ cwd: root, json: join(root, 'perf.json'), out: undefined, paths: [] })).toMatchObject({ ok: false });
    expect(readPerfRun({ cwd: root, json: join(root, 'missing.json'), out: undefined, paths: [] })).toMatchObject({ ok: false });
  });

  it('refuses to run when the repository has no Vitest', () => {
    const root = createTempRepo({ 'package.json': '{}' });
    const source = readPerfRun({ cwd: root, json: undefined, out: undefined, paths: [] });

    expect(source.ok).toBe(false);
    expect(source.ok ? '' : source.error).toContain('No Vitest is installed');
  });

  it('refuses to run when its own reporter was not built', () => {
    const root = createTempRepo({ 'package.json': '{}', 'node_modules/vitest/vitest.mjs': '' });
    const source = readPerfRun({ cwd: root, json: undefined, out: undefined, paths: [] }, () => ({ status: 0 }), root);

    expect(source.ok ? '' : source.error).toContain('dist/perf-reporter.js');
  });

  /** A repository with a Vitest to run and a package root whose reporter is on disk. */
  const runnable = (): string =>
    createTempRepo({ 'package.json': '{}', 'node_modules/vitest/vitest.mjs': '', 'dist/perf-reporter.js': '' });

  const writing = (status: number): Spawn => {
    return (_command, _args, _cwd, env) => {
      writeTextFile(env[PERF_OUTPUT_ENV] ?? '', REPORT);

      return { status };
    };
  };

  it('runs Vitest with the reporter attached and reads what it wrote', () => {
    const root = runnable();
    let seen: readonly string[] = [];
    const spawn: Spawn = (command, args, cwd, env) => {
      seen = args;

      expect(command).toBe(process.execPath);
      expect(cwd).toBe(root);

      return writing(0)(command, args, cwd, env);
    };
    const source = readPerfRun({ cwd: root, json: undefined, out: undefined, paths: ['src/a.spec.ts'] }, spawn, root);

    expect(seen).toEqual([
      join(root, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      '--reporter=default',
      `--reporter=${join(root, 'dist', 'perf-reporter.js')}`,
      'src/a.spec.ts',
    ]);
    expect(source).toMatchObject({ ok: true, runFailed: false });
    expect(pathExists(join(root, 'node_modules', '.cache', 'vitest-auto-spy', 'perf.json'))).toBe(false);
  });

  it('keeps the report where --out asks, and still reports a suite that failed', () => {
    const root = runnable();
    const out = join(root, 'kept.json');

    expect(readPerfRun({ cwd: root, json: undefined, out, paths: [] }, writing(1), root)).toMatchObject({ ok: true, runFailed: true });
    expect(pathExists(out)).toBe(true);
  });

  it('says so when the run wrote nothing', () => {
    const root = runnable();
    const source = readPerfRun({ cwd: root, json: undefined, out: undefined, paths: [] }, () => ({ status: 2 }), root);

    expect(source.ok ? '' : source.error).toContain('exited 2');
  });
});

describe('packageOf', () => {
  it('stops at the package, scoped or not', () => {
    expect(packageOf('rxjs')).toBe('rxjs');
    expect(packageOf('rxjs/operators')).toBe('rxjs');
    expect(packageOf('@angular/core')).toBe('@angular/core');
    expect(packageOf('@angular/core/testing')).toBe('@angular/core');
    expect(packageOf('@scope')).toBe('@scope');
  });
});

describe('readAliases', () => {
  it('reads compilerOptions.paths from both configs, longest prefix first', () => {
    const root = createTempRepo({
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: './', paths: { '@app/*': ['src/app/*'], '*': ['src/*'] } } }),
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: { '@lib/deep/*': ['libs/deep/*'], '@bad/*': 'not-an-array' } } }),
    });

    expect(readAliases(root)).toEqual([
      { prefix: '@lib/deep/', target: 'libs/deep/' },
      { prefix: '@app/', target: 'src/app/' },
    ]);
  });

  it('is empty when there is nothing to read', () => {
    const root = createTempRepo({ 'tsconfig.json': '{ "compilerOptions": {} }', 'tsconfig.base.json': 'not json at all' });

    expect(readAliases(root)).toEqual([]);
    expect(readAliases(join(root, 'nowhere'))).toEqual([]);
  });
});

describe('findDomFreeSpecs', () => {
  const specsOf = (root: string): readonly string[] => {
    const profile = readProfile(root);

    return findDomFreeSpecs(profile, buildGraph(profile)).specs;
  };

  it('lists a spec whose whole reach was read and mentions no DOM name', () => {
    expect(specsOf(cleanRepo(1))).toEqual(['src/case-0.spec.ts']);
  });

  it('refuses a spec that mentions a DOM name, or imports a module that does', () => {
    const dirty = cleanRepo(1, {
      'src/dom.spec.ts': `import { it } from 'vitest';\n\nit('renders', () => {\n  document.createElement('div');\n});\n`,
      'src/via.spec.ts': `import { it } from 'vitest';\nimport { widget } from './widget';\n\nit('uses', () => {\n  widget();\n});\n`,
      'src/widget.ts': `export function widget(): unknown {\n  return window;\n}\n`,
    });

    expect(specsOf(dirty)).toEqual(['src/case-0.spec.ts']);
  });

  it('refuses a spec that imports a package it cannot see through, and follows a path alias into one', () => {
    const repo = cleanRepo(0, {
      'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@app/*': ['src/app/*'] } } }),
      'src/bare.spec.ts': `import { it } from 'vitest';\nimport { thing } from '@some/package';\n\nit('x', () => {\n  thing();\n});\n`,
      'src/aliased.spec.ts': `import { it } from 'vitest';\nimport { helper } from '@app/helper';\n\nit('x', () => {\n  helper();\n});\n`,
      'src/app/helper.ts': `export function helper(): number {\n  return 1;\n}\n`,
      'src/dirty-alias.spec.ts': `import { it } from 'vitest';\nimport { dirty } from '@app/dirty';\n\nit('x', () => {\n  dirty();\n});\n`,
      'src/app/dirty.ts': `export function dirty(): unknown {\n  return document;\n}\n`,
    });

    expect(specsOf(repo)).toEqual(['src/aliased.spec.ts']);
  });

  it('accepts the packages on the list and node builtins, and refuses an unresolvable relative import', () => {
    const repo = cleanRepo(0, {
      'src/ok.spec.ts': `import { it } from 'vitest';\nimport { of } from 'rxjs';\nimport { join } from 'node:path';\nimport 'vitest-auto-spy/rxjs';\n\nit('x', () => {\n  of(join('a'));\n});\n`,
      'src/gone.spec.ts': `import { it } from 'vitest';\nimport { gone } from './gone';\n\nit('x', () => {\n  gone();\n});\n`,
    });

    expect(specsOf(repo)).toEqual(['src/ok.spec.ts']);
  });

  it('leaves a spec that already declares its environment alone, and survives a cycle', () => {
    const repo = cleanRepo(0, {
      'src/declared.spec.ts': `// @vitest-environment node\nimport { it } from 'vitest';\n\nit('x', () => {\n  expect(1).toBe(1);\n});\n`,
      'src/cycle.spec.ts': `import { it } from 'vitest';\nimport { a } from './a';\n\nit('x', () => {\n  a();\n});\n`,
      'src/a.ts': `import { b } from './b';\n\nexport function a(): number {\n  return b();\n}\n`,
      'src/b.ts': `import { a } from './a';\n\nexport function b(): number {\n  return a === undefined ? 1 : 2;\n}\n`,
    });
    const profile = readProfile(repo);
    const result = findDomFreeSpecs(profile, buildGraph(profile));

    expect(result.specs).toEqual(['src/cycle.spec.ts']);
    expect(result.undecided).toBe(0);
  });

  it('refuses every spec when the setup file that runs before all of them needs a DOM', () => {
    const repo = cleanRepo(1, {
      'vitest.config.ts': "export default { test: { setupFiles: ['src/test-setup.ts'] } };\n",
      'src/test-setup.ts': "import { getTestBed } from '@angular/core/testing';\n\ngetTestBed();\n",
    });

    expect(specsOf(repo)).toEqual([]);
  });

  it('keeps the specs when the setup file needs no DOM, and refuses them when it cannot be read', () => {
    const clean = cleanRepo(1, {
      'vitest.config.ts': "export default { test: { setupFiles: ['src/test-setup.ts'] } };\n",
      'src/test-setup.ts': "import { beforeEach } from 'vitest';\n\nbeforeEach(() => undefined);\n",
    });
    const unreadable = cleanRepo(1, { 'vitest.config.ts': "export default { test: { setupFiles: ['@company/test-setup'] } };\n" });

    expect(specsOf(clean)).toEqual(['src/case-0.spec.ts']);
    expect(specsOf(unreadable)).toEqual([]);
  });

  it('states the rule it used', () => {
    expect(DOM_FREE_RULE).toContain('the configured setup files');
    expect(DOM_FREE_RULE).toContain('rxjs');
  });
});

describe('isBarrel', () => {
  it('is a re-export-only index, and nothing else', () => {
    const reexports = "export * from './a';\nexport { b } from './b';\n";

    expect(isBarrel('src/index.ts', reexports)).toBe(true);
    expect(isBarrel('src/public-api.ts', reexports)).toBe(true);
    expect(isBarrel('src/thing.ts', reexports)).toBe(false);
    expect(isBarrel('src/index.ts', "export * from './a';\n")).toBe(false);
    expect(isBarrel('src/index.ts', `${reexports}export const extra = 1;\n`)).toBe(false);
    expect(isBarrel('src/index.ts', '// nothing here yet\n')).toBe(false);
  });
});

/**
 * One repository for every ordering the report has to be stable under: barrels of different width,
 * two of the same width, one spec importing two of them, and a module two barrels share.
 */
const BARREL_REPO: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }),
  'src/index.ts': "export * from './a';\nexport * from './b';\n",
  'src/a.ts': "export * from './shared';\nexport const a = 1;\n",
  'src/b.ts': "export * from './shared';\nexport const b = 2;\n",
  'src/shared.ts': 'export const shared = 3;\n',
  'src/other/index.ts': "export * from './x';\nexport * from './y';\n",
  'src/other/x.ts': 'export const x = 1;\n',
  'src/other/y.ts': 'export const y = 2;\n',
  'src/p/index.ts': "export * from './m';\nexport * from './n';\n",
  'src/p/m.ts': 'export const m = 1;\n',
  'src/p/n.ts': 'export const n = 2;\n',
  'src/q/index.ts': "export * from './r';\nexport * from './s';\n",
  'src/q/r.ts': 'export const r = 1;\n',
  'src/q/s.ts': 'export const s = 2;\n',
  'src/one.spec.ts': "import { a } from './index';\n",
  'src/two.spec.ts': "import { x } from './other/index';\n",
  'src/both.spec.ts': "import { m } from './p/index';\nimport { r } from './q/index';\n",
  'src/direct.spec.ts': "import { shared } from './shared';\n",
  'src/not-a-spec.ts': "import { a } from './index';\n",
};

describe('findBarrelImports', () => {
  it('names the spec, the barrel and how much the barrel drags in behind it', () => {
    const graph = buildGraph(readProfile(createTempRepo(BARREL_REPO)));

    expect(reachOf('src/index.ts', graph)).toBe(3);
    expect(findBarrelImports(graph)).toEqual([
      { spec: 'src/one.spec.ts', barrel: 'src/index.ts', reach: 3 },
      { spec: 'src/both.spec.ts', barrel: 'src/p/index.ts', reach: 2 },
      { spec: 'src/both.spec.ts', barrel: 'src/q/index.ts', reach: 2 },
      { spec: 'src/two.spec.ts', barrel: 'src/other/index.ts', reach: 2 },
    ]);
  });
});

describe('measuredFiles', () => {
  it('keys by repository-relative path and drops what is outside the repository', () => {
    const measured = measuredFiles(run({ files: [file('/repo/src/a.spec.ts'), file('/elsewhere/b.spec.ts'), file('/repo')] }), '/repo');

    expect([...measured.keys()]).toEqual(['src/a.spec.ts']);
  });
});

describe('declaresNoIsolation', () => {
  it('reads the setting and not the prose about it', () => {
    const configured = buildGraph(
      readProfile(createTempRepo({ 'package.json': '{}', 'vitest.config.ts': 'export default { test: { isolate: false } };\n' })),
    );
    const discussed = buildGraph(
      readProfile(
        createTempRepo({
          'package.json': '{}',
          'vitest.config.ts': '// isolate: false is what the other config does\nexport default { test: { isolate: true } };\n',
        }),
      ),
    );

    expect(declaresNoIsolation(configured)).toBe(true);
    expect(declaresNoIsolation(discussed)).toBe(false);
  });
});

describe('analysePerf', () => {
  it('says there is nothing to do for a suite that costs nothing', () => {
    const root = cleanRepo(1);
    const analysis = analysePerf(heavyRun(root, ['src/case-0.spec.ts'], 100), readProfile(root));

    expect(analysis.findings).toEqual([]);
    expect(nothingToDo(analysis)).toContain('Nothing here is worth your time');
  });

  it('names every DOM-free spec when environment setup dominates', () => {
    const root = cleanRepo(2);
    const analysis = analysePerf(heavyRun(root, ['src/case-0.spec.ts', 'src/case-1.spec.ts'], 4_000), readProfile(root));
    const environment = analysis.findings.filter((finding) => finding.check === 'perf-environment-node-candidate');

    expect(checks(analysis.findings)).toContain('perf-environment');
    expect(environment.map((finding) => finding.file)).toEqual(['src/case-0.spec.ts', 'src/case-1.spec.ts']);
    expect(analysis.findings[0]?.message).toContain('2 spec files reach no DOM');
    expect(analysis.findings[0]?.fix).toContain(DOM_FREE_RULE);
    expect(analysis.findings.every((finding) => finding.severity === 'info')).toBe(true);
  });

  it('caps the list and counts the rest', () => {
    const root = cleanRepo(14);
    const specs = Array.from({ length: 14 }, (_unused, index) => `src/case-${index}.spec.ts`);
    const analysis = analysePerf(heavyRun(root, specs, 1_000), readProfile(root));

    expect(analysis.findings.filter((finding) => finding.check === 'perf-environment-node-candidate')).toHaveLength(12);
    expect(analysis.findings[0]?.message).toContain('The 2 not listed below');
  });

  it('says so when environment dominates but no file could be proved DOM-free', () => {
    const root = cleanRepo(0, { 'src/dom.spec.ts': `import { it } from 'vitest';\n\nit('x', () => {\n  document.title = '';\n});\n` });
    const analysis = analysePerf(heavyRun(root, ['src/dom.spec.ts'], 9_000), readProfile(root));

    expect(analysis.findings[0]?.message).toContain('No spec file could be proved DOM-free');
    expect(analysis.findings[0]?.message).toContain('1 were left undecided');
  });

  it('skips a DOM-free spec the run never measured', () => {
    const root = cleanRepo(2);
    const analysis = analysePerf(heavyRun(root, ['src/case-0.spec.ts'], 9_000), readProfile(root));

    expect(analysis.findings.filter((finding) => finding.check === 'perf-environment-node-candidate')).toHaveLength(1);
  });

  it('names the specs that reach their subject through a barrel when import time dominates', () => {
    const root = createTempRepo(BARREL_REPO);
    const analysis = analysePerf(
      run({ root, wall: 100, files: [file(join(root, 'src/one.spec.ts'), { imports: 9_000, tests: 10 })] }),
      readProfile(root),
    );

    expect(checks(analysis.findings)).toEqual(['perf-import', 'perf-import-barrel', 'perf-import-barrel', 'perf-import-barrel']);
    expect(analysis.findings.map((finding) => finding.file)).toEqual([undefined, 'src/one.spec.ts', 'src/both.spec.ts', 'src/two.spec.ts']);
    expect(analysis.findings[1]?.message).toContain('src/index.ts');
    expect(analysis.findings[1]?.message).toContain('3 repository modules');
  });

  it('keeps quiet about barrels when import time dominates but there are none', () => {
    const root = cleanRepo(1);
    const analysis = analysePerf(run({ root, files: [file(join(root, 'src/case-0.spec.ts'), { imports: 9_000 })] }), readProfile(root));

    expect(analysis.findings).toEqual([]);
  });

  it('offers the isolation trade, with what it costs, and not to a suite that already took it', () => {
    const root = cleanRepo(1);
    const measured = run({ root, files: [file(join(root, 'src/case-0.spec.ts'), { setup: 4_000, prepare: 4_000, tests: 100 })] });
    const analysis = analysePerf(measured, readProfile(root));
    const taken = analysePerf(
      measured,
      readProfile(cleanRepo(1, { 'vitest.config.ts': 'export default { test: { isolate: false } };\n' })),
    );

    expect(checks(analysis.findings)).toEqual(['perf-isolation']);
    expect(analysis.findings[0]?.fix).toContain('peak memory');
    expect(analysis.findings[0]?.fix).toContain('#memory-under-isolate-false');
    expect(checks(taken.findings)).toEqual([]);
  });
});

describe('formatPhases', () => {
  it('is one row per phase, share included', () => {
    const table = formatPhases(phasesOf(run({ transform: 1_000, files: [file('/r/a.spec.ts', { environment: 1_000 })] })));

    expect(table).toContain('phase');
    expect(table).toContain('environment');
    expect(table).toContain('50.0%');
  });
});

describe('renderPerf', () => {
  const report = (root: string, over: Partial<PerfFile>): string =>
    JSON.stringify(run({ root, wall: 1_234, files: [file(join(root, 'src/case-0.spec.ts'), over)] }));

  const render = (root: string, over: Partial<PerfFile>, io: CliIo): number => {
    writeTextFile(join(root, 'perf.json'), report(root, over));

    return renderPerf(readPerfRun({ cwd: root, json: join(root, 'perf.json'), out: undefined, paths: [] }), root, io);
  };

  it('prints the phase table and the findings', () => {
    const io = recorder();

    expect(render(cleanRepo(1), { environment: 9_000, tests: 100 }, io)).toBe(0);

    const out = io.stdout.join('\n');

    expect(out).toContain('vitest-auto-spy perf —');
    expect(out).toContain('1 test files, 1.23s wall clock');
    expect(out).toContain('environment');
    expect(out).toContain('perf-environment-node-candidate src/case-0.spec.ts');
    expect(out).toContain('0 errors, 0 warnings');
  });

  it('says there is nothing to do, and still exits 0', () => {
    const io = recorder();

    expect(render(cleanRepo(1), { tests: 10 }, io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('Nothing here is worth your time');
  });

  it('says nothing is worth naming when the suite is slow but evenly spread', () => {
    const io = recorder();

    render(cleanRepo(1), { tests: 9_000 }, io);

    expect(io.stdout.join('\n')).toContain('no rule found a file to name');
  });

  it('warns that the suite failed and prints the timings anyway', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source = parsePerfRun(report(root, { tests: 10 }));

    expect(renderPerf({ ok: true, run: source ?? run(), runFailed: true }, root, io)).toBe(0);
    expect(io.stderr.join('\n')).toContain('The suite did not pass');
    expect(io.stdout.join('\n')).toContain('vitest-auto-spy perf —');
  });

  it('reports a report it cannot read on stderr, and exits 1', () => {
    const root = cleanRepo(1);
    const io = recorder();

    expect(renderPerf(readPerfRun({ cwd: root, json: join(root, 'missing.json'), out: undefined, paths: [] }), root, io)).toBe(1);
    expect(io.stderr.join('\n')).toContain('Not a perf report');
  });
});
