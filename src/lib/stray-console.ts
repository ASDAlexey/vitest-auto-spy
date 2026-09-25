/**
 * A call that reaches the recording wrapper under `console` was absorbed by nothing — a silent spy never
 * calls through. The wrapper forwards every call, so the reporter's attribution is untouched.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';

import { consoleCause } from './console-causes';
import type { GuardReaction } from './guard-reaction';
import { currentSpecFile } from './spec-file';
import { ownFrames, stackFrames } from './stack-frames';
import { describeStrayConsole } from './stray-console-report';
import { writeWarning } from './write-warning';

export { describeStrayConsole } from './stray-console-report';

/** How the stray-console guard reacts to output nothing absorbed. */
export type StrayConsoleReaction = GuardReaction;

/** The object form of `strayConsole`, for a reaction plus the output a project cannot reach. */
export interface StrayConsoleOptions {
  /** Default `'throw'`. */
  reaction?: StrayConsoleReaction;
  /** Output let through, as a substring or a searched RegExp: the last resort, for noise no spec can reach. */
  allow?: readonly (RegExp | string)[];
}

/**
 * When a call was made: while the file was being imported (its modules and `describe` bodies), in a
 * `beforeAll`, during a test, or after a test had ended — a late callback or an `afterAll`.
 */
export type StrayConsolePhase = 'afterTest' | 'beforeAll' | 'import' | 'test';

