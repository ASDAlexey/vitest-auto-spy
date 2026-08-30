/**
 * Why a test under fake timers dies on its timeout instead of failing.
 *
 * A frozen clock turns "waiting" into "waiting forever". `await new Promise(r => setTimeout(r, 10))`
 * never resolves unless something advances the clock, and the runner has nothing better to say about
 * it than the sentence it says about a genuinely slow test:
 *
 * ```text
 * Error: Test timed out in 5000ms.
 * If this is a long-running test, pass a timeout value as the last argument …
 * ```
 *
 * So the reader is told to raise the budget, which is the one repair that cannot work — the callback
 * is not late, it is never going to run. Under `setupAutoSpy({ globalFakeTimers: true })` the trap is
 * worse, because nothing in the spec says the clock is fake: the file inherited the setting from a
 * Jest preset that had `fakeTimers.enableGlobally`, and the timeout arrives in a file that never
 * mentions a timer.
 *
 * The evidence is public and exact. `vi.isFakeTimers()` says the clock is frozen and
 * `vi.getTimerCount()` says how much work is queued on it, so the hint reports a fact rather than a
 * guess: the clock is fake, N callbacks are waiting on it, and nothing advanced it.
 *
 * The commonest shape that reaches this without a timer in sight is an HTTP spec: `setImmediate` is
 * among the globals `vi.useFakeTimers()` replaces by default, and Express ends a request that
 * matched no route through `finalhandler`, which schedules on `setImmediate`. The 404 is therefore
 * never written, and a routing mistake is reported as a test that took thirty seconds.
 *
 * The one place this cannot help: a spec whose own `afterEach` calls `vi.useRealTimers()`. Hooks run
 * in reverse registration order, so a spec's own hook runs before the one `setupAutoSpy` installs,
 * and by the time the clock is read it is real again. Nothing is reported then rather than something
 * wrong.
 */
import { vi } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';

/** Both wordings the runner uses for "ran out of time" — a frozen clock strands hooks as readily as tests. */
const TIMEOUT_MESSAGE = /^(?:Test|Hook) timed out in \d+ms\./;

/** Marks a message this module has already extended, so a second pass cannot append twice. */
const HINT_MARKER = '[vitest-auto-spy] the clock is frozen';

/** The state of the clock at teardown, or `undefined` when the timers are real. */
export interface FrozenClock {
  /** How many callbacks `vi.getTimerCount()` found queued on the fake clock. */
  pending: number;
}

/**
 * The fake clock and its backlog, or `undefined` when there is nothing to report.
 *
 * `vi.getTimerCount()` is only meaningful — and on some runtimes only callable — while the fakes are
 * installed, so the check is ordered rather than combined. A frozen clock with an empty queue says
 * nothing about a timeout and is treated as no finding.
 *
 * `clock` is a parameter so the spec can hand over a stand-in; production always passes `vi`.
 */
export function readFrozenClock(clock: Pick<typeof vi, 'getTimerCount' | 'isFakeTimers'> = vi): FrozenClock | undefined {
  if (!clock.isFakeTimers()) {
    return undefined;
  }

  const pending = clock.getTimerCount();

  return pending > 0 ? { pending } : undefined;
}

/** The sentence appended to a timeout the frozen clock explains. */
export function describeFrozenClock({ pending }: FrozenClock): string {
  return withDocs(
    `${HINT_MARKER} and ${pending} callback(s) are queued on it, so this did not run out of time — it ran out of clock. ` +
      'Fake timers only move when something moves them: advance them (`await vi.advanceTimersByTimeAsync(ms)`, ' +
      '`await vi.runAllTimersAsync()`) or take them off for this test. Raising the timeout cannot help, because the ' +
      'callback is not late — it is never scheduled to run. `setImmediate` is faked too, which is how an HTTP spec ' +
      'reaches this with no timer in sight: a request that matches no route is ended by `finalhandler` on ' +
      '`setImmediate`, so the 404 is never written and a routing mistake is reported as a slow test.',
    DOCS_LINKS.fakeTimers,
  );
}

/**
 * Append the explanation to every timeout the runner has already blamed this test for.
 *
 * The errors are walked the same defensive way the rest of the teardown reads the runner's task
 * shape: this package does not depend on the runner's types, and a missing link anywhere on the path
 * means the same thing as an empty list.
 */
export function annotateFrozenClockTimeout(errors: readonly unknown[], clock: FrozenClock | undefined): void {
  if (clock === undefined) {
    return;
  }

  for (const error of errors) {
    const message: unknown = Reflect.get(Object(error), 'message');

    if (typeof message === 'string' && !message.includes(HINT_MARKER) && TIMEOUT_MESSAGE.test(message)) {
      Reflect.set(Object(error), 'message', `${message}\n${describeFrozenClock(clock)}`);
    }
  }
}
