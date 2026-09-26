/**
 * `setupAutoSpy()` — the single line a project's Vitest setup file needs.
 *
 * Three pieces of hygiene are easy to get wrong and expensive to diagnose, and every project that
 * adopts this library ends up assembling them by hand:
 *
 *  1. **`restoreMockedProps()` after each test.** `vi.restoreAllMocks()` knows about spies, not
 *     about properties `mockReadonlyProp` / `mockValueProp` redefined. Under `isolate: false` an
 *     un-restored patch on a global, a prototype or a singleton leaks straight into the next file.
 *  2. **One copy of the library in the tree.** Two installs keep two sets of console spies and
 *     registries, and the failure reads as "tests fail depending on order".
 *  3. **Draining the runner's restore registry.** Every `vi.spyOn` adds an entry that only
 *     `vi.restoreAllMocks()` removes; with a shared environment that list grows for the whole run.
 */
import { afterAll, beforeAll, expect, vi } from 'vitest';

import { noticeAngularBuildSplitting } from './angular-build-notice';
import * as DOCS_LINKS from './docs-links';
import { type DocumentPollutionOptions, type DocumentPollutionReaction, watchDocumentPollution } from './document-guard';
import { abandonEmissionWaits } from './emission-timeout';
import { type FakeTimersConfig, setupFakeTimers } from './fake-timers';
import { type BoundaryRepair, type StrayListenerReport, installFileBoundary } from './file-boundary';
import { setDefaultStrictMode } from './function-spy';
import type { GlobalPatchReaction } from './global-patch-guard';
import { type GuardReaction, libraryWarn } from './guard-reaction';
import { type GuardRegistry, addRestore, createGuardRegistry } from './guard-registry';
import { withDocs } from './message-link';
import { count } from './message-text';
import { type MisconfigurationReaction, setMisconfigurationReaction } from './misconfiguration';
import { trackMockRegistry } from './mock-registry';
import { type BlockNetworkOptions, blockNetwork } from './network-stub';
import { describeDuplicateCopies } from './package-identity';
import { type OutsideHookReaction, beginPropEpoch, reportPropsOutsideHooks, restoreMockedProps } from './prop-mock';
import type { PrototypePollutionReaction } from './prototype-guard';
import { armDiagnostics } from './setup-guards';
import { recordSetupRegistration } from './setup-per-file';
import { installTeardown } from './setup-teardown';
import { type StrayConsoleOptions, type StrayConsoleReaction, watchStrayConsole } from './stray-console';
import { strayTimersError, strayTimersReport } from './stray-failure';
import {
  type StrayTimer,
  cancelStrayTimers,
  describeStrayTimers,
  detectsAsyncLeaks,
  trackStrayTimers,
  withoutStrayTimerTracking,
} from './stray-timers';
import { type StrictSurvey, createStrictSurvey } from './strict-survey';
import { restoreTimerGlobals } from './timer-globals';
import type { UnstubbedCallHandler, UnstubbedReadHandler } from './types';
import { setUnconfiguredReadsDefault } from './unconfigured-reads';
import { restoreWebStorage } from './web-storage';
import { writeWarning } from './write-warning';

export { type TeardownStep, runTeardown } from './setup-teardown';
export type { StrayListenerReport } from './file-boundary';

/** How `setupAutoSpy` should react to more than one install of the library. */
export type DuplicateCopiesReaction = 'off' | 'throw' | 'warn';

/** What `strayTimers` swept up at the end of a file. Handed to {@link SetupAutoSpyOptions.onStrayTimers}. */
export interface StrayTimerReport {
  /** Timeouts, intervals and animation frames that were still outstanding when the file ended. */
  cancelled: number;
  /** Each of them, with the spec file that was running when it was scheduled and where the call came from. */
  timers: readonly StrayTimer[];
}

/** How `setupAutoSpy` reacts to a strict double's throw that something caught before the test saw it. */
export type SwallowedStrictCallsReaction = GuardReaction;

/** A named grade for every guard at once. `'strict'` is the only one: see {@link SetupAutoSpyOptions.preset}. */
export type SetupAutoSpyPreset = 'strict';

