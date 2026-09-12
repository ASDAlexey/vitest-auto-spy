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
import type { GateRequest } from './perf';
import { analysePerf, declaresNoIsolation, formatPhases, nothingToDo, renderPerf } from './perf';
import { BASELINE_DEFAULTS } from './perf-baseline';
import type { PerfFile, PerfRun } from './perf-data';
import {
  PERF_OUTPUT_ENV,
  PERF_REPORTER_ENV,
  formatMs,
  formatShare,
  measuredNothing,
  parsePerfRun,
  phasesOf,
  shareOf,
  totalOf,
} from './perf-data';
import type { GateOptions } from './perf-gate';
import { GATE_DEFAULTS, measuredFiles } from './perf-gate';
import PerfReporter from './perf-reporter';
import type { PerfTestModule } from './perf-reporter';
import type { PerfRunOptions, PerfSource, Spawn, SpawnRequest } from './perf-run';
import { commandTakesPaths, perfRemeasure, readPerfRun, reporterPath, shellQuote, spawnProcess, withPaths } from './perf-run';
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
  testCount: 1,
  cases: [],
  ...over,
});

const run = (over: Partial<PerfRun> = {}): PerfRun => ({ version: 2, root: '/repo', transform: 0, wall: 0, failed: 0, files: [], ...over });

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
    expect(parsed?.files).toEqual([file('/r/a.spec.ts', { testCount: 0 })]);
  });

  it('reads the per-test rows version 2 added, and keeps only the entries that are cases', () => {
    const parsed = parsePerfRun(
      '{"version":2,"files":[{"file":"/r/a.spec.ts","testCount":3,"cases":[{"name":"slow","ms":2000},{"name":"timeless"},{"ms":5},"nope"]}]}',
    );

    expect(parsed?.files[0]?.testCount).toBe(3);
    expect(parsed?.files[0]?.cases).toEqual([
      { name: 'slow', ms: 2_000 },
      { name: 'timeless', ms: 0 },
    ]);
  });

  it('reads a version 1 report, which simply has no per-test rows', () => {
    const parsed = parsePerfRun('{"version":1,"files":[{"file":"/r/a.spec.ts","tests":40}]}');

    expect(parsed?.version).toBe(1);
    expect(parsed?.files[0]?.cases).toEqual([]);
  });

  it('refuses anything that is not a report of the version it understands', () => {
    expect(parsePerfRun('not json')).toBeUndefined();
    expect(parsePerfRun('[]')).toBeUndefined();
    expect(parsePerfRun('{"version":3,"files":[]}')).toBeUndefined();
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
    expect(report.files).toEqual([
      { file: '/repo/a.spec.ts', environment: 1, prepare: 2, setup: 4, imports: 3, tests: 5, testCount: 0, cases: [] },
    ]);
  });

  it('counts the bodies that finished and keeps the slowest few of them by name', () => {
    const bodies = [
      { fullName: 'suite > slow', diagnostic: () => ({ duration: 2_000 }) },
      { fullName: 'suite > quick', diagnostic: () => ({ duration: 4 }) },
      { name: 'unnamed parent', diagnostic: () => ({ duration: 900 }) },
      { fullName: 'suite > skipped', diagnostic: () => undefined },
      { fullName: 'suite > never ran' },
    ];
    const report = new PerfReporter().report([{ ...module('/repo/a.spec.ts'), children: { allTests: () => bodies } }]);

    expect(report.files[0]?.testCount).toBe(3);
    expect(report.files[0]?.cases).toEqual([
      { name: 'suite > slow', ms: 2_000 },
      { name: 'unnamed parent', ms: 900 },
    ]);
  });

  it('names a body Vitest gave no name at all, and keeps at most five per file', () => {
    const bodies = Array.from({ length: 7 }, (_, index) => ({
      fullName: `case ${index}`,
      diagnostic: () => ({ duration: 1_000 + index }),
    }));
    const report = new PerfReporter().report([{ ...module('/repo/a.spec.ts'), children: { allTests: () => bodies } }]);

    expect(report.files[0]?.cases).toHaveLength(5);
    expect(report.files[0]?.cases[0]).toEqual({ name: 'case 6', ms: 1_006 });
  });

  it('keeps one body per name, the slowest, because a name is not unique', () => {
    const bodies = [
      { fullName: 'suite > renders', diagnostic: () => ({ duration: 400 }) },
      { fullName: 'suite > renders', diagnostic: () => ({ duration: 1_200 }) },
      { fullName: 'suite > renders', diagnostic: () => ({ duration: 700 }) },
    ];
    const report = new PerfReporter().report([{ ...module('/repo/a.spec.ts'), children: { allTests: () => bodies } }]);

    expect(report.files[0]?.testCount).toBe(3);
    expect(report.files[0]?.cases).toEqual([{ name: 'suite > renders', ms: 1_200 }]);
  });

  it('falls back to a name of its own for a body Vitest named nothing', () => {
    const report = new PerfReporter().report([
      { ...module('/r/b.spec.ts'), children: { allTests: () => [{ diagnostic: () => ({ duration: 900 }) }] } },
    ]);

    expect(report.files[0]?.cases[0]?.name).toBe('(unnamed test)');
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

  it('writes nothing, and says nothing, when no report was asked for', () => {
    const reporter = new PerfReporter();

    delete process.env[PERF_OUTPUT_ENV];

    expect(() => reporter.onTestRunEnd([])).not.toThrow();
  });
});

