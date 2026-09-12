/**
 * Merging sharded perf reports, rule by rule.
 *
 * Two of the rules are pinned harder than the rest, because both are silent when they are wrong.
 * The **wall clock** is the largest of the reports and never their sum — a summed one reads as a
 * suite four times slower than it is, and nothing in the output would say so. And a **file measured
 * twice** keeps the slower of the two measurements whole, rather than the larger of each phase,
 * because a field-by-field maximum is a file nobody ran.
 */
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { PerfFile, PerfRun } from './perf-data';
import { PERF_FORMAT_VERSION } from './perf-data';
import type { MergeInput } from './perf-merge';
import { describeMerge, mergeRuns, readRuns, resolveReportPaths } from './perf-merge';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
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

const run = (over: Partial<PerfRun> = {}): PerfRun => ({ version: 2, root: '/repo', transform: 0, wall: 0, failed: 0, files: [], ...over });

const input = (path: string, over: Partial<PerfRun> = {}): MergeInput => ({ path, run: run(over) });

const paths = (result: { readonly run: PerfRun }): string[] => result.run.files.map((entry) => entry.file);

const REPORT = JSON.stringify(run({ root: '/repo', transform: 100, wall: 200, files: [file('/repo/src/a.spec.ts', { tests: 10 })] }));

describe('mergeRuns', () => {
  it('sums the transform time of every report, because it is a whole-run number in each of them', () => {
    const merged = mergeRuns([input('one.json', { transform: 1_000 }), input('two.json', { transform: 2_500 })]);

    expect(merged.run.transform).toBe(3_500);
  });

  it('takes the largest wall clock and never the sum, because the shards ran at the same time', () => {
    const merged = mergeRuns([
      input('one.json', { wall: 90_000 }),
      input('two.json', { wall: 120_000 }),
      input('three.json', { wall: 80_000 }),
    ]);

    expect(merged.run.wall).toBe(120_000);
  });

  it('is only as rich as its poorest input, so the version is the minimum of the reports', () => {
    expect(mergeRuns([input('one.json', { version: 2 }), input('two.json', { version: 1 })]).run.version).toBe(1);
    expect(mergeRuns([input('one.json', { version: 2 }), input('two.json', { version: 2 })]).run.version).toBe(PERF_FORMAT_VERSION);
  });

  it('collects the files of every report, sorted by path', () => {
    const merged = mergeRuns([
      input('one.json', { files: [file('/repo/src/z.spec.ts'), file('/repo/src/b.spec.ts')] }),
      input('two.json', { files: [file('/repo/src/a.spec.ts')] }),
    ]);

    expect(paths(merged)).toEqual(['/repo/src/a.spec.ts', '/repo/src/b.spec.ts', '/repo/src/z.spec.ts']);
    expect(merged.duplicates).toEqual([]);
    expect(merged.empty).toEqual([]);
  });

  it('keeps the first non-empty root and moves the files of the other checkouts onto it', () => {
    const merged = mergeRuns([
      input('one.json', { root: '/builds/job-1/repo', files: [file('/builds/job-1/repo/src/a.spec.ts')] }),
      input('two.json', { root: '/builds/job-2/repo', files: [file('/builds/job-2/repo/src/b.spec.ts')] }),
    ]);

    expect(merged.run.root).toBe('/builds/job-1/repo');
    expect(paths(merged)).toEqual(['/builds/job-1/repo/src/a.spec.ts', '/builds/job-1/repo/src/b.spec.ts']);
  });

  it('reads a root with a trailing separator as the same root', () => {
    const merged = mergeRuns([
      input('one.json', { root: '/repo/', files: [file('/repo/src/a.spec.ts')] }),
      input('two.json', { root: '/repo', files: [file('/repo/src/b.spec.ts')] }),
    ]);

    expect(merged.run.root).toBe('/repo');
    expect(paths(merged)).toEqual(['/repo/src/a.spec.ts', '/repo/src/b.spec.ts']);
  });

  it('leaves the files of a report with no root of its own exactly where they were measured', () => {
    const merged = mergeRuns([input('one.json', { root: '', files: [file('/elsewhere/src/a.spec.ts')] })]);

    expect(merged.run.root).toBe('');
    expect(paths(merged)).toEqual(['/elsewhere/src/a.spec.ts']);
  });

  it('takes the root of the first report that has one', () => {
    const merged = mergeRuns([input('one.json', { root: '' }), input('two.json', { root: '/repo' })]);

    expect(merged.run.root).toBe('/repo');
  });

  it('does not move a file that only looks like it sits under its report root', () => {
    const merged = mergeRuns([
      input('one.json', { root: '/repo', files: [file('/repo/src/a.spec.ts')] }),
      input('two.json', { root: '/other', files: [file('/otherwise/src/b.spec.ts'), file('/unrelated/src/c.spec.ts')] }),
    ]);

    expect(paths(merged)).toEqual(['/otherwise/src/b.spec.ts', '/repo/src/a.spec.ts', '/unrelated/src/c.spec.ts']);
  });

  it('keeps the slower measurement of a file two reports carried, and names the file and the reports', () => {
    const slow = file('/repo/src/a.spec.ts', { environment: 400, tests: 700, testCount: 9 });
    const fast = file('/repo/src/a.spec.ts', { environment: 900, tests: 100, testCount: 3 });
    const merged = mergeRuns([input('two.json', { files: [fast] }), input('one.json', { files: [slow] })]);

    expect(merged.run.files).toEqual([slow]);
    expect(merged.duplicates).toEqual(['/repo/src/a.spec.ts (two.json, one.json)']);
  });

  it('keeps the measurement read first when two reports agree on the time', () => {
    const first = file('/repo/src/a.spec.ts', { tests: 500, testCount: 9 });
    const second = file('/repo/src/a.spec.ts', { tests: 500, testCount: 3 });
    const merged = mergeRuns([input('one.json', { files: [first] }), input('two.json', { files: [second] })]);

    expect(merged.run.files[0]?.testCount).toBe(9);
  });

  it('recognises the same file across two checkouts, because the paths were moved onto one root first', () => {
    const merged = mergeRuns([
      input('one.json', { root: '/builds/job-1', files: [file('/builds/job-1/src/a.spec.ts', { tests: 10 })] }),
      input('two.json', { root: '/builds/job-2', files: [file('/builds/job-2/src/a.spec.ts', { tests: 90 })] }),
    ]);

    expect(paths(merged)).toEqual(['/builds/job-1/src/a.spec.ts']);
    expect(merged.run.files[0]?.tests).toBe(90);
    expect(merged.duplicates).toEqual(['/builds/job-1/src/a.spec.ts (one.json, two.json)']);
  });

  it('names the reports that carried no file at all, sorted', () => {
    const merged = mergeRuns([input('z.json'), input('one.json', { files: [file('/repo/src/a.spec.ts')] }), input('a.json')]);

    expect(merged.empty).toEqual(['a.json', 'z.json']);
  });

  it('merges nothing into an empty report rather than failing', () => {
    const merged = mergeRuns([]);

    expect(merged).toEqual({
      run: { version: PERF_FORMAT_VERSION, root: '', transform: 0, wall: 0, failed: 0, files: [] },
      duplicates: [],
      empty: [],
    });
  });
});

