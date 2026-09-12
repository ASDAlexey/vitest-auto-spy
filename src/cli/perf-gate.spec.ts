/**
 * The gate, rule by rule.
 *
 * Two properties are pinned harder than the rest, because they are the ones that decide whether
 * anybody leaves the gate switched on. A finding must be **relative to the run it is in** — the
 * same file on a loaded runner and on an idle laptop must not change verdict — and it must
 * **survive a second measurement**, or it is reported as not reproduced rather than as somebody's
 * defect. Every test below is one of those two, or the arithmetic they rest on.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { PerfCase, PerfFile, PerfRun } from './perf-data';
import { GATE_DEFAULTS, gateCandidates, gateVerdict, isJudged, measuredFiles, medianFileMs, suspectFiles } from './perf-gate';

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

const run = (files: readonly PerfFile[], wall = 1_000): PerfRun => ({ version: 2, root: ROOT, transform: 0, wall, failed: 0, files });

/** Nine ordinary files, so the median is a median of something. */
const ordinary = (): PerfFile[] => Array.from({ length: 9 }, (_unused, index) => file(`src/ordinary-${index}.spec.ts`, { tests: 100 }));

const slowBody = (name: string, ms: number): PerfCase[] => [{ name, ms }];

describe('measuredFiles', () => {
  it('keys by repository-relative path and drops anything outside the repository', () => {
    const measured = measuredFiles(run([file('src/a.spec.ts'), { ...file('x'), file: '/elsewhere/b.spec.ts' }]), ROOT);

    expect([...measured.keys()]).toEqual(['src/a.spec.ts']);
  });
});

describe('isJudged', () => {
  it('judges everything when nothing was named', () => {
    expect(isJudged('libs/a/x.spec.ts', [])).toBe(true);
  });

  it('judges a named file, anything under a named directory, and nothing else', () => {
    expect(isJudged('libs/a/x.spec.ts', ['libs/a/x.spec.ts'])).toBe(true);
    expect(isJudged('libs/a/x.spec.ts', ['libs/a'])).toBe(true);
    expect(isJudged('libs/a/x.spec.ts', ['libs/a/'])).toBe(true);
    expect(isJudged('libs/ab/x.spec.ts', ['libs/a'])).toBe(false);
    expect(isJudged('libs/a/x.spec.ts', ['apps/web'])).toBe(false);
  });
});

describe('medianFileMs', () => {
  it('is the middle file, and the mean of the middle two when the count is even', () => {
    expect(medianFileMs([file('a', { tests: 10 }), file('b', { tests: 30 }), file('c', { tests: 50 })])).toBe(30);
    expect(medianFileMs([file('a', { tests: 10 }), file('b', { tests: 30 })])).toBe(20);
    expect(medianFileMs([])).toBe(0);
  });

  it('ignores a file that ran nothing: an empty file is not evidence that the suite is fast', () => {
    expect(medianFileMs([file('a', { tests: 10 }), file('b', { tests: 30 }), file('c', { tests: 0, testCount: 0 })])).toBe(20);
  });
});

describe('gateCandidates', () => {
  it('finds a body over the budget and names the test rather than the file', () => {
    const subject = file('src/slow.spec.ts', { tests: 4_000, cases: slowBody('suite > waits', 3_500) });
    const [candidate, ...rest] = gateCandidates(run([...ordinary(), subject]), ROOT, GATE_DEFAULTS);

    expect(rest).toEqual([]);
    expect(candidate).toMatchObject({ check: 'perf-gate-slow-test', file: 'src/slow.spec.ts', name: 'suite > waits', ms: 3_500 });
  });

  it('reports the file only when no single body in it is the problem', () => {
    const subject = file('src/heavy.spec.ts', { tests: 9_000, testCount: 40 });
    const [candidate] = gateCandidates(run([...ordinary(), subject]), ROOT, GATE_DEFAULTS);

    expect(candidate).toMatchObject({ check: 'perf-gate-slow-file', file: 'src/heavy.spec.ts', ms: 9_000 });
    expect(candidate?.budgetNote).toContain('10×');
  });

  it('says nothing about a file that is slow the way the whole run is slow', () => {
    const even = Array.from({ length: 10 }, (_unused, index) => file(`src/even-${index}.spec.ts`, { tests: 6_000 }));

    expect(gateCandidates(run(even), ROOT, GATE_DEFAULTS)).toEqual([]);
  });

  it('applies the absolute floor when the median is tiny, and never below it', () => {
    const tiny = Array.from({ length: 9 }, (_unused, index) => file(`src/tiny-${index}.spec.ts`, { tests: 1 }));
    const subject = file('src/heavy.spec.ts', { tests: 4_900 });

    expect(gateCandidates(run([...tiny, subject]), ROOT, GATE_DEFAULTS)).toEqual([]);
    expect(gateCandidates(run([...tiny, file('src/heavy.spec.ts', { tests: 5_100 })]), ROOT, GATE_DEFAULTS)).toHaveLength(1);
  });

  it('judges only the files it was pointed at', () => {
    const mine = file('libs/mine/slow.spec.ts', { tests: 9_000 });
    const theirs = file('libs/theirs/slow.spec.ts', { tests: 9_000 });
    const scoped = gateCandidates(run([...ordinary(), mine, theirs]), ROOT, { ...GATE_DEFAULTS, only: ['libs/mine'] });

    expect(suspectFiles(scoped)).toEqual(['libs/mine/slow.spec.ts']);
  });

  it('adds the whole-run budget only when one was asked for', () => {
    const fast = run(ordinary(), 30_000);

    expect(gateCandidates(fast, ROOT, GATE_DEFAULTS)).toEqual([]);
    expect(gateCandidates(fast, ROOT, { ...GATE_DEFAULTS, maxWallMs: 10_000 })).toMatchObject([{ check: 'perf-gate-wall', ms: 30_000 }]);
    expect(gateCandidates(fast, ROOT, { ...GATE_DEFAULTS, maxWallMs: 40_000 })).toEqual([]);
  });
});