describe('spawnProcess', () => {
  it('reports the exit status of the child', () => {
    expect(spawnProcess({ command: process.execPath, args: ['-e', ''], cwd: process.cwd(), env: {}, shell: false }).status).toBe(0);
  });

  it('reports a failure to start as a non-zero status', () => {
    expect(
      spawnProcess({ command: join(process.cwd(), 'no-such-binary'), args: [], cwd: process.cwd(), env: {}, shell: false }).status,
    ).toBe(1);
  });

  it('runs a shell line when the request asks for one', () => {
    expect(spawnProcess({ command: 'exit 0', args: [], cwd: process.cwd(), env: {}, shell: true }).status).toBe(0);
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

  /** Everything `readPerfRun` needs, with the repository's own profile read from disk. */
  const options = (root: string, over: Partial<PerfRunOptions> = {}): PerfRunOptions => ({
    cwd: root,
    profile: readProfile(root),
    json: undefined,
    out: undefined,
    command: undefined,
    paths: [],
    ...over,
  });

  it('reads a report a previous run wrote', () => {
    const root = createTempRepo({ 'package.json': '{}', 'perf.json': REPORT });
    const source = readPerfRun(options(root, { json: join(root, 'perf.json') }));

    expect(source.ok && source.run.files).toHaveLength(1);
  });

  it('says so when --json points at something that is not one', () => {
    const root = createTempRepo({ 'package.json': '{}', 'perf.json': '{}' });

    expect(readPerfRun(options(root, { json: join(root, 'perf.json') }))).toMatchObject({ ok: false });
    expect(readPerfRun(options(root, { json: join(root, 'missing.json') }))).toMatchObject({ ok: false });
  });

  it('refuses a bare run in a repository whose suite is built by something else', () => {
    const root = createTempRepo({
      'package.json': JSON.stringify({ scripts: { test: 'node tools/bench/run.mjs' }, devDependencies: { vitest: '^4' } }),
      'node_modules/vitest/vitest.mjs': '',
    });
    const source = readPerfRun(options(root), () => ({ status: 0 }), root);

    expect(source.ok).toBe(false);
    expect(source.ok ? '' : source.error).toContain('would not measure this repository');
    expect(source.ok ? '' : source.error).toContain('node tools/bench/run.mjs');
    expect(source.ok ? '' : source.error).toContain('--command');
  });

  it('says which of the two it saw when there is no test script at all', () => {
    const root = createTempRepo({ 'package.json': '{}' });
    const source = readPerfRun(options(root));

    expect(source.ok ? '' : source.error).toContain('there is no `test` script');
  });

  /** A repository a bare run is fair in: it has the root config `vitest run` would read. */
  const bareOk = (extra: Readonly<Record<string, string>> = {}): string =>
    createTempRepo({ 'package.json': '{}', 'vitest.config.ts': 'export default {};\n', ...extra });

  it('refuses to run when the repository has no Vitest', () => {
    const source = readPerfRun(options(bareOk()));

    expect(source.ok).toBe(false);
    expect(source.ok ? '' : source.error).toContain('No Vitest is installed');
  });

  it('refuses to run when its own reporter was not built', () => {
    const root = bareOk({ 'node_modules/vitest/vitest.mjs': '' });
    const source = readPerfRun(options(root), () => ({ status: 0 }), root);

    expect(source.ok ? '' : source.error).toContain('dist/perf-reporter.js');
  });

  it('refuses a --command run when its own reporter was not built', () => {
    const root = bareOk();
    const source = readPerfRun(options(root, { command: 'npm test' }), () => ({ status: 0 }), root);

    expect(source.ok ? '' : source.error).toContain('dist/perf-reporter.js');
  });

  /** A repository with a Vitest to run and a package root whose reporter is on disk. */
  const runnable = (): string => bareOk({ 'node_modules/vitest/vitest.mjs': '', 'dist/perf-reporter.js': '' });

  const writing = (status: number): Spawn => {
    return (request) => {
      writeTextFile(request.env[PERF_OUTPUT_ENV] ?? '', REPORT);

      return { status };
    };
  };

  it('runs Vitest with the reporter attached and reads what it wrote', () => {
    const root = runnable();
    let seen: SpawnRequest | undefined;
    const spawn: Spawn = (request) => {
      seen = request;

      return writing(0)(request);
    };
    const source = readPerfRun(options(root, { paths: ['src/a.spec.ts'] }), spawn, root);

    expect(seen?.command).toBe(process.execPath);
    expect(seen?.cwd).toBe(root);
    expect(seen?.shell).toBe(false);
    expect(seen?.args).toEqual([
      join(root, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      '--reporter=default',
      `--reporter=${join(root, 'dist', 'perf-reporter.js')}`,
      'src/a.spec.ts',
    ]);
    expect(seen?.env[PERF_REPORTER_ENV]).toBe(join(root, 'dist', 'perf-reporter.js'));
    expect(source).toMatchObject({ ok: true, runFailed: false });
    expect(pathExists(join(root, 'node_modules', '.cache', 'vitest-auto-spy', `perf-${process.pid}.json`))).toBe(false);
  });

  it('keeps the report where --out asks, and still reports a suite that failed', () => {
    const root = runnable();
    const out = join(root, 'kept.json');

    expect(readPerfRun(options(root, { out }), writing(1), root)).toMatchObject({ ok: true, runFailed: true });
    expect(pathExists(out)).toBe(true);
  });

  it('says so when the run wrote nothing', () => {
    const root = runnable();
    const source = readPerfRun(options(root), () => ({ status: 2 }), root);

    expect(source.ok ? '' : source.error).toContain('exited 2');
  });

  it('runs the command it was given as a shell line, with the reporter path in the environment', () => {
    const root = runnable();
    let seen: SpawnRequest | undefined;
    const spawn: Spawn = (request) => {
      seen = request;

      return writing(0)(request);
    };
    const source = readPerfRun(
      options(root, { command: 'npm test -- {paths:--include=}', paths: ['a.spec.ts', "b'c.spec.ts"] }),
      spawn,
      root,
    );

    expect(seen?.shell).toBe(true);
    expect(seen?.command).toBe("npm test -- --include='a.spec.ts' --include='b'\\''c.spec.ts'");
    expect(seen?.env[PERF_REPORTER_ENV]).toBe(join(root, 'dist', 'perf-reporter.js'));
    expect(source).toMatchObject({ ok: true });
  });

  it('tells a command that wrote no report how to attach the reporter', () => {
    const root = runnable();
    const source = readPerfRun(options(root, { command: 'npm test' }), () => ({ status: 1 }), root);

    expect(source.ok ? '' : source.error).toContain('exited 1');
    expect(source.ok ? '' : source.error).toContain(PERF_REPORTER_ENV);
    expect(source.ok ? '' : source.error).toContain('reporters:');
  });
});

describe('withPaths', () => {
  it('substitutes the files, quoted, with the prefix each harness wants', () => {
    expect(withPaths('vitest run {paths}', ['a.spec.ts'])).toBe("vitest run 'a.spec.ts'");
    expect(withPaths('npm test -- {paths:--include=}', ['a', 'b'])).toBe("npm test -- --include='a' --include='b'");
    expect(withPaths('npm test -- {paths}', [])).toBe('npm test -- ');
    expect(withPaths('npm test', ['a'])).toBe('npm test');
  });

  it('knows which commands can be narrowed at all', () => {
    expect(commandTakesPaths('npm test -- {paths}')).toBe(true);
    expect(commandTakesPaths('npm test -- {paths:--include=}')).toBe(true);
    expect(commandTakesPaths('npm test')).toBe(false);
  });
});

describe('perfRemeasure', () => {
  const options = (root: string, over: Partial<PerfRunOptions> = {}): PerfRunOptions => ({
    cwd: root,
    profile: readProfile(root),
    json: undefined,
    out: undefined,
    command: undefined,
    paths: [],
    ...over,
  });

  it('is nothing for a report that was handed over, or a command that cannot be narrowed', () => {
    const root = createTempRepo({ 'package.json': '{}', 'vitest.config.ts': 'export default {};\n' });

    expect(perfRemeasure(options(root, { json: 'perf.json' }))).toBeUndefined();
    expect(perfRemeasure(options(root, { json: 'perf.json', command: 'npm test -- {paths}' }))).toBeTypeOf('function');
    expect(perfRemeasure(options(root, { command: 'npm test' }))).toBeUndefined();
  });

  it('re-runs the same source over the files it is given, and keeps no report behind', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'vitest.config.ts': 'export default {};\n',
      'node_modules/vitest/vitest.mjs': '',
      'dist/perf-reporter.js': '',
    });
    const seen: string[][] = [];
    const spawn: Spawn = (request) => {
      seen.push([...request.args]);
      writeTextFile(request.env[PERF_OUTPUT_ENV] ?? '', JSON.stringify(run({ files: [file('/r/a.spec.ts', { tests: 1 })] })));

      return { status: 0 };
    };
    const remeasure = perfRemeasure(options(root, { out: join(root, 'kept.json') }), spawn, root);

    expect(remeasure?.(['src/a.spec.ts'])).toMatchObject({ ok: true });
    expect(seen[0]?.at(-1)).toBe('src/a.spec.ts');
    expect(pathExists(join(root, 'kept.json'))).toBe(false);
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

  it('offers happy-dom to a jsdom suite whose environment time dominates, and not to one already on it', () => {
    const jsdom = cleanRepo(1, { 'vitest.config.ts': "export default { test: { environment: 'jsdom' } };\n" });
    const happy = cleanRepo(1, { 'vitest.config.ts': "export default { test: { environment: 'happy-dom' } };\n" });
    const dominates = (root: string): string[] =>
      checks(analysePerf(heavyRun(root, ['src/case-0.spec.ts'], 9_000), readProfile(root)).findings);

    expect(dominates(jsdom)).toContain('perf-environment-engine');
    expect(dominates(happy)).not.toContain('perf-environment-engine');
  });

  it('reads the environment setting and not the comment that mentions the other one', () => {
    const discussed = cleanRepo(1, {
      'vitest.config.ts': "// happy-dom was tried here once\nexport default { test: { environment: 'jsdom' } };\n",
    });
    const analysis = analysePerf(heavyRun(discussed, ['src/case-0.spec.ts'], 9_000), readProfile(discussed));

    expect(checks(analysis.findings)).toContain('perf-environment-engine');
  });

  it('names the worker count on a run large enough for it to be a decision, once', () => {
    const root = cleanRepo(1);
    const capped = cleanRepo(1, { 'vitest.config.ts': 'export default { test: { maxWorkers: 4 } };\n' });
    const large = (target: string): PerfRun => run({ root: target, files: [file(join(target, 'src/case-0.spec.ts'), { tests: 90_000 })] });
    const analysis = analysePerf(large(root), readProfile(root));

    expect(checks(analysis.findings)).toEqual(['perf-workers']);
    expect(analysis.findings[0]?.message).toContain('155 MB per worker');
    expect(analysis.findings[0]?.fix).toContain('2.8 %');
    expect(checks(analysePerf(large(capped), readProfile(capped)).findings)).toEqual([]);
  });

  it('counts a cap the config computes, not only one written as a literal', () => {
    const computed = cleanRepo(1, {
      'vitest.config.ts': 'const maxWorkers = Math.max(1, cpus() * 0.85);\nexport default { test: { maxWorkers } };\n',
    });
    const large = run({ root: computed, files: [file(join(computed, 'src/case-0.spec.ts'), { tests: 90_000 })] });

    expect(checks(analysePerf(large, readProfile(computed)).findings)).toEqual([]);
  });

  it('says nothing about workers on a run that finishes in seconds', () => {
    const root = cleanRepo(1);
    const analysis = analysePerf(run({ root, files: [file(join(root, 'src/case-0.spec.ts'), { tests: 6_000 })] }), readProfile(root));

    expect(checks(analysis.findings)).not.toContain('perf-workers');
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

  const sourceOf = (root: string, over: Partial<PerfFile>): PerfSource => {
    writeTextFile(join(root, 'perf.json'), report(root, over));

    return readPerfRun({
      cwd: root,
      profile: readProfile(root),
      json: join(root, 'perf.json'),
      out: undefined,
      command: undefined,
      paths: [],
    });
  };

  const render = (root: string, over: Partial<PerfFile>, io: CliIo): number => renderPerf(sourceOf(root, over), readProfile(root), io);

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

    expect(renderPerf({ ok: true, run: source ?? run(), runFailed: true }, readProfile(root), io)).toBe(0);
    expect(io.stderr.join('\n')).toContain('The suite did not pass');
    expect(io.stdout.join('\n')).toContain('vitest-auto-spy perf —');
  });

  it('reports a report it cannot read on stderr, and exits 2', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source = readPerfRun({
      cwd: root,
      profile: readProfile(root),
      json: join(root, 'missing.json'),
      out: undefined,
      command: undefined,
      paths: [],
    });

    expect(renderPerf(source, readProfile(root), io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Not a perf report');
  });

  it('refuses to call a run in which no test body executed a measurement', () => {
    const root = cleanRepo(1);
    const io = recorder();

    expect(render(root, { testCount: 0, environment: 9_000, imports: 4_000 }, io)).toBe(2);

    const err = io.stderr.join('\n');

    expect(err).toContain('Nothing was measured: 1 test file was collected and 0 test bodies ran');
    expect(err).toContain('describe is not defined');
    expect(io.stdout).toEqual([]);
  });
});

describe('renderPerf --gate', () => {
  const GATE: GateOptions = { ...GATE_DEFAULTS };

  /**
   * Nine ordinary files and the ones the test is about. The file rule is relative to the median of
   * the run it is in, so a one-file run has no outlier in it by construction — which is the rule
   * working, and the reason every fixture here has a suite around its subject.
   */
  const gateRun = (root: string, files: readonly PerfFile[], wall = 1_000): PerfRun =>
    run({
      root,
      wall,
      files: [
        ...Array.from({ length: 9 }, (_unused, index) => file(join(root, `src/ordinary-${index}.spec.ts`), { tests: 100, testCount: 4 })),
        ...files,
      ],
    });

  const gateOf = (over: Partial<GateRequest> = {}): GateRequest => ({
    options: GATE,
    remeasure: undefined,
    trustSingle: false,
    ...over,
  });

  const spec = (root: string, name: string, over: Partial<PerfFile>): PerfFile => file(join(root, name), over);

  it('says so and exits 0 when nothing is over budget', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source: PerfSource = { ok: true, run: gateRun(root, [spec(root, 'src/case-0.spec.ts', { tests: 200 })]), runFailed: false };

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf() })).toBe(0);
    expect(io.stdout.join('\n')).toContain('perf gate: nothing over budget');
  });

  it('fails on a slow test body that is still slow when it is re-measured on its own', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = spec(root, 'src/case-0.spec.ts', { tests: 4_000, testCount: 3, cases: [{ name: 'suite > waits', ms: 3_900 }] });
    const source: PerfSource = { ok: true, run: gateRun(root, [slow]), runFailed: false };
    const remeasure = (): PerfSource => ({
      ok: true,
      run: run({ root, files: [spec(root, 'src/case-0.spec.ts', { tests: 3_800, cases: [{ name: 'suite > waits', ms: 3_700 }] })] }),
      runFailed: false,
    });

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf({ remeasure }) })).toBe(1);

    const out = io.stdout.join('\n');

    expect(out).toContain('perf gate: re-measuring 1 file');
    expect(out).toContain('error  perf-gate-slow-test src/case-0.spec.ts');
    expect(out).toContain('`suite > waits` spent 3.90s in its body');
    expect(out).toContain('Re-measured on its own: 3.70s, still over budget');
  });

  it('drops a candidate the second measurement does not reproduce, and exits 0', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = spec(root, 'src/case-0.spec.ts', { tests: 4_000, cases: [{ name: 'suite > unlucky', ms: 3_900 }] });
    const source: PerfSource = { ok: true, run: gateRun(root, [slow]), runFailed: false };
    const remeasure = (): PerfSource => ({
      ok: true,
      run: run({ root, files: [spec(root, 'src/case-0.spec.ts', { tests: 120, cases: [] })] }),
      runFailed: false,
    });

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf({ remeasure }) })).toBe(0);

    const out = io.stdout.join('\n');

    expect(out).toContain('info   perf-gate-slow-test');
    expect(out).toContain('not reported as a defect');
    expect(out).toContain('sharing a worker');
  });

  it('warns rather than fails when there was no way to confirm, unless --no-confirm said to trust it', () => {
    const root = cleanRepo(1);
    const slow = spec(root, 'src/case-0.spec.ts', { tests: 9_000, testCount: 4 });
    const source: PerfSource = { ok: true, run: gateRun(root, [slow]), runFailed: false };
    const warned = recorder();
    const trusted = recorder();

    expect(renderPerf(source, readProfile(root), warned, { gate: gateOf() })).toBe(0);
    expect(warned.stdout.join('\n')).toContain('warn   perf-gate-slow-file src/case-0.spec.ts');
    expect(warned.stdout.join('\n')).toContain('never confirmed');

    expect(renderPerf(source, readProfile(root), trusted, { gate: gateOf({ trustSingle: true }) })).toBe(1);
    expect(trusted.stdout.join('\n')).toContain('error  perf-gate-slow-file');
    expect(trusted.stdout.join('\n')).toContain('--no-confirm said that is enough');
  });

  it('says the confirmation pass itself failed, and confirms nothing', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = spec(root, 'src/case-0.spec.ts', { tests: 9_000 });
    const source: PerfSource = { ok: true, run: gateRun(root, [slow]), runFailed: false };
    const broken = (): PerfSource => ({ ok: false, error: 'no vitest here' });

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf({ remeasure: broken }) })).toBe(0);
    expect(io.stderr.join('\n')).toContain('The confirmation pass could not run');
    expect(io.stdout.join('\n')).toContain('never confirmed');
  });

  it('treats a confirmation pass that failed or ran nothing as no confirmation', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = spec(root, 'src/case-0.spec.ts', { tests: 9_000 });
    const source: PerfSource = { ok: true, run: gateRun(root, [slow]), runFailed: false };
    const red = (): PerfSource => ({
      ok: true,
      run: run({ root, files: [spec(root, 'src/case-0.spec.ts', { tests: 10 })] }),
      runFailed: true,
    });

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf({ remeasure: red }) })).toBe(0);
    expect(io.stderr.join('\n')).toContain('The confirmation pass did not pass');
  });

  it('refuses to judge a run that did not pass, and exits 2', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source: PerfSource = { ok: true, run: gateRun(root, [spec(root, 'src/case-0.spec.ts', { tests: 100 })]), runFailed: true };

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf() })).toBe(2);
    expect(io.stderr.join('\n')).toContain('does not judge a run that did not pass');
  });

  it('fails on an explicit whole-run budget without re-measuring anything', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source: PerfSource = {
      ok: true,
      run: gateRun(root, [spec(root, 'src/case-0.spec.ts', { tests: 100 })], 30_000),
      runFailed: false,
    };

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf({ options: { ...GATE, maxWallMs: 10_000 } }) })).toBe(1);
    expect(io.stdout.join('\n')).toContain('error  perf-gate-wall');
    expect(io.stdout.join('\n')).toContain('is not re-measured');
  });
});

