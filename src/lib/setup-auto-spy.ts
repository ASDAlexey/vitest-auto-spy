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
import { afterAll, afterEach, beforeEach, onTestFinished, vi } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';
import { type FakeTimersConfig, setupFakeTimers } from './fake-timers';
import { type GlobalPatchReaction, type GlobalSnapshot, checkSealedAdditions, snapshotWatchedGlobals } from './global-patch-guard';
import { trackMockRegistry } from './mock-registry';
import { type BlockNetworkOptions, blockNetwork } from './network-stub';
import { describeDuplicateCopies } from './package-identity';
import { countMockedProps, restoreMockedProps } from './prop-mock';
import { type StrayRejection, flushStrayRejections, trackStrayRejections } from './stray-rejections';
import { cancelStrayTimers, trackStrayTimers } from './stray-timers';
import { restoreTimerGlobals } from './timer-globals';

/** How `setupAutoSpy` should react to more than one install of the library. */
export type DuplicateCopiesReaction = 'off' | 'throw' | 'warn';

/** Options for {@link setupAutoSpy}. */
export interface SetupAutoSpyOptions {
  /** React to a duplicated install. Default `'throw'` — the failure it prevents is far worse than a loud start. */
  duplicateCopies?: DuplicateCopiesReaction;
  /** Undo `mock*Prop` patches after every test. Default `true`. */
  restoreProps?: boolean;
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
   * Put back timer globals that uninstalling the fakes removed rather than restored. Default `true`:
   * it only ever replaces a global that has gone missing, so it cannot overwrite anything a spec
   * installed on purpose. See {@link restoreTimerGlobals}.
   */
  restoreTimerGlobals?: boolean;
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
   */
  pruneMockRegistry?: boolean;
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

  // eslint-disable-next-line no-console -- the whole point of `'warn'` is to surface the report without failing the run.
  console.warn(report);
}

const LATE_ASSERTION_ADVICE =
  'An assertion that settles after its test has finished cannot fail it: the test it belongs to was reported green without ever ' +
  'running it. The usual causes are `.then(() => expect(...))` and an `async` helper called without `await` — return or await ' +
  'the promise so the assertion lands inside the test.';

const UNHANDLED_ERROR_ADVICE =
  'A rejection nothing handled is a code path the suite never asserted on: under zone.js it fails no test, so the run stays ' +
  'green while the error scrolls past in stderr. Await the promise, or assert on it with ' +
  '`await expect(promise).rejects.toThrow(...)`.';

function describeReason(reason: unknown): string {
  return reason instanceof Error ? `${reason.name}: ${reason.message}` : `rejected with ${String(reason)}`;
}

/**
 * Turn what was captured into the failure message.
 *
 * Both halves of it are load-bearing. The reason names the defect, and "attributed to" names the
 * test the runner was in when zone.js gave up — which is not always the test that created the
 * promise, and pretending otherwise would send the reader to the wrong file.
 *
 * Exported for this module's own spec: the hook below fails the test it runs after, so the wording
 * can only be asserted on by building it directly.
 */
export function describeStrayRejections(rejections: readonly StrayRejection[]): string {
  const lines = rejections.map((rejection) => `  - ${describeReason(rejection.reason)} — attributed to ${rejection.testName || 'no test'}`);
  const advice = rejections.some((rejection) => rejection.assertion) ? LATE_ASSERTION_ADVICE : UNHANDLED_ERROR_ADVICE;

  return withDocs(
    `[vitest-auto-spy] ${rejections.length} promise rejection(s) went unhandled and zone.js swallowed each one into ` +
      `console.error:\n${lines.join('\n')}\n${advice}`,
    DOCS_LINKS.setup,
  );
}

/**
 * What the runner has already blamed the test that just ran for.
 *
 * Reached through `Object(...)` at every step rather than guarded: the shape is the runner's, this
 * package does not depend on its types, and a missing link anywhere on the path means the same
 * thing as an empty list. `errors` is on `task.result` by the time `afterEach` runs — verified
 * against the runner rather than assumed, for a passing test (absent), a synchronous failure and an
 * asynchronous one (present, one entry).
 *
 * Exported for this module's own spec, which builds the context by hand.
 */
export function reportedErrors(context: unknown): readonly unknown[] {
  const result: unknown = Reflect.get(Object(Reflect.get(Object(context), 'task')), 'result');
  const errors: unknown = Reflect.get(Object(result), 'errors');

  return Array.isArray(errors) ? errors : [];
}

