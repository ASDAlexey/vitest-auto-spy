/**
 * `vitest-auto-spy/diagnostics` — the three reports that answer a question a counter cannot.
 *
 * ```ts
 * import { compareTestRuns, diffByField, explainSpy } from 'vitest-auto-spy/diagnostics';
 * ```
 *
 * `compareTestRuns` diffs the two *sets of test names* from the JSON reports two runners wrote, so
 * "did the migration lose a test?" has an answer — totals can match while a file loses a whole
 * suite and a flake elsewhere starts passing. `diffByField` turns a collapsed
 * `…(8) to deeply equal` into the field that actually differs. `explainSpy` prints what a double
 * was configured to answer next to what it was actually asked, before anything has failed.
 *
 * **The first two lived on the root entry until 4.0.0**, and neither is reached from a spec's assertions:
 * one runs after a run, one inside a handful of failures, and `explainSpy` only when a reader asks
 * it a question at a breakpoint. `explainSpy` is here for the same reason and was never on the root:
 * it costs 1 226 B min+gzip, which is most of what the root entry would grow by. ESM re-export is eager and no
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

// "Which config did that call actually hit?" — asked at will, before anything has failed
export { explainSpy } from './lib/explain-spy';