describe('measuredNothing', () => {
  it('is true for a run with no files at all, and for one whose files ran nothing', () => {
    expect(measuredNothing(run())).toBe(true);
    expect(measuredNothing(run({ files: [file('/r/a.spec.ts', { testCount: 0, environment: 900 })] }))).toBe(true);
    expect(measuredNothing(run({ files: [file('/r/a.spec.ts', { testCount: 2 })] }))).toBe(false);
  });

  it('judges a version 1 report by the only evidence it carries', () => {
    const legacy = (tests: number): PerfRun => ({ ...run({ files: [file('/r/a.spec.ts', { tests, testCount: 0 })] }), version: 1 });

    expect(measuredNothing(legacy(0))).toBe(true);
    expect(measuredNothing(legacy(5))).toBe(false);
  });
});

describe('renderPerf, the wording of the two plurals', () => {
  it('counts files in the plural when more than one collected nothing', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const empty = run({
      root,
      files: [file(join(root, 'a.spec.ts'), { testCount: 0 }), file(join(root, 'b.spec.ts'), { testCount: 0 })],
    });

    expect(renderPerf({ ok: true, run: empty, runFailed: true }, readProfile(root), io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('2 test files were collected and 0 test bodies ran');
  });

  it('does not open a confirmation pass for a finding that names no file', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source: PerfSource = {
      ok: true,
      run: run({ root, wall: 30_000, files: [file(join(root, 'src/case-0.spec.ts'), { tests: 100 })] }),
      runFailed: false,
    };
    const remeasure = (): PerfSource => {
      throw new Error('the whole-run finding must not be re-measured');
    };

    expect(
      renderPerf(source, readProfile(root), io, {
        gate: { options: { ...GATE_DEFAULTS, maxWallMs: 10_000 }, remeasure, trustSingle: false },
      }),
    ).toBe(1);
    expect(io.stdout.join('\n')).not.toContain('re-measuring');
  });

  it('counts the re-measured files in the plural', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const ordinary = Array.from({ length: 9 }, (_unused, index) => file(join(root, `src/ordinary-${index}.spec.ts`), { tests: 100 }));
    const slow = ['src/a.spec.ts', 'src/b.spec.ts'].map((path) => file(join(root, path), { tests: 9_000 }));
    const source: PerfSource = { ok: true, run: run({ root, files: [...ordinary, ...slow] }), runFailed: false };
    const remeasure = (): PerfSource => ({ ok: true, run: run({ root, files: slow }), runFailed: false });

    expect(renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } })).toBe(1);
    expect(io.stdout.join('\n')).toContain('re-measuring 2 files on their own');
  });
});