/** Options for {@link setupAutoSpy}. */
export interface SetupAutoSpyOptions {
  /** Every guard at its failing grade — see {@link applyPreset} for the list; an option passed alongside wins. */
  preset?: SetupAutoSpyPreset;
  /** Fail a test that writes to the console unabsorbed, and a file that does so outside a test. Default `'off'`. */
  strayConsole?: StrayConsoleOptions | StrayConsoleReaction;
  /** The library's own misuse reports (a `returns` key no spy answers to, …): `'warn'` (default) or `'throw'` at the call. */
  misconfiguration?: MisconfigurationReaction;
  /** React to a duplicated install. Default `'throw'` — the failure it prevents is far worse than a loud start. */
  duplicateCopies?: DuplicateCopiesReaction;
  /** Undo `mock*Prop` patches after every test. Default `true`. */
  restoreProps?: boolean;
  /**
   * React to a `mock*Prop` patch applied outside a per-test hook — in a `describe` body, or in
   * `beforeAll`. Default `'warn'`.
   *
   * Such a patch is undone after the **first** test of the block and never put back, so the first
   * test passes and every one after it reads the real member. Nothing says so today: the failure is
   * `… is not a function` several tests away from the line that caused it. Read together with
   * `restoreProps`, which is what takes the patch off; with `restoreProps: false` nothing sweeps and
   * nothing is reported.
   */
  propsOutsideHooks?: OutsideHookReaction;
  /**
   * Call `vi.restoreAllMocks()` after every test. Default `false`, because it also drops `vi.spyOn`
   * stubs a suite may have installed in `beforeAll`. Turn it on when running with `isolate: false`,
   * where the runner's restore registry otherwise grows for the entire run.
   */
  restoreMocks?: boolean;
  /**
   * Cancel timeouts, intervals and animation frames that outlive the file that scheduled them.
   * Default `false`, because it wraps the global schedulers and that should be a deliberate choice.
   * Turn it on with `isolate: false`, where a stray callback fires during a *later* file and is
   * reported against it — see {@link trackStrayTimers}.
   */
  strayTimers?: boolean;
  /**
   * What to do with the count `strayTimers` cancelled at the end of a file. Default: nothing, unless
   * Vitest's `detectAsyncLeaks` is on, in which case one warning is printed — see
   * {@link warnAboutSuppressedLeaks} for why that combination cannot stay quiet.
   *
   * Pass a handler to decide for yourself. Failing the run on any stray callback is one line:
   *
   * ```ts
   * setupAutoSpy({ strayTimers: true, onStrayTimers: ({ cancelled }) => expect(cancelled).toBe(0) });
   * ```
   *
   * `'throw'` does the same with a message that lists every stray's kind, delay, spec file and
   * first frame.
   *
   * Called only when something was actually cancelled, and only once per file.
   */
  onStrayTimers?: 'throw' | ((info: StrayTimerReport) => void);
  /**
   * Fail the test a swallowed promise rejection surfaced in, instead of letting it scroll past in
   * stderr. Default `false`, because it needs zone.js loaded and claims a hook on it.
   *
   * zone.js drains a rejection nobody handled into `console.error` and stops there — it never
   * reaches the channel Vitest watches, so the runner never hears about it. That is what lets
   * `compileComponents().then(() => expect(...))`, an `async` helper called without `await`, or a
   * `TypeError` thrown inside an `import(...).then(...)` in production code leave a green test and a
   * line of stderr behind. One migrated 11 587-test suite was hiding six such defects, two of them
   * assertions that were false. See {@link trackStrayRejections}.
   *
   * Native (non-zone) rejections already fail a Vitest run on their own, and nothing here touches
   * them; turning this on where zone.js is absent throws rather than pretending to watch.
   */
  strayRejections?: boolean;
  /**
   * Close the network before each test, so a unit run cannot reach it. Default `false`, since it
   * changes the behaviour of code under test. `true` blocks every channel the environment
   * implements — `fetch` rejects, `XMLHttpRequest` fails, `navigator.sendBeacon` answers `false`;
   * pass a {@link BlockNetworkOptions} object to narrow it, most often `{ xhr: 'empty' }` for a
   * suite whose outbound requests are tracker pings nobody reads.
   *
   * Worth turning on under happy-dom, which — unlike jsdom — implements `fetch`: requests nothing
   * asserts on then abort at teardown and fail an otherwise green run with no test named. And worth
   * it under jsdom too, which implements `XMLHttpRequest` in full. See {@link blockNetwork}.
   */
  blockNetwork?: BlockNetworkOptions | boolean;
  /**
   * Install fake timers around **every** test in the run — Jest's `fakeTimers.enableGlobally`,
   * which Vitest has no setting for. Default `false`.
   *
   * A suite ported from a Jest project that had it on was written against a frozen clock
   * throughout, and turning it back on file by file is a thousand edits. Pass `true` for the
   * defaults, or a `vi.useFakeTimers()` config (`{ toFake: ['setTimeout', 'Date'] }`) to narrow it.
   *
   * Installation is guarded on both ends, which is the part a hand-written pair of hooks gets
   * wrong: a spec that drives the clock itself would otherwise hit a second `vi.useRealTimers()`,
   * and that one leaves the environment without `clearInterval` — which then explodes during
   * teardown of whichever file happens to run next.
   */
  globalFakeTimers?: FakeTimersConfig | boolean;
  /**
   * Report a test that redefines a property of `globalThis` / `document` / `navigator` as
   * **non-configurable**, which nothing can undo. Default `'off'`.
   *
   * The patch itself is ordinary Jest-era code — `Object.defineProperty(document, 'cookie', { value })`
   * defaults `configurable` to `false` — and under per-file isolation it was harmless. Under
   * `isolate: false` the leftover belongs to every later file in the worker, and what fails is some
   * library, intermittently, with nothing naming the file that did it. See `guardGlobalPatches`,
   * which is the same check registered on its own.
   */
  guardGlobals?: GlobalPatchReaction;
  /**
   * Report — and take back off — an own enumerable key a test leaves on `Object.prototype`,
   * `Array.prototype` or `Function.prototype`. Default `'throw'`.
   *
   * On by default because the failure it catches is silent: Vitest walks a file's hooks with
   * `for…in`, so one inherited key stops **every later spec file in the worker from collecting**,
   * with no stack and zero failing tests — a green-looking run over code that never executed. See
   * {@link guardPrototypePollution}.
   */
  prototypePollution?: PrototypePollutionReaction;
  /**
   * Report — and put back — an attribute a test leaves added, changed or removed on `<html>`, `<head>`
   * or `<body>`; with `{ nodes: true }`, a child element of `<head>` or `<body>` as well. Default
   * `'off'`; `'throw'` under `preset: 'strict'`.
   *
   * Under `isolate: false` every file in a worker shares one document, so a `data-*` attribute or a
   * class a component set on `<body>` and never took off changes the branch some later file's code
   * takes — a failure in a file that never touched it, only when the two share a worker. Checked after
   * the TestBed's own teardown, so what a destroyed component cleans up is never reported. See
   * {@link guardDocumentPollution}.
   */
  documentPollution?: DocumentPollutionOptions | DocumentPollutionReaction;
  /**
   * Put back timer globals that uninstalling the fakes removed rather than restored. Default `true`:
   * it only ever replaces a global that has gone missing, so it cannot overwrite anything a spec
   * installed on purpose. See {@link restoreTimerGlobals}.
   */
  restoreTimerGlobals?: boolean;
  /**
   * Give the run a `localStorage` and a `sessionStorage` that work. Default `true`, for the same
   * reason as {@link restoreTimerGlobals}: a storage that survives a write and a read back is left
   * untouched, and a `node` environment — which is supposed to have neither — gets nothing.
   *
   * Vitest's `populateGlobal` copies a DOM environment's globals behind `if (k in global) return
   * KEYS.includes(k)`, and neither storage is in `KEYS`. Node's own Web Storage put the key on
   * `globalThis`, so the filter now answers "no" and the environment's storage never arrives:
   * `setItem is not a function` on Node 25, `localStorage` undefined on Node 26, under jsdom and
   * happy-dom alike. See {@link restoreWebStorage}.
   */
  restoreWebStorage?: boolean;
  /**
   * Take a spy off a `localStorage` / `sessionStorage` method at the end of each file, when the
   * runner's own restore could not. Default `true`: it only ever replaces a method that is still a
   * mock once the file is over.
   *
   * happy-dom's `Storage` is a Proxy whose `deleteProperty` trap only knows stored items, so the
   * delete behind `mockRestore()` never lands and the spy answers for every later file of the worker.
   * Turn it off for a suite that keeps a storage spy for a whole worker on purpose. See
   * {@link restoreStorageSpies}.
   */
  restoreStorageSpies?: boolean;
  /**
   * Take off `window` / `document` listeners a file added and never removed. Default `false`, because
   * it wraps `addEventListener` on both. Listeners already registered when the file's `beforeAll`
   * runs — the module graph's own — are kept. See {@link trackStrayListeners}.
   */
  strayListeners?: boolean;
  /**
   * What to do with the listeners `strayListeners` took off at the end of a file. Default: nothing.
   * Called only when something was removed, once per file, after the other file-boundary repairs:
   *
   * ```ts
   * setupAutoSpy({ strayListeners: true, onStrayListeners: ({ removed }) => expect(removed).toBe(0) });
   * ```
   *
   * `'throw'` fails the file with a message that lists every stray's type, target, spec file and first frame.
   */
  onStrayListeners?: 'throw' | ((info: StrayListenerReport) => void);
  /**
   * Put every `globalThis` global a file changed back at the end of the file. Default `false`.
   *
   * One snapshot per worker, taken when the first `setupAutoSpy` call runs; a plain
   * `global.ResizeObserver = stub` is tracked by neither `unstubGlobals` nor `restoreMocks`, and
   * under `isolate: false` it answers for every later file. Globals added after the snapshot are
   * kept. See {@link restoreGlobals}.
   */
  restoreGlobals?: boolean;
  /**
   * Keep `@vitest/spy`'s registry of every mock ever created down to the mocks that outlive a file.
   * Default `false`, because it reaches into a set the runner does not expose.
   *
   * The registry exists so `vi.clearAllMocks()` has something to walk. With `isolate: false` it is
   * created once per worker and only grows: `clearMocks: true` then walks every mock of every file
   * already run before each test, and the heap holds all of them — with their recorded arguments,
   * and through those whole component trees. Turning this on prunes what each file added once the
   * file is over, and keeps what the file inherited. See {@link trackMockRegistry}, and
   * {@link keepMockRegistered} for the one case the split gets wrong on its own.
   *
   * It also guards the mocks it keeps. A registered mock is reachable by `vi.resetAllMocks()` as
   * well as by `vi.clearAllMocks()`, and `mockReset` puts an implementation back only when it was
   * passed to `vi.fn(implementation)` — a chained `.mockReturnValue(…)` or `.mockReturnThis()` is
   * simply lost. With `isolate: false` that surfaces as a failure in a later file, inside
   * application code, blaming a component for a shared double some other spec reset. The
   * implementation each long-lived mock carried when it was classified is therefore remembered and
   * put back before a test that has lost it. See {@link restoreLongLivedImplementations}.
   */
  pruneMockRegistry?: boolean;
  /**
   * Explain a `beforeEach` that ran out of the run-wide `hookTimeout` while `testTimeout` is larger.
   * Default `true` — it only ever adds a sentence to a test that has already failed.
   *
   * Jest resolves one `testTimeout` for a hook and for a test body alike; Vitest resolves
   * `hookTimeout` separately and defaults it to 10 000 ms. A suite that migrated its preset's single
   * `testTimeout: 30000` into the runner config and stopped there gives hooks a third of the budget
   * their tests get — and Vitest reports the resulting hook timeout **against the test**, with the
   * test's duration pinned at the limit (`× should create 10045ms`). It reads as a slow test, and
   * the body it names never ran. See {@link annotateHookTimeout}.
   *
   * Silent unless the two budgets actually differ, and silent for a hook that named its own timeout
   * (`beforeEach(fn, 300)`) — that one is slow on its own terms and the config is not to blame.
   */
  hookTimeoutHint?: boolean;
  /**
   * Explain a test or hook that ran out of time while the clock was frozen and callbacks were queued
   * on it. Default `true` — like {@link hookTimeoutHint}, it only ever adds a sentence to a test
   * that has already failed.
   *
   * A frozen clock turns waiting into waiting forever, and the runner's own advice ("pass a timeout
   * value") is the one repair that cannot work. Under {@link globalFakeTimers} nothing in the spec
   * says the clock is fake at all, so the timeout arrives in a file that never mentions a timer. The
   * hint reports `vi.isFakeTimers()` and `vi.getTimerCount()` — a fact, not a guess — and names the
   * `setImmediate` case that reaches this with no timer in sight. See
   * {@link annotateFrozenClockTimeout}.
   *
   * Silent when the clock is real, and silent when the fake clock has nothing queued.
   */
  frozenClockHint?: boolean;
  /**
   * Say once per worker when `@angular/build:unit-test` is in the window where it builds the
   * unit-test bundle with code splitting off — `[22.1.5, 22.1.7)`. Default `true`; like
   * {@link hookTimeoutHint}, it only ever adds a line, here to stderr at the start of the run.
   *
   * In that window every spec becomes a self-contained bundle, and `--coverage` grows by hundreds
   * of megabytes with no plateau until the run is killed — 791 chunks / 596 MB on a 784-spec suite.
   * The builder emits no warning, and the `doctor` check that reports it has to be sought out; this
   * fires in the run where it hurts. See {@link noticeAngularBuildSplitting}.
   *
   * Silent outside the builder, outside the window, and wherever the installed version cannot be
   * read (no `process`, a Node before `getBuiltinModule`). It is the one place the library reads the
   * disk: a single `package.json`, read-only, and nothing but the line depends on it.
   */
  angularBuildHint?: boolean;
  /**
   * Clear the `vitest-auto-spy/console` spies after every test. Default `true`.
   *
   * They are plain mocks over the real `console`, and nothing the runner offers empties them:
   * `vi.restoreAllMocks()` only knows about `vi.spyOn`, and `clearMocks` is off by default. Left
   * alone they keep every argument of every log for the whole run — `Error` objects and their stacks
   * included, which in an Angular suite is a teardown warning per test. Turn it off for a spec that
   * asserts on what an earlier test logged.
   *
   * A project that never imports the `/console` entry pays nothing for this: the reset is looked up
   * on a registry that entry fills in, so the module is not pulled in on its account.
   */
  resetConsoleSpies?: boolean;
  /**
   * Make every double built afterwards throw when a method nobody configured is called, instead of
   * returning `undefined`. Default: off.
   *
   * The per-double flag is `createSpyFromClass(X, { strict: true })`; this is the same switch for a
   * whole suite, so that adopting it is one line rather than an edit per factory call. A double's
   * own configuration still wins — an explicit `strict: false` included, which is the only way to
   * exempt one wide collaborator from a suite-wide default.
   *
   * See {@link StrictSpyConfiguration.strict} for what counts as configured.
   *
   * `'survey'` refuses nothing: every call and read strict mode would refuse is counted, and each file
   * ends with the list — the members to seed in `returns` before switching to `true`.
   */
  strict?: boolean | 'survey';
  /**
   * The general form of {@link strict} for a whole suite: run this instead of returning `undefined`
   * from a call nobody configured, and use whatever it returns as that call's result.
   *
   * ```ts
   * setupAutoSpy({ onUnstubbedCall: ({ className, method }) => console.warn(`unstubbed ${className}.${method}`) });
   * ```
   *
   * A double's own `onUnstubbedCall` wins over this one, and a double built with `strict: false` never
   * reaches it.
   */
  onUnstubbedCall?: UnstubbedCallHandler;
  /**
   * Fail a test in which a strict double threw and the error never reached the test — caught by a
   * `try`/`catch` in the code under test, or an RxJS error with no handler, whose rethrow a fake clock
   * never runs. Default `'throw'` with `strict: true` or the strict preset, `'off'` otherwise.
   */
  swallowedStrictCalls?: SwallowedStrictCallsReaction;
  /**
   * Report, after each test, what a strict double answered without anyone configuring it: a spied
   * getter the test read (it answered `undefined`) and an observable property it subscribed to that
   * nothing fed by the end of the test (it never emitted). Default `'off'`; not part of
   * `preset: 'strict'`. Reads are counted from the first `beforeEach` of a test to its last `afterEach`.
   *
   * ```
   * [vitest-auto-spy] Router.url was read 3 times on a strict double and nothing configured it, so the code under test got undefined.
   * ```
   */
  unconfiguredReads?: UnconfiguredReadsReaction;
  /**
   * The suite-wide form of `onUnstubbedRead`: receives every finding {@link unconfiguredReads} would
   * report — from every double not built with `strict: false`, strict or not — instead of the report.
   * For surveying a suite before turning the report on.
   */
  onUnstubbedRead?: UnstubbedReadHandler;
}

