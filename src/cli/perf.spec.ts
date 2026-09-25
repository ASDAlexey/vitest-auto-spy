/**
 * `perf`, end to end and rule by rule.
 *
 * Two things are pinned harder than the rest. The **DOM-free rule** is pinned from both sides on
 * every input that could make it wrong, because a false positive there is somebody's suite failing
 * on `document is not defined` — the rule is allowed to say "undecided" about anything, and never
 * allowed to be wrong. And the **numbers** are pinned to what the reporter read, because a perf
 * tool that rounds, guesses or invents is worse than no perf tool.
 *
 * The reporter's own rules live in `perf-reporter.spec.ts`, the gate's in `perf-gate.spec.ts` and
 * the baseline's in `perf-baseline.spec.ts`; this file keeps the run source, the analysis rules
 * and the rendering that crosses them.
 */
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findBarrelImports, isBarrel, reachOf } from './checks/barrels';
import { DOM_FREE_RULE, findDomFreeSpecs, packageOf, readAliases } from './checks/dom-free';
import { buildGraph } from './checks/graph';
import { pathExists, writeTextFile } from './fs-scan';
import type { CliIo } from './main';
import { analysePerf, declaresNoIsolation, formatPhases, nothingToDo, renderPerf } from './perf';
import type { PerfFile, PerfRun } from './perf-data';
import {
  PERF_OUTPUT_ENV,
  PERF_PROFILE_ENV,
  PERF_REPORTER_ENV,
  environmentOf,
  formatMs,
  formatShare,
  measuredNothing,
  parsePerfRun,
  phasesOf,
  shareOf,
  totalOf,
} from './perf-data';
import { cleanRepo, file, recorder, run } from './perf-fixtures';
import { GATE_DEFAULTS } from './perf-gate';
import type { PerfRunOptions, PerfSource, Spawn, SpawnRequest } from './perf-run';
import {
  commandTakesPaths,
  perfRemeasure,
  readPerfRun,
  reporterPath,
  shellQuote,
  spawnProcess,
  spawnToStderr,
  withPaths,
} from './perf-run';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