describe('PerfReporter, ordering', () => {
  it('breaks a tie between two equally slow bodies by name, so the report is stable', () => {
    const bodies = [
      { fullName: 'b', diagnostic: () => ({ duration: 500 }) },
      { fullName: 'a', diagnostic: () => ({ duration: 500 }) },
    ];
    const report = new PerfReporter().report([
      {
        moduleId: '/repo/a.spec.ts',
        diagnostic: () => ({ environmentSetupDuration: 0, prepareDuration: 0, collectDuration: 0, setupDuration: 0, duration: 1_000 }),
        children: { allTests: () => bodies },
      },
    ]);

    expect(report.files[0]?.cases.map((entry) => entry.name)).toEqual(['a', 'b']);
  });
});

describe('the settings checks and where a runner config lives', () => {
  it('reads a config the builder owns, not only vitest.config at the root', () => {
    const root = cleanRepo(1, { 'tools/bench/vitest-runner.config.ts': 'export default { test: { isolate: false } };\n' });

    expect(declaresNoIsolation(buildGraph(readProfile(root)))).toBe(true);
  });

  it('still ignores a file that only looks like one', () => {
    const root = cleanRepo(1, { 'src/vitest-config-notes.ts': 'export const notes = "isolate: false";\n' });

    expect(declaresNoIsolation(buildGraph(readProfile(root)))).toBe(false);
  });
});