/** One console call nothing absorbed, as the report quotes it. */
export interface StrayConsoleCall {
  readonly method: string;
  /** The first lines of what was written. */
  readonly text: string;
  /** The first frame outside `node_modules`, or the direct caller when there is none. */
  readonly frame: string;
  /** The test that was running, or `undefined` for output made outside any test. */
  readonly test: string | undefined;
  /** Absent on a call recorded by hand, which the report then treats as made outside any phase it knows. */
  readonly phase?: StrayConsolePhase;
  /** What the output most likely means, read from all of it, when the library recognises it. */
  readonly cause?: string;
  /** The spec file that was running, so a report carried into the next file still names this one. */
  readonly file?: string;
  /** Set when the method was a runner spy with no implementation, which calls through and prints. */
  readonly callThrough?: boolean;
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

/** The calls a window recorded: the first few quoted, all of them counted. */
export interface CallBucket {
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
  /** The phase a call outside a test belongs to. */
  outsidePhase: Exclude<StrayConsolePhase, 'test'>;
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

/** Whether this call writes nothing at all: a passing `assert`, a `group` with no label. */
function writesNothing(method: string, args: readonly unknown[]): boolean {
  return Boolean(method === 'assert' && args[0]) || ((method === 'group' || method === 'groupCollapsed') && args.length === 0);
}

/** The first lines of what the call wrote, or `undefined` when this call writes nothing at all. */
export function describeOutput(method: string, args: readonly unknown[]): string | undefined {
  return writesNothing(method, args) ? undefined : formatOutput(method, args);
}

function fullOutput(method: string, args: readonly unknown[]): string {
  const written = method === 'assert' ? ['Assertion failed', ...args.slice(1)] : args;

  return written.map(formatArg).join(' ');
}

function formatOutput(method: string, args: readonly unknown[]): string {
  return quoteOutput(fullOutput(method, args));
}

const URL_PATTERN = /https?:\/\/[^\s"')<>]+/g;

function quoteOutput(output: string): string {
  const lines = output.split('\n');
  const quoted = lines
    .slice(0, QUOTED_LINES)
    .map((line) => (line.length > QUOTED_LINE_LENGTH ? `${line.slice(0, QUOTED_LINE_LENGTH)}…` : line))
    .join('\n');

  if (quoted === output) {
    return quoted;
  }

  // A link is usually the part of a long line worth having, and the cut drops it first.
  const url = output.match(URL_PATTERN)?.find((found) => !quoted.includes(found.replace(/\.$/, '')));

  return url === undefined ? quoted : `${quoted} ${url.replace(/\.$/, '')}`;
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

/** A `vi.spyOn(console, method)` with no implementation: it calls through, which is how the call got here. */
function callsThrough(guard: ConsoleGuard, method: string): boolean {
  const current: unknown = Reflect.get(guard.host, method);

  if (current === guard.sentinels.get(method) || typeof current !== 'function') {
    return false;
  }

  const implementation: unknown = Reflect.get(current, 'getMockImplementation');

  return typeof implementation === 'function' && Reflect.apply(implementation, current, []) === undefined;
}

/**
 * The phase of a call outside a test. A suite none of whose tasks has started is running its
 * `beforeAll`, which the setup file's own hooks cannot see for a nested `describe`.
 */
function phaseNow(guard: ConsoleGuard): Exclude<StrayConsolePhase, 'test'> {
  if (guard.outsidePhase !== 'afterTest') {
    return guard.outsidePhase;
  }

  const current: unknown = Reflect.get(Object(Reflect.get(globalThis, '__vitest_worker__')), 'current');
  const tasks: unknown = Reflect.get(Object(current), 'tasks');
  const starting = Array.isArray(tasks) && tasks.length > 0 && tasks.every((task) => Reflect.get(Object(task), 'result') === undefined);

  return starting ? 'beforeAll' : 'afterTest';
}

function record(guard: ConsoleGuard, method: string, args: readonly unknown[], boundary: unknown): void {
  if (!guard.recording || writesNothing(method, args)) {
    return;
  }

  const bucket = guard.test === undefined ? guard.outsideTest : guard.inTest;

  // Nothing left to quote and nothing to match against: the call is counted and not formatted, so a
  // test that logs whole store states pays no `JSON.stringify` past the five calls a report quotes.
  if (bucket.calls.length >= QUOTED_CALLS && guard.allow.length === 0) {
    bucket.total += 1;

    return;
  }

  const output = fullOutput(method, args);
  const text = quoteOutput(output);

  if (isAllowed(text, guard.allow)) {
    return;
  }

  bucket.total += 1;

  if (bucket.calls.length < QUOTED_CALLS) {
    const phase = guard.test === undefined ? phaseNow(guard) : 'test';
    const cause = consoleCause(output);
    const file = currentSpecFile();

    bucket.calls.push({
      method,
      text,
      frame: callerFrame(boundary),
      test: guard.test,
      phase,
      ...(cause === undefined ? {} : { cause }),
      ...(typeof file === 'string' ? { file } : {}),
      ...(callsThrough(guard, method) ? { callThrough: true } : {}),
    });
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
 *
 * Armed again by every file's setup, which starts the file at its import: a previous file whose
 * file-end report never ran keeps its calls, and each still names the file it came from.
 */
export function armConsoleGuard(options: Required<StrayConsoleOptions>, host: object = globalThis.console): ConsoleGuard {
  const current = globalThis.__vitestAutoSpyStrayConsole__;
  const guard = current?.host === host ? current : createGuard(host);

  guard.reaction = options.reaction;
  guard.allow = options.allow;
  guard.recording = true;
  moveBucket(guard.inTest, guard.outsideTest);
  guard.test = undefined;
  guard.outsidePhase = 'import';

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
    outsidePhase: 'import',
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
  guard.outsidePhase = 'afterTest';

  if (bucket.total > 0) {
    react(guard, describeStrayConsole(bucket, name), true);
  }
}

function currentFile(): string {
  const file = expect.getState().testPath ?? currentSpecFile();

  return typeof file === 'string' ? file : 'this file';
}

/**
 * Put `console` back as it was between files and stop recording; what it hands back makes the file's
 * report. Split so the file-end sweep can collect that report with the others rather than lose it.
 */
export function closeConsoleFile(guard: ConsoleGuard): (() => void) | undefined {
  guard.originals.forEach((original, method) => Reflect.set(guard.host, method, guard.sentinels.get(method) ?? original));
  moveBucket(guard.inTest, guard.outsideTest);
  guard.test = undefined;
  guard.recording = false;
  guard.outsidePhase = 'import';

  const bucket = guard.outsideTest;

  guard.outsideTest = emptyBucket();

  if (bucket.total === 0) {
    return undefined;
  }

  const file = currentFile();

  return (): void => react(guard, describeStrayConsole(bucket, undefined, file), false);
}

/** Put `console` back as it was between files, stop recording, and report the file's own output. */
export function finishConsoleFile(guard: ConsoleGuard): void {
  closeConsoleFile(guard)?.();
}

/** The teardown steps `setupAutoSpy` slots into its shared `afterEach`, and the file-end sweep. */
export interface ConsoleTeardown {
  restore: () => void;
  report: () => void;
  closeFile: () => (() => void) | undefined;
}

/**
 * Arm the guard and register its per-test hooks; `undefined` when the reaction is `'off'`. The file
 * end gets its own `afterAll` unless `ownFileEnd` is `false`, for a caller that sweeps it with the rest.
 */
export function watchStrayConsole(
  option: StrayConsoleOptions | StrayConsoleReaction | undefined,
  ownFileEnd = true,
): ConsoleTeardown | undefined {
  const options = resolveStrayConsole(option);

  if (options.reaction === 'off') {
    return undefined;
  }

  const guard = armConsoleGuard(options);

  // Registered from the setup file, so it runs before any `beforeAll` of the spec, and after its import.
  beforeAll(() => {
    guard.outsidePhase = 'beforeAll';
  });
  beforeEach(() => {
    openConsoleWindow(guard);
  });

  if (ownFileEnd) {
    afterAll(() => {
      finishConsoleFile(guard);
    });
  }

  return {
    restore: (): void => restoreConsoleMethods(guard),
    report: (): void => reportTestConsole(guard),
    closeFile: (): (() => void) | undefined => closeConsoleFile(guard),
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