/** How `setupAutoSpy` reacts to a strict double's getter or stream that a test used with nothing configured. */
export type UnconfiguredReadsReaction = GuardReaction;

/**
 * The one sentence that keeps `strayTimers` from quietly emptying somebody else's leak report.
 *
 * Vitest 4.1's `detectAsyncLeaks` remembers every async resource a file created and, once the file
 * is over, asks each whether anything still holds it. `cancelStrayTimers()` runs in `afterAll` —
 * *before* that question — so every timer it swept up answers no, and a suite that leaks timers is
 * told it leaks nothing. That is a worse outcome than either feature alone: the reader turned the
 * flag on precisely to find out, and got a clean bill of health as the answer.
 *
 * Cancelling anyway is still right — a callback that fires during a later file is the failure
 * `strayTimers` exists to prevent, and it is the more expensive one — so the fix is to say what was
 * taken away and where to look for it instead, once per file, only when there was something.
 *
 * **Not `console.warn`.** The sweep runs after the file's last test, and Vitest attributes
 * intercepted console output to the task that produced it — with no task left, the line is dropped
 * and the warning is never seen (checked on 4.1.9: it reappears only under
 * `disableConsoleIntercept`). `process.stderr` is the channel that survives — see
 * {@link writeWarning}, console-last for an environment with no `process`.
 */
