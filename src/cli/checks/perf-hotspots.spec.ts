/**
 * The two tables, and the four things that decide whether anybody reads them.
 *
 * Order has to be **total**, not merely by time, or two renderings of one report disagree and the
 * tables stop being quotable. The per-test column has to survive a file that finished no body, which
 * is the one input that turns an average into `Infinity`. The floor has to be pinned from **both**
 * sides, because a table that appears for a 40 ms suite teaches the reader to skip the section. And a
 * path wider than its column has to lose its head rather than its tail — the tail is the half that
 * says which file this is.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { PerfFile, PerfRun } from '../perf-data';
import { caseHotspots, fileHotspots, formatHotspots, hotspotFloorNote } from './perf-hotspots';

const ROOT = '/repo';

const file = (path: string, over: Partial<PerfFile> = {}): PerfFile => ({
  file: join(ROOT, path),
  environment: 0,
  prepare: 0,
  setup: 0,
  imports: 0,
  tests: 0,
  testCount: 0,
  cases: [],
  ...over,
});

const run = (files: readonly PerfFile[], version = 2): PerfRun => ({ version, root: ROOT, transform: 0, wall: 10_000, failed: 0, files });

/** Five files, 24.00s of bodies between them, one of which finished nothing. */
const suite = (): PerfRun =>
  run([
    file('libs/player/wrapper/src/lib/ads/ads.controller.spec.ts', {
      tests: 7_500,
      testCount: 12,
      cases: [{ name: 'AdsController > plays the pre-roll', ms: 2_900 }],
    }),
    file('apps/web/src/app/profile/profile.component.spec.ts', {
      tests: 5_500,
      testCount: 240,
      cases: [{ name: 'ProfileComponent > uploads an avatar', ms: 320 }],
    }),
    file('libs/api/src/lib/catalog.service.spec.ts', { tests: 4_900, testCount: 3 }),
    file('libs/shared/retry.interceptor.spec.ts', { tests: 3_800, testCount: 0 }),
    file('libs/misc/small.spec.ts', { tests: 2_300, testCount: 20 }),
  ]);

describe('fileHotspots', () => {
  it('ranks the files by what their bodies cost, the most expensive first', () => {
    expect(fileHotspots(suite(), ROOT, 3).map((hotspot) => hotspot.file)).toEqual([
      'libs/player/wrapper/src/lib/ads/ads.controller.spec.ts',
      'apps/web/src/app/profile/profile.component.spec.ts',
      'libs/api/src/lib/catalog.service.spec.ts',
    ]);
  });

  it('breaks a tie on the path, so two readings of one report print the same table', () => {
    const tied = run([file('libs/b.spec.ts', { tests: 500, testCount: 1 }), file('libs/a.spec.ts', { tests: 500, testCount: 1 })]);

    expect(fileHotspots(tied, ROOT, 5).map((hotspot) => hotspot.file)).toEqual(['libs/a.spec.ts', 'libs/b.spec.ts']);
  });

  it('leaves out a file that spent nothing in its bodies and a file outside the repository', () => {
    const mixed = run([
      file('libs/ran.spec.ts', { tests: 500, testCount: 2 }),
      file('libs/empty.spec.ts'),
      { ...file('ignored'), file: '/elsewhere/other.spec.ts', tests: 9_000, testCount: 3 },
    ]);

    expect(fileHotspots(mixed, ROOT, 5).map((hotspot) => hotspot.file)).toEqual(['libs/ran.spec.ts']);
  });

  it('divides by the bodies that finished, and reports no average for a file that finished none', () => {
    const [slow, unfinished] = fileHotspots(
      run([file('libs/slow.spec.ts', { tests: 4_800, testCount: 12 }), file('libs/none.spec.ts', { tests: 3_800, testCount: 0 })]),
      ROOT,
      5,
    );

    expect(slow).toEqual({ file: 'libs/slow.spec.ts', ms: 4_800, testCount: 12, perTest: 400 });
    expect(unfinished).toEqual({ file: 'libs/none.spec.ts', ms: 3_800, testCount: 0, perTest: 0 });
  });

  it('takes nothing at all when the limit is zero or below it', () => {
    expect(fileHotspots(suite(), ROOT, 0)).toEqual([]);
    expect(fileHotspots(suite(), ROOT, -3)).toEqual([]);
  });
});

