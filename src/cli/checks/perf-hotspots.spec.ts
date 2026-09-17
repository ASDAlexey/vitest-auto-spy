/**
 * The two tables, and the things that decide whether anybody reads them.
 *
 * A row has to be exactly what the gate would take as a candidate — a table that lists a large file
 * of ordinary tests, which the gate never fails, is the noise these tables used to be. Order has to be
 * **total**, or two renderings of one report disagree. The per-test columns have to survive a file
 * that finished no body. A cut path has to stay in its column with color on, which is where padding
 * used to count the escape sequence around the ellipsis. And color has to be pinned from the test,
 * because the same strings are golden here and a stray `NO_COLOR` would otherwise decide them.
 */
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { PerfFile, PerfRun } from '../perf-data';
import { GATE_DEFAULTS } from '../perf-gate';
import { bodiesOverBudget, filesOverBudget, formatHotspots, nothingOverBudgetNote } from './perf-hotspots';

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

/** Nine files of forty 2.5 ms tests: the median test of every run below, and a 5.00s floor with the defaults. */
const ordinary = (): PerfFile[] =>
  Array.from({ length: 9 }, (_unused, index) => file(`libs/ordinary/o-${index}.spec.ts`, { tests: 100, testCount: 40 }));

/** Three files over budget, one large file of ordinary tests that is not, and one that is merely small. */
const suite = (): PerfRun =>
  run([
    ...ordinary(),
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
    file('libs/api/src/lib/catalog.service.spec.ts', { tests: 6_000, testCount: 3 }),
    file('libs/shared/retry.interceptor.spec.ts', { tests: 5_200, testCount: 0 }),
    file('libs/misc/small.spec.ts', { tests: 2_300, testCount: 20 }),
  ]);

const plain = { colors: false } as const;

describe('filesOverBudget', () => {
  it('lists exactly the files the gate would take, the most expensive first', () => {
    expect(filesOverBudget(suite(), ROOT, GATE_DEFAULTS, 10).map((entry) => entry.file)).toEqual([
      'libs/player/wrapper/src/lib/ads/ads.controller.spec.ts',
      'libs/api/src/lib/catalog.service.spec.ts',
      'libs/shared/retry.interceptor.spec.ts',
    ]);
  });

  it('leaves out a large file of ordinary tests, however long it adds up to', () => {
    const large = run([...ordinary(), file('libs/large.spec.ts', { tests: 40_000, testCount: 4_000 })]);

    expect(filesOverBudget(large, ROOT, GATE_DEFAULTS, 10)).toEqual([]);
  });

  it('carries the budget, the cost of one test and its multiple of the median test', () => {
    const [ads] = filesOverBudget(suite(), ROOT, GATE_DEFAULTS, 1);

    expect(ads).toEqual({
      file: 'libs/player/wrapper/src/lib/ads/ads.controller.spec.ts',
      ms: 7_500,
      budget: 5_000,
      testCount: 12,
      perTest: 625,
      timesMedian: 250,
    });
  });

  it('reports no average for a file that finished no body, and no multiple for a run with no median', () => {
    const [none] = filesOverBudget(suite(), ROOT, GATE_DEFAULTS, 10).slice(-1);
    const [alone] = filesOverBudget(run([file('libs/none.spec.ts', { tests: 6_000 })]), ROOT, GATE_DEFAULTS, 10);

    expect(none).toMatchObject({ testCount: 0, perTest: 0, timesMedian: 0 });
    expect(alone).toMatchObject({ file: 'libs/none.spec.ts', perTest: 0, timesMedian: 0 });
  });

  it('breaks a tie on the path, and leaves out a file outside the repository or one the gate does not judge', () => {
    const mixed = run([
      ...ordinary(),
      file('libs/b.spec.ts', { tests: 6_000, testCount: 2 }),
      file('libs/a.spec.ts', { tests: 6_000, testCount: 2 }),
      file('apps/c.spec.ts', { tests: 6_000, testCount: 2 }),
      { ...file('ignored'), file: '/elsewhere/other.spec.ts', tests: 9_000, testCount: 3 },
    ]);

    expect(filesOverBudget(mixed, ROOT, { ...GATE_DEFAULTS, only: ['libs'] }, 10).map((entry) => entry.file)).toEqual([
      'libs/a.spec.ts',
      'libs/b.spec.ts',
    ]);
  });

  it('takes nothing at all when the limit is zero or below it', () => {
    expect(filesOverBudget(suite(), ROOT, GATE_DEFAULTS, 0)).toEqual([]);
    expect(filesOverBudget(suite(), ROOT, GATE_DEFAULTS, -3)).toEqual([]);
  });
});