export function warnAboutSuppressedLeaks(
  cancelled: number,
  write: (message: string) => void = writeWarning,
  timers: readonly StrayTimer[] = [],
): void {
  write(
    withDocs(
      `${strayTimersReport(cancelled, timers, 3)}\n` +
        'Vitest\'s detectAsyncLeaks looks after that cancel, so these timers are missing from its "Async Leaks" report.',
      DOCS_LINKS.setupAsyncLeaks,
    ),
  );
}

/**
 * Hand the sweep's count to whoever asked for it — the caller's handler, or the warning above.
 *
 * Exported for its spec: the sweep it belongs to runs in an `afterAll` at the very end of a file,
 * where a test can neither choose the count nor observe what was printed.
 */
export function reportStrayTimers(
  cancelled: number,
  handler: SetupAutoSpyOptions['onStrayTimers'],
  timers: readonly StrayTimer[] = [],
): void {
  if (cancelled === 0) {
    return;
  }

  if (handler === 'throw') {
    throw strayTimersError(cancelled, timers);
  }

  if (handler) {
    handler({ cancelled, timers });

    return;
  }

  if (detectsAsyncLeaks()) {
    warnAboutSuppressedLeaks(cancelled, writeWarning, timers);
  }
}

/**
 * Install the suite-wide strict-mode default, and take it off again when the file is over.
 *
 * The disarm is the half that matters. `setDefaultStrictMode` writes a module-level binding, and
 * under `isolate: false` that module is shared by every file in the worker — so a default armed by
 * one setup run would stay armed for files whose own setup never asked for it, and the failure
 * ("Nothing configured X.load, and strict mode is on") would name a spec that never opted in.
 * `afterAll` is the same seam `strayTimers` uses for the same reason: the switch is armed now, once,
 * and released once the file that armed it has finished.
 *
 * Armed only when the caller actually asked, so that a plain `setupAutoSpy()` cannot clobber a
 * default some other seam installed — `{ strict: undefined, onUnstubbedCall: undefined }` resolves
 * to "off", but writing it would still overwrite whatever was there.
 */
