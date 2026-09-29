/**
 * What the reporter records beyond the phases: per-test heap steps, the library's hook time, the
 * setup-file import chain with self time, how the run ended, coverage after the last file, a process
 * that would not exit, and the `isolate` a second `--ab-isolate` run is started with. Each field is
 * absent when there is nothing to say, so a report without them reads exactly as before.
 */
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readTextFile } from './fs-scan';
import type { PerfRun } from './perf-data';
import { PERF_ISOLATE_ENV, PERF_OUTPUT_ENV, PERF_PROFILE_ENV, parsePerfRun } from './perf-data';
import { mergeRuns } from './perf-merge';
import type { PerfProject, PerfTestCase, PerfTestModule } from './perf-reporter';
import PerfReporter from './perf-reporter';
import { createTempRepo, removeTempRepos } from './temp-repo';

const MB = 1024 * 1024;

beforeEach(() => {
  vi.stubEnv(PERF_OUTPUT_ENV, undefined);
  vi.stubEnv(PERF_PROFILE_ENV, undefined);
  vi.stubEnv(PERF_ISOLATE_ENV, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  removeTempRepos();
});

const test = (name: string, heap: number | undefined, startTime?: number, meta?: Record<string, unknown>): PerfTestCase => ({
  fullName: name,
  diagnostic: () => ({ duration: 1, heap, ...(startTime === undefined ? {} : { startTime }) }),
  ...(meta === undefined ? {} : { meta: () => meta }),
});

const moduleOf = (tests: readonly PerfTestCase[], over: Partial<PerfTestModule> = {}, fileHeap?: number): PerfTestModule => ({
  moduleId: '/repo/a.spec.ts',
  diagnostic: () => ({
    environmentSetupDuration: 0,
    prepareDuration: 0,
    collectDuration: 0,
    setupDuration: 0,
    duration: 10,
    heap: fileHeap,
  }),
  children: { allTests: () => tests },
  ...over,
});

const fileOf = (module: PerfTestModule, reporter = new PerfReporter()): PerfRun['files'][number] | undefined =>
  reporter.report([module]).files[0];

describe('the reporter, per-test heap', () => {
  it('names the test whose growth the next test kept, the largest of them', () => {
    const tests = [test('first', 10 * MB, 1), test('keeps', 15 * MB, 2), test('keeps more', 25 * MB, 3), test('last', 26 * MB, 4)];

    expect(fileOf(moduleOf(tests))?.heapStep).toEqual({ test: 'keeps more', bytes: 10 * MB });
  });

  it('ignores growth the next test gave back, growth under a megabyte, and the first test', () => {
    const freed = [test('first', 50 * MB, 1), test('spike', 80 * MB, 2), test('after', 50 * MB, 3)];
    const small = [test('first', 10 * MB, 1), test('tiny', 10 * MB + 1024, 2), test('after', 11 * MB, 3)];

    expect(fileOf(moduleOf(freed))).not.toHaveProperty('heapStep');
    expect(fileOf(moduleOf(small))).not.toHaveProperty('heapStep');
  });

  it("judges the last test against the file's own heap, orders by start time, and falls back to the order it ran in", () => {
    const outOfOrder = [test('last', 30 * MB, 3), test('first', 10 * MB, 1), test('middle', 12 * MB, 2)];
    const unordered = [test('first', 10 * MB), test('keeps', 20 * MB)];

    expect(fileOf(moduleOf(outOfOrder, {}, 30 * MB))?.heapStep).toEqual({ test: 'last', bytes: 18 * MB });
    expect(fileOf(moduleOf(outOfOrder))?.heapStep).toEqual({ test: 'middle', bytes: 2 * MB });
    expect(fileOf(moduleOf(unordered, {}, 25 * MB))?.heapStep).toEqual({ test: 'keeps', bytes: 10 * MB });
    expect(fileOf(moduleOf([test('no heap', undefined, 1)]))).not.toHaveProperty('heapStep');
  });
});

describe("the reporter, setupAutoSpy's hook time", () => {
  it('sums the time the library left in each test meta, and records none when no test carries it', () => {
    const tests = [test('a', undefined, 1, { autoSpyMs: 2.5 }), test('b', undefined, 2, { autoSpyMs: 1.5 }), test('c', undefined, 3, {})];

    expect(fileOf(moduleOf(tests))?.autoSpy).toBe(4);
    expect(
      fileOf(moduleOf([test('a', undefined, 1, { autoSpyMs: 'slow' }), test('b', undefined, 2, { autoSpyMs: Number.NaN })])),
    ).not.toHaveProperty('autoSpy');
    expect(fileOf(moduleOf([test('a', undefined, 1)]))).not.toHaveProperty('autoSpy');
  });
});

describe('the reporter, imports', () => {
  const durations = {
    '/repo/a.ts': { totalTime: 40, selfTime: 5, importer: '/repo/a.spec.ts' },
    '/repo/test-setup.ts': { totalTime: 300, selfTime: 10 },
    '/repo/node_modules/zone.js/zone.js': { totalTime: 120, selfTime: 120, importer: '/repo/test-setup.ts' },
    '/repo/other.ts': { totalTime: 90, importer: '/repo/b.ts' },
  };
  const withImports: Partial<PerfTestModule> = {
    diagnostic: () => ({
      environmentSetupDuration: 0,
      prepareDuration: 0,
      collectDuration: 0,
      setupDuration: 0,
      duration: 10,
      importDurations: durations,
    }),
  };
  const project = (): PerfProject => ({ config: { setupFiles: ['/repo/test-setup.ts'] } });

  it('keeps the self time beside the total, and the setup files with the chain they import apart from the spec', () => {
    const reporter = new PerfReporter();

    vi.stubEnv(PERF_OUTPUT_ENV, '/tmp/unused.json');
    reporter.onInit({ config: { root: '/repo' }, state: {}, projects: [project()] });

    const file = fileOf(moduleOf([], withImports), reporter);

    expect(file?.slowImports).toEqual([{ module: '/repo/a.ts', ms: 40, self: 5 }]);
    expect(file?.setupImports).toEqual([
      { module: '/repo/test-setup.ts', ms: 300, self: 10 },
      { module: '/repo/node_modules/zone.js/zone.js', ms: 120, self: 120 },
    ]);
  });

  it('records no setup chain when it never saw a setup file', () => {
    expect(fileOf(moduleOf([], withImports))).not.toHaveProperty('setupImports');
  });
});

describe('the reporter, --ab-isolate', () => {
  it('sets every project to the isolate the environment names, and leaves them alone otherwise', () => {
    const projects = (): (PerfProject & { config: { isolate?: boolean } })[] => [
      { config: { setupFiles: [], isolate: true } },
      { config: { setupFiles: [] } },
    ];
    const flipped = projects();
    const kept = projects();
    const junk = projects();

    vi.stubEnv(PERF_OUTPUT_ENV, '/tmp/unused.json');
    vi.stubEnv(PERF_ISOLATE_ENV, 'false');
    new PerfReporter().onInit({ config: { root: '/repo' }, state: {}, projects: flipped });
    vi.stubEnv(PERF_ISOLATE_ENV, undefined);
    new PerfReporter().onInit({ config: { root: '/repo' }, state: {}, projects: kept });
    vi.stubEnv(PERF_ISOLATE_ENV, 'no');
    new PerfReporter().onInit({ config: { root: '/repo' }, state: {}, projects: junk });

    expect(flipped.map((each) => each.config.isolate)).toEqual([false, false]);
    expect(kept.map((each) => each.config.isolate)).toEqual([true, undefined]);
    expect(junk.map((each) => each.config.isolate)).toEqual([true, undefined]);

    const on = projects();

    vi.stubEnv(PERF_ISOLATE_ENV, 'true');
    new PerfReporter().onInit({ config: { root: '/repo' }, state: {}, projects: on });

    expect(on.map((each) => each.config.isolate)).toEqual([true, true]);
  });
});

describe('the reporter, how the run ended', () => {
  const started = (): { reporter: PerfReporter; target: string } => {
    const target = join(createTempRepo({ 'package.json': '{}' }), 'perf.json');
    const reporter = new PerfReporter();

    vi.useFakeTimers({ now: 1_000 });
    vi.stubEnv(PERF_OUTPUT_ENV, target);
    reporter.onInit({ config: { root: '/repo' }, state: {} });

    return { reporter, target };
  };
  const read = (target: string): PerfRun | undefined => parsePerfRun(readTextFile(target) ?? '');

  it('records how Vitest said the run ended, and an interrupted run as partial', () => {
    const { reporter, target } = started();

    reporter.onTestRunEnd([moduleOf([])], [], 'passed');

    expect(read(target)).toMatchObject({ end: 'passed' });
    expect(read(target)).not.toHaveProperty('partial');

    reporter.onTestRunEnd([moduleOf([])], [], 'interrupted');

    expect(read(target)).toMatchObject({ end: 'interrupted', partial: true });
  });

  it('times coverage from the last file to the map, then the reports written after the run, and keeps the wall of the run', () => {
    const { reporter, target } = started();

    vi.setSystemTime(2_000);
    reporter.onTestModuleEnd(moduleOf([]));
    vi.setSystemTime(2_500);
    reporter.onCoverage();
    vi.setSystemTime(2_600);
    reporter.onTestRunEnd([moduleOf([])], [], 'passed');

    expect(read(target)).toMatchObject({ coverage: 500, wall: 1_600 });

    vi.setSystemTime(4_100);
    reporter.onFinishedReportCoverage();

    expect(read(target)).toMatchObject({ coverage: 2_000, wall: 1_600 });
  });

  it('records no coverage when no map was generated, and times only the reports when no file ended', () => {
    const { reporter, target } = started();

    reporter.onTestRunEnd([], [], 'passed');

    expect(read(target)).not.toHaveProperty('coverage');

    reporter.onCoverage();
    reporter.onTestRunEnd([], [], 'passed');
    vi.setSystemTime(1_300);
    reporter.onFinishedReportCoverage();

    expect(read(target)).toMatchObject({ coverage: 300 });
  });

  it('marks a run whose process Vitest had to force out, and ignores a timeout before the run ended', () => {
    const { reporter, target } = started();

    reporter.onProcessTimeout();

    expect(readTextFile(target)).toBeUndefined();

    reporter.onTestRunEnd([moduleOf([])], [], 'passed');
    reporter.onProcessTimeout();

    expect(read(target)).toMatchObject({ hung: true, end: 'passed' });
  });

  it('writes nothing after the run when no report was asked for', () => {
    const reporter = new PerfReporter();

    reporter.onTestRunEnd([], [], 'passed');
    reporter.onFinishedReportCoverage();
    reporter.onProcessTimeout();

    expect(reporter.report([])).toMatchObject({ hung: true });
  });
});

describe('a report with the version 5 fields', () => {
  it('reads each of them back, and drops a value of the wrong shape', () => {
    const text = JSON.stringify({
      version: 5,
      files: [
        {
          file: '/repo/a.spec.ts',
          autoSpy: 3,
          heapStep: { test: 'keeps', bytes: 2 * MB },
          setupImports: [{ module: '/repo/setup.ts', ms: 30, self: 2 }],
        },
        { file: '/repo/b.spec.ts', heapStep: { test: 'keeps' } },
        { file: '/repo/c.spec.ts', heapStep: 'x' },
      ],
      end: 'interrupted',
      hung: true,
      coverage: 1_200,
    });
    const parsed = parsePerfRun(text);

    expect(parsed).toMatchObject({ end: 'interrupted', hung: true, coverage: 1_200 });
    expect(parsed?.files[0]).toMatchObject({
      autoSpy: 3,
      heapStep: { test: 'keeps', bytes: 2 * MB },
      setupImports: [{ module: '/repo/setup.ts', ms: 30, self: 2 }],
    });
    expect(parsed?.files[1]).not.toHaveProperty('heapStep');
    expect(parsed?.files[2]).not.toHaveProperty('heapStep');
    expect(parsePerfRun(JSON.stringify({ version: 5, files: [], end: 'crashed', hung: 'yes' }))).toEqual(
      expect.not.objectContaining({ end: expect.anything(), hung: expect.anything() }),
    );
  });

  it('merges shards into the worst ending, any hang, and the longest coverage', () => {
    const shard = (over: Partial<PerfRun>): { path: string; run: PerfRun } => ({
      path: '/ci/perf.json',
      run: { version: 5, root: '/repo', transform: 0, wall: 1, failed: 0, files: [], ...over },
    });
    const merged = mergeRuns([
      shard({ end: 'passed', coverage: 300 }),
      shard({ end: 'interrupted', hung: true }),
      shard({ end: 'failed', coverage: 900 }),
    ]).run;

    expect(merged).toMatchObject({ end: 'interrupted', hung: true, coverage: 900 });

    const plain = mergeRuns([shard({}), shard({})]).run;

    expect(plain).not.toHaveProperty('end');
    expect(plain).not.toHaveProperty('hung');
    expect(plain).not.toHaveProperty('coverage');
  });
});
