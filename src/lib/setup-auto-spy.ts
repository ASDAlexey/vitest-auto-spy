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

import { type FakeTimersConfig, setupFakeTimers } from './fake-timers';
import { type GlobalPatchReaction, guardGlobalPatches } from './global-patch-guard';
import { blockNetwork } from './network-stub';
import { describeDuplicateCopies } from './package-identity';
import { restoreMockedProps } from './prop-mock';
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
   * library, intermittently, with nothing naming the file that did it. See {@link guardGlobalPatches}.
   */
  guardGlobals?: GlobalPatchReaction;
  /**
   * Put back timer globals that uninstalling the fakes removed rather than restored. Default `true`:
   * it only ever replaces a global that has gone missing, so it cannot overwrite anything a spec
   * installed on purpose. See {@link restoreTimerGlobals}.
   */
  restoreTimerGlobals?: boolean;
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

  if (options.restoreProps ?? true) {
    afterEach(restoreMockedProps);
  }

  if (options.restoreMocks ?? false) {
    afterEach(() => {
      vi.restoreAllMocks();
    });
  }

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

  guardGlobalPatches(options.guardGlobals ?? 'off');

  if (options.blockNetwork ?? false) {
    // Per test rather than once: the stub is registered as a property patch, so `restoreProps`
    // takes it off again after every test, and re-installing is what keeps it in place.
    beforeEach(blockNetwork);
  }

  // Last of the `afterEach` hooks, so it runs after a spec's own timer teardown and repairs
  // whatever that removed. Hooks registered here run in registration order (`sequence.hooks`
  // defaults to 'stack' for nested suites, but these are all top-level and file-scoped).
  if (options.restoreTimerGlobals ?? true) {
    afterEach(restoreTimerGlobals);
  }
}