describe('renderPerf, a report measured somewhere else', () => {
  const elsewhere = (prefix: string): PerfRun =>
    run({
      root: prefix,
      wall: 1_000,
      files: [`${prefix}/src/case-0.spec.ts`, `${prefix}/src/case-1.spec.ts`].map((path) => file(path, { tests: 100 })),
    });

  it('re-bases the paths onto the working directory, because CI clones somewhere else than a laptop', () => {
    const root = cleanRepo(2);
    const io = recorder();
    const source: PerfSource = { ok: true, run: elsewhere('/builds/group/project'), runFailed: false };

    expect(renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure: undefined, trustSingle: false } })).toBe(
      0,
    );
    expect(io.stdout.join('\n')).toContain('perf gate: nothing over budget');
  });

  it('refuses when even the report’s own root does not place the files here, instead of printing an all-clear', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const orphan = run({ root: '', wall: 1_000, files: [file('/elsewhere/src/a.spec.ts', { tests: 9_000 })] });

    expect(
      renderPerf({ ok: true, run: orphan, runFailed: false }, readProfile(root), io, {
        gate: { options: GATE_DEFAULTS, remeasure: undefined, trustSingle: false },
      }),
    ).toBe(2);
    expect(io.stderr.join('\n')).toContain('None of the 1 measured files is inside');
    expect(io.stderr.join('\n')).toContain('records no root of its own');
    expect(io.stdout).toEqual([]);
  });

  it('names the root it was written under when it has one', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const orphan = run({ root: '/builds/group/project', wall: 1_000, files: [file('/elsewhere/src/a.spec.ts', { tests: 10 })] });

    expect(renderPerf({ ok: true, run: orphan, runFailed: false }, readProfile(root), io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('written under /builds/group/project');
  });
});

