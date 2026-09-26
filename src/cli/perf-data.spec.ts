/**
 * What version 4 of the report adds: the worker, lane and fetch wait of every file, and the
 * resolved config of the run. Each one is optional, so a report of an older Vitest reads exactly as
 * it did, and the transform split falls back to the whole-run number unless every file carries `fetch`.
 */
import { describe, expect, it } from 'vitest';

import { PERF_FORMAT_VERSION, environmentOf, parsePerfRun, phasesOf, whyNotAPerfRun } from './perf-data';
import { file, run } from './perf-fixtures';

const phase = (name: string, over: Parameters<typeof run>[0]): number => phasesOf(run(over)).find((each) => each.name === name)?.ms ?? -1;

describe('parsePerfRun, version 4', () => {
  it('reads every field Vitest 5 adds, and names the new version among the readable ones', () => {
    const parsed = parsePerfRun(
      JSON.stringify({
        version: PERF_FORMAT_VERSION,
        files: [{ file: '/a.spec.ts', workerId: 2, lane: 1, start: 1_000, fetch: 30, setupFetch: 10, retries: 2 }],
        vitest: '5.0.0',
        config: {
          isolate: false,
          pool: 'threads',
          maxWorkers: 4,
          environment: 'jsdom',
          fsModuleCache: true,
          coverage: 'v8',
          provided: ['pool', 7],
        },
        startup: { ms: 90, workers: 3 },
        partial: true,
      }),
    );

    expect(parsed?.files[0]).toMatchObject({ workerId: 2, lane: 1, start: 1_000, fetch: 30, setupFetch: 10, retries: 2 });
    expect(parsed).toMatchObject({
      vitest: '5.0.0',
      config: {
        isolate: false,
        pool: 'threads',
        maxWorkers: 4,
        environment: 'jsdom',
        fsModuleCache: true,
        coverage: 'v8',
        provided: ['pool'],
      },
      startup: { ms: 90, workers: 3 },
      partial: true,
    });
    expect(whyNotAPerfRun('{"version": 9, "files": []}')).toContain('versions 1, 2, 3, 4');
  });

  it('drops a field of the wrong type rather than trusting it', () => {
    const parsed = parsePerfRun(
      JSON.stringify({
        version: 4,
        files: [{ file: '/a.spec.ts', workerId: '2', fetch: null }],
        vitest: 5,
        config: { isolate: 'no', pool: 1, maxWorkers: 'many', environment: false, fsModuleCache: 'yes', coverage: true, provided: 'pool' },
        startup: { ms: 90 },
        partial: 'yes',
      }),
    );

    expect(Object.keys(parsed?.files[0] ?? {})).not.toContain('workerId');
    expect(Object.keys(parsed?.files[0] ?? {})).not.toContain('fetch');
    expect(parsed?.config).toEqual({});
    expect(parsed).not.toHaveProperty('vitest');
    expect(parsed).not.toHaveProperty('startup');
    expect(parsed).not.toHaveProperty('partial');
    expect(parsePerfRun(JSON.stringify({ version: 4, files: [], config: 'x', startup: 'x' }))).not.toHaveProperty('config');
  });
});

describe('environmentOf', () => {
  it('counts one environment per value per lane, since Vitest 5 gives every file a new workerId', () => {
    const files = [
      file('/a.spec.ts', { environment: 100, workerId: 1, lane: 1 }),
      file('/b.spec.ts', { environment: 100, workerId: 2, lane: 1 }),
      file('/c.spec.ts', { environment: 100, workerId: 3, lane: 2 }),
      file('/d.spec.ts', { environment: 40, workerId: 4, lane: 2 }),
    ];

    expect(environmentOf(files)).toBe(240);
  });

  it('falls back to distinct values when the report names no lanes', () => {
    const files = [file('/a.spec.ts', { environment: 100, workerId: 1 }), file('/c.spec.ts', { environment: 100, workerId: 2 })];

    expect(environmentOf(files)).toBe(100);
    expect(environmentOf([])).toBe(0);
  });
});

describe('phasesOf, with fetch waits per file', () => {
  const files = [
    file('/a.spec.ts', { imports: 100, setup: 50, fetch: 40, setupFetch: 10 }),
    file('/b.spec.ts', { imports: 5, setup: 0, fetch: 20, setupFetch: 30 }),
  ];

  it('takes the wait out of import and setup and reports it as transform, as Vitest 5 does', () => {
    expect(phase('transform', { files, transform: 999 })).toBe(60);
    expect(phase('import', { files })).toBe(75);
    expect(phase('setup', { files })).toBe(40);
  });

  it('keeps the whole-run transform and the measured phases when a single file has no fetch', () => {
    const mixed = [...files, file('/c.spec.ts', { imports: 7 })];

    expect(phase('transform', { files: mixed, transform: 999 })).toBe(999);
    expect(phase('import', { files: mixed })).toBe(112);
    expect(phase('transform', { files: [], transform: 5 })).toBe(5);
  });

  it('treats a fetch with no setup share as all collect', () => {
    expect(phase('import', { files: [file('/a.spec.ts', { imports: 100, setup: 50, fetch: 40 })] })).toBe(60);
    expect(phase('setup', { files: [file('/a.spec.ts', { imports: 100, setup: 50, fetch: 40 })] })).toBe(50);
  });
});