/**
 * Whether a rejection is one the runner has already told the reader about.
 *
 * Identity first, and then message-and-stack, because the runner processes an error on its way into
 * `result.errors` and does not promise to hand back the object that was thrown. Two failures that
 * agree on both of those are the same throw seen twice, which is precisely the case worth dropping.
 */
function alreadyReported(reason: unknown, reported: readonly unknown[]): boolean {
  return reported.some((error) => error === reason || sameFailure(error, reason));
}

function sameFailure(reported: unknown, reason: unknown): boolean {
  const message: unknown = Reflect.get(Object(reason), 'message');

  return (
    typeof message === 'string' &&
    Reflect.get(Object(reported), 'message') === message &&
    Reflect.get(Object(reported), 'stack') === Reflect.get(Object(reason), 'stack')
  );
}

/**
 * Fail the test whatever was captured is attributed to — minus what the runner has already said.
 *
 * An `async` test that fails an assertion leaves its own `AssertionError` where this can find it:
 * the runner reports the failure, and the same error arrives here as a rejection nobody handled. The
 * report then carried two messages per failure, and the first thing a reader does with the second
 * one is go looking for a defect that is not there. A rejection the runner has already attributed to
 * this test is not news, whatever else it is, so it is dropped — the check exists to surface the
 * rejections that fail *no* test.
 *
 * A named function rather than an inline hook body, so the spec can exercise the failure without
 * the hook failing the very test doing the asserting.
 */
export function reportStrayRejections(context?: unknown): void {
  const reported = reportedErrors(context);
  const stray = flushStrayRejections().filter((rejection) => !alreadyReported(rejection.reason, reported));

  if (stray.length > 0) {
    throw new Error(describeStrayRejections(stray));
  }
}

/**
 * One step of the single `afterEach` {@link setupAutoSpy} installs.
 *
 * The runner's test context is handed along, because one of the steps needs to know how the test it
 * runs after ended; the rest ignore it.
 */
type TeardownStep = (context?: unknown) => void;

/**
 * Run every teardown step, then re-throw whatever the first failing one threw.
 *
 * Two of the steps throw on purpose — `strayRejections` and `guardGlobals: 'throw'` fail the test
 * their finding belongs to — and a throw out of a hook cancels every hook the runner has not called
 * yet. So the steps share one hook and this loop: the restores run whether or not a diagnostic
 * found something, and the diagnostic's message still fails the test.
 *
 * The first failure wins rather than the last, because the diagnostics run first and their message
 * is the one that names a defect in the suite; a `try`/`finally` would give the opposite priority,
 * since a `finally` block's throw replaces the pending one.
 *
 * Exported for this module's own spec: every step of a real run either throws through the hook —
 * failing the test that is doing the asserting — or is invisible from inside a test.
 */
