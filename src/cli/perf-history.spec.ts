import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { readTextFile, writeTextFile } from './fs-scan';
import type { CliIo } from './main';
import { renderPerf } from './perf';
import { BASELINE_DEFAULTS } from './perf-baseline';
import type { PerfFile, PerfRun } from './perf-data';
import { GATE_DEFAULTS } from './perf-gate';
import type { HistoryEntry } from './perf-history';
import {
  HISTORY_LIMIT,
  PERF_HISTORY_VERSION,
  appendHistory,
  historyDrift,
  historyEntry,
  historyRegressions,
  isHistoryPath,
  readHistory,
} from './perf-history';
import type { PerfSource } from './perf-run';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const ROOT = '/repo';

const file = (path: string, tests: number, root = ROOT): PerfFile => ({
  file: join(root, path),
  environment: 0,
  prepare: 0,
  setup: 0,
  imports: 0,
  tests,
  testCount: 4,
  cases: [],
});

/** Nine files at 100 ms around the one under test, so the median of the run is 100. */
const runWith = (tests: number, root = ROOT): PerfRun => ({
  version: 3,
  root,
  transform: 0,
  wall: 1_000,
  failed: 0,
  files: [
    ...Array.from({ length: 9 }, (_unused, index) => file(`src/ordinary-${index}.spec.ts`, 100, root)),
    file('src/grew.spec.ts', tests, root),
  ],
});

const entry = (shares: Readonly<Record<string, number>>): HistoryEntry => ({
  version: PERF_HISTORY_VERSION,
  at: '2026-09-01T00:00:00.000Z',
  median: 100,
  files: shares,
});

const history = (...grew: readonly number[]): HistoryEntry[] => grew.map((share) => entry({ 'src/grew.spec.ts': share }));

describe('isHistoryPath', () => {
  it('is a JSON Lines file, and a baseline otherwise', () => {
    expect(isHistoryPath('ci/perf-history.jsonl')).toBe(true);
    expect(isHistoryPath('perf-baseline.json')).toBe(false);
  });
});

describe('historyEntry', () => {
  it('records the shares the baseline would, when, and the commit CI names', () => {
    const recorded = historyEntry(runWith(300), ROOT, new Date('2026-09-17T10:00:00Z'), { CI_COMMIT_SHA: 'abc' });

    expect(recorded).toMatchObject({ version: 1, at: '2026-09-17T10:00:00.000Z', commit: 'abc', median: 100 });
    expect(recorded.files['src/grew.spec.ts']).toBe(3);
    expect(historyEntry(runWith(300), ROOT, new Date(0), { GITHUB_SHA: 'def' }).commit).toBe('def');
    expect(historyEntry(runWith(300), ROOT, new Date(0), { CI_COMMIT_SHA: '' })).not.toHaveProperty('commit');
  });
});

describe('readHistory and appendHistory', () => {
  it('appends a line per run, keeps the last ones, and reads them back oldest first', () => {
    const path = join(createTempRepo({}), 'ci/perf-history.jsonl');

    for (let index = 0; index < 3; index += 1) {
      expect(appendHistory(path, { ...entry({ 'a.spec.ts': index }), at: `run-${index}` }, 2)).toBe(Math.min(index + 1, 2));
    }

    expect(readHistory(path).map((each) => each.at)).toEqual(['run-1', 'run-2']);
    expect(readTextFile(path)?.split('\n')).toHaveLength(3);
    expect(HISTORY_LIMIT).toBe(30);
  });

  it('skips a broken line, a foreign version and a share that is not a number, and reads nothing from no file', () => {
    const path = join(createTempRepo({}), 'perf-history.jsonl');

    writeTextFile(
      path,
      [
        '{"version":1,"at":"ok","median":"x","files":{"a":1,"b":-1,"c":"2"},"commit":7}',
        '{"version":1,"at":"sha","median":50,"files":{},"commit":"abc"}',
        '{"version":1,"at":"cut',
        '{"version":2,"at":"later","files":{}}',
        '{"version":1,"files":{}}',
        '',
      ].join('\n'),
    );

    expect(readHistory(path)).toEqual([
      { version: 1, at: 'ok', median: 0, files: { a: 1 } },
      { version: 1, at: 'sha', commit: 'abc', median: 50, files: {} },
    ]);
    expect(readHistory(join(path, 'missing.jsonl'))).toEqual([]);
  });
});