function armStrictMode(options: SetupAutoSpyOptions & { strict?: boolean }): void {
  // One value rather than two conditions, because `strict: false` is an answer and not an absence:
  // `??` keeps it (`false ?? handler` is `false`), so the only way to reach `undefined` here is a
  // caller that mentioned neither option.
  const asked: UnstubbedCallHandler | boolean | undefined = options.strict ?? options.onUnstubbedCall;

  if (asked === undefined) {
    return;
  }

  setDefaultStrictMode({ strict: options.strict, onUnstubbedCall: options.onUnstubbedCall });

  afterAll(() => {
    setDefaultStrictMode(undefined);
  });
}

/** The read-side half of {@link armStrictMode}: armed only when asked, released after the file for the same reason. */
function armUnconfiguredReads(options: SetupAutoSpyOptions): void {
  if (options.unconfiguredReads === undefined && options.onUnstubbedRead === undefined) {
    return;
  }

  setUnconfiguredReadsDefault((options.unconfiguredReads ?? 'off') !== 'off', options.onUnstubbedRead);

  afterAll(() => {
    setUnconfiguredReadsDefault(false, undefined);
  });
}

function reportDuplicateCopies(reaction: DuplicateCopiesReaction): void {
  if (reaction === 'off') {
    return;
  }

  const report = describeDuplicateCopies();

  if (!report) {
    return;
  }

  if (reaction === 'throw') {
    throw new Error(report);
  }

  libraryWarn(report);
}