describe('renderPerf --gate, the scope and the confirmation it was given', () => {
  const runWith = (root: string, files: readonly PerfFile[]): PerfRun => run({ root, wall: 1_000, files });

  const ordinary = (root: string): PerfFile[] =>
    Array.from({ length: 9 }, (_unused, index) => file(join(root, `src/ordinary-${index}.spec.ts`), { tests: 100 }));

  it('refuses a --gate-only that matches nothing this run measured', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source: PerfSource = { ok: true, run: runWith(root, ordinary(root)), runFailed: false };

    expect(
      renderPerf(source, readProfile(root), io, {
        gate: { options: { ...GATE_DEFAULTS, only: ['libs/nothing-here'] }, remeasure: undefined, trustSingle: false },
      }),
    ).toBe(2);
    expect(io.stderr.join('\n')).toContain('libs/nothing-here');
    expect(io.stdout.join('\n')).not.toContain('nothing over budget');
  });

  it('confirms nothing when the command ignored the paths and re-ran the whole suite', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = file(join(root, 'src/slow.spec.ts'), { tests: 9_000 });
    const whole = runWith(root, [...ordinary(root), slow]);
    const source: PerfSource = { ok: true, run: whole, runFailed: false };
    const remeasure = (): PerfSource => ({ ok: true, run: whole, runFailed: false });

    expect(renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } })).toBe(0);
    expect(io.stderr.join('\n')).toContain('ignored the paths it was given');
    expect(io.stdout.join('\n')).toContain('never confirmed');
  });
});

