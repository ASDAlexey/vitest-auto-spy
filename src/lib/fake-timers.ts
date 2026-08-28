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

import { DOCS_LINKS, withDocs } from './docs-links';
import { restoreTimerGlobals } from './timer-globals';

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
  // Both halves are guarded, because installing or uninstalling twice does not round-trip: a suite
  // that drives the clock itself, or a nested `describe` that calls this helper again, reaches a
  // second `vi.useRealTimers()` — and that one leaves the environment without `clearInterval`,
  // which then explodes during teardown of whichever file happens to run next.
  const install = (): void => {
    if (!vi.isFakeTimers()) {
      vi.useFakeTimers(config);
    }
  };

  const uninstall = (): void => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }

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
      withDocs('advanceTimers() requires fake timers — call setupFakeTimers() or vi.useFakeTimers() first', DOCS_LINKS.fakeTimers),
    );
  }

  vi.advanceTimersByTime(ms);
  await Promise.resolve();
}