function restoreRunnerMocks(): void {
  vi.restoreAllMocks();
}

/**
 * Clear the `vitest-auto-spy/console` spies, if this run installed any.
 *
 * Looked up on the registry the `/console` entry fills in rather than imported: a project that never
 * imports that entry must not pay for the module, and `setupAutoSpy` is what every project loads.
 */
function resetInstalledConsoleSpies(): void {
  globalThis.__vitestAutoSpyResetConsoleSpies__?.();
}

function prepareEnvironment(options: SetupAutoSpyOptions): void {
  if (options.angularBuildHint ?? true) {
    noticeAngularBuildSplitting();
  }

  if (options.restoreWebStorage ?? true) {
    withoutStrayTimerTracking(() => restoreWebStorage());
  }
}

/** Whether zone.js is loaded, which is what `strayRejections` needs and the strict preset checks for. */
function zoneIsLoaded(): boolean {
  return typeof Reflect.get(Object(Reflect.get(globalThis, 'Zone')), '__symbol__') === 'function';
}

/** Fill in what the preset grades, leaving every option the caller passed as it was. Exported for its spec. */
export function applyPreset(options: SetupAutoSpyOptions): SetupAutoSpyOptions {
  if (options.preset !== 'strict') {
    return options;
  }

  return {
    ...options,
    duplicateCopies: options.duplicateCopies ?? 'throw',
    propsOutsideHooks: options.propsOutsideHooks ?? 'throw',
    guardGlobals: options.guardGlobals ?? 'throw',
    prototypePollution: options.prototypePollution ?? 'throw',
    documentPollution: options.documentPollution ?? 'throw',
    strayConsole: options.strayConsole ?? 'throw',
    misconfiguration: options.misconfiguration ?? 'throw',
    swallowedStrictCalls: options.swallowedStrictCalls ?? 'throw',
    strayTimers: options.strayTimers ?? true,
    strayRejections: options.strayRejections ?? zoneIsLoaded(),
  };
}

