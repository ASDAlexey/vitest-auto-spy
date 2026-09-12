/**
 * The ratchet, rule by rule.
 *
 * Two properties are pinned harder than the rest, because they are the ones that decide whether the
 * committed baseline survives contact with CI. A recorded number must be **relative to the run it
 * came from** — the same repository measured on a laptop and on a loaded runner must produce the
 * same verdict — and **silence must be the default in every case where the evidence is missing**: a
 * file that ran nothing, a file the baseline never saw, a file the baseline has that this shard did
 * not run. Every test below is one of those two, or the arithmetic they rest on.
 */
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BASELINE_DEFAULTS,
  PERF_BASELINE_VERSION,
  type PerfBaseline,
  baselineDrift,
  baselineRegressions,
  buildBaseline,
  formatBaseline,
  parseBaseline,
  readBaseline,
  writeBaseline,
} from './perf-baseline';
import type { PerfFile, PerfRun } from './perf-data';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const ROOT = '/repo';

const file = (path: string, over: Partial<PerfFile> = {}): PerfFile => ({
  file: join(ROOT, path),
  environment: 0,
  prepare: 0,
  setup: 0,
  imports: 0,
  tests: 0,
  testCount: 4,
  cases: [],
  ...over,
});

const run = (files: readonly PerfFile[]): PerfRun => ({ version: 2, root: ROOT, transform: 0, wall: 1_000, failed: 0, files });

/** Nine files at 100 ms, so the median of anything they are mixed into is 100. */
const ordinary = (): PerfFile[] => Array.from({ length: 9 }, (_unused, index) => file(`src/ordinary-${index}.spec.ts`, { tests: 100 }));

const baselineOf = (files: Readonly<Record<string, number>>, median = 100): PerfBaseline => ({
  version: PERF_BASELINE_VERSION,
  median,
  files,
});

const paths = (regressions: readonly { file: string }[]): string[] => regressions.map((regression) => regression.file);

describe('buildBaseline', () => {
  it('records each file as a multiple of the median of its own run, not as milliseconds', () => {
    const baseline = buildBaseline(run([...ordinary(), file('src/slow.spec.ts', { tests: 300 })]), ROOT);

    expect(baseline.median).toBe(100);
    expect(baseline.files['src/slow.spec.ts']).toBe(3);
    expect(baseline.files['src/ordinary-0.spec.ts']).toBe(1);
    expect(baseline.version).toBe(PERF_BASELINE_VERSION);
  });

  it('is unmoved by a machine that runs the whole suite five times slower', () => {
    const laptop = [...ordinary(), file('src/slow.spec.ts', { tests: 300 })];
    const runner = laptop.map((entry) => ({ ...entry, tests: entry.tests * 5 }));

    expect(buildBaseline(run(runner), ROOT).files).toEqual(buildBaseline(run(laptop), ROOT).files);
  });

  it('keeps a ratio to three decimals, so the committed file does not churn on noise', () => {
    const baseline = buildBaseline(
      run([file('a.spec.ts', { tests: 1 }), file('b.spec.ts', { tests: 3 }), file('c.spec.ts', { tests: 3 })]),
      ROOT,
    );

    expect(baseline.files['a.spec.ts']).toBe(0.333);
  });

  it('does not record a file that ran no test body: zero is not evidence that it is fast', () => {
    const baseline = buildBaseline(run([...ordinary(), file('src/skipped.spec.ts', { tests: 0, testCount: 0 })]), ROOT);

    expect(Object.keys(baseline.files)).not.toContain('src/skipped.spec.ts');
  });

  it('records a file a version 1 report gave no test count for, because its time says it ran', () => {
    const baseline = buildBaseline(run([...ordinary(), file('src/counted.spec.ts', { tests: 900, testCount: 0 })]), ROOT);

    expect(baseline.files['src/counted.spec.ts']).toBe(9);
  });

  it('records nothing when the run has no median to divide by, rather than a file full of Infinity', () => {
    const empty = buildBaseline(run([file('a.spec.ts'), file('b.spec.ts')]), ROOT);

    expect(empty).toEqual({ version: PERF_BASELINE_VERSION, median: 0, files: {} });
    expect(buildBaseline(run([]), ROOT).files).toEqual({});
  });
});