// Under `vitest-auto-spy perf` these are set for the whole suite, and readPerfRun reads them.
beforeEach(() => {
  vi.stubEnv(PERF_OUTPUT_ENV, undefined);
  vi.stubEnv(PERF_PROFILE_ENV, undefined);
  vi.stubEnv(PERF_REPORTER_ENV, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  removeTempRepos();
});

const checks = (findings: readonly { check: string }[]): string[] => findings.map((finding) => finding.check);

/**
 * A run in which environment setup dominates and every spec cost the same. One environment per file,
 * which is what `isolate: true` produces — the analysis counts an environment once per distinct
 * value, because Vitest repeats a single worker's number across the files that worker ran.
 */
function heavyRun(root: string, specs: readonly string[], environment: number): PerfRun {
  return run({
    root,
    transform: 100,
    wall: 1_000,
    files: specs.map((spec, index) => file(join(root, spec), { environment: environment - index, tests: 10 })),
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
    expect(parsePerfRun('{"version":4,"files":[]}')).toBeUndefined();
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

  it('counts an environment once per worker, not once per file', () => {
    // Three files, two workers: Vitest copies one worker's number into every file it ran, so the
    // 300 here is two environments of 100 and 200 — not the 500 a plain sum would report.
    const files = [
      file('/r/a.spec.ts', { environment: 100, tests: 10 }),
      file('/r/b.spec.ts', { environment: 100, tests: 10 }),
      file('/r/c.spec.ts', { environment: 200, tests: 10 }),
    ];

    expect(environmentOf(files)).toBe(300);
    expect(phasesOf(run({ files })).find((phase) => phase.name === 'environment')?.ms).toBe(300);
  });

  it('counts a single environment once however many files shared it', () => {
    const files = Array.from({ length: 20 }, (_unused, index) => file(`/r/case-${index}.spec.ts`, { environment: 50, tests: 1 }));

    expect(environmentOf(files)).toBe(50);
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

describe('spawnToStderr', () => {
  it('runs the command and returns its status, with the suite printing to stderr', () => {
    expect(spawnToStderr({ command: 'exit 3', args: [], cwd: process.cwd(), env: {}, shell: true }).status).toBe(3);
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
    expect(source.ok ? '' : source.error.split('\n')).toEqual([
      "A bare `vitest run` would not measure this repository's suite: there is no vitest.config or vite.config at the root, and `npm test` is `node tools/bench/run.mjs`. Without a config every file fails to collect, so the timings would measure nothing.",
      'Attach the perf reporter where the Vitest config of your suite declares `reporters`:',
      `  const perf = process.env['${PERF_REPORTER_ENV}'];`,
      "  reporters: perf === undefined ? ['default'] : ['default', perf],",
      'Then measure the command that runs it:',
      "  npx vitest-auto-spy perf --command 'npm test'",
      'Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#when-a-bare-run-is-not-your-suite',
    ]);
  });

  it('names the builder recipe when the suite runs through the Angular unit-test builder', () => {
    const nx = createTempRepo({
      'package.json': '{}',
      'libs/ui/project.json': JSON.stringify({ name: 'ui', targets: { test: { executor: '@nx/angular:unit-test' } } }),
    });
    const ng = createTempRepo({
      'package.json': '{}',
      'angular.json': JSON.stringify({ projects: { app: { architect: { test: { builder: '@angular/build:unit-test' } } } } }),
    });
    const error = (root: string): string => {
      const source = readPerfRun(options(root));

      return source.ok ? '' : source.error;
    };

    expect(error(nx).split('\n').slice(1)).toEqual([
      '`ui:test` in libs/ui/project.json runs through `@nx/angular:unit-test`, which takes the perf reporter as an option. Measure it with:',
      `  npx vitest-auto-spy perf --command 'npx nx run ui:test --reporters=default --reporters="$VITEST_AUTO_SPY_PERF_REPORTER" {paths:--include=}'`,
      'Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#when-a-bare-run-is-not-your-suite',
    ]);
    expect(error(nx)).not.toContain("--command 'npm test'");
    expect(error(ng)).toContain("perf --command 'npx ng run app:test --reporters=default");
  });

  it('says which of the two it saw when there is no test script at all', () => {
    const root = createTempRepo({ 'package.json': '{}' });
    const source = readPerfRun(options(root));

    expect(source.ok ? '' : source.error).toContain('there is no `test` script');
    expect(source.ok ? '' : source.error).toContain(
      "Then measure the command that runs your suite:\n  npx vitest-auto-spy perf --command '<command that runs your suite>'",
    );
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
      '--logHeapUsage',
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

  it('says so when the run wrote nothing, and tells a failed run from a reporter that never ran', () => {
    const root = runnable();
    const failedRun = readPerfRun(options(root), () => ({ status: 2 }), root);
    const quiet = readPerfRun(options(root), () => ({ status: 0 }), root);

    expect(failedRun.ok ? '' : failedRun.error).toBe(
      '`vitest run` exited 2 before writing a perf report, so the run itself failed. Make it pass, then measure again.\nDocs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#when-there-is-nothing-to-read',
    );
    expect(quiet.ok ? '' : quiet.error).toContain('`vitest run` exited 0 but wrote no perf report, so the perf reporter did not run.');
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

  it('tells a command that passed without a report how to attach the reporter', () => {
    const root = runnable();
    const source = readPerfRun(options(root, { command: 'npm test' }), () => ({ status: 0 }), root);
    const lines = (source.ok ? '' : source.error).split('\n');

    expect(lines[0]).toBe(
      '`npm test` exited 0 but wrote no perf report, so the Vitest config it reaches does not attach the perf reporter. Add it where that config declares `reporters`:',
    );
    expect(lines[1]).toContain(PERF_REPORTER_ENV);
    expect(lines.at(-1)).toBe('Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#when-a-bare-run-is-not-your-suite');
  });

  it('tells a command that failed without a report to fix the run, naming the command', () => {
    const root = runnable();
    const source = readPerfRun(options(root, { command: 'npm test -- {paths}', paths: ['a.spec.ts'] }), () => ({ status: 1 }), root);

    expect(source.ok ? '' : source.error).toContain(
      "`npm test -- 'a.spec.ts'` exited 1 before writing a perf report, so the run itself failed. Make it pass, then measure again.",
    );
    expect(source.ok ? '' : source.error).not.toContain('reporters:');
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
    expect(analysis.findings[0]?.fix).toBe('Move the files listed below to the `node` environment.');
    expect(analysis.findings.every((finding) => finding.severity === 'info')).toBe(true);
  });

  it('says a move frees nothing while a DOM-using file shares the worker', () => {
    const root = cleanRepo(1, { 'src/dom.spec.ts': `import { it } from 'vitest';\n\nit('x', () => {\n  document.title = '';\n});\n` });
    // One environment value across both files is one worker running both: the DOM-using one rebuilds
    // the environment whatever happens to its neighbour, so moving the neighbour buys nothing.
    const shared = run({
      root,
      transform: 100,
      wall: 1_000,
      files: [
        file(join(root, 'src/case-0.spec.ts'), { environment: 9_000, tests: 10 }),
        file(join(root, 'src/dom.spec.ts'), { environment: 9_000, tests: 10 }),
      ],
    });
    const analysis = analysePerf(shared, readProfile(root));

    expect(checks(analysis.findings)).toContain('perf-environment');
    expect(analysis.findings[0]?.message).toContain('frees no environment');
    expect(analysis.findings[0]?.message).not.toContain('moving them frees');
  });

  it('prices the move when a whole worker is DOM-free, breaking ties by name', () => {
    const root = cleanRepo(2);
    // One environment value across both files is one worker whose every file is DOM-free: moving
    // both actually retires that environment, and equally expensive candidates come out by name.
    const shared = run({
      root,
      transform: 100,
      wall: 1_000,
      files: [
        file(join(root, 'src/case-1.spec.ts'), { environment: 9_000, tests: 10 }),
        file(join(root, 'src/case-0.spec.ts'), { environment: 9_000, tests: 10 }),
      ],
    });
    const analysis = analysePerf(shared, readProfile(root));
    const environment = analysis.findings.filter((finding) => finding.check === 'perf-environment-node-candidate');

    expect(environment.map((finding) => finding.file)).toEqual(['src/case-0.spec.ts', 'src/case-1.spec.ts']);
    expect(analysis.findings[0]?.message).toContain('2 spec files reach no DOM');
    expect(analysis.findings[0]?.message).toContain('moving them frees');
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
    expect(analysis.findings[0]?.fix).toBe('Nothing can move until a spec is proved DOM-free; the docs say what the rule reads.');
  });

  it('points at the setup files when they are what keeps every spec on the DOM', () => {
    const root = cleanRepo(1, {
      'vitest.config.ts': "export default { test: { setupFiles: ['./src/test-setup.ts'] } };\n",
      'src/test-setup.ts': "document.title = '';\n",
    });
    const analysis = analysePerf(heavyRun(root, ['src/case-0.spec.ts'], 9_000), readProfile(root));

    expect(analysis.findings[0]?.fix).toBe(
      'Nothing can move while every spec loads `src/test-setup.ts`: a setup file that mentions a DOM name keeps every spec on the DOM. Move the DOM part of it into a setup file only the DOM specs load.',
    );
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

    const engine = analysePerf(heavyRun(jsdom, ['src/case-0.spec.ts'], 9_000), readProfile(jsdom)).findings.find(
      (finding) => finding.check === 'perf-environment-engine',
    );

    expect(engine?.message).toMatch(/^vitest\.config\.ts sets `environment: 'jsdom'`, and building the DOM is/);
    expect(engine?.fix).toBe(
      "Try `environment: 'happy-dom'` in vitest.config.ts, one project at a time with the suite green after each: it builds the DOM for less, and implements less of the platform.",
    );
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

    const cores = availableParallelism();

    expect(checks(analysis.findings)).toEqual(['perf-workers']);
    expect(analysis.findings[0]?.message).toBe(
      `No \`maxWorkers\` is declared, so Vitest starts one worker per core — ${cores} on this machine, each a whole runtime with its own memory.`,
    );
    expect(analysis.findings[0]?.fix).toBe(
      `If the run shares this machine, set \`maxWorkers: ${Math.max(1, Math.floor(cores / 2))}\` in your Vitest config and compare the wall clock before and after.`,
    );
    expect(checks(analysePerf(large(capped), readProfile(capped)).findings)).toEqual([]);

    const configured = cleanRepo(1, {
      'vitest.bench.config.ts': 'export default { test: {} };\n',
      'vitest.config.ts': 'export default { test: {} };\n',
      'libs/a/vitest.config.ts': 'export default { test: {} };\n',
      'libs/b/vitest.config.ts': 'export default { test: {} };\n',
    });

    expect(analysePerf(large(configured), readProfile(configured)).findings[0]?.fix).toContain('in vitest.config.ts and compare');
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
    expect(analysis.findings[0]?.fix).toBe(
      'Try `isolate: false` in your Vitest config and keep it only if peak memory stays acceptable: without isolation, every double a file creates lives until its worker ends.',
    );
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

  it('says in --format json how the gate could confirm, and carries a whole-run budget when one was set', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const remeasure = (): PerfSource => ({ ok: false, error: 'no second run' });
    const gate = { options: { ...GATE_DEFAULTS, maxWallMs: 60_000 }, remeasure, trustSingle: false };

    expect(renderPerf(sourceOf(root, { tests: 100, testCount: 1 }), readProfile(root), io, { gate, format: 'json' })).toBe(0);
    expect(JSON.parse(io.stdout.join(''))).toMatchObject({
      budgets: { maxWallMs: 60_000 },
      gate: { status: 'judged', confirmation: 'remeasure', verdicts: [] },
    });

    const plain = recorder();

    renderPerf(sourceOf(root, { tests: 100, testCount: 1 }), readProfile(root), plain, { format: 'json' });

    expect(JSON.parse(plain.stdout.join(''))).toMatchObject({ gate: null, budgets: { maxWallMs: null } });
  });

  it('lists the slowest files in --format json, relative, per phase, bounded by --top', () => {
    const root = cleanRepo(1);
    const rows = (top?: number): unknown => {
      const io = recorder();

      renderPerf(sourceOf(root, { environment: 30, setup: 20, tests: 100, testCount: 4 }), readProfile(root), io, {
        format: 'json',
        ...(top === undefined ? {} : { top }),
      });

      return (JSON.parse(io.stdout.join('')) as { run: { slowestFiles: unknown } }).run.slowestFiles;
    };

    expect(rows()).toEqual([
      {
        file: 'src/case-0.spec.ts',
        totalMs: 150,
        tests: 4,
        phases: { environment: 30, prepare: 0, setup: 20, import: 0, tests: 100 },
      },
    ]);
    expect(rows(0)).toEqual([]);
  });

  it('prints the phase table and the findings', () => {
    const io = recorder();

    expect(render(cleanRepo(1), { environment: 9_000, tests: 100 }, io)).toBe(0);

    const out = io.stdout.join('\n');

    expect(out).toContain('vitest-auto-spy perf —');
    expect(out).toContain('1 test file, 1 test, 1.23s wall clock');
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
    expect(io.stderr.join('\n')).toContain('Cannot read the perf report: missing.json does not exist.');
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

describe('renderPerf, the wording of the plural', () => {
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

describe('renderPerf, a report whose files sit elsewhere', () => {
  it('names the root it was written under when it has one', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const orphan = run({ root: '/builds/group/project', wall: 1_000, files: [file('/elsewhere/src/a.spec.ts', { tests: 10 })] });

    expect(renderPerf({ ok: true, run: orphan, runFailed: false }, readProfile(root), io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('written under /builds/group/project');
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
        file(join(root, 'src/case-0.spec.ts'), { tests: 45_000, testCount: 8, cases: [{ name: 'suite > waits', ms: 1_200 }] }),
      ],
    });

  it('prints only what is over budget, at the bottom of the report, and drops it when asked for no rows', () => {
    const root = cleanRepo(1);
    const shown = recorder();
    const hidden = recorder();
    const source: PerfSource = { ok: true, run: bigRun(root), runFailed: false };

    expect(renderPerf(source, readProfile(root), shown)).toBe(0);

    const out = shown.stdout.join('\n');

    expect(out).toContain('files over budget');
    expect(out).toContain('test bodies over budget');
    expect(out).not.toContain('src/ordinary-0.spec.ts');
    expect(out.indexOf('files over budget')).toBeGreaterThan(out.indexOf('phase'));

    expect(renderPerf(source, readProfile(root), hidden, { top: 0 })).toBe(0);
    expect(hidden.stdout.join('\n')).not.toContain('over budget');
  });

  it('prints what the source had to say about itself, when it had something', () => {
    const root = cleanRepo(1);
    const io = recorder();

    expect(renderPerf({ ok: true, run: bigRun(root), runFailed: false, note: 'merged 3 reports' }, readProfile(root), io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('merged 3 reports');
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

  it('tells a file that is not JSON, JSON that is not a report and a report of another version apart', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'reports/a.json': 'not json',
      'reports/b.json': '{"version": 3}',
      'reports/c.json': '{"version": 9, "files": []}',
    });
    const single = readPerfRun(options(root, { json: 'reports/c.json' }));
    const several = readPerfRun(options(root, { json: 'reports' }));

    expect(single.ok ? '' : single.error.split('\n')[0]).toBe(
      'Cannot read the perf report: reports/c.json is version 9 of the perf report format, and this build reads versions 1, 2, 3.',
    );
    expect(several.ok ? '' : several.error.split('\n')).toEqual([
      'Cannot read any of the 3 perf reports:',
      '  reports/a.json is not valid JSON',
      '  reports/b.json is JSON, but not a perf report: it has no `files` list',
      '  reports/c.json is version 9 of the perf report format, and this build reads versions 1, 2, 3',
      'Point --json at the file `perf --out` or the perf reporter wrote.',
      'Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#when-there-is-nothing-to-read',
    ]);

    const unversioned = createTempRepo({ 'package.json': '{}', 'perf.json': '{"files": []}' });

    expect(readPerfRun(options(unversioned, { json: 'perf.json' }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('is version unknown'),
    });
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

    expect(source.ok ? '' : source.error).toContain('--json coverage/**/perf-*.json matches no report file.');
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
