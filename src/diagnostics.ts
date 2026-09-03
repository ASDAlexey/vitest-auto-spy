/**
 * `vitest-auto-spy/diagnostics` — the two reports that answer a question a counter cannot.
 *
 * ```ts
 * import { compareTestRuns, diffByField } from 'vitest-auto-spy/diagnostics';
 * ```
 *
 * `compareTestRuns` diffs the two *sets of test names* from the JSON reports two runners wrote, so
 * "did the migration lose a test?" has an answer — totals can match while a file loses a whole
 * suite and a flake elsewhere starts passing. `diffByField` turns a collapsed
 * `…(8) to deeply equal` into the field that actually differs.
 *
 * **Both lived on the root entry until 4.0.0**, and neither is reached from a spec's assertions:
 * one runs after a run, the other inside a handful of failures. ESM re-export is eager and no
 * runner tree-shakes a test file, so exporting them from the root meant every spec evaluated them.
 * They are pure functions of their input and register nothing, so this entry installs no adapter
 * and can be imported from anywhere — including a plain Node script that reads two JSON reports.
 */

// "Did the migration lose a test?" — answered by the set of names, which counters cannot
export {
  compareTestRuns,
  formatTestRunComparison,
  summarizeTestRun,
  type TestRunComparison,
  type TestRunReport,
  type TestRunSummary,
} from './lib/compare-runs';

// "All nine elements differ the same way" — the diff the runner's own reporter collapses
export { diffByField } from './lib/record-diff';