describe('formatBaseline', () => {
  it('sorts the paths and ends with a newline, so the committed file has a stable diff', () => {
    const text = formatBaseline(baselineOf({ 'src/b.spec.ts': 2, 'src/a.spec.ts': 1 }));

    expect(text).toBe(
      [
        '{',
        '  "version": 1,',
        '  "median": 100,',
        '  "files": {',
        '    "src/a.spec.ts": 1,',
        '    "src/b.spec.ts": 2',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('round-trips through parseBaseline unchanged', () => {
    const baseline = baselineOf({ 'src/a.spec.ts': 1.5 }, 240);

    expect(parseBaseline(formatBaseline(baseline))).toEqual(baseline);
  });
});

describe('parseBaseline', () => {
  it('refuses text that is not a baseline at all', () => {
    expect(parseBaseline('not json')).toBeUndefined();
    expect(parseBaseline('[]')).toBeUndefined();
  });

  it('refuses another version, an absent version and a version that is not a number', () => {
    expect(parseBaseline('{ "version": 2, "median": 1, "files": {} }')).toBeUndefined();
    expect(parseBaseline('{ "median": 1, "files": {} }')).toBeUndefined();
    expect(parseBaseline('{ "version": "1", "median": 1, "files": {} }')).toBeUndefined();
  });

  it('refuses a file map that is not a map', () => {
    expect(parseBaseline('{ "version": 1, "median": 1, "files": [] }')).toBeUndefined();
    expect(parseBaseline('{ "version": 1, "median": 1 }')).toBeUndefined();
  });

  it('drops an entry that is not a finite non-negative number and keeps the rest', () => {
    const baseline = parseBaseline('{ "version": 1, "median": 100, "files": { "a": 2, "b": -1, "c": "3", "d": 1e999 } }');

    expect(baseline?.files).toEqual({ a: 2 });
  });

  it('falls back to a median of 0 when the recorded one is absent or not a number', () => {
    expect(parseBaseline('{ "version": 1, "files": {} }')?.median).toBe(0);
    expect(parseBaseline('{ "version": 1, "median": 1e999, "files": {} }')?.median).toBe(0);
  });
});

describe('readBaseline', () => {
  it('reads a committed baseline from disk', () => {
    const root = createTempRepo({ 'perf-baseline.json': formatBaseline(baselineOf({ 'src/a.spec.ts': 4 }, 120)) });

    expect(readBaseline(join(root, 'perf-baseline.json'))).toEqual(baselineOf({ 'src/a.spec.ts': 4 }, 120));
  });

  it('answers undefined for a file that is not there, and for one that is not a baseline', () => {
    const root = createTempRepo({ 'junk.json': '{ "version": 9 }' });

    expect(readBaseline(join(root, 'missing.json'))).toBeUndefined();
    expect(readBaseline(join(root, 'junk.json'))).toBeUndefined();
  });
});

describe('writeBaseline', () => {
  it('writes a baseline that reads back as itself, creating the directory it lives in', () => {
    const root = createTempRepo({ 'package.json': '{}' });
    const path = join(root, 'nested', 'perf-baseline.json');

    writeBaseline(path, baselineOf({ 'src/a.spec.ts': 3 }, 80));

    expect(readBaseline(path)).toEqual(baselineOf({ 'src/a.spec.ts': 3 }, 80));
  });
});

describe('baselineRegressions', () => {
  it('defaults to a doubled ratio over half a second', () => {
    expect(BASELINE_DEFAULTS).toEqual({ factor: 2, floorMs: 500 });
  });

  it('reports a file whose ratio to the median grew by the factor and is over the floor', () => {
    const measured = run([...ordinary(), file('src/slow.spec.ts', { tests: 900 })]);
    const [regression, ...rest] = baselineRegressions(measured, ROOT, baselineOf({ 'src/slow.spec.ts': 3 }), BASELINE_DEFAULTS);

    expect(rest).toEqual([]);
    expect(regression).toEqual({ file: 'src/slow.spec.ts', ms: 900, ratio: 9, wasRatio: 3, grewBy: 3 });
  });

  it('reports nothing when the ratio grew but the file is under the floor', () => {
    const measured = run([...ordinary(), file('src/quick.spec.ts', { tests: 400 })]);

    expect(baselineRegressions(measured, ROOT, baselineOf({ 'src/quick.spec.ts': 0.5 }), BASELINE_DEFAULTS)).toEqual([]);
  });

  it('reports nothing when the file is over the floor but its ratio did not grow', () => {
    const measured = run([...ordinary(), file('src/slow.spec.ts', { tests: 900 })]);

    expect(baselineRegressions(measured, ROOT, baselineOf({ 'src/slow.spec.ts': 9 }), BASELINE_DEFAULTS)).toEqual([]);
  });

  it('reports nothing for a file the baseline does not know: it is new, not slower', () => {
    const measured = run([...ordinary(), file('src/new.spec.ts', { tests: 900 })]);

    expect(baselineRegressions(measured, ROOT, baselineOf({ 'src/other.spec.ts': 1 }), BASELINE_DEFAULTS)).toEqual([]);
  });

  it('never compares against a recorded ratio of 0, which would make every measurement infinite', () => {
    const measured = run([...ordinary(), file('src/slow.spec.ts', { tests: 900 })]);

    expect(baselineRegressions(measured, ROOT, baselineOf({ 'src/slow.spec.ts': 0 }), BASELINE_DEFAULTS)).toEqual([]);
  });

  it('reports nothing about a file that ran no test body, whatever the thresholds are', () => {
    const measured = run([...ordinary(), file('src/skipped.spec.ts', { tests: 0, testCount: 0 })]);

    expect(baselineRegressions(measured, ROOT, baselineOf({ 'src/skipped.spec.ts': 3 }), { factor: 0, floorMs: 0 })).toEqual([]);
  });

  it('compares nothing when this run has no median: a missing denominator is not a regression', () => {
    const measured = run([file('src/a.spec.ts'), file('src/b.spec.ts')]);

    expect(baselineRegressions(measured, ROOT, baselineOf({ 'src/a.spec.ts': 3 }), { factor: 1, floorMs: 0 })).toEqual([]);
  });

  it('reaches the same verdict on a runner where every file takes five times as long', () => {
    const laptop = [...ordinary(), file('src/slow.spec.ts', { tests: 900 })];
    const runner = laptop.map((entry) => ({ ...entry, tests: entry.tests * 5 }));
    const baseline = baselineOf({ 'src/slow.spec.ts': 3 });
    const verdict = (files: readonly PerfFile[]): unknown =>
      baselineRegressions(run(files), ROOT, baseline, BASELINE_DEFAULTS).map(({ file: path, ratio, grewBy }) => ({ path, ratio, grewBy }));

    expect(verdict(runner)).toEqual([{ path: 'src/slow.spec.ts', ratio: 9, grewBy: 3 }]);
    expect(verdict(laptop)).toEqual(verdict(runner));
  });

  it('sorts by how much the file grew, and by path when two grew the same', () => {
    const measured = run([
      ...ordinary(),
      file('src/b.spec.ts', { tests: 900 }),
      file('src/a.spec.ts', { tests: 900 }),
      file('src/worst.spec.ts', { tests: 1_500 }),
    ]);
    const baseline = baselineOf({ 'src/a.spec.ts': 3, 'src/b.spec.ts': 3, 'src/worst.spec.ts': 3 });

    expect(paths(baselineRegressions(measured, ROOT, baseline, BASELINE_DEFAULTS))).toEqual([
      'src/worst.spec.ts',
      'src/a.spec.ts',
      'src/b.spec.ts',
    ]);
  });
});

describe('baselineDrift', () => {
  it('names what the baseline knows and this run did not measure, and what this run added', () => {
    const measured = run([
      file('src/kept.spec.ts', { tests: 100 }),
      file('src/newer.spec.ts', { tests: 100 }),
      file('src/new.spec.ts', { tests: 100 }),
    ]);
    const baseline = baselineOf({ 'src/kept.spec.ts': 1, 'src/gone.spec.ts': 1, 'src/absent.spec.ts': 1 });

    expect(baselineDrift(measured, ROOT, baseline)).toEqual({
      missing: ['src/absent.spec.ts', 'src/gone.spec.ts'],
      added: ['src/new.spec.ts', 'src/newer.spec.ts'],
    });
  });

  it('counts a file that ran nothing as neither added nor measured', () => {
    const measured = run([file('src/kept.spec.ts', { tests: 100 }), file('src/skipped.spec.ts', { tests: 0, testCount: 0 })]);

    expect(baselineDrift(measured, ROOT, baselineOf({ 'src/kept.spec.ts': 1, 'src/skipped.spec.ts': 1 }))).toEqual({
      missing: ['src/skipped.spec.ts'],
      added: [],
    });
  });
});
