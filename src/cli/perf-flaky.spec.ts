import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeTextFile } from './fs-scan';
import type { CliIo } from './main';
import { runCli } from './main';
import { analysePerf, renderPerf } from './perf';
import type { PerfFile, PerfRun } from './perf-data';
import { parsePerfRun } from './perf-data';
import { GATE_DEFAULTS } from './perf-gate';
import type { PerfTestModule } from './perf-reporter';
import PerfReporter from './perf-reporter';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

interface Recorder extends CliIo {
  readonly stdout: string[];
}

function recorder(): Recorder {
  const stdout: string[] = [];

  return { stdout, out: (line) => stdout.push(line), err: () => undefined };
}

const repo = (): string => createTempRepo({ 'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }) });

const file = (root: string, name: string, over: Partial<PerfFile> = {}): PerfFile => ({
  file: join(root, name),
  environment: 0,
  prepare: 0,
  setup: 0,
  imports: 0,
  tests: 10,
  testCount: 2,
  cases: [],
  ...over,
});

const run = (root: string, files: readonly PerfFile[], over: Partial<PerfRun> = {}): PerfRun => ({
  version: 3,
  root,
  transform: 0,
  wall: 100,
  failed: 0,
  files,
  ...over,
});

describe('PerfReporter, flaky tests and heap', () => {
  const module = (heap: number | undefined): PerfTestModule => ({
    moduleId: '/repo/a.spec.ts',
    diagnostic: () => ({ environmentSetupDuration: 0, prepareDuration: 0, collectDuration: 0, setupDuration: 0, duration: 10, heap }),
    children: {
      allTests: () => [
        { fullName: 'b > retried', diagnostic: () => ({ duration: 5, flaky: true }) },
        { fullName: 'a > retried', diagnostic: () => ({ duration: 5, flaky: true }) },
        { fullName: 'a > retried', diagnostic: () => ({ duration: 5, flaky: true }) },
        { fullName: 'steady', diagnostic: () => ({ duration: 5, flaky: false }) },
      ],
    },
  });

  it('records each flaky test once, sorted, and the heap Vitest measured', () => {
    const [recorded] = new PerfReporter().report([module(52_428_800)]).files;

    expect(recorded?.flaky).toEqual(['a > retried', 'b > retried']);
    expect(recorded?.heap).toBe(52_428_800);
  });

  it('writes neither field when there is nothing to say', () => {
    const quiet: PerfTestModule = {
      ...module(undefined),
      children: { allTests: () => [{ name: 'steady', diagnostic: () => ({ duration: 5 }) }] },
    };
    const [recorded] = new PerfReporter().report([quiet]).files;

    expect(recorded).not.toHaveProperty('flaky');
    expect(recorded).not.toHaveProperty('heap');
  });
});

describe('parsePerfRun, version 3', () => {
  it('reads the flaky names and the heap, and drops what is not a name', () => {
    const parsed = parsePerfRun(JSON.stringify({ version: 3, files: [{ file: '/a.spec.ts', flaky: ['x', 7], heap: 1_024 }] }));

    expect(parsed?.files[0]).toMatchObject({ flaky: ['x'], heap: 1_024 });
  });

  it('leaves all three out of a file that carries none, or carries them malformed', () => {
    const parsed = parsePerfRun(JSON.stringify({ version: 3, files: [{ file: '/a.spec.ts', flaky: 'x', heap: 'big', slowImports: 'x' }] }));

    expect(parsed?.files[0]).not.toHaveProperty('flaky');
    expect(parsed?.files[0]).not.toHaveProperty('heap');
    expect(parsed?.files[0]).not.toHaveProperty('slowImports');
  });

  it('reads the slow imports, and drops an entry that names no module', () => {
    const parsed = parsePerfRun(
      JSON.stringify({
        version: 3,
        files: [{ file: '/a.spec.ts', slowImports: [{ module: '/b.ts', ms: 12 }, { module: '/c.ts' }, { ms: 3 }, 7] }],
      }),
    );

    expect(parsed?.files[0]?.slowImports).toEqual([
      { module: '/b.ts', ms: 12 },
      { module: '/c.ts', ms: 0 },
    ]);
  });
});

describe('analysePerf, flaky tests and heap', () => {
  it('warns about a flaky file even on a run too cheap for any other finding', () => {
    const root = repo();
    const findings = analysePerf(run(root, [file(root, 'src/a.spec.ts', { flaky: ['a > retried'] })]), readProfile(root)).findings;

    expect(findings).toEqual([
      expect.objectContaining({
        check: 'perf-flaky',
        severity: 'warning',
        file: 'src/a.spec.ts',
        message: '1 test passed only after a retry: `a > retried`.',
      }),
    ]);
  });

  it('counts several, and makes them errors when asked to fail on them', () => {
    const root = repo();
    const [finding] = analysePerf(run(root, [file(root, 'src/a.spec.ts', { flaky: ['one', 'two'] })]), readProfile(root), true).findings;

    expect(finding).toMatchObject({ severity: 'error', message: '2 tests passed only after a retry: `one`, `two`.' });
  });

  it('lists the five largest heaps in megabytes, and keeps them next to the other findings of a heavy run', () => {
    const root = repo();
    const files = [0, 1, 2, 3, 4, 5].map((index) =>
      file(root, `src/case-${index}.spec.ts`, { heap: (index + 1) * 1_048_576, environment: 2_000 }),
    );
    const findings = analysePerf(run(root, [...files, file(root, 'src/none.spec.ts', { heap: 1_048_576 })]), readProfile(root)).findings;
    const heap = findings.find((entry) => entry.check === 'perf-heap');

    expect(heap?.message).toBe(
      'Heap used after the file, largest first: src/case-5.spec.ts 6 MB, src/case-4.spec.ts 5 MB, src/case-3.spec.ts 4 MB, src/case-2.spec.ts 3 MB, src/case-1.spec.ts 2 MB.',
    );
    expect(findings.length).toBeGreaterThan(1);
  });
});

describe('renderPerf --fail-on-flaky', () => {
  it('fails an otherwise green run, and leaves the run green without the flag', () => {
    const root = repo();
    const flaky = run(root, [file(root, 'src/a.spec.ts', { flaky: ['a > retried'] })]);

    expect(renderPerf({ ok: true, run: flaky, runFailed: false }, readProfile(root), recorder())).toBe(0);

    const io = recorder();

    expect(renderPerf({ ok: true, run: flaky, runFailed: false }, readProfile(root), io, { failOnFlaky: true })).toBe(1);
    expect(io.stdout.join('\n')).toContain('error  perf-flaky src/a.spec.ts');
  });

  it('keeps the gate refusing a red run as nothing to judge, flaky or not', () => {
    const root = repo();
    const red = run(root, [file(root, 'src/a.spec.ts', { flaky: ['a > retried'] })], { failed: 1 });

    expect(
      renderPerf({ ok: true, run: red, runFailed: true }, readProfile(root), recorder(), {
        failOnFlaky: true,
        gate: { options: GATE_DEFAULTS, remeasure: undefined, trustSingle: false },
      }),
    ).toBe(2);
  });

  it('is read from the command line', () => {
    const root = repo();

    writeTextFile(join(root, 'perf.json'), JSON.stringify(run(root, [file(root, 'src/a.spec.ts', { flaky: ['a > retried'] })])));

    expect(runCli(['perf', '--cwd', root, '--json', 'perf.json', '--fail-on-flaky'], recorder())).toBe(1);
  });
});