describe('caseHotspots', () => {
  it('ranks the bodies of every file together, the slowest first', () => {
    expect(caseHotspots(suite(), ROOT, 5)).toEqual([
      { file: 'libs/player/wrapper/src/lib/ads/ads.controller.spec.ts', name: 'AdsController > plays the pre-roll', ms: 2_900 },
      { file: 'apps/web/src/app/profile/profile.component.spec.ts', name: 'ProfileComponent > uploads an avatar', ms: 320 },
    ]);
  });

  it('breaks a tie on the path first and the test name second', () => {
    const tied = run([
      file('libs/b.spec.ts', { tests: 900, testCount: 2, cases: [{ name: 'zeta', ms: 450 }] }),
      file('libs/a.spec.ts', {
        tests: 900,
        testCount: 2,
        cases: [
          { name: 'beta', ms: 450 },
          { name: 'alpha', ms: 450 },
        ],
      }),
    ]);

    expect(caseHotspots(tied, ROOT, 5).map((entry) => `${entry.file} ${entry.name}`)).toEqual([
      'libs/a.spec.ts alpha',
      'libs/a.spec.ts beta',
      'libs/b.spec.ts zeta',
    ]);
  });

  it('carries nothing when the report carries no bodies, which is every version 1 report', () => {
    expect(caseHotspots(run([file('libs/slow.spec.ts', { tests: 7_500, testCount: 12 })], 1), ROOT, 5)).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(caseHotspots(suite(), ROOT, 1).map((entry) => entry.ms)).toEqual([2_900]);
  });
});

describe('formatHotspots', () => {
  it('prints nothing for a suite whose slowest file is below the floor, and a table once it reaches it', () => {
    const quick = run([file('libs/quick.spec.ts', { tests: 40, testCount: 8 })]);
    const slow = run([file('libs/slow.spec.ts', { tests: 1_000, testCount: 8 })]);

    expect(formatHotspots(quick, ROOT)).toBe('');
    expect(formatHotspots(slow, ROOT)).toContain('libs/slow.spec.ts');
  });

  it('prints nothing when no file was measured, even with the floor taken away', () => {
    expect(formatHotspots(run([file('libs/empty.spec.ts')]), ROOT, { floorMs: 0 })).toBe('');
  });

  it('says why there is no table, in the two ways there can be none', () => {
    const quick = hotspotFloorNote(run([file('libs/quick.spec.ts', { tests: 40, testCount: 8 })]), ROOT);

    expect(quick).toContain('the slowest file spent 40ms in its test bodies, under the 1.00s floor');
    expect(hotspotFloorNote(run([file('libs/empty.spec.ts')]), ROOT)).toContain('no file in this run finished a test body');
  });

  it('shows the total, the cost of one test and the share of the run side by side, and an em dash for a file that finished none', () => {
    expect(formatHotspots(suite(), ROOT, { limit: 4 })).toBe(
      [
        'slowest files — what every body in the file cost, and what one of them cost',
        '',
        '  file                                                       time    ms/test    share',
        '  libs/player/wrapper/src/lib/ads/ads.controller.spec.ts    7.50s      625ms    31.3%',
        '  apps/web/src/app/profile/profile.component.spec.ts        5.50s       23ms    22.9%',
        '  libs/api/src/lib/catalog.service.spec.ts                  4.90s      1.63s    20.4%',
        '  libs/shared/retry.interceptor.spec.ts                     3.80s          —    15.8%',
        '',
        '  Those 4 files are 21.70s of the 24.00s this run spent in test bodies — 90.4% of it.',
        '  `time` is what the file costs, `ms/test` what one test in it costs, and the second is the one that says whether to open the file:',
        '  400 tests sharing 6.00s is a large file, 3 tests sharing 6.00s is a slow one. A file that finished no test shows —.',
        '',
        'slowest test bodies — a body under 100ms is not in the report at all, so a fast one is absent rather than cheap',
        '',
        '  test                                                                                            time',
        '  libs/player/wrapper/src/lib/ads/ads.controller.spec.ts › AdsController > plays the pre-roll    2.90s',
        '  apps/web/src/app/profile/profile.component.spec.ts › ProfileComponent > uploads an avatar      320ms',
      ].join('\n'),
    );
  });

  it('takes the share over the whole run, not over the rows it printed', () => {
    const listed = formatHotspots(suite(), ROOT, { limit: 1 });

    expect(listed).toContain('7.50s      625ms    31.3%');
    expect(listed).toContain('That one file is 7.50s of the 24.00s');
  });

  it('drops the head of a path too wide for its column and keeps the tail that names the file', () => {
    expect(formatHotspots(suite(), ROOT, { limit: 2, width: 70 })).toContain(
      [
        '  file                                        time    ms/test    share',
        '  …per/src/lib/ads/ads.controller.spec.ts    7.50s      625ms    31.3%',
      ].join('\n'),
    );
  });

  it('truncates a test the same way, from the left, and keeps the columns aligned to the width', () => {
    const rows = formatHotspots(suite(), ROOT, { limit: 2, width: 70 }).split('\n');
    const table = rows.slice(rows.indexOf('  test                                                            time'));

    expect(table).toEqual([
      '  test                                                            time',
      '  …ds.controller.spec.ts › AdsController > plays the pre-roll    2.90s',
      '  …e.component.spec.ts › ProfileComponent > uploads an avatar    320ms',
    ]);
  });

  it('leaves out the body table rather than printing an empty one when the report has no bodies', () => {
    const version1 = formatHotspots(run([file('libs/slow.spec.ts', { tests: 7_500, testCount: 12 })], 1), ROOT);

    expect(version1).toContain('libs/slow.spec.ts');
    expect(version1).not.toContain('slowest test bodies');
  });
});
