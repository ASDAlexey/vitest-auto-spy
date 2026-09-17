/**
 * The confirmation pass's evidence, end to end through the CLI: the profile directory handed to the
 * run, the profiles it left read back, and the lines a confirmed finding prints from them. A finding
 * the second reading did not confirm must print none of it — its profile explains a file that was
 * not slow.
 */
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeTextFile } from './fs-scan';
import type { CliIo } from './main';
import { renderPerf } from './perf';
import type { PerfFile, PerfRun } from './perf-data';
import { PERF_OUTPUT_ENV, PERF_PROFILE_ENV } from './perf-data';
import { GATE_DEFAULTS } from './perf-gate';
import type { CpuProfile } from './perf-profile';
import type { PerfRunOptions, PerfSource, Spawn } from './perf-run';
import { perfRemeasure } from './perf-run';
import { readProfile } from './profile';
import { formatFindings } from './report';
import { createTempRepo, removeTempRepos } from './temp-repo';

beforeEach(() => {
  vi.stubEnv('NO_COLOR', '1');
});

afterEach(() => {
  vi.unstubAllEnvs();
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

const run = (root: string, files: readonly PerfFile[]): PerfRun => ({ version: 2, root, transform: 0, wall: 1_000, failed: 0, files });

function recorder(): CliIo & { readonly stdout: string[] } {
  const stdout: string[] = [];

  return { stdout, out: (line) => stdout.push(line), err: () => undefined };
}

/** Two samples of 3 ms: one inside a hook through `setUp` in the spec, one in a package. */
const profileOf = (specPath: string): CpuProfile => ({
  nodes: [
    { id: 1, callFrame: { functionName: '(root)', url: '' }, children: [2, 5] },
    { id: 2, callFrame: { functionName: 'callSuiteHook', url: '/repo/node_modules/@vitest/runner/dist/index.js' }, children: [3] },
    { id: 3, callFrame: { functionName: 'setUp', url: specPath }, children: [4] },
    { id: 4, callFrame: { functionName: 'refreshView', url: '/repo/node_modules/@angular/core/fesm2022/core.mjs' } },
    { id: 5, callFrame: { functionName: 'render', url: specPath } },
  ],
  samples: [4, 5],
  timeDeltas: [3_000, 3_000],
});

describe('perfRemeasure, the profile half', () => {
  it('hands the run a profile directory and brings back the profiles it left, keyed by spec file', () => {
    const root = createTempRepo({ 'package.json': '{}', 'vitest.config.ts': 'export default {};\n', 'dist/perf-reporter.js': '' });
    const specPath = join(root, 'src/a.spec.ts');
    const options: PerfRunOptions = {
      cwd: root,
      profile: readProfile(root),
      json: undefined,
      out: undefined,
      command: 'npm test -- {paths}',
      paths: [],
    };
    let handed = '';
    const spawn: Spawn = (request) => {
      handed = request.env[PERF_PROFILE_ENV] ?? '';
      writeTextFile(join(handed, '1.json'), JSON.stringify({ file: specPath, profile: profileOf(specPath) }));
      writeTextFile(request.env[PERF_OUTPUT_ENV] ?? '', JSON.stringify(run(root, [file(specPath, { tests: 1 })])));

      return { status: 0 };
    };
    const second = perfRemeasure(options, spawn, root)?.(['src/a.spec.ts']);

    expect(handed).toContain(join('node_modules', '.cache', 'vitest-auto-spy', 'profiles-'));
    expect(second?.ok === true ? [...(second.profiles?.keys() ?? [])] : []).toEqual([specPath]);
  });
});

describe('renderPerf --gate, why a confirmed file is slow', () => {
  const ordinary = (root: string): PerfFile[] =>
    Array.from({ length: 9 }, (_unused, index) => file(join(root, `src/ordinary-${index}.spec.ts`), { tests: 100, testCount: 40 }));

  it('prints the slowest tests and where the profile says the time went, between the message and the fix', () => {
    const root = createTempRepo({ 'package.json': '{}', 'src/slow.spec.ts': 'test("x", () => {});\n' });
    const specPath = join(root, 'src/slow.spec.ts');
    const source: PerfSource = {
      ok: true,
      run: run(root, [...ordinary(root), file(specPath, { tests: 9_000, testCount: 30 })]),
      runFailed: false,
    };
    const remeasure = (): PerfSource => ({
      ok: true,
      runFailed: false,
      run: run(root, [
        file(specPath, {
          tests: 8_000,
          testCount: 30,
          cases: [
            { name: 'renders', ms: 40 },
            { name: 'opens the menu', ms: 90 },
            { name: 'closes it', ms: 60 },
            { name: 'focuses', ms: 10 },
            { name: 'blurs', ms: 10 },
          ],
        }),
      ]),
      profiles: new Map([[specPath, profileOf(specPath)]]),
    });
    const io = recorder();

    expect(renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } })).toBe(1);

    const out = io.stdout.join('\n');

    expect(out).toContain('       │ first run      9.00s   budget 5.00s   1.8× over');
    expect(out).toContain('       │ on its own     8.00s   still over budget');
    expect(out).toContain('       │ tests             30   300ms each   120× the median test');
    expect(out).toContain(
      '       │   90ms  opens the menu\n       │   60ms  closes it\n       │   40ms  renders\n       │   10ms  blurs\n       │   10ms  focuses',
    );
    expect(out).toContain('where the time went · CPU profile, 6ms sampled');
    expect(out).toContain('       │ hooks        ██████████░░░░░░░░░░ 50%   test bodies 50%');
    expect(out).toContain('       │ in the spec  render 50%  ·  setUp 50%');
    expect(out).toContain('Most of the time is set-up that every test repeats: 50% is in hooks — render alone is 50%.');
    expect(out.indexOf('slowest tests')).toBeLessThan(out.indexOf('→ Every test in this file'));
  });

  it('prints the slowest tests alone when the pass left no profile, and nothing under a finding it did not confirm', () => {
    const root = createTempRepo({ 'package.json': '{}' });
    const slowPath = join(root, 'src/slow.spec.ts');
    const luckyPath = join(root, 'src/lucky.spec.ts');
    const source: PerfSource = {
      ok: true,
      run: run(root, [
        ...ordinary(root),
        file(slowPath, { tests: 9_000, testCount: 30 }),
        file(luckyPath, { tests: 9_000, testCount: 30 }),
      ]),
      runFailed: false,
    };
    const remeasure = (): PerfSource => ({
      ok: true,
      runFailed: false,
      run: run(root, [
        file(slowPath, { tests: 8_000, testCount: 30, cases: [{ name: 'waits', ms: 70 }] }),
        file(luckyPath, { tests: 400, testCount: 30, cases: [{ name: 'fine', ms: 20 }] }),
      ]),
    });
    const io = recorder();

    expect(renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } })).toBe(1);

    const out = io.stdout.join('\n');

    expect(out).toContain('       │   70ms  waits');
    expect(out).not.toContain('where the time went');
    expect(out).not.toContain('slowest imports');
    expect(out).not.toContain('fine');
  });

  it('prints the heaviest imports of the spec, a package by its name and a module by its path', () => {
    const root = createTempRepo({ 'package.json': '{}' });
    const slowPath = join(root, 'src/slow.spec.ts');
    const source: PerfSource = {
      ok: true,
      run: run(root, [...ordinary(root), file(slowPath, { tests: 9_000, testCount: 30 })]),
      runFailed: false,
    };
    const remeasure = (): PerfSource => ({
      ok: true,
      runFailed: false,
      run: run(root, [
        file(slowPath, {
          tests: 8_000,
          testCount: 30,
          slowImports: [
            { module: join(root, 'node_modules/@angular/material/fesm2022/table.mjs'), ms: 1_240 },
            { module: join(root, 'src/player/player.component.ts'), ms: 310 },
          ],
        }),
      ]),
    });
    const io = recorder();

    renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } });

    expect(io.stdout.join('\n')).toContain(
      '       ├─ slowest imports · with everything under them ────────────────\n       │   1.24s  @angular/material\n       │   310ms  src/player/player.component.ts',
    );
  });

  it('prints the measurements alone for a confirmed finding whose file the pass reported no body for', () => {
    const root = createTempRepo({ 'package.json': '{}' });
    const slowPath = join(root, 'src/slow.spec.ts');
    const source: PerfSource = {
      ok: true,
      run: run(root, [...ordinary(root), file(slowPath, { tests: 9_000, testCount: 30 })]),
      runFailed: false,
    };
    const remeasure = (): PerfSource => ({ ok: true, runFailed: false, run: run(root, [file(slowPath, { tests: 8_000, testCount: 30 })]) });
    const io = recorder();

    expect(renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } })).toBe(1);
    expect(io.stdout.join('\n')).toContain('measurements');
    expect(io.stdout.join('\n')).not.toContain('slowest tests');
  });
});

describe('formatFindings, details', () => {
  it('prints each detail on its own indented line between the message and the fix', () => {
    expect(formatFindings([{ check: 'c', severity: 'error', message: 'm', fix: 'f', details: ['one', 'two'] }])).toBe(
      ['error  c', '       m', '       one', '       two', '       → f'].join('\n'),
    );
  });
});
