/**
 * What `perf` reads off the run as a whole rather than off its phases: a process that would not exit,
 * coverage after the last file, a test that kept its heap, the library's own hook time, and the time a
 * harness spends outside the run Vitest timed.
 */
import type { PerfFile, PerfRun } from './perf-data';
import { formatMs, formatShare } from './perf-data';
import type { PerfMeasured } from './perf-run';
import type { Finding } from './report';

/** Coverage under a second, or under a fifth of the run, is not worth a line. */
const COVERAGE_FLOOR_MS = 1_000;
const COVERAGE_SHARE = 0.2;

/** A harness that adds less than this to the run is starting a process, not building anything. */
const OUTSIDE_FLOOR_MS = 1_000;

const HEAP_STEPS = 5;

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function hungFindings(run: PerfRun): Finding[] {
  return run.hung === true
    ? [
        {
          check: 'perf-hung',
          severity: 'warning',
          message:
            'Vitest finished the run, but the process did not exit: Vitest waited `teardownTimeout` for it and then forced it out, so every run of this suite ends with that wait. Something the suite started still holds the process open — a server, a socket, an interval, a worker.',
          fix: 'Run the suite once with `--reporter=hanging-process`, which prints what keeps the process alive, then close that in the `afterAll` of the file or setup file that starts it.',
        },
      ]
    : [];
}

export function coverageFindings(run: PerfRun): Finding[] {
  const coverage = run.coverage;

  if (coverage === undefined || coverage < COVERAGE_FLOOR_MS || coverage < COVERAGE_SHARE * run.wall) {
    return [];
  }

  const provider = run.config?.coverage === undefined ? '' : ` with the ${run.config.coverage} provider`;

  return [
    {
      check: 'perf-coverage',
      severity: 'info',
      message: `Coverage took ${formatMs(coverage)}${provider} after the last test file finished, against ${formatMs(run.wall)} for the run, and none of it is in the phases above.`,
      fix: 'Collect coverage in the job that reads it rather than on every run, narrow `coverage.include` to the source it reports on, and drop the `coverage.reporter` formats nobody opens: each one is another pass over every covered file.',
    },
  ];
}

export function heapStepFindings(measured: ReadonlyMap<string, PerfFile>): Finding[] {
  const steps = [...measured]
    .flatMap(([path, file]) => (file.heapStep === undefined ? [] : [{ path, ...file.heapStep }]))
    .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path))
    .slice(0, HEAP_STEPS);

  return steps.length === 0
    ? []
    : [
        {
          check: 'perf-heap',
          severity: 'info',
          message: `Tests whose heap growth the next test did not give back, largest first: ${steps.map((step) => `\`${step.test}\` in ${step.path} +${megabytes(step.bytes)}`).join(', ')}.`,
          fix: 'Each of them kept what it allocated past its own end: a subscription it never closed, a listener on a global, a module-level cache or registry it filled. Start with the first; under `isolate: false` it stays for every file after it in the worker.',
        },
      ];
}

/** `setupAutoSpy`'s own per-test hooks, which Vitest counts inside the tests phase. */
export function libraryHooksLine(files: readonly PerfFile[]): string | undefined {
  const timed = files.filter((file): file is PerfFile & { readonly autoSpy: number } => file.autoSpy !== undefined);

  if (timed.length === 0) {
    return undefined;
  }

  const hooks = timed.reduce((total, file) => total + file.autoSpy, 0);
  const tests = files.reduce((total, file) => total + file.tests, 0);

  return `setupAutoSpy hooks ${formatMs(hooks)}, ${formatShare(tests === 0 ? 0 : hooks / tests)} of the tests phase — the library's per-test work, not your tests'`;
}

/** The part of the process's life Vitest's own wall clock does not see, when it is large enough to matter. */
export function outsideLine(source: PerfMeasured): string | undefined {
  const endToEnd = source.endToEnd;
  const outside = endToEnd === undefined ? 0 : endToEnd - source.run.wall;

  if (endToEnd === undefined || outside < OUTSIDE_FLOOR_MS) {
    return undefined;
  }

  const what = source.command === undefined ? '`vitest run`' : `\`${source.command}\``;

  return `${what} took ${formatMs(endToEnd)} end to end, ${formatMs(outside)} of it outside the run Vitest timed: building, bundling, starting and exiting.`;
}