// Armed now for doubles built during collection, and again before the tests, because an earlier block
// of the same file may already have released it.
function armMisconfiguration(reaction: MisconfigurationReaction | undefined): void {
  if (reaction === undefined) {
    return;
  }

  const arm = (): void => setMisconfigurationReaction(reaction);

  arm();
  beforeAll(arm);
  afterAll(() => {
    setMisconfigurationReaction(undefined);
  });
}

/**
 * Emission waits the test never awaited: tear the subscription down and name what it was waiting for.
 *
 * Ahead of every other step, because a wait still holding a subscription keeps its source — and the
 * timers and patches the source touches — alive while the checks after it look for leftovers. A
 * non-empty list means a helper's promise was dropped, so the test passed without its assertion.
 */
function abandonPendingWaits(): void {
  const abandoned = abandonEmissionWaits();

  if (abandoned.length > 0) {
    libraryWarn(describeAbandonedWaits(abandoned, expect.getState().currentTestName));
  }
}

/** Exported for its spec. */
export function describeAbandonedWaits(abandoned: readonly string[], test: string | undefined): string {
  const one = abandoned.length === 1;

  return withDocs(
    `[vitest-auto-spy] ${test === undefined ? 'This test' : `"${test}"`} never awaited ${count(abandoned.length, 'emission wait')} ` +
      `(${abandoned.join(', ')}), so ${one ? 'its assertion' : 'their assertions'} never ran.\n` +
      `Await ${one ? 'it' : 'each one'}, or return it from the test. ` +
      `${one ? 'Its subscription is' : 'Their subscriptions are'} torn down now.`,
    DOCS_LINKS.observableAssertions,
  );
}

/**
 * The file-end sweep `strayTimers` needs, or none. Wrapping happens now, once per worker; the sweep is
 * per file, because "still wanted?" only becomes an unambiguous no once the file is over.
 */
function strayTimerSweeps(options: SetupAutoSpyOptions): BoundaryRepair[] {
  if (!(options.strayTimers ?? false)) {
    return [];
  }

  trackStrayTimers();

  return [
    (): (() => void) => {
      const timers = describeStrayTimers();
      const cancelled = cancelStrayTimers();

      return (): void => reportStrayTimers(cancelled, options.onStrayTimers, timers);
    },
  ];
}

/** The teardown steps that put the environment back, in the order they have to run. */
function armRestores(registry: GuardRegistry, options: SetupAutoSpyOptions): void {
  if (options.restoreProps ?? true) {
    addRestore(registry, restoreMockedProps);
    reportPropsOutsideHooks(options.propsOutsideHooks ?? 'warn');
  }

  if (options.restoreMocks ?? false) {
    addRestore(registry, restoreRunnerMocks);
  }

  if (options.resetConsoleSpies ?? true) {
    addRestore(registry, resetInstalledConsoleSpies);
  }

  // Last of the restores: whatever came before may have uninstalled fake timers, and under happy-dom
  // that removes a timer global rather than putting it back.
  if (options.restoreTimerGlobals ?? true) {
    addRestore(registry, restoreTimerGlobals);
  }
}

