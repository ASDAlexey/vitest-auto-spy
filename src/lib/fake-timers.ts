/**
 * Fake-timer helpers — the boilerplate every suite that tests a debounce, a poll or a retry ends up
 * writing by hand, and the one mistake it makes while doing so.
 *
 * The mistake is asserting straight after `vi.advanceTimersByTime()`. Advancing runs the timer
 * callbacks synchronously, but anything they *queue* — a resolved promise, an `await` continuation,
 * an RxJS `delay()` handing control back — is still sitting in the microtask queue when the next
 * line executes. The assertion then reads state from before the callback finished, and the test
 * fails in a way that reads like a race in the code under test. {@link advanceTimers} awaits that
 * queue, which is why it is `async` and why the return value must be awaited.
 *
 * {@link setupFakeTimers} is the paired `beforeEach`/`afterEach`. Installing fake timers without
 * restoring them leaks a frozen clock into every later file in the same worker, so the two belong
 * in one call rather than in two hooks a suite can half-write.
 */
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { forgetDateOnlyFakes, hasDateOnlyFakes, restoreTimerGlobals } from './timer-globals';

/**
 * Config forwarded verbatim to `vi.useFakeTimers()`.
 *
 * Typed off Vitest's own signature rather than restated here, so it tracks whatever the installed
 * version accepts (`toFake`, `shouldAdvanceTime`, `now`, …).
 */
export type FakeTimersConfig = Parameters<typeof vi.useFakeTimers>[0];

/**
 * Install fake timers for a `describe` block and restore real ones after every test.
 *
 * ```ts
 * describe('SearchComponent', () => {
 *   setupFakeTimers();
 *
 *   it('debounces the query', async () => {
 *     component.onInput('ab');
 *     await advanceTimers(300);
 *     expect(search.query).toHaveBeenCalledWith('ab');
 *   });
 * });
 * ```
 *
 * @param config Optional `vi.useFakeTimers()` config — e.g. `{ toFake: ['setTimeout'] }` to leave
 *   `Date` and `queueMicrotask` real.
 * @param options `betweenTests: true` keeps the clock fake in the gaps between tests as well — see
 *   {@link SetupFakeTimersOptions.betweenTests}. Off by default, because a scoped call belongs to
 *   its `describe` and must leave the clock as it found it.
 */
export function setupFakeTimers(config?: FakeTimersConfig, { betweenTests = false }: SetupFakeTimersOptions = {}): void {
  // The fakes this call installed, by identity. `vi.isFakeTimers()` answers "somebody has fakes
  // on", which is not the question: `mockSystemTime()` in a `beforeAll` installs `Date`-only fakes,
  // and skipping the install on those left `setTimeout` real — `advanceTimers(100)` then passed its
  // own check and ran nothing, silently. The same "somebody" also swallowed this call's `config`
  // whenever an outer `setupFakeTimers` or `globalFakeTimers` had armed a set first.
  let ownFakes: { readonly date: unknown; readonly timer: unknown } | undefined = undefined;

  const ownsTheClock = (): boolean => ownFakes?.date === globalThis.Date && ownFakes?.timer === globalThis.setTimeout;

  // Both halves are guarded, because installing or uninstalling twice does not round-trip: a suite
  // that drives the clock itself, or a nested `describe` that calls this helper again, reaches a
  // second `vi.useRealTimers()` — and that one leaves the environment without `clearInterval`,
  // which then explodes during teardown of whichever file happens to run next.
  const install = (): void => {
    if (vi.isFakeTimers()) {
      if (ownsTheClock()) {
        return;
      }

      // Somebody else's fakes. A call with no config of its own defers to them, as it always has —
      // an outer `describe` or a global setup owns the clock and knows what it wanted. A call that
      // *was* given a config, and a set that fakes nothing but `Date`, are the two cases where
      // deferring means silently doing the opposite of what the caller asked.
      if (config === undefined && !hasDateOnlyFakes()) {
        return;
      }

      forgetDateOnlyFakes();
      vi.useRealTimers();
      restoreTimerGlobals();
    }

    vi.useFakeTimers(config);
    ownFakes = { date: globalThis.Date, timer: globalThis.setTimeout };
  };

  const uninstall = (): void => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }

    ownFakes = undefined;
    restoreTimerGlobals();
  };

  if (betweenTests) {
    // Covers a `beforeAll` that runs before any test of the file has — the root one, and the first
    // one of every nested `describe` reached before the first test.
    beforeAll(install);
  }

  beforeEach(install);

  afterEach(() => {
    uninstall();

    if (betweenTests) {
      install();
    }
  });

  if (betweenTests) {
    // The boundary that matters under `isolate: false`: the fakes must not outlive the file, or the
    // next one evaluates its imports against a frozen clock it never asked for.
    afterAll(uninstall);
  }
}

/** Options for {@link setupFakeTimers}. */
export interface SetupFakeTimersOptions {
  /**
   * Keep the clock fake between tests, not only during them — Jest's `fakeTimers.enableGlobally`.
   *
   * Arming in `beforeEach` alone does not reproduce it, and the gap is not hypothetical: a
   * `beforeAll` inside a **nested** `describe` runs *after* the previous test's `afterEach`, so it
   * meets whatever that hook left behind. A suite that prepares its samples there — driving an
   * animation clock with `vi.advanceTimersByTimeAsync`, say — then fails with `A function to advance
   * timers was called but the timers APIs are not mocked`, in a set whose own tests never touch a
   * timer.
   *
   * So the fakes are re-armed in `afterEach` right after they come off, and taken off for good in
   * `afterAll`. The clock is still fresh for every test: the uninstall discards whatever the
   * previous one scheduled.
   *
   * @default false
   */
  betweenTests?: boolean;
}

/**
 * Advance fake timers by `ms`, then let the microtasks their callbacks queued settle.
 *
 * Throws on real timers instead of letting Vitest fail deeper in with "timers are not mocked" —
 * the actual fix is one call away (`setupFakeTimers()`), and the message says so.
 *
 * ```ts
 * poller.start();
 * await advanceTimers(5_000);
 * expect(api.fetch).toHaveBeenCalledTimes(2);
 * ```
 *
 * @param ms Milliseconds to advance. Defaults to `0` — the "run everything already due, then flush
 *   microtasks" step, which is what a `setTimeout(fn, 0)` or a resolved-promise chain needs.
 */
export async function advanceTimers(ms = 0): Promise<void> {
  if (!vi.isFakeTimers()) {
    throw new Error(
      withDocs(
        '[vitest-auto-spy] advanceTimers() requires fake timers, and the timers in this test are real. ' +
          'Call setupFakeTimers() once in the setup file, or vi.useFakeTimers() in this test.',
        DOCS_LINKS.advanceTimers,
      ),
    );
  }

  if (hasDateOnlyFakes()) {
    throw new Error(
      withDocs(
        '[vitest-auto-spy] advanceTimers() found only the clock faked, not the timers: mockSystemTime() installs `Date` ' +
          'alone, so there is nothing for this call to advance. Call setupFakeTimers() (or vi.useFakeTimers()) for the ' +
          'test that drives timers.',
        DOCS_LINKS.advanceTimers,
      ),
    );
  }

  // `advanceTimersByTimeAsync`, not the sync version plus one `await Promise.resolve()`: that
  // drains a fixed two levels of the microtask queue, so a `.then().then().then()` chain a timer
  // callback started was left one level short and a timer *scheduled* from a promise continuation
  // never ran at all — the rxjs `delay()` / retry / poll shape this helper exists for.
  await vi.advanceTimersByTimeAsync(ms);
}
