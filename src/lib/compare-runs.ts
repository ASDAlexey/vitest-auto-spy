/**
 * "Did the migration lose a test?" — the only check that answers it.
 *
 * Counters do not. Under `isolate: false` a file can lose a whole suite (an exported spec file
 * imported by its neighbour loses its own `describe`) and, in the same run, a flaky test elsewhere
 * can start passing. Totals match, the run looks identical, and a suite is silently gone. The
 * question is about **which** tests ran, so the answer has to be the symmetric difference of two
 * sets of names.
 *
 * This is the shape of every runner migration — Jest to Vitest, Karma to Jest, mocha to node:test.
 * Both runners write a JSON report in the same "Jest format" (`--reporter=json`), and that is all
 * this needs: no runner is imported here, and neither report has to come from Vitest.
 */

/** One test in a JSON report. Only the fields every runner writes are read. */
interface ReportedTest {
  fullName?: string;
  title?: string;
  status?: string;
}

/** One file in a JSON report. */
interface ReportedFile {
  name?: string;
  assertionResults?: ReportedTest[];
}

/** A JSON report, as `--reporter=json` writes it. */
export interface TestRunReport {
  testResults?: ReportedFile[];
}

/** What one run contained, keyed by `file::full name`. */
export interface TestRunSummary {
  /** `file::full test name` for every test the report mentions, whatever its status. */
  names: Set<string>;
  files: number;
  passed: number;
  failed: string[];
  skipped: number;
}

/** How two runs differ. */
export interface TestRunComparison {
  baseline: TestRunSummary;
  current: TestRunSummary;
  /** In the baseline, gone now — the answer to "did I lose anything?". */
  missing: string[];
  /** Not in the baseline — a rename shows up here *and* in `missing`. */
  added: string[];
}

/** Trim the absolute path down to the part that is the same in both runs. */
function shorten(file: string, root: string | undefined): string {
  if (root === undefined) {
    return file;
  }

  const index = file.indexOf(root);

  return index === -1 ? file : file.slice(index + root.length);
}

/**
 * Read one JSON report into the set of names it ran.
 *
 * @param report The parsed report.
 * @param root A path fragment to cut everything before, so two runs from different checkouts (CI
 *   and a laptop) compare as equal.
 */
export function summarizeTestRun(report: TestRunReport, root?: string): TestRunSummary {
  const summary: TestRunSummary = { names: new Set(), files: 0, passed: 0, failed: [], skipped: 0 };

  (report.testResults ?? []).forEach((file) => {
    summary.files += 1;

    (file.assertionResults ?? []).forEach((test) => {
      const name = `${shorten(file.name ?? '<unknown file>', root)}::${test.fullName ?? test.title ?? '<unnamed test>'}`;

      summary.names.add(name);

      if (test.status === 'passed') {
        summary.passed += 1;
      } else if (test.status === 'failed') {
        summary.failed.push(name);
      } else {
        summary.skipped += 1;
      }
    });
  });

  return summary;
}

/**
 * Compare two JSON reports by the set of test names.
 *
 * ```ts
 * const diff = compareTestRuns(JSON.parse(before), JSON.parse(after), '/my-repo/');
 *
 * expect(diff.missing).toEqual([]);
 * ```
 *
 * A renamed test appears in both `missing` and `added`, which is the honest answer: from the
 * outside a rename and a deletion-plus-addition are the same event, and only a person can tell them
 * apart.
 */
export function compareTestRuns(baseline: TestRunReport, current: TestRunReport, root?: string): TestRunComparison {
  const before = summarizeTestRun(baseline, root);
  const after = summarizeTestRun(current, root);

  return {
    baseline: before,
    current: after,
    missing: [...before.names].filter((name) => !after.names.has(name)),
    added: [...after.names].filter((name) => !before.names.has(name)),
  };
}

/** How many names one section of the report prints before it says "and N more". */
const MAX_LISTED = 40;

function section(title: string, names: readonly string[], marker: string): string[] {
  const shown = names.slice(0, MAX_LISTED).map((name) => `  ${marker} ${name}`);
  const rest = names.length > MAX_LISTED ? [`  … and ${names.length - MAX_LISTED} more`] : [];

  return [`${title}: ${names.length}`, ...shown, ...rest];
}

/** Render a {@link compareTestRuns} result for a terminal or a CI log. */
export function formatTestRunComparison(comparison: TestRunComparison): string {
  const { baseline, current } = comparison;
  const line = (label: string, summary: TestRunSummary): string =>
    `${label}: ${summary.files} files, ${summary.passed} passed, ${summary.failed.length} failed, ${summary.skipped} skipped`;

  return [
    line('baseline', baseline),
    line('current ', current),
    '',
    ...section('in the baseline and gone now', comparison.missing, '-'),
    ...section('new since the baseline', comparison.added, '+'),
    ...section('failing now', current.failed, '!'),
  ].join('\n');
}