export function runTeardown(steps: readonly TeardownStep[], context?: unknown): void {
  const failures: unknown[] = [];

  for (const step of steps) {
    try {
      step(context);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw failures[0];
  }
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

/**
 * Arm the non-configurable-patch guard, handing back the check to run after each test.
 *
 * Registered here rather than through `guardGlobalPatches` (which stays the standalone entry point)
 * so that the check is one of the steps above: it throws, and the restores have to survive it.
 */
function watchGlobalPatches(reaction: GlobalPatchReaction): TeardownStep[] {
  if (reaction === 'off') {
    return [];
  }

  let before: GlobalSnapshot[] = [];

  beforeEach(() => {
    before = snapshotWatchedGlobals();
  });

  return [
    (): void => {
      checkSealedAdditions(before, reaction);
    },
  ];
}

/**
 * Claim zone's rejection slot for this worker, handing back the per-test report step.
 *
 * Kept last of the diagnostics, which is as late as the read can be made without a restore running
 * first: every await point before it is one more chance for zone's microtask drain to have handed
 * the rejection over.
 */
function watchStrayRejections(enabled: boolean): TeardownStep[] {
  if (!enabled) {
    return [];
  }

  // The claim happens now, once per worker, exactly as `strayTimers` does.
  afterAll(trackStrayRejections());

  return [reportStrayRejections];
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
export function setupAutoSpy(options: SetupAutoSpyOptions = {}): void {
  reportDuplicateCopies(options.duplicateCopies ?? 'throw');

  if (options.strayTimers ?? false) {
    // Wrapping happens now, once per worker; the sweep is per file, because "still wanted?" only
    // becomes an unambiguous no once the file is over.
    trackStrayTimers();
    afterAll(() => {
      cancelStrayTimers();
    });
  }

  if (options.pruneMockRegistry ?? false) {
    trackMockRegistry();
  }

  if (options.globalFakeTimers) {
    setupFakeTimers(options.globalFakeTimers === true ? undefined : options.globalFakeTimers, { betweenTests: true });
  }

  if (options.blockNetwork) {
    // Per test rather than once: the stubs are registered as property patches, so `restoreProps`
    // takes them off again after every test, and re-installing is what keeps them in place. The
    // options are read once here rather than per test — `beforeEach` hands its callback a
    // `TestContext`, which a bare `beforeEach(blockNetwork)` would pass on as the options object.
    const blockOptions = options.blockNetwork === true ? {} : options.blockNetwork;

    beforeEach(() => {
      blockNetwork(blockOptions);
    });
  }

  // The diagnostics come first because they are the steps that throw on purpose; every restore
  // after them runs regardless. See {@link runTeardown} for why the two live in one hook.
  // The diagnostics are the steps that throw on purpose; the restores are the ones that put the
  // environment back. The split is not cosmetic — the net below re-runs the restores and must not
  // re-run a check that has already reported.
  const diagnostics: TeardownStep[] = [
    ...watchGlobalPatches(options.guardGlobals ?? 'off'),
    ...watchStrayRejections(options.strayRejections ?? false),
  ];
  const restores: TeardownStep[] = [];

  if (options.restoreProps ?? true) {
    restores.push(restoreMockedProps);
  }

  if (options.restoreMocks ?? false) {
    restores.push(restoreRunnerMocks);
  }

  if (options.resetConsoleSpies ?? true) {
    restores.push(resetInstalledConsoleSpies);
  }

  // Last of the restores: whatever came before may have uninstalled fake timers, and under happy-dom
  // that removes a timer global rather than putting it back.
  if (options.restoreTimerGlobals ?? true) {
    restores.push(restoreTimerGlobals);
  }

  const steps = [...diagnostics, ...restores];

  if (steps.length > 0) {
    installTeardown(steps, restores);
  }
}

/**
 * The teardown hook, and the net that catches the run where it never happened.
 *
 * Vitest runs `afterEach` hooks in **reverse** registration order, so the hook a setup file
 * registers is the *last* to run — and a hook the spec file registered, which therefore runs first,
 * takes the whole chain down with it when it throws. Nothing here runs, the patches stay in place,
 * and the next test reads values somebody else installed.
 *
 * That is neither hypothetical nor loud. One spec kept a long-standing
 * `afterEach(() => vi.restoreAllMocks())`; migrating it to
 * `provideAutoSpy(LayoutStateService, { gettersToSpyOn: [...] })` made the restored getter return
 * `undefined`, `ngOnDestroy` called it as a signal, the `TypeError` aborted the hook — and the
 * failure surfaced in a different `describe` as a template error about a null profile. With the
 * hand-rolled `vi.fn()` it replaced, the restored getter was still callable, so the mine had been
 * sitting there invisible.
 *
 * `onTestFinished` is the answer because Vitest runs it after the `afterEach` chain and runs it
 * whatever that chain did — measured in both orderings rather than assumed. It is registered per
 * test from a `beforeEach`, and does nothing at all unless the hook was skipped, so the ordinary
 * path costs one boolean.
 */
function installTeardown(steps: readonly TeardownStep[], restores: readonly TeardownStep[]): void {
  let teardownRan = false;

  beforeEach(() => {
    teardownRan = false;

    onTestFinished(() => {
      if (teardownRan) {
        return;
      }

      const leaked = countMockedProps();

      runTeardown(restores);

      // eslint-disable-next-line no-console -- the test has already failed on whatever threw, and a second thrown error would bury the first; this is the sentence that explains it.
      console.warn(describeSkippedTeardown(leaked));
    });
  });

  afterEach((context) => {
    try {
      runTeardown(steps, context);
    } finally {
      // In a `finally`, because `runTeardown` rethrows what a step threw and the restores have run
      // by then regardless — the net's job is the hook that never started, not the one that failed.
      teardownRan = true;
    }
  });
}

/** What the net says when it finds a teardown that never ran. */
function describeSkippedTeardown(leaked: number): string {
  return withDocs(
    `[vitest-auto-spy] setupAutoSpy()'s afterEach did not run for this test, so ${leaked} mock*Prop patch(es) were still in ` +
      'place; they have been put back now. Vitest runs `afterEach` hooks in reverse registration order, which makes the one a ' +
      'setup file registers the last to run — so any hook the spec file registered that throws takes this one with it. Look for ' +
      "the hook that threw in this test's output; without this net the patches would have travelled into the next test, and the " +
      'failure would have surfaced in some later test that never touched them.',
    DOCS_LINKS.setup,
  );
}
