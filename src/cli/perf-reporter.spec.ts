/**
 * The reporter's half of a profiled confirmation pass.
 *
 * Pinned from both sides, because the ordinary run is the one that matters more: without
 * `VITEST_AUTO_SPY_PERF_PROFILE` the reporter must add nothing to anybody's `setupFiles` and keep
 * the 100 ms floor under what it records, or every measured suite pays for a profile nobody asked
 * for and writes a report the size of the suite. With it, the profiler goes into every project and
 * every body is recorded, since a pass of a few suspect files is exactly where the fast ones are the
 * evidence.
 */
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readTextFile } from './fs-scan';
import { PERF_OUTPUT_ENV, PERF_PROFILE_ENV, parsePerfRun } from './perf-data';
import type { PerfProject, PerfTestModule } from './perf-reporter';
import PerfReporter from './perf-reporter';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  vi.unstubAllEnvs();
  removeTempRepos();
});

const project = (limit?: number): PerfProject => ({
  config: { setupFiles: ['/repo/setup.ts'], ...(limit === undefined ? {} : { experimental: { importDurations: { limit } } }) },
});

const moduleWith = (durations: readonly number[]): PerfTestModule => ({
  moduleId: '/repo/a.spec.ts',
  diagnostic: () => ({ environmentSetupDuration: 0, prepareDuration: 0, collectDuration: 0, setupDuration: 0, duration: 100 }),
  children: { allTests: () => durations.map((duration, index) => ({ fullName: `case ${index}`, diagnostic: () => ({ duration }) })) },
});

const module = (moduleId: string): PerfTestModule => ({
  moduleId,
  diagnostic: () => ({ environmentSetupDuration: 1, prepareDuration: 2, collectDuration: 3, setupDuration: 4, duration: 5 }),
});

describe('PerfReporter, a profiled pass', () => {
  it('adds the profiler to the setup files of every project', () => {
    vi.stubEnv(PERF_PROFILE_ENV, '/tmp/profiles');

    const projects = [project(), project()];

    new PerfReporter().onInit({ config: { root: '/repo' }, state: { transformTime: 0 }, projects });

    for (const each of projects) {
      expect(each.config.setupFiles).toHaveLength(2);
      expect(each.config.setupFiles[0]).toBe('/repo/setup.ts');
      expect(each.config.setupFiles[1]).toMatch(/perf-profiler\.js$/);
    }
  });

  it('makes Vitest collect import durations for the pass, and never lowers a limit already set higher', () => {
    vi.stubEnv(PERF_PROFILE_ENV, '/tmp/profiles');

    const unset: PerfProject = { config: { setupFiles: [], experimental: { importDurations: {} } } };
    const projects = [project(0), project(500), project(), unset];

    new PerfReporter().onInit({ config: { root: '/repo' }, state: { transformTime: 0 }, projects });

    expect(projects.map((each) => each.config.experimental?.importDurations?.limit)).toEqual([200, 500, undefined, 200]);
  });

  it('records the heaviest imports the spec made itself, and none another module made', () => {
    const module: PerfTestModule = {
      ...moduleWith([]),
      diagnostic: () => ({
        environmentSetupDuration: 0,
        prepareDuration: 0,
        collectDuration: 0,
        setupDuration: 0,
        duration: 100,
        importDurations: {
          '/repo/b.ts': { totalTime: 40, importer: '/repo/a.spec.ts' },
          '/repo/a.ts': { totalTime: 40, importer: '/repo/a.spec.ts' },
          '/repo/c.ts': { totalTime: 90, importer: '/repo/b.ts' },
          '/repo/d.ts': { totalTime: 10 },
        },
      }),
    };

    expect(new PerfReporter().report([module]).files[0]?.slowImports).toEqual([
      { module: '/repo/a.ts', ms: 40 },
      { module: '/repo/b.ts', ms: 40 },
    ]);
    expect(new PerfReporter().report([moduleWith([])]).files[0]).not.toHaveProperty('slowImports');
  });

  it('tolerates a Vitest that exposes no projects', () => {
    vi.stubEnv(PERF_PROFILE_ENV, '/tmp/profiles');

    expect(() => new PerfReporter().onInit({ config: { root: '/repo' }, state: { transformTime: 0 } })).not.toThrow();
  });

  it('records the bodies under 100 ms too', () => {
    vi.stubEnv(PERF_PROFILE_ENV, '/tmp/profiles');

    expect(new PerfReporter().report([moduleWith([12, 150])]).files[0]?.cases).toEqual([
      { name: 'case 1', ms: 150 },
      { name: 'case 0', ms: 12 },
    ]);
  });
});

describe('PerfReporter, an ordinary run', () => {
  it('adds nothing to any setup files and collects no imports, whether the variable is unset or empty', () => {
    const projects = [project(0)];

    vi.stubEnv(PERF_PROFILE_ENV, undefined);
    new PerfReporter().onInit({ config: { root: '/repo' }, state: { transformTime: 0 }, projects });
    vi.stubEnv(PERF_PROFILE_ENV, '');
    new PerfReporter().onInit({ config: { root: '/repo' }, state: { transformTime: 0 }, projects });

    expect(projects[0]?.config.setupFiles).toEqual(['/repo/setup.ts']);
    expect(projects[0]?.config.experimental?.importDurations?.limit).toBe(0);
  });

  it('keeps the floor under what it records', () => {
    vi.stubEnv(PERF_PROFILE_ENV, undefined);

    expect(new PerfReporter().report([moduleWith([12, 150])]).files[0]?.cases).toEqual([{ name: 'case 1', ms: 150 }]);
  });
});

describe('PerfReporter', () => {
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