describe('readRuns', () => {
  it('keeps the reports that parse and names the ones that did not', () => {
    const root = createTempRepo({ 'good.json': REPORT, 'bad.json': 'not json at all', 'other.json': '{ "files": [] }' });
    const result = readRuns([join(root, 'good.json'), join(root, 'bad.json'), join(root, 'other.json'), join(root, 'missing.json')]);

    expect(result.inputs.map((entry) => entry.path)).toEqual([join(root, 'good.json')]);
    expect(result.inputs[0]?.run.files.map((entry) => entry.file)).toEqual(['/repo/src/a.spec.ts']);
    expect(result.failed).toEqual([join(root, 'bad.json'), join(root, 'other.json'), join(root, 'missing.json')]);
  });

  it('reads a repeated path once, so two values expanding onto one report do not double its time', () => {
    const root = createTempRepo({ 'perf.json': REPORT });
    const result = readRuns([join(root, 'perf.json'), join(root, 'perf.json')]);

    expect(result.inputs).toHaveLength(1);
    expect(mergeRuns(result.inputs).run.transform).toBe(100);
  });

  it('has nothing to read in an empty list', () => {
    expect(readRuns([])).toEqual({ inputs: [], failed: [] });
  });
});

describe('resolveReportPaths', () => {
  const repo = (): string =>
    createTempRepo({
      'reports/perf-1.json': REPORT,
      'reports/perf-2.json': REPORT,
      'reports/notes.txt': '',
      'reports/shard-1/perf-3.json': REPORT,
      'reports/dist/perf-4.json': REPORT,
    });

  it('takes a path to a file as itself, resolved against the working directory', () => {
    expect(resolveReportPaths('reports/perf-1.json', '/cwd')).toEqual([join('/cwd', 'reports/perf-1.json')]);
  });

  it('leaves an absolute value alone', () => {
    expect(resolveReportPaths('/elsewhere/perf.json', '/cwd')).toEqual(['/elsewhere/perf.json']);
  });

  it('takes a path that does not exist as itself, so the caller can name it', () => {
    const root = repo();

    expect(resolveReportPaths('reports/missing.json', root)).toEqual([join(root, 'reports/missing.json')]);
  });

  it('expands a directory into the json files directly in it', () => {
    const root = repo();

    expect(resolveReportPaths('reports', root)).toEqual([join(root, 'reports/perf-1.json'), join(root, 'reports/perf-2.json')]);
  });

  it('expands a one-segment pattern against the files directly in its directory', () => {
    const root = repo();

    expect(resolveReportPaths('reports/perf-*.json', root)).toEqual([join(root, 'reports/perf-1.json'), join(root, 'reports/perf-2.json')]);
  });

  it('expands a `**` pattern against every file under its directory', () => {
    const root = repo();

    expect(resolveReportPaths('reports/**/perf-*.json', root)).toEqual([
      join(root, 'reports/perf-1.json'),
      join(root, 'reports/perf-2.json'),
      join(root, 'reports/shard-1/perf-3.json'),
    ]);
  });

  it('does not descend into a build-output directory, so the base has to be where the reports are', () => {
    const root = repo();

    expect(resolveReportPaths('reports/**/perf-*.json', root)).not.toContain(join(root, 'reports/dist/perf-4.json'));
    expect(resolveReportPaths('reports/dist/perf-*.json', root)).toEqual([join(root, 'reports/dist/perf-4.json')]);
  });

  it('matches nothing when the pattern names a directory that is not there', () => {
    const root = repo();

    expect(resolveReportPaths('missing/*.json', root)).toEqual([]);
  });

  it('matches a literal dot rather than any character', () => {
    const root = createTempRepo({ 'reports/perf.json': REPORT, 'reports/perfXjson': REPORT });

    expect(resolveReportPaths('reports/*.json', root)).toEqual([join(root, 'reports/perf.json')]);
    expect(resolveReportPaths('reports/perf*json', root)).toEqual([join(root, 'reports/perf.json'), join(root, 'reports/perfXjson')]);
  });

  it('takes an unsupported pattern literally instead of quietly matching nothing', () => {
    const root = repo();

    expect(resolveReportPaths('reports/*/shard/*.json', root)).toEqual([join(root, 'reports/*/shard/*.json')]);
    expect(resolveReportPaths('reports/**', root)).toEqual([join(root, 'reports/**')]);
    expect(resolveReportPaths('reports/**.json', root)).toEqual([join(root, 'reports/**.json')]);
  });
});