describe('historyRegressions', () => {
  it('flags a file over factor × its mean share and over every recorded share', () => {
    const [found] = historyRegressions(runWith(1_000), ROOT, history(2, 3, 4), BASELINE_DEFAULTS);

    expect(found).toEqual({ file: 'src/grew.spec.ts', ms: 1_000, ratio: 10, wasRatio: 3, grewBy: 10 / 3, runs: 3, mean: 3, max: 4 });
  });

  it('leaves a file that has been this slow before, even at twice its mean', () => {
    expect(historyRegressions(runWith(700), ROOT, history(1, 1, 7), BASELINE_DEFAULTS)).toEqual([]);
  });

  it('says nothing without enough runs, under the floor, below the factor, or with no median to divide by', () => {
    expect(historyRegressions(runWith(1_000), ROOT, history(2, 2), BASELINE_DEFAULTS)).toEqual([]);
    expect(historyRegressions(runWith(400), ROOT, history(1, 1, 1), BASELINE_DEFAULTS)).toEqual([]);
    expect(historyRegressions(runWith(1_000), ROOT, history(6, 6, 6), BASELINE_DEFAULTS)).toEqual([]);
    expect(historyRegressions(runWith(1_000), ROOT, history(0, 0, 0), BASELINE_DEFAULTS)).toEqual([]);

    const idle: PerfRun = { ...runWith(1_000), files: runWith(1_000).files.map((each) => ({ ...each, tests: 0, testCount: 0 })) };

    expect(historyRegressions(idle, ROOT, history(1, 1, 1), BASELINE_DEFAULTS)).toEqual([]);
  });

  it('ranks the largest growth first, and a tie by path', () => {
    const run: PerfRun = {
      ...runWith(1_000),
      files: [...runWith(1_000).files, file('src/also.spec.ts', 800), file('src/tied.spec.ts', 1_000)],
    };
    const entries = [1, 2, 3].map(() => entry({ 'src/grew.spec.ts': 2, 'src/also.spec.ts': 1, 'src/tied.spec.ts': 2 }));

    expect(historyRegressions(run, ROOT, entries, BASELINE_DEFAULTS).map((each) => each.file)).toEqual([
      'src/also.spec.ts',
      'src/grew.spec.ts',
      'src/tied.spec.ts',
    ]);
  });
});

describe('historyDrift', () => {
  it('names new files against every run, and missing ones against the latest', () => {
    const entries = [
      entry({ 'src/gone.spec.ts': 1 }),
      entry({ 'src/grew.spec.ts': 1, 'src/shard-b.spec.ts': 1, 'src/shard-a.spec.ts': 1 }),
    ];
    const drift = historyDrift(runWith(100), ROOT, entries);

    expect(drift.missing).toEqual(['src/shard-a.spec.ts', 'src/shard-b.spec.ts']);
    expect(drift.added).toEqual(Array.from({ length: 9 }, (_unused, index) => `src/ordinary-${index}.spec.ts`));
    expect(historyDrift(runWith(100), ROOT, [])).toEqual({ missing: [], added: drift.added.concat('src/grew.spec.ts').sort() });
  });
});

describe('renderPerf with a history', () => {
  interface Recorder extends CliIo {
    readonly stdout: string[];
    readonly stderr: string[];
  }

  const recorder = (): Recorder => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    return { stdout, stderr, out: (line) => stdout.push(line), err: (line) => stderr.push(line) };
  };

  it('records runs, then gates a file that grew past its history and confirms it', () => {
    const root = createTempRepo({ 'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }) });
    const path = join(root, 'perf-history.jsonl');
    const baseline = { path, update: true, options: BASELINE_DEFAULTS };

    for (const tests of [200, 300, 250]) {
      const io = recorder();

      expect(renderPerf({ ok: true, run: runWith(tests, root), runFailed: false }, readProfile(root), io, { baseline })).toBe(0);
      expect(io.stdout.join('\n')).toContain('perf history: recorded 10 files at a median of 100ms');
    }

    const io = recorder();
    const remeasure = (): PerfSource => ({
      ok: true,
      run: { ...runWith(0, root), files: [file('src/grew.spec.ts', 2_000, root)] },
      runFailed: false,
    });

    expect(
      renderPerf({ ok: true, run: runWith(2_000, root), runFailed: false }, readProfile(root), io, {
        baseline: { ...baseline, update: false },
        gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false },
      }),
    ).toBe(1);

    const out = io.stdout.join('\n');

    expect(out).toContain('perf history: 3 recorded runs; 0 files this run measured are new to it');
    expect(out).toContain('error  perf-gate-regression src/grew.spec.ts');
    expect(out).toContain('8.0× their mean share of the run in the recorded history');
    expect(out).toContain('2× its mean share over 3 recorded runs, and above the largest of them');
  });

  it('warns when there is no history to read', () => {
    const root = createTempRepo({ 'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }) });
    const io = recorder();

    expect(
      renderPerf({ ok: true, run: runWith(100, root), runFailed: false }, readProfile(root), io, {
        baseline: { path: join(root, 'none.jsonl'), update: false, options: BASELINE_DEFAULTS },
      }),
    ).toBe(0);
    expect(io.stderr.join('\n')).toContain('No history to compare against');
  });
});