describe('suspectFiles', () => {
  it('is every file a candidate named, once each, and never the whole-run finding', () => {
    const candidates = gateCandidates(
      run([...ordinary(), file('src/a.spec.ts', { tests: 9_000, cases: [...slowBody('one', 2_000), ...slowBody('two', 1_500)] })], 30_000),
      ROOT,
      { ...GATE_DEFAULTS, maxWallMs: 10_000 },
    );

    expect(suspectFiles(candidates)).toEqual(['src/a.spec.ts']);
  });
});

describe('gateVerdict', () => {
  const candidatesFor = (subject: PerfFile, options = GATE_DEFAULTS) => gateCandidates(run([...ordinary(), subject]), ROOT, options);

  it('fails on a candidate the second measurement reproduces, and prints both numbers', () => {
    const candidates = candidatesFor(file('src/slow.spec.ts', { tests: 4_000, cases: slowBody('suite > waits', 3_500) }));
    const second = run([file('src/slow.spec.ts', { tests: 3_100, cases: slowBody('suite > waits', 3_000) })]);
    const verdict = gateVerdict(candidates, second, ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0]?.severity).toBe('error');
    expect(verdict.findings[0]?.message).toContain('3.50s');
    expect(verdict.findings[0]?.message).toContain('Re-measured on its own: 3.00s');
  });

  it('reports a candidate the second measurement does not reproduce as no defect at all', () => {
    const candidates = candidatesFor(file('src/slow.spec.ts', { tests: 4_000, cases: slowBody('suite > waits', 3_500) }));
    const verdict = gateVerdict(candidates, run([file('src/slow.spec.ts', { tests: 90, cases: [] })]), ROOT, false);

    expect(verdict.failed).toBe(false);
    expect(verdict.findings[0]?.severity).toBe('info');
    expect(verdict.findings[0]?.message).toContain('0ms or less');
    expect(verdict.findings[0]?.message).toContain('sharing a worker');
  });

  it('treats a file the second run did not measure as unconfirmed rather than as confirmed', () => {
    const candidates = candidatesFor(file('src/slow.spec.ts', { tests: 9_000 }));
    const verdict = gateVerdict(candidates, run([file('src/elsewhere.spec.ts', { tests: 10 })]), ROOT, false);

    expect(verdict.failed).toBe(false);
    expect(verdict.findings[0]?.severity).toBe('warning');
    expect(verdict.findings[0]?.message).toContain('never confirmed');
  });

  it('fails on one reading when the caller said that is enough', () => {
    const candidates = candidatesFor(file('src/slow.spec.ts', { tests: 9_000 }));
    const verdict = gateVerdict(candidates, undefined, ROOT, true);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0]?.severity).toBe('error');
  });

  it('fails the whole-run budget without a second measurement, and says why there is none', () => {
    const candidates = gateCandidates(run(ordinary(), 30_000), ROOT, { ...GATE_DEFAULTS, maxWallMs: 10_000 });
    const verdict = gateVerdict(candidates, undefined, ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0]).toMatchObject({ check: 'perf-gate-wall', severity: 'error' });
    expect(verdict.findings[0]?.file).toBeUndefined();
    expect(verdict.findings[0]?.message).toContain('the same suite again');
  });

  it('names a fix that fits the rule that fired', () => {
    const body = gateVerdict(
      candidatesFor(file('src/a.spec.ts', { tests: 4_000, cases: slowBody('waits', 3_500) })),
      undefined,
      ROOT,
      true,
    );
    const whole = gateVerdict(candidatesFor(file('src/b.spec.ts', { tests: 9_000 })), undefined, ROOT, true);

    expect(body.findings[0]?.fix).toContain('vi.useFakeTimers()');
    expect(whole.findings[0]?.fix).toContain('Splitting the file changes nothing');
  });
});