describe('describeMerge', () => {
  it('says there is nothing to merge when no report was read', () => {
    expect(describeMerge(mergeRuns([]), 0)).toBe('No perf report was read, so there is nothing to merge.');
  });

  it('states how the two whole-run numbers were arrived at', () => {
    const merged = mergeRuns([
      input('one.json', { transform: 1_000, wall: 20_000, files: [file('/repo/src/a.spec.ts')] }),
      input('two.json', { transform: 1_500, wall: 30_000, files: [file('/repo/src/b.spec.ts')] }),
    ]);

    expect(describeMerge(merged, 2)).toBe(
      'Merged 2 reports into 2 files: transform 2.50s summed, wall 30.00s (the longest report, not the sum).',
    );
  });

  it('counts one report and one file in the singular', () => {
    const merged = mergeRuns([input('one.json', { files: [file('/repo/src/a.spec.ts')] })]);

    expect(describeMerge(merged, 1)).toContain('Merged 1 report into 1 file:');
  });

  it('says out loud that a file was measured twice and which measurement was kept', () => {
    const merged = mergeRuns([
      input('one.json', { files: [file('/repo/src/a.spec.ts', { tests: 10 })] }),
      input('two.json', { files: [file('/repo/src/a.spec.ts', { tests: 90 })] }),
    ]);

    expect(describeMerge(merged, 2)).toContain('1 file appeared in more than one report and kept the slower measurement.');
  });

  it('names the reports that measured nothing', () => {
    const merged = mergeRuns([input('one.json', { files: [file('/repo/src/a.spec.ts')] }), input('empty.json'), input('idle.json')]);

    expect(describeMerge(merged, 3)).toContain('2 reports carried no file at all: empty.json, idle.json.');
  });
});