/** Flips `strict` for one run without editing the setup file: `VITEST_AUTO_SPY_STRICT=1 vitest run <slice>`. */
export const STRICT_ENV = 'VITEST_AUTO_SPY_STRICT';

/** The `strict` the environment asks for, which wins over the option; `undefined` when it asks nothing. */
export function strictFromEnvironment(
  env: Readonly<Record<string, string | undefined>> | undefined = globalThis.process?.env,
): boolean | 'survey' | undefined {
  const raw = env?.[STRICT_ENV]?.trim().toLowerCase();

  if (raw === '1' || raw === 'true') {
    return true;
  }

  if (raw === 'survey') {
    return raw;
  }

  return raw === '0' || raw === 'false' ? false : undefined;
}

/**
 * `strict: 'survey'` as the handlers that count instead of throwing, and the per-file report.
 * A handler the caller passed still wins, so the survey never swallows one.
 */
export function surveyInstead(
  options: SetupAutoSpyOptions,
  survey: StrictSurvey = createStrictSurvey(),
  write: (message: string) => void = writeWarning,
): SetupAutoSpyOptions & { strict?: boolean } {
  const { strict, ...rest } = options;

  if (strict !== 'survey') {
    return strict === undefined ? rest : { ...rest, strict };
  }

  afterAll(() => {
    const report = survey.flush(expect.getState().testPath);

    if (report !== undefined) {
      write(report);
    }
  });

  return { ...rest, onUnstubbedCall: options.onUnstubbedCall ?? survey.onCall, onUnstubbedRead: options.onUnstubbedRead ?? survey.onRead };
}

/**
 * Install the library's test-run hygiene.
 *
 * ```ts
 * // vitest.setup.ts
 * import { setupAutoSpy } from 'vitest-auto-spy/setup';
 *
 * setupAutoSpy();
 * ```
 */
export function setupAutoSpy(input: SetupAutoSpyOptions = {}): void {
  const strict = strictFromEnvironment();
  const options = surveyInstead(applyPreset(strict === undefined ? input : { ...input, strict }));

  reportDuplicateCopies(options.duplicateCopies ?? 'throw');
  recordSetupRegistration();
  prepareEnvironment(options);

  // Its `beforeEach` is registered here, ahead of every hook below. The epoch is its first step:
  // `blockNetwork` installs its stubs through the mock*Prop journal, and a patch stamped with the
  // previous test's epoch is graded as written outside a hook. With `restoreProps` off nothing grades.
  const registry = createGuardRegistry();

  if (options.restoreProps ?? true) {
    registry.open.push(beginPropEpoch);
  }

  // The file-end report runs in the boundary sweep: a sibling report that throws first would otherwise
  // skip its own `afterAll`, and the output would be charged to the next file.
  const consoleGuard = watchStrayConsole(options.strayConsole, registry.open);

  const sweeps = strayTimerSweeps(options);

  if (consoleGuard) {
    sweeps.push(consoleGuard.closeFile);
  }

  if (options.pruneMockRegistry ?? false) {
    trackMockRegistry();
  }

  installFileBoundary(options, sweeps);

  armStrictMode(options);
  armUnconfiguredReads(options);
  armMisconfiguration(options.misconfiguration);
  // Not a teardown step: it has to look after the TestBed's own teardown, which an `afterEach` here
  // precedes, so its per-test check rides the net.
  const documents = watchDocumentPollution(options.documentPollution ?? 'off');

  if (options.globalFakeTimers) {
    setupFakeTimers(options.globalFakeTimers === true ? undefined : options.globalFakeTimers, { betweenTests: true });
  }

  if (options.blockNetwork) {
    // Per test: `restoreProps` takes the stubs off after every test. Read once, not handed the context.
    const blockOptions = options.blockNetwork === true ? {} : options.blockNetwork;

    registry.open.push(() => {
      blockNetwork(blockOptions);
    });
  }

  // The console goes back first, so a spy the test installed cannot absorb what the steps after it
  // print, and the report goes last, so it can quote them.
  if (consoleGuard) {
    addRestore(registry, consoleGuard.restore);
  }

  addRestore(registry, abandonPendingWaits);
  armDiagnostics(registry, options);
  armRestores(registry, options);

  if (consoleGuard) {
    registry.teardown.push(consoleGuard.report);
  }

  installTeardown(registry, documents);
}
