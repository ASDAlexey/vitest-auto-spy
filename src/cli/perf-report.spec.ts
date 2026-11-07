import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeTextFile } from './fs-scan';
import { BASELINE_DEFAULTS } from './perf-baseline';
import type { PerfFile, PerfRun } from './perf-data';
import { gateVerdict } from './perf-gate';
import { baselineCandidates } from './perf-report';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(removeTempRepos);

describe('baseline confirmation floors', () => {
  const io = { out: (): void => undefined, err: (): void => undefined };

  function measured(root: string, tests: number): PerfRun {
    const file = (name: string, ms: number): PerfFile => ({
      file: join(root, name),
      environment: 0,
      prepare: 0,
      setup: 0,
      imports: 0,
      tests: ms,
      testCount: 4,
      cases: [],
    });

    return {
      version: 3,
      root,
      transform: 0,
      wall: 2_000,
      failed: 0,
      files: [file('a.spec.ts', 100), file('b.spec.ts', 100), file('grew.spec.ts', tests)],
    };
  }

  it.each(['baseline.json', 'history.jsonl'])('keeps the absolute floor during confirmation against %s', (name) => {
    const root = createTempRepo({});
    const path = join(root, name);
    const record = { version: 1, median: 100, files: { 'grew.spec.ts': 0.25 } };
    const data = name.endsWith('.jsonl')
      ? [1, 2, 3].map((at) => JSON.stringify({ ...record, at: String(at) })).join('\n')
      : JSON.stringify(record);

    writeTextFile(path, data);
    const candidates = baselineCandidates(measured(root, 950), root, { path, update: false, options: BASELINE_DEFAULTS }, io);

    expect(candidates).toEqual([expect.objectContaining({ check: 'perf-gate-regression', file: 'grew.spec.ts', budget: 500 })]);
    expect(candidates[0]?.budgetNote).toContain('--baseline-floor-ms 500');

    for (const tests of [119, 212, 499]) {
      const verdict = gateVerdict(candidates, measured(root, tests), root, false);

      expect(verdict.failed).toBe(false);
      expect(verdict.rows).toEqual([expect.objectContaining({ again: tests, outcome: 'not reproduced' })]);
    }

    for (const tests of [500, 700]) {
      const verdict = gateVerdict(candidates, measured(root, tests), root, false);

      expect(verdict.failed).toBe(true);
      expect(verdict.rows).toEqual([expect.objectContaining({ again: tests, outcome: 'confirmed' })]);
    }
  });
});