describe('measuredNothing, the second half of the evidence', () => {
  it('does not accuse a report whose runner exposed no test collection', () => {
    const noRows = run({ files: [file('/r/a.spec.ts', { testCount: 0, tests: 21_000 })] });

    expect(measuredNothing(noRows)).toBe(false);
    expect(measuredNothing(run({ files: [file('/r/a.spec.ts', { testCount: 0, tests: 0, environment: 900 })] }))).toBe(true);
  });
});

describe('renderPerf, the tables and the notes around the phases', () => {
  const bigRun = (root: string): PerfRun =>
    run({
      root,
      wall: 20_000,
      files: [
        ...Array.from({ length: 9 }, (_unused, index) => file(join(root, `src/ordinary-${index}.spec.ts`), { tests: 200, testCount: 10 })),
        file(join(root, 'src/case-0.spec.ts'), { tests: 4_000, testCount: 8, cases: [{ name: 'suite > waits', ms: 900 }] }),
      ],
    });

  it('prints the hotspot tables after the phase table, and drops them when asked for no rows', () => {
    const root = cleanRepo(1);
    const shown = recorder();
    const hidden = recorder();
    const source: PerfSource = { ok: true, run: bigRun(root), runFailed: false };

    expect(renderPerf(source, readProfile(root), shown)).toBe(0);
    expect(shown.stdout.join('\n')).toContain('slowest files');
    expect(shown.stdout.join('\n')).toContain('src/case-0.spec.ts');

    expect(renderPerf(source, readProfile(root), hidden, { top: 0 })).toBe(0);
    expect(hidden.stdout.join('\n')).not.toContain('slowest files');
  });

  it('says why a run asked for rows got none, and stays quiet about it when nobody asked', () => {
    const root = cleanRepo(1);
    const asked = recorder();
    const silent = recorder();
    const quick: PerfSource = {
      ok: true,
      run: run({ root, wall: 900, files: [file(join(root, 'src/quick.spec.ts'), { tests: 40, testCount: 8 })] }),
      runFailed: false,
    };

    expect(renderPerf(quick, readProfile(root), asked, { top: 15 })).toBe(0);
    expect(asked.stdout.join('\n')).toContain('No hotspot tables: the slowest file spent 40ms');

    expect(renderPerf(quick, readProfile(root), silent)).toBe(0);
    expect(silent.stdout.join('\n')).not.toContain('No hotspot tables');
  });

  it('prints what the source had to say about itself, when it had something', () => {
    const root = cleanRepo(1);
    const io = recorder();

    expect(renderPerf({ ok: true, run: bigRun(root), runFailed: false, note: 'merged 3 reports' }, readProfile(root), io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('merged 3 reports');
  });
});

describe('renderPerf --baseline', () => {
  const measured = (root: string, slow: number): PerfRun =>
    run({
      root,
      wall: 5_000,
      files: [
        ...Array.from({ length: 9 }, (_unused, index) => file(join(root, `src/ordinary-${index}.spec.ts`), { tests: 100, testCount: 10 })),
        file(join(root, 'src/grew.spec.ts'), { tests: slow, testCount: 10 }),
      ],
    });

  it('records a baseline and says what it wrote, without judging anything', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const path = join(root, 'perf-baseline.json');

    expect(
      renderPerf({ ok: true, run: measured(root, 300), runFailed: false }, readProfile(root), io, {
        baseline: { path, update: true, options: BASELINE_DEFAULTS },
      }),
    ).toBe(0);
    expect(pathExists(path)).toBe(true);
    expect(io.stdout.join('\n')).toContain('perf baseline: recorded 10 files');
  });

  it('fails the gate on a file that grew against it, and confirms that the way it confirms anything else', () => {
    const root = cleanRepo(1);
    const path = join(root, 'perf-baseline.json');
    const recording = recorder();

    renderPerf({ ok: true, run: measured(root, 300), runFailed: false }, readProfile(root), recording, {
      baseline: { path, update: true, options: BASELINE_DEFAULTS },
    });

    const io = recorder();
    const grown = measured(root, 3_000);
    const remeasure = (): PerfSource => ({
      ok: true,
      run: run({ root, files: [file(join(root, 'src/grew.spec.ts'), { tests: 2_900 })] }),
      runFailed: false,
    });

    expect(
      renderPerf({ ok: true, run: grown, runFailed: false }, readProfile(root), io, {
        baseline: { path, update: false, options: BASELINE_DEFAULTS },
        gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false },
      }),
    ).toBe(1);

    const out = io.stdout.join('\n');

    expect(out).toContain('error  perf-gate-regression src/grew.spec.ts');
    expect(out).toContain('the share of the run they took when the baseline was recorded');
  });

  it('reports what drifted, and says so when there is no baseline to read at all', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const path = join(root, 'perf-baseline.json');

    renderPerf({ ok: true, run: measured(root, 300), runFailed: false }, readProfile(root), recorder(), {
      baseline: { path, update: true, options: BASELINE_DEFAULTS },
    });

    const withNewFile = run({
      root,
      files: [...measured(root, 300).files, file(join(root, 'src/new.spec.ts'), { tests: 100, testCount: 3 })],
    });

    expect(
      renderPerf({ ok: true, run: withNewFile, runFailed: false }, readProfile(root), io, {
        baseline: { path, update: false, options: BASELINE_DEFAULTS },
      }),
    ).toBe(0);
    expect(io.stdout.join('\n')).toContain('1 files this run measured are not in it');

    const missing = recorder();

    expect(
      renderPerf({ ok: true, run: measured(root, 300), runFailed: false }, readProfile(root), missing, {
        baseline: { path: join(root, 'nowhere.json'), update: false, options: BASELINE_DEFAULTS },
      }),
    ).toBe(0);
    expect(missing.stderr.join('\n')).toContain('No baseline to compare against');
  });

  it('reports a regression without a gate as a finding that fails nothing', () => {
    const root = cleanRepo(1);
    const path = join(root, 'perf-baseline.json');

    renderPerf({ ok: true, run: measured(root, 300), runFailed: false }, readProfile(root), recorder(), {
      baseline: { path, update: true, options: BASELINE_DEFAULTS },
    });

    const io = recorder();

    expect(
      renderPerf({ ok: true, run: measured(root, 3_000), runFailed: false }, readProfile(root), io, {
        baseline: { path, update: false, options: BASELINE_DEFAULTS },
      }),
    ).toBe(0);
    expect(io.stdout.join('\n')).toContain('perf-gate-regression');
  });
});

