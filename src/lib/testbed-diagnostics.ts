/**
 * Where a spec spends its time.
 *
 * Speeding a suite up starts with knowing which files pay for `TestBed` and how much of their
 * runtime that is — otherwise the rewrite list is guesswork and "it feels faster" is the only
 * available progress report. This instruments the `TestBed` entry points a spec actually pays for
 * (module configuration, template compilation, component creation) and reports, per file, how much
 * of the wall clock went there versus into plain logic.
 *
 * It is opt-in and self-contained: one call in a setup file, no reporter plugin to install.
 */
import { TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, expect } from 'vitest';

/** What one spec file cost. */
export interface SpecTiming {
  /** Absolute path of the spec file, or `'unknown file'` when the runner did not report one. */
  file: string;
  /** Wall-clock time spent inside the instrumented `TestBed` calls. */
  testBedMs: number;
  /** Wall-clock time of the whole file. */
  totalMs: number;
  /** `totalMs - testBedMs` — the part that is plain TypeScript. */
  otherMs: number;
  /** How many components the file created. */
  components: number;
  /** How many testing modules it configured. */
  configurations: number;
}

/** Options for {@link enableTestBedDiagnostics}. */
export interface TestBedDiagnosticsOptions {
  /** Receives each file's timing. Defaults to one `console.info` line per file. */
  report?: (timing: SpecTiming) => void;
  /** Stay quiet for files whose `testBedMs` is below this. Default `0` (report every file). */
  minTestBedMs?: number;
}

/** The instrumented calls, and what each one counts towards. */
const INSTRUMENTED: { method: string; counter: 'components' | 'configurations' | undefined }[] = [
  { method: 'configureTestingModule', counter: 'configurations' },
  { method: 'createComponent', counter: 'components' },
  { method: 'compileComponents', counter: undefined },
  { method: 'overrideComponent', counter: undefined },
];

/** Any instrumented `TestBed` method, viewed loosely enough to wrap. */
type LooseMethod = (...args: unknown[]) => unknown;

/**
 * The clock, captured at import time.
 *
 * `vi.useFakeTimers()` replaces `performance.now` for the spec that installs it, and a frozen clock
 * reports 0 ms for work that plainly took longer — the first real suite these diagnostics were
 * pointed at had two files claiming "0ms for 155 components". A setup file imports this module
 * before any spec runs, so the reference taken here is the real one.
 */
const now: () => number = performance.now.bind(performance);

let counters = { testBedMs: 0, components: 0, configurations: 0 };
let fileStartedAt = 0;
const originals = new Map<string, LooseMethod>();

function reset(): void {
  counters = { testBedMs: 0, components: 0, configurations: 0 };
}

function readMethod(method: string): LooseMethod | undefined {
  const candidate: unknown = Reflect.get(TestBed, method);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowing a `TestBed` member to the loose call shape this module wraps; only `apply` is ever used on it.
  return typeof candidate === 'function' ? (candidate as LooseMethod) : undefined;
}

function instrument(method: string, counter: 'components' | 'configurations' | undefined): void {
  const original = readMethod(method);

  // Absent on older Angular versions, or already wrapped by a previous call — either way, leave it.
  if (!original || originals.has(method)) {
    return;
  }

  originals.set(method, original);
  Reflect.set(TestBed, method, function instrumented(this: unknown, ...args: unknown[]): unknown {
    const startedAt = now();

    if (counter) {
      counters[counter] += 1;
    }

    try {
      return original.apply(this, args);
    } finally {
      counters.testBedMs += now() - startedAt;
    }
  });
}

/**
 * Wrap the `TestBed` entry points. Idempotent, and safe on Angular versions missing one of them.
 *
 * @example
 * ```ts
 * instrumentTestBed(); // start measuring; pair with getTestBedTiming() in an afterAll
 * ```
 */
export function instrumentTestBed(): void {
  INSTRUMENTED.forEach(({ method, counter }) => instrument(method, counter));
}

/**
 * Undo the instrumentation, putting the original `TestBed` methods back.
 *
 * @example
 * ```ts
 * disableTestBedDiagnostics(); // put the untouched TestBed back
 * ```
 */
export function disableTestBedDiagnostics(): void {
  originals.forEach((original, method) => Reflect.set(TestBed, method, original));
  originals.clear();
}

/**
 * The timing accumulated so far in the current file.
 *
 * @example
 * ```ts
 * afterAll(() => {
 *   const timing = getTestBedTiming();
 *
 *   if (timing.testBedMs > 200) {
 *     reportSpecTiming(timing);
 *   }
 * });
 * ```
 */
export function getTestBedTiming(): SpecTiming {
  const totalMs = now() - fileStartedAt;
  const state: { testPath?: string } = expect.getState();

  return {
    file: state.testPath ?? 'unknown file',
    testBedMs: counters.testBedMs,
    totalMs,
    otherMs: Math.max(0, totalMs - counters.testBedMs),
    components: counters.components,
    configurations: counters.configurations,
  };
}

/**
 * One human-readable line: what the file cost and how much of it was `TestBed`.
 *
 * @example
 * ```ts
 * process.stdout.write(`${formatSpecTiming(getTestBedTiming())}\n`);
 * ```
 */
export function formatSpecTiming(timing: SpecTiming): string {
  const share = timing.totalMs > 0 ? Math.round((timing.testBedMs / timing.totalMs) * 100) : 0;

  return (
    `[vitest-auto-spy] ${timing.file} — TestBed ${Math.round(timing.testBedMs)}ms of ${Math.round(timing.totalMs)}ms (${share}%), ` +
    `logic ${Math.round(timing.otherMs)}ms, ${timing.components} component(s), ${timing.configurations} module config(s)`
  );
}

/**
 * Write the report where a test run can actually show it.
 *
 * Not `console.info`: a project that imports `vitest-auto-spy/console` (or spies the console for
 * any other reason) has replaced that method with a silent mock, and the report would vanish —
 * which is exactly what happened the first time these diagnostics were pointed at a real suite.
 *
 * Exported as the default `report`: a project that wants both its own bookkeeping and the printed
 * line can call it from a custom reporter.
 *
 * @example
 * ```ts
 * reportSpecTiming(getTestBedTiming()); // one line to process.stdout, not console.info
 * ```
 */
export function reportSpecTiming(timing: SpecTiming): void {
  const line = `${formatSpecTiming(timing)}\n`;
  const stdout = globalThis.process?.stdout;

  if (stdout) {
    stdout.write(line);

    return;
  }

  // eslint-disable-next-line no-console -- browser-like environment with no `process`: the console is the only channel left.
  console.info(line);
}

/**
 * Instrument `TestBed` and report each spec file's cost.
 *
 * ```ts
 * // vitest.setup.ts
 * import { enableTestBedDiagnostics } from 'vitest-auto-spy/angular';
 *
 * if (process.env['SPEC_TIMING']) {
 *   enableTestBedDiagnostics();
 * }
 * ```
 */
export function enableTestBedDiagnostics(options: TestBedDiagnosticsOptions = {}): void {
  const report = options.report ?? reportSpecTiming;
  const minTestBedMs = options.minTestBedMs ?? 0;

  instrumentTestBed();

  beforeAll(() => {
    reset();
    fileStartedAt = now();
  });

  afterAll(() => {
    const timing = getTestBedTiming();

    if (timing.testBedMs >= minTestBedMs) {
      report(timing);
    }
  });
}
