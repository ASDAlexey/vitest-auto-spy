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

import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { count } from './message-text';

/** Both wordings the runner uses for "ran out of time" — a frozen clock strands hooks as readily as tests. */
// The ` while waiting for …` part is Vitest 5's: it names the operations its `TaskDeadline` was
// tracking, and it sits between the limit and the full stop. Nothing calls `track` in the 5.0.0
// node runner, so the suffix is not reachable yet — the day something does (browser commands,
// `expect.poll`, `vi.waitFor`), a regex anchored on `ms.` would drop the hint without a word.
const TIMEOUT_MESSAGE = /^(?:Test|Hook) timed out in \d+ms(?: while waiting for [^\n]*?)?\./;

/** Marks a message this module has already extended, so a second pass cannot append twice. */
const HINT_MARKER = '[vitest-auto-spy] the clock is frozen';

/** The state of the clock at teardown, or `undefined` when the timers are real. */
export interface FrozenClock {
  /** How many callbacks `vi.getTimerCount()` found queued on the fake clock. */
  pending: number;
  /** How many of them are `setImmediate` callbacks, when there are any. */
  immediates?: number;
}

/** The `setImmediate` callbacks on the installed fake clock, read off the clock `@sinonjs/fake-timers` tags its fakes with. */
function queuedImmediates(host: object): number {
  const clock: unknown = Reflect.get(Object(Reflect.get(host, 'setTimeout')), 'clock');
  const timers: unknown = Reflect.get(Object(clock), 'timers');

  // A `Map` in the fake-timers Vitest bundles, a plain object in older releases.
  const queued: unknown[] = timers instanceof Map ? [...timers.values()] : Object.values(Object(timers));

  return queued.filter((timer) => Reflect.get(Object(timer), 'immediate') === true).length;
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
export function readFrozenClock(
  clock: Pick<typeof vi, 'getTimerCount' | 'isFakeTimers'> = vi,
  host: object = globalThis,
): FrozenClock | undefined {
  if (!clock.isFakeTimers()) {
    return undefined;
  }

  const pending = clock.getTimerCount();
  const immediates = queuedImmediates(host);

  if (pending === 0) {
    return undefined;
  }

  return immediates > 0 ? { pending, immediates } : { pending };
}

/** The sentence appended to a timeout the frozen clock explains. */
export function describeFrozenClock({ pending, immediates }: FrozenClock): string {
  const queued = pending === 1 ? '1 callback is queued on it' : `${pending} callbacks are queued on it`;
  const server =
    immediates === undefined
      ? ''
      : ` ${count(immediates, 'of them is a setImmediate callback', 'of them are setImmediate callbacks')}: an HTTP server ends ` +
        "a request that matched no route that way, so its 404 is never written — leave setImmediate out of the fakes' toFake.";

  return withDocs(
    `${HINT_MARKER} and ${queued}, so this did not run out of time — nothing advanced the clock, and raising the timeout ` +
      'cannot help. Advance it (`await vi.advanceTimersByTimeAsync(ms)`, `await vi.runAllTimersAsync()`) or use real ' +
      `timers for this test.${server}`,
    DOCS_LINKS.setupFrozenClock,
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
