/**
 * A call that reaches the recording wrapper under `console` was absorbed by nothing — a silent spy never
 * calls through. The wrapper forwards every call, so the reporter's attribution is untouched.
 */
import { afterAll, afterEach, beforeEach, expect } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';
import type { GuardReaction } from './guard-reaction';
import { ownFrames, stackFrames } from './stack-frames';
import { writeWarning } from './write-warning';

/** How the stray-console guard reacts to output nothing absorbed. */
export type StrayConsoleReaction = GuardReaction;

/** The object form of `strayConsole`, for a reaction plus the output a project cannot reach. */
export interface StrayConsoleOptions {
  /** Default `'throw'`. */
  reaction?: StrayConsoleReaction;
  /** Output let through, as a substring or a searched RegExp: the last resort, for noise no spec can reach. */
  allow?: readonly (RegExp | string)[];
}

/** One console call nothing absorbed, as the report quotes it. */
export interface StrayConsoleCall {
  readonly method: string;
  /** The first lines of what was written. */
  readonly text: string;
  /** The first frame outside `node_modules`, or the direct caller when there is none. */
  readonly frame: string;
  /** The test that was running, or `undefined` for output made outside any test. */
  readonly test: string | undefined;
}

/** The methods that write. `assert` only does when its condition is falsy, `group` only with a label. */
const PRINTING_METHODS = [
  'assert',
  'count',
  'debug',
  'dir',
  'dirxml',
  'error',
  'group',
  'groupCollapsed',
  'info',
  'log',
  'table',
  'timeEnd',
  'timeLog',
  'trace',
  'warn',
] as const;

/** Also put back after a test: `time` writes nothing, but the `/console` entry spies it. */
const RESTORED_METHODS: readonly string[] = [...PRINTING_METHODS, 'time'];

/** Beyond this many calls a report quotes nothing more, and a chatty test holds nothing more. */
const QUOTED_CALLS = 5;
const QUOTED_LINES = 3;
const QUOTED_LINE_LENGTH = 200;

interface CallBucket {
  calls: StrayConsoleCall[];
  total: number;
}

interface ConsoleGuard {
  readonly host: object;
  readonly originals: Map<string, unknown>;
  readonly sentinels: Map<string, unknown>;
  reaction: StrayConsoleReaction;
  allow: readonly (RegExp | string)[];
  recording: boolean;
  test: string | undefined;
  snapshot: Map<string, unknown>;
  inTest: CallBucket;
  outsideTest: CallBucket;
}

declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyStrayConsole__: ConsoleGuard | undefined;
}

/** The `Error` surface the frame capture needs, so a runtime without `captureStackTrace` can be modelled. */
export interface FrameHost {
  captureStackTrace?(target: object, boundary?: unknown): void;
}

function emptyBucket(): CallBucket {
  return { calls: [], total: 0 };
}

/** Normalise the two spellings `setupAutoSpy` accepts into a reaction and an allow list. */
export function resolveStrayConsole(option: StrayConsoleOptions | StrayConsoleReaction | undefined): Required<StrayConsoleOptions> {
  if (typeof option === 'object') {
    return { reaction: option.reaction ?? 'throw', allow: option.allow ?? [] };
  }

  return { reaction: option ?? 'off', allow: [] };
}

