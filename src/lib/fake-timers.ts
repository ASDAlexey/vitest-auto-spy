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
import { afterEach, beforeEach, vi } from 'vitest';

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
 */
export function setupFakeTimers(config?: FakeTimersConfig): void {
  // Both hooks are guarded, because installing or uninstalling twice does not round-trip: a suite
  // that drives the clock itself, or a nested `describe` that calls this helper again, reaches a
  // second `vi.useRealTimers()` — and that one leaves the environment without `clearInterval`,
  // which then explodes during teardown of whichever file happens to run next.
  beforeEach(() => {
    if (!vi.isFakeTimers()) {
      vi.useFakeTimers(config);
    }
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }

    restoreTimerGlobals();
  });
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
