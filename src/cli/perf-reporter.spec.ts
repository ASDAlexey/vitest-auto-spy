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
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PERF_PROFILE_ENV } from './perf-data';
import type { PerfProject, PerfTestModule } from './perf-reporter';
import PerfReporter from './perf-reporter';

afterEach(() => {
  vi.unstubAllEnvs();
});

const project = (limit?: number): PerfProject => ({
  config: { setupFiles: ['/repo/setup.ts'], ...(limit === undefined ? {} : { experimental: { importDurations: { limit } } }) },
});

const moduleWith = (durations: readonly number[]): PerfTestModule => ({
  moduleId: '/repo/a.spec.ts',
  diagnostic: () => ({ environmentSetupDuration: 0, prepareDuration: 0, collectDuration: 0, setupDuration: 0, duration: 100 }),
  children: { allTests: () => durations.map((duration, index) => ({ fullName: `case ${index}`, diagnostic: () => ({ duration }) })) },
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