describe('readPerfRun, the two shapes a handed-over report can have', () => {
  const options = (root: string, over: Partial<PerfRunOptions> = {}): PerfRunOptions => ({
    cwd: root,
    profile: readProfile(root),
    json: undefined,
    out: undefined,
    command: undefined,
    paths: [],
    ...over,
  });

  it('knows a handed-over report was written by a run that failed', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'perf.json': JSON.stringify(run({ failed: 2, files: [file('/r/a.spec.ts', { tests: 30_000, testCount: 4 })] })),
    });
    const source = readPerfRun(options(root, { json: join(root, 'perf.json') }));

    expect(source).toMatchObject({ ok: true, runFailed: true });
  });

  it('merges every report a sharded pipeline wrote, and says it did', () => {
    const shard = (spec: string): string =>
      JSON.stringify(
        run({ root: '/builds/project', transform: 100, wall: 1_000, files: [file(`/builds/project/${spec}`, { tests: 50 })] }),
      );
    const root = createTempRepo({
      'package.json': '{}',
      'coverage/shard-1/perf.json': shard('src/a.spec.ts'),
      'coverage/shard-2/perf.json': shard('src/b.spec.ts'),
    });
    const source = readPerfRun(options(root, { json: 'coverage/**/perf.json' }));

    expect(source.ok && source.run.files).toHaveLength(2);
    expect(source.ok && source.run.transform).toBe(200);
    expect(source.ok ? source.note : '').toContain('2');
  });

  it('refuses to start a second measurement from inside a measured run', () => {
    const root = createTempRepo({ 'package.json': '{}', 'vitest.config.ts': 'export default {};\n', 'dist/perf-reporter.js': '' });

    process.env[PERF_OUTPUT_ENV] = join(root, 'outer.json');

    try {
      const source = readPerfRun(options(root, { command: 'npm test' }), () => ({ status: 0 }), root);

      expect(source.ok ? '' : source.error).toContain('is already set');
    } finally {
      delete process.env[PERF_OUTPUT_ENV];
    }
  });
});

describe('shellQuote', () => {
  it('quotes for the shell it will actually run in, which is not the same shell on Windows', () => {
    expect(shellQuote("a b'c.spec.ts", 'linux')).toBe("'a b'\\''c.spec.ts'");
    expect(shellQuote('a b"c.spec.ts', 'win32')).toBe('"a b""c.spec.ts"');
  });
});

describe('renderPerf --gate-only, a scope that is partly right', () => {
  it('says which entries matched nothing when some of them did match', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const measured = run({
      root,
      wall: 1_000,
      files: [file(join(root, 'src/case-0.spec.ts'), { tests: 100 })],
    });

    expect(
      renderPerf({ ok: true, run: measured, runFailed: false }, readProfile(root), io, {
        gate: { options: { ...GATE_DEFAULTS, only: ['src', 'libs/gone'] }, remeasure: undefined, trustSingle: false },
      }),
    ).toBe(2);
    expect(io.stderr.join('\n')).toContain('paths this run did not measure: libs/gone');
  });
});

describe('readPerfRun, a pattern that matched nothing', () => {
  it('names the pattern rather than an empty list of files', () => {
    const root = createTempRepo({ 'package.json': '{}', 'coverage/shard-1/': '' });
    const source = readPerfRun({
      cwd: root,
      profile: readProfile(root),
      json: 'coverage/**/perf-*.json',
      out: undefined,
      command: undefined,
      paths: [],
    });

    expect(source.ok ? '' : source.error).toContain('Not a perf report: coverage/**/perf-*.json');
  });
});

describe('the isolation finding and a builder that already decided', () => {
  it('stays quiet in a workspace whose builder runs without per-file isolation', () => {
    const heavy = (root: string): PerfRun =>
      run({ root, files: [file(join(root, 'src/case-0.spec.ts'), { setup: 4_000, prepare: 4_000, tests: 100, testCount: 4 })] });
    const plain = cleanRepo(1);
    const builder = cleanRepo(1, {
      'angular.json': JSON.stringify({ projects: { bench: { architect: { test: { builder: '@angular/build:unit-test' } } } } }),
    });

    expect(checks(analysePerf(heavy(plain), readProfile(plain)).findings)).toContain('perf-isolation');
    expect(checks(analysePerf(heavy(builder), readProfile(builder)).findings)).not.toContain('perf-isolation');
  });
});