describe('gateVerdict, the paths the confirmation pass takes', () => {
  it('confirms a file finding against the file total, not against a body', () => {
    const subject = file('src/heavy.spec.ts', { tests: 9_000, testCount: 40 });
    const candidates = gateCandidates(run([...ordinary(), subject]), ROOT, GATE_DEFAULTS);
    const verdict = gateVerdict(candidates, run([file('src/heavy.spec.ts', { tests: 8_000 })]), ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0]?.message).toContain('Re-measured on its own: 8.00s');
  });

  it('leaves the whole-run finding alone even when a second measurement exists', () => {
    const candidates = gateCandidates(run(ordinary(), 30_000), ROOT, { ...GATE_DEFAULTS, maxWallMs: 10_000 });
    const verdict = gateVerdict(candidates, run(ordinary(), 100), ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0]?.message).toContain('is not re-measured');
  });
});

describe('gateVerdict, the wording of a candidate that did not reproduce', () => {
  it('prints the second reading plainly when the report still carried the body', () => {
    const subject = file('src/slow.spec.ts', { tests: 4_000, cases: slowBody('suite > waits', 3_500) });
    const candidates = gateCandidates(run([...ordinary(), subject]), ROOT, GATE_DEFAULTS);
    const verdict = gateVerdict(
      candidates,
      run([file('src/slow.spec.ts', { tests: 700, cases: slowBody('suite > waits', 600) })]),
      ROOT,
      false,
    );

    expect(verdict.findings[0]?.severity).toBe('info');
    expect(verdict.findings[0]?.message).toContain('Re-measured on its own: 600ms, under budget');
    expect(verdict.findings[0]?.message).not.toContain('or less');
  });
});

describe('a file finding and a body finding in the same file', () => {
  const heavy = (bodyMs: number): PerfFile =>
    file('src/heavy.spec.ts', { tests: 60_000, testCount: 40, cases: [{ name: 'suite > borderline', ms: bodyMs }] });

  it('keeps the file finding when the body it would have been suppressed by did not reproduce', () => {
    const candidates = gateCandidates(run([...ordinary(), heavy(1_000)]), ROOT, GATE_DEFAULTS);
    const second = run([file('src/heavy.spec.ts', { tests: 58_000, cases: [{ name: 'suite > borderline', ms: 900 }] })]);
    const verdict = gateVerdict(candidates, second, ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings.map((finding) => `${finding.severity} ${finding.check}`)).toEqual([
      'info perf-gate-slow-test',
      'error perf-gate-slow-file',
    ]);
  });

  it('reports the body alone when the body is the confirmed problem', () => {
    const candidates = gateCandidates(run([...ordinary(), heavy(9_000)]), ROOT, GATE_DEFAULTS);
    const second = run([file('src/heavy.spec.ts', { tests: 58_000, cases: [{ name: 'suite > borderline', ms: 8_000 }] })]);
    const verdict = gateVerdict(candidates, second, ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings.map((finding) => finding.check)).toEqual(['perf-gate-slow-test']);
  });

  it('judges a regression against the same second measurement a file total gets', () => {
    const candidates = [
      {
        check: 'perf-gate-regression' as const,
        file: 'src/grew.spec.ts',
        ms: 4_000,
        budget: 2_000,
        grewBy: 3.2,
        budgetNote: '2× its recorded share of the run, from perf-baseline.json',
      },
    ];
    const confirmed = gateVerdict(candidates, run([file('src/grew.spec.ts', { tests: 3_000 })]), ROOT, false);
    const dropped = gateVerdict(candidates, run([file('src/grew.spec.ts', { tests: 400 })]), ROOT, false);

    expect(confirmed.failed).toBe(true);
    expect(confirmed.findings[0]?.message).toContain('3.2× the share of the run');
    expect(confirmed.findings[0]?.fix).toContain('--update-baseline');
    expect(dropped.failed).toBe(false);
  });
});