describe('bodiesOverBudget', () => {
  it('lists the bodies at or over --max-test-ms and nothing under it', () => {
    expect(bodiesOverBudget(suite(), ROOT, GATE_DEFAULTS, 10)).toEqual([
      { file: 'libs/player/wrapper/src/lib/ads/ads.controller.spec.ts', name: 'AdsController > plays the pre-roll', ms: 2_900 },
    ]);
    expect(bodiesOverBudget(suite(), ROOT, { ...GATE_DEFAULTS, maxTestMs: 300 }, 10)).toHaveLength(2);
  });

  it('breaks a tie on the path first and the test name second, and stops at the limit', () => {
    const tied = run([
      file('libs/b.spec.ts', { tests: 900, testCount: 2, cases: [{ name: 'zeta', ms: 1_450 }] }),
      file('libs/a.spec.ts', {
        tests: 900,
        testCount: 2,
        cases: [
          { name: 'beta', ms: 1_450 },
          { name: 'alpha', ms: 1_450 },
        ],
      }),
    ]);

    expect(bodiesOverBudget(tied, ROOT, GATE_DEFAULTS, 5).map((entry) => `${entry.file} ${entry.name}`)).toEqual([
      'libs/a.spec.ts alpha',
      'libs/a.spec.ts beta',
      'libs/b.spec.ts zeta',
    ]);
    expect(bodiesOverBudget(tied, ROOT, GATE_DEFAULTS, 1)).toHaveLength(1);
  });

  it('judges only the paths the gate judges, and carries nothing from a version 1 report', () => {
    expect(bodiesOverBudget(suite(), ROOT, { ...GATE_DEFAULTS, only: ['apps'] }, 10)).toEqual([]);
    expect(bodiesOverBudget(run([file('libs/slow.spec.ts', { tests: 7_500, testCount: 12 })], 1), ROOT, GATE_DEFAULTS, 5)).toEqual([]);
  });
});

