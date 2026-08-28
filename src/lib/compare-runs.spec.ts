import { describe, expect, it } from 'vitest';

import { compareTestRuns, formatTestRunComparison, summarizeTestRun } from './compare-runs';

/** A JSON report, in the shape `--reporter=json` writes. */
function report(...files: { name: string; tests: { fullName: string; status: string }[] }[]): {
  testResults: { name: string; assertionResults: { fullName: string; status: string }[] }[];
} {
  return { testResults: files.map(({ name, tests }) => ({ name, assertionResults: tests })) };
}

describe('compareTestRuns', () => {
  const baseline = report(
    { name: '/repo/src/cart.spec.ts', tests: [{ fullName: 'Cart > adds', status: 'passed' }] },
    {
      name: '/repo/src/user.spec.ts',
      tests: [
        { fullName: 'User > loads', status: 'passed' },
        { fullName: 'User > fails', status: 'failed' },
      ],
    },
  );

  it('finds the suite that disappeared while the totals stayed plausible', () => {
    // The failure this exists for: `user.spec.ts` lost its suite, and `cart.spec.ts` grew a test —
    // 3 tests before, 3 after.
    const current = report({
      name: '/repo/src/cart.spec.ts',
      tests: [
        { fullName: 'Cart > adds', status: 'passed' },
        { fullName: 'Cart > removes', status: 'passed' },
        { fullName: 'Cart > totals', status: 'passed' },
      ],
    });

    const diff = compareTestRuns(baseline, current);

    expect(diff.baseline.passed + diff.baseline.failed.length).toBe(diff.current.passed);
    expect(diff.missing).toEqual(['/repo/src/user.spec.ts::User > loads', '/repo/src/user.spec.ts::User > fails']);
    expect(diff.added).toEqual(['/repo/src/cart.spec.ts::Cart > removes', '/repo/src/cart.spec.ts::Cart > totals']);
  });

  it('leaves a path alone when the root is not in it', () => {
    const summary = summarizeTestRun(report({ name: '/elsewhere/a.spec.ts', tests: [{ fullName: 'A > one', status: 'passed' }] }), '/src/');

    expect([...summary.names]).toEqual(['/elsewhere/a.spec.ts::A > one']);
  });

  it('compares two checkouts by cutting everything above a shared root', () => {
    const current = report({ name: '/ci/workspace/src/cart.spec.ts', tests: [{ fullName: 'Cart > adds', status: 'passed' }] });
    const diff = compareTestRuns(
      report({ name: '/laptop/src/cart.spec.ts', tests: [{ fullName: 'Cart > adds', status: 'passed' }] }),
      current,
      '/src/',
    );

    expect(diff.missing).toEqual([]);
    expect(diff.added).toEqual([]);
  });

  it('counts skipped tests and reads a report with no files at all', () => {
    const summary = summarizeTestRun(report({ name: 'a.spec.ts', tests: [{ fullName: 'A > skipped', status: 'skipped' }] }));

    expect(summary.skipped).toBe(1);
    expect(summarizeTestRun({})).toMatchObject({ files: 0, passed: 0, skipped: 0 });
  });

  it('falls back to what the report does carry', () => {
    const summary = summarizeTestRun({
      testResults: [{ assertionResults: [{ title: 'unnamed', status: 'passed' }, { status: 'passed' }] }],
    });

    expect([...summary.names]).toEqual(['<unknown file>::unnamed', '<unknown file>::<unnamed test>']);

    const empty = summarizeTestRun({ testResults: [{ name: 'a.spec.ts' }] });

    expect(empty.files).toBe(1);
    expect(empty.names.size).toBe(0);
  });
});

describe('formatTestRunComparison', () => {
  it('leads with the counters and then names what changed', () => {
    const diff = compareTestRuns(
      report({ name: 'a.spec.ts', tests: [{ fullName: 'A > one', status: 'passed' }] }),
      report({ name: 'a.spec.ts', tests: [{ fullName: 'A > two', status: 'failed' }] }),
    );

    const text = formatTestRunComparison(diff);

    expect(text).toContain('baseline: 1 files, 1 passed, 0 failed, 0 skipped');
    expect(text).toContain('in the baseline and gone now: 1\n  - a.spec.ts::A > one');
    expect(text).toContain('new since the baseline: 1\n  + a.spec.ts::A > two');
    expect(text).toContain('failing now: 1\n  ! a.spec.ts::A > two');
  });

  it('stops listing after forty names', () => {
    const many = report({
      name: 'a.spec.ts',
      tests: Array.from({ length: 45 }, (_, index) => ({ fullName: `A > ${index}`, status: 'passed' })),
    });

    expect(formatTestRunComparison(compareTestRuns(report(), many))).toContain('… and 5 more');
  });
});
