/**
 * `vitest-auto-spy/perf-reporter`: the reporter `perf` attaches, under a name a config can write —
 * `reporters: ['default', 'vitest-auto-spy/perf-reporter']`, or the Angular builder's `--reporters`.
 * It writes nothing unless `VITEST_AUTO_SPY_PERF_OUT` names a file.
 */
import PerfReporter from './cli/perf-reporter';

export default PerfReporter;