describe('formatHotspots', () => {
  it('prints nothing when nothing is over budget, and a one-line note says so instead', () => {
    expect(formatHotspots(run([...ordinary(), file('libs/misc/small.spec.ts', { tests: 2_300, testCount: 20 })]), ROOT, plain)).toBe('');
    expect(nothingOverBudgetNote()).toBe(
      'Nothing over budget: no file over its budget and no test body over 1.00s. Nothing here would fail --gate.',
    );
  });

  it('shows each file with the budget it is over, and an em dash for a file that finished no test', () => {
    expect(formatHotspots(suite(), ROOT, plain)).toBe(
      [
        'files over budget — the ones the gate re-measures and fails on',
        '',
        '  file                                                       time    budget    ms/test    vs median test',
        '  libs/player/wrapper/src/lib/ads/ads.controller.spec.ts    7.50s     5.00s      625ms              250×',
        '  libs/api/src/lib/catalog.service.spec.ts                  6.00s     5.00s      2.00s              800×',
        '  libs/shared/retry.interceptor.spec.ts                     5.20s     5.00s          —                 —',
        '',
        '  `budget` is the largest of --max-file-ms 5.00s, --max-file-tests 2000 × the median test of this run (3ms),',
        '  and --factor 10 × that median for each test in the file. A large file of ordinary tests is never here.',
        '',
        'test bodies over budget — each one over --max-test-ms 1.00s',
        '',
        '  libs/player/wrapper/src/lib/ads/ads.controller.spec.ts',
        `    AdsController > plays the pre-roll${' '.repeat(97)}2.90s`,
      ].join('\n'),
    );
  });

  it('says "the one" for a single file, and prints a multiple under ten with a decimal', () => {
    const gate = { ...GATE_DEFAULTS, factor: 1 };
    const single = formatHotspots(run([...ordinary(), file('libs/one.spec.ts', { tests: 5_000, testCount: 400 })]), ROOT, {
      ...plain,
      gate,
    });

    expect(single).toContain('the one the gate re-measures');
    expect(single).toContain('5.0×');
  });

  it('prints the bodies alone when no file is over budget, and the files alone when the report has no bodies', () => {
    const bodyOnly = run([...ordinary(), file('libs/b.spec.ts', { tests: 1_200, testCount: 40, cases: [{ name: 'waits', ms: 1_100 }] })]);
    const version1 = formatHotspots(run([...ordinary(), file('libs/slow.spec.ts', { tests: 7_500, testCount: 12 })], 1), ROOT, plain);

    expect(formatHotspots(bodyOnly, ROOT, plain).startsWith('test bodies over budget')).toBe(true);
    expect(version1).toContain('libs/slow.spec.ts');
    expect(version1).not.toContain('test bodies over budget');
  });

  it("groups the bodies of one file under the file, ordered by their file's slowest body", () => {
    const grouped = run([
      file('libs/two.spec.ts', {
        tests: 2_000,
        testCount: 2,
        cases: [
          { name: 'second body', ms: 1_100 },
          { name: 'first body', ms: 1_300 },
        ],
      }),
      file('apps/one.spec.ts', { tests: 1_100, testCount: 1, cases: [{ name: 'middle body', ms: 1_200 }] }),
    ]);
    const text = formatHotspots(grouped, ROOT, plain);
    const at = (needle: string) => text.indexOf(needle);

    expect(text.split('\n').filter((line) => line === '  libs/two.spec.ts')).toHaveLength(1);
    expect(at('  libs/two.spec.ts')).toBeLessThan(at('first body'));
    expect(at('first body')).toBeLessThan(at('second body'));
    expect(at('second body')).toBeLessThan(at('  apps/one.spec.ts'));
    expect(at('  apps/one.spec.ts')).toBeLessThan(at('middle body'));
  });

  it('cuts a path too wide for its column in the middle, on segment boundaries, and keeps both ends', () => {
    expect(formatHotspots(suite(), ROOT, { ...plain, limit: 1, width: 90 })).toContain('  libs/…/lib/ads/ads.controller.spec.ts');
  });

  it('keeps a cut row in its column with color on, counting what the terminal shows rather than the escape codes', () => {
    const rows = formatHotspots(suite(), ROOT, { width: 90, colors: true })
      .split('\n')
      // eslint-disable-next-line no-control-regex -- stripping the escapes the module wrote
      .map((row) => row.replace(/\u001b\[[\d;]*m/g, ''))
      .filter((row) => row.includes('.spec.ts') && row.includes('5.00s'));

    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.indexOf('5.00s'))).size).toBe(1);
    expect(rows.some((row) => row.includes('…'))).toBe(true);
  });

  it('cuts a body name from the left and keeps the test, aligned to the width it was given', () => {
    expect(formatHotspots(suite(), ROOT, { ...plain, width: 40 })).toContain('    …oller > plays the pre-roll    2.90s');
  });

  it('falls back to a tail cut when even the file name does not fit, or the path has no segment boundary', () => {
    const giant = run([
      file(`libs/${'x'.repeat(30)}giant.spec.ts`, { tests: 1_200, testCount: 2, cases: [{ name: 'slow one', ms: 1_100 }] }),
    ]);
    const flat = run([file(`${'y'.repeat(40)}root.spec.ts`, { tests: 1_300, testCount: 2, cases: [{ name: 'slow one', ms: 1_100 }] })]);
    const cut = (text: string, name: string): boolean =>
      text.split('\n').some((row) => row.trimStart().startsWith('…') && row.includes(name));

    expect(cut(formatHotspots(giant, ROOT, { ...plain, width: 30 }), 'giant.spec.ts')).toBe(true);
    expect(cut(formatHotspots(flat, ROOT, { ...plain, width: 30 }), 'root.spec.ts')).toBe(true);
  });
});

describe('formatHotspots color', () => {
  it('carries the time of every row in red, and dims the header', () => {
    const colored = formatHotspots(suite(), ROOT, { colors: true });

    expect(colored).toContain('\u001b[31m    7.50s\u001b[0m');
    expect(colored).toContain('\u001b[31m    2.90s\u001b[0m');
    expect(colored).not.toContain('\u001b[31m     5.00s');
    expect(colored).toContain('\u001b[2mfile');
  });

  it('prints no escape sequence at all when color is off, whatever the environment says', () => {
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', undefined);
    vi.stubEnv('TERM', 'xterm');

    expect(formatHotspots(suite(), ROOT, plain)).not.toContain('\u001b[');

    vi.unstubAllEnvs();
  });

  it('follows the environment when the caller does not decide', () => {
    vi.stubEnv('NO_COLOR', '1');
    vi.stubEnv('FORCE_COLOR', undefined);
    vi.stubEnv('TERM', 'xterm');

    expect(formatHotspots(suite(), ROOT)).not.toContain('\u001b[2mfile');

    vi.stubEnv('NO_COLOR', undefined);

    expect(formatHotspots(suite(), ROOT)).toContain('\u001b[2mfile');

    vi.stubEnv('FORCE_COLOR', '0');

    expect(formatHotspots(suite(), ROOT)).not.toContain('\u001b[2mfile');

    vi.stubEnv('FORCE_COLOR', undefined);
    vi.stubEnv('TERM', 'dumb');

    expect(formatHotspots(suite(), ROOT)).not.toContain('\u001b[2mfile');

    vi.unstubAllEnvs();
  });
});
