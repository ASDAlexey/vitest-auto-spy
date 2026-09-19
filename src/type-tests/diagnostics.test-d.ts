/**
 * Type-level tests for the `/diagnostics` entry.
 *
 * These functions are what a person runs *after* something went wrong — two JSON reports diffed
 * across a migration, a collapsed diff re-read field by field, a double interrogated at a
 * breakpoint. Their value is that they can be dropped into a scratch script or a `console.log`
 * without ceremony, so the signatures are pinned: what a call accepts, what it hands back, and
 * that the report types have not widened into something the compiler stops checking.
 */
import { describe, expectTypeOf, it } from 'vitest';

import {
  type TestRunComparison,
  type TestRunReport,
  type TestRunSummary,
  compareTestRuns,
  diffByField,
  explainSpy,
  formatTestRunComparison,
  summarizeTestRun,
} from '../diagnostics';

const report: TestRunReport = {
  testResults: [{ name: 'a.spec.ts', assertionResults: [{ fullName: 'suite > works', status: 'passed' }] }],
};

describe('TestRunReport', () => {
  it('is the Jest-shaped JSON every runner writes, and checks it', () => {
    const partial: TestRunReport = { testResults: [{ assertionResults: [{ title: 'works' }] }] };

    expectTypeOf(partial).toEqualTypeOf<TestRunReport>();

    // @ts-expect-error -- `testResults` is the report's files, not its totals
    summarizeTestRun({ testResults: 'one' });
    // @ts-expect-error -- a status is what the runner printed, a string
    summarizeTestRun({ testResults: [{ assertionResults: [{ status: 1 }] }] });
  });
});

describe('summarizeTestRun', () => {
  it('answers the counts the comparison is made of, at their own types', () => {
    const summary = summarizeTestRun(report, '/repo/');

    expectTypeOf(summary).toEqualTypeOf<TestRunSummary>();
    expectTypeOf(summary.names).toEqualTypeOf<Set<string>>();
    expectTypeOf(summary.counts).toEqualTypeOf<Map<string, number>>();
    expectTypeOf(summary.files).toEqualTypeOf<number>();
    expectTypeOf(summary.passed).toEqualTypeOf<number>();
    expectTypeOf(summary.failed).toEqualTypeOf<string[]>();
    expectTypeOf(summary.skipped).toEqualTypeOf<number>();
  });

  it('takes a parsed report, and a root that is a path', () => {
    summarizeTestRun(report);
    summarizeTestRun(report, '/repo/');

    // @ts-expect-error -- it reads the report the runner wrote, not the string it printed
    summarizeTestRun('{"testResults":[]}');
    // @ts-expect-error -- the root is a path fragment to cut, not an offset
    summarizeTestRun(report, 0);
  });
});

describe('compareTestRuns', () => {
  it('answers the two summaries and the two lists of names', () => {
    const diff = compareTestRuns(report, report, '/repo/');

    expectTypeOf(diff).toEqualTypeOf<TestRunComparison>();
    expectTypeOf(diff.baseline).toEqualTypeOf<TestRunSummary>();
    expectTypeOf(diff.current).toEqualTypeOf<TestRunSummary>();
    expectTypeOf(diff.missing).toEqualTypeOf<string[]>();
    expectTypeOf(diff.added).toEqualTypeOf<string[]>();
  });

  it('needs both runs', () => {
    // @ts-expect-error -- a migration is two reports; one side cannot be defaulted
    compareTestRuns(report);
  });
});

describe('formatTestRunComparison', () => {
  it('renders a comparison, not the summaries it was made of', () => {
    expectTypeOf(formatTestRunComparison(compareTestRuns(report, report))).toEqualTypeOf<string>();

    // @ts-expect-error -- it prints both sides; one summary is half the report
    formatTestRunComparison(summarizeTestRun(report));
  });
});

describe('diffByField', () => {
  it('answers a sentence, or nothing when the lists already match', () => {
    expectTypeOf(diffByField([{ id: 1 }], [{ id: 2 }])).toEqualTypeOf<string | undefined>();
    expectTypeOf(diffByField([], [])).toEqualTypeOf<string | undefined>();
  });

  it('compares two lists, and two lists only', () => {
    // @ts-expect-error -- there is nothing to diff against
    diffByField([{ id: 1 }]);
    // @ts-expect-error -- the elements are records the diff reads, not prose
    diffByField('all nine differ', 'all nine differ');
  });
});

describe('explainSpy', () => {
  it('answers a report to print, whatever it was handed', () => {
    expectTypeOf(explainSpy({})).toEqualTypeOf<string>();
    expectTypeOf(explainSpy({}, 'load')).toEqualTypeOf<string>();
  });

  it('asks for the double, and names at most one member', () => {
    // @ts-expect-error -- the double is the one thing it cannot do without
    explainSpy();
    // @ts-expect-error -- a member is named, not numbered
    explainSpy({}, 1);
    // @ts-expect-error -- two members is two reports
    explainSpy({}, 'load', 'save');
  });
});
