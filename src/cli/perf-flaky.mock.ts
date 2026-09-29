import type { PerfRun } from './perf-data';
import type { PerfTestDiagnostic } from './perf-reporter';
import type { PerfSource } from './perf-run';

export function retriedDiagnostic(): PerfTestDiagnostic {
  return { duration: 5, flaky: true };
}

export function redSource(run: PerfRun): PerfSource {
  return { ok: true, run, runFailed: true };
}