function formatArg(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/** The first lines of what the call wrote, or `undefined` when this call writes nothing at all. */
export function describeOutput(method: string, args: readonly unknown[]): string | undefined {
  if ((method === 'assert' && args[0]) || ((method === 'group' || method === 'groupCollapsed') && args.length === 0)) {
    return undefined;
  }

  const written = method === 'assert' ? ['Assertion failed', ...args.slice(1)] : args;

  return written
    .map(formatArg)
    .join(' ')
    .split('\n')
    .slice(0, QUOTED_LINES)
    .map((line) => (line.length > QUOTED_LINE_LENGTH ? `${line.slice(0, QUOTED_LINE_LENGTH)}…` : line))
    .join('\n');
}

function isAllowed(text: string, allow: readonly (RegExp | string)[]): boolean {
  // `search` ignores `lastIndex`, so a global or sticky pattern answers the same on every call.
  return allow.some((pattern) => (typeof pattern === 'string' ? text.includes(pattern) : text.search(pattern) !== -1));
}

/** The frame worth quoting: the first one outside dependencies, or the direct caller when all are. */
export function callerFrame(boundary: unknown, host: FrameHost = Error): string {
  const holder: { stack?: string } = new Error();

  host.captureStackTrace?.(holder, boundary);

  return ownFrames(stackFrames(holder.stack), 1)[0] ?? 'at <unknown>';
}

function record(guard: ConsoleGuard, method: string, args: readonly unknown[], boundary: unknown): void {
  const text = guard.recording ? describeOutput(method, args) : undefined;

  if (text === undefined || isAllowed(text, guard.allow)) {
    return;
  }

  const bucket = guard.test === undefined ? guard.outsideTest : guard.inTest;

  bucket.total += 1;

  if (bucket.calls.length < QUOTED_CALLS) {
    bucket.calls.push({ method, text, frame: callerFrame(boundary), test: guard.test });
  }
}

function installSentinel(guard: ConsoleGuard, method: string): void {
  const original = guard.originals.get(method);

  if (typeof original !== 'function') {
    return;
  }

  const sentinel = (...args: unknown[]): unknown => {
    record(guard, method, args, sentinel);

    return Reflect.apply(original, guard.host, args);
  };

  guard.sentinels.set(method, sentinel);
  Reflect.set(guard.host, method, sentinel);
}

/**
 * Wrap `host` once per worker. Spies an import already installed come off first: left on, they would
 * absorb everything for the rest of the worker, which is what the guard exists to stop.
 */
export function armConsoleGuard(options: Required<StrayConsoleOptions>, host: object = globalThis.console): ConsoleGuard {
  const current = globalThis.__vitestAutoSpyStrayConsole__;
  const guard = current?.host === host ? current : createGuard(host);

  guard.reaction = options.reaction;
  guard.allow = options.allow;
  guard.recording = true;

  return guard;
}

function createGuard(host: object): ConsoleGuard {
  globalThis.__vitestAutoSpyDetachConsoleSpies__?.();

  const guard: ConsoleGuard = {
    host,
    originals: new Map(),
    sentinels: new Map(),
    reaction: 'throw',
    allow: [],
    recording: true,
    test: undefined,
    snapshot: new Map(),
    inTest: emptyBucket(),
    outsideTest: emptyBucket(),
  };

  RESTORED_METHODS.forEach((method) => {
    const original: unknown = Reflect.get(host, method);

    if (typeof original === 'function') {
      guard.originals.set(method, original);
    }
  });
  PRINTING_METHODS.forEach((method) => installSentinel(guard, method));
  globalThis.__vitestAutoSpyStrayConsole__ = guard;

  return guard;
}

/** Take the wrappers off and forget the guard. For specs, and for a suite that wires the guard by hand. */
export function stopGuardingConsole(): void {
  const guard = globalThis.__vitestAutoSpyStrayConsole__;

  if (!guard) {
    return;
  }

  guard.originals.forEach((original, method) => Reflect.set(guard.host, method, original));
  globalThis.__vitestAutoSpyStrayConsole__ = undefined;
}

/** Open the per-test window; a previous test whose teardown never ran hands its calls to the file. */
export function openConsoleWindow(guard: ConsoleGuard): void {
  moveBucket(guard.inTest, guard.outsideTest);
  guard.recording = true;
  guard.test = expect.getState().currentTestName ?? '';
  guard.snapshot = new Map(RESTORED_METHODS.map((method) => [method, Reflect.get(guard.host, method)]));
}

function moveBucket(from: CallBucket, to: CallBucket): void {
  to.total += from.total;
  to.calls.push(...from.calls.slice(0, QUOTED_CALLS - to.calls.length));
  from.calls = [];
  from.total = 0;
}

/** Put back whatever this test left standing on `console` — a spy it installed must not outlive it. */
export function restoreConsoleMethods(guard: ConsoleGuard): void {
  guard.snapshot.forEach((value, method) => {
    if (Reflect.get(guard.host, method) !== value) {
      Reflect.set(guard.host, method, value);
    }
  });
}

const ABSORB_ADVICE =
  'Absorb what the test expects: `installConsoleSpies()` from `vitest-auto-spy/console` in a `beforeEach`, then assert on ' +
  '`consoleErrorSpy` and its siblings — or `vi.spyOn(console, "error").mockImplementation(() => undefined)`. A `vi.spyOn` ' +
  'with no implementation calls through and still prints. Output the code should not make is a defect to fix, not to ' +
  'silence; `strayConsole: { allow: [...] }` is the last resort, for environment noise no spec can reach.';

const IMPORTED_SPIES_ADVICE =
  '`vitest-auto-spy/console` is loaded in this worker, but under `strayConsole` importing a spy installs nothing: under ' +
  '`isolate: false` the import runs once per worker, so it cannot tell which file it belongs to. Call ' +
  '`installConsoleSpies()` in a `beforeEach`, or at the top of the file for all of its tests.';

function quote(calls: readonly StrayConsoleCall[], total: number, withTest: boolean): string {
  const lines = calls.map((call) => {
    const during = withTest && call.test !== undefined ? ` (during "${call.test}")` : '';
    const text = call.text.split('\n').join('\n      ');

    return `  - console.${call.method}${during}: ${text}\n      ${call.frame}`;
  });
  const more = total > calls.length ? [`  … and ${total - calls.length} more`] : [];

  return [...lines, ...more].join('\n');
}

const OUTSIDE_TEST =
  'outside any test — while the file was being imported, in a beforeAll or afterAll, or from a callback that fired after its test had ended —';

/** The report for one test, or — given `file` — for a file's output outside any test. Exported for its spec. */
export function describeStrayConsole(bucket: Readonly<CallBucket>, test: string | undefined, file?: string): string {
  const advice = globalThis.__vitestAutoSpyResetConsoleSpies__ ? `${ABSORB_ADVICE}\n${IMPORTED_SPIES_ADVICE}` : ABSORB_ADVICE;
  const count = `wrote to the console ${bucket.total} time(s)`;
  const subject = file === undefined ? `"${test ?? ''}" ${count}` : `${file} ${count} ${OUTSIDE_TEST}`;

  return withDocs(
    `[vitest-auto-spy] ${subject} and nothing absorbed it:\n${quote(bucket.calls, bucket.total, file !== undefined)}\n${advice}`,
    DOCS_LINKS.setup,
  );
}

function react(guard: ConsoleGuard, message: string, inTest: boolean): void {
  if (guard.reaction === 'throw') {
    throw new Error(message);
  }

  const warn = guard.originals.get('warn');

  // Past the file's last test the console line would be dropped, so the file-level report goes to stderr.
  if (inTest && typeof warn === 'function') {
    Reflect.apply(warn, guard.host, [message]);
  } else {
    writeWarning(message);
  }
}

/** Close the per-test window and report what reached the console during it. */
export function reportTestConsole(guard: ConsoleGuard): void {
  const bucket = guard.inTest;
  const name = guard.test;

  guard.inTest = emptyBucket();
  guard.test = undefined;

  if (bucket.total > 0) {
    react(guard, describeStrayConsole(bucket, name), true);
  }
}

function currentFile(): string {
  return expect.getState().testPath ?? 'this file';
}

/** Put `console` back as it was between files, stop recording, and report the file's own output. */
export function finishConsoleFile(guard: ConsoleGuard): void {
  guard.originals.forEach((original, method) => Reflect.set(guard.host, method, guard.sentinels.get(method) ?? original));
  moveBucket(guard.inTest, guard.outsideTest);
  guard.test = undefined;
  guard.recording = false;

  const bucket = guard.outsideTest;

  guard.outsideTest = emptyBucket();

  if (bucket.total > 0) {
    react(guard, describeStrayConsole(bucket, undefined, currentFile()), false);
  }
}

/** The two teardown steps `setupAutoSpy` slots into its shared `afterEach`. */
export interface ConsoleTeardown {
  restore: () => void;
  report: () => void;
}

/** Arm the guard and register its per-test and per-file hooks; `undefined` when the reaction is `'off'`. */
export function watchStrayConsole(option: StrayConsoleOptions | StrayConsoleReaction | undefined): ConsoleTeardown | undefined {
  const options = resolveStrayConsole(option);

  if (options.reaction === 'off') {
    return undefined;
  }

  const guard = armConsoleGuard(options);

  beforeEach(() => {
    openConsoleWindow(guard);
  });
  afterAll(() => {
    finishConsoleFile(guard);
  });

  return {
    restore: (): void => restoreConsoleMethods(guard),
    report: (): void => reportTestConsole(guard),
  };
}

/**
 * Fail a test that writes to the console without absorbing it, and a file that writes outside a test.
 * `setupAutoSpy({ strayConsole })` is the same guard, slotted into the library's shared teardown.
 */
export function guardStrayConsole(option: StrayConsoleOptions | StrayConsoleReaction): void {
  const teardown = watchStrayConsole(option);

  if (!teardown) {
    return;
  }

  afterEach(() => {
    teardown.restore();
    teardown.report();
  });
}
