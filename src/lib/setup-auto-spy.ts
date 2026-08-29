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
import { afterAll, afterEach, beforeEach, vi } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';
import { type FakeTimersConfig, setupFakeTimers } from './fake-timers';
import { type GlobalPatchReaction, type GlobalSnapshot, checkSealedAdditions, snapshotWatchedGlobals } from './global-patch-guard';
import { blockNetwork } from './network-stub';
import { describeDuplicateCopies } from './package-identity';
import { restoreMockedProps } from './prop-mock';
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
   * Reject every `fetch` before each test, so a unit run cannot reach the network. Default `false`,
   * since it changes the behaviour of code under test. Worth turning on under happy-dom, which —
   * unlike jsdom — implements `fetch`: requests nothing asserts on then abort at teardown and fail
   * an otherwise green run with no test named. See {@link blockNetwork}.
   */
  blockNetwork?: boolean;
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
 * Fail the test whatever was captured is attributed to.
 *
 * A named function rather than an inline hook body, so the spec can exercise the failure without
 * the hook failing the very test doing the asserting.
 */
export function reportStrayRejections(): void {
  const stray = flushStrayRejections();

  if (stray.length > 0) {
    throw new Error(describeStrayRejections(stray));
  }
}

/** One step of the single `afterEach` {@link setupAutoSpy} installs. */
type TeardownStep = () => void;

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
export function runTeardown(steps: readonly TeardownStep[]): void {
  const failures: unknown[] = [];

  for (const step of steps) {
    try {
      step();
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

  if (options.globalFakeTimers) {
    setupFakeTimers(options.globalFakeTimers === true ? undefined : options.globalFakeTimers, { betweenTests: true });
  }

  if (options.blockNetwork ?? false) {
    // Per test rather than once: the stub is registered as a property patch, so `restoreProps`
    // takes it off again after every test, and re-installing is what keeps it in place.
    beforeEach(blockNetwork);
  }

  // The diagnostics come first because they are the steps that throw on purpose; every restore
  // after them runs regardless. See {@link runTeardown} for why the two live in one hook.
  const steps: TeardownStep[] = [
    ...watchGlobalPatches(options.guardGlobals ?? 'off'),
    ...watchStrayRejections(options.strayRejections ?? false),
  ];

  if (options.restoreProps ?? true) {
    steps.push(restoreMockedProps);
  }

  if (options.restoreMocks ?? false) {
    steps.push(restoreRunnerMocks);
  }

  if (options.resetConsoleSpies ?? true) {
    steps.push(resetInstalledConsoleSpies);
  }

  // Last of the restores: whatever came before may have uninstalled fake timers, and under happy-dom
  // that removes a timer global rather than putting it back.
  if (options.restoreTimerGlobals ?? true) {
    steps.push(restoreTimerGlobals);
  }

  if (steps.length > 0) {
    afterEach(() => {
      runTeardown(steps);
    });
  }
}
