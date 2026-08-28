/**
 * Clock control that survives fake timers being re-installed around every test.
 *
 * Two distinct needs live here, and both are broken by the same detail.
 *
 * `vi.useFakeTimers()` installs a *new* `Date` implementation on every call. A suite that keeps
 * fakes on globally therefore replaces `globalThis.Date` before each test, and any patch a spec
 * applied to `Date.now` in module scope — or in a `beforeAll` — is left sitting on an object
 * nothing reads any more. The symptom is a clock that "stops working from the second test on",
 * with nothing in the spec to point at. Worse is the hand-written undo: `afterEach(() => { Date.now
 * = saved })` re-attaches a *dead* clock's `now` to the live `Date`, and the damage surfaces in a
 * later file.
 *
 * {@link mockNow} and {@link useCountingClock} therefore re-apply per test, and hand the undo to
 * {@link restoreMockedProps}, which records the exact object it patched.
 *
 * {@link mockSystemTime} covers the other need: the ported `jest.spyOn(global, 'Date')`. That throws
 * `Date is not a constructor` under Vitest with a stack in production code, because the fake timers
 * already own the global — and the message never mentions timers. The right call is
 * `vi.setSystemTime`, plus installing `Date`-only fakes when none are running yet.
 */
import { afterEach, beforeEach, vi } from 'vitest';

import { type RestoreProp, mockValueProp } from './prop-mock';

/** Anything `vi.setSystemTime` accepts. */
export type SystemTime = Date | number | string;

/**
 * Freeze the clock at `time`, whether or not fake timers are already running.
 *
 * With fakes installed this is `vi.setSystemTime`. Without them it installs `Date`-only fakes, so
 * `setTimeout` and friends stay real and nothing else about the test changes.
 *
 * ```ts
 * const restore = mockSystemTime('2025-04-30T00:00:00Z');
 *
 * expect(banner.text()).toBe('valid from 30.04.25');
 * restore();
 * ```
 *
 * An assertion that contains a date needs this. Without it the expected string is computed from
 * `new Date()` and the test starts failing on its own, some days after it was written — a failure
 * that looks like a regression and is not one.
 *
 * @returns An undo. It uninstalls the fakes only if this call installed them.
 */
export function mockSystemTime(time: SystemTime): RestoreProp {
  if (vi.isFakeTimers()) {
    vi.setSystemTime(time);

    // The suite owns the fakes; taking them off here would break every later test in the file.
    return (): void => undefined;
  }

  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(time);

  return (): void => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }
  };
}

/**
 * Run `body` with the clock frozen at `time`, and put it back afterwards — including on failure.
 *
 * ```ts
 * await withSystemTime('2025-04-30T00:00:00Z', async () => {
 *   await expect(subscription.renewalLabel()).resolves.toBe('renews 30.05.25');
 * });
 * ```
 */
export async function withSystemTime<T>(time: SystemTime, body: () => Promise<T> | T): Promise<T> {
  const restore = mockSystemTime(time);

  try {
    return await body();
  } finally {
    restore();
  }
}

/**
 * Replace `Date.now` with `source` before every test in the enclosing block, on whichever `Date`
 * is live at that moment.
 *
 * Call it at `describe` level; it registers the hooks itself.
 *
 * ```ts
 * describe('AnalyticsQueue', () => {
 *   let tick = 0;
 *
 *   mockNow(() => (tick += 1));
 *
 *   it('stamps events in order', () => { … });
 * });
 * ```
 */
export function mockNow(source: () => number): void {
  let restore: RestoreProp | undefined;

  beforeEach(() => {
    // Patch the live `Date`, not one captured earlier: a global fake-timer setup has just replaced
    // it, and `mockValueProp` records the object it actually patched so the undo cannot land on
    // the wrong one.
    restore = mockValueProp(Date, 'now', source);
  });

  afterEach(() => {
    // Undone here as well as by `restoreMockedProps()`, so the helper is safe in a project that has
    // not adopted `setupAutoSpy()`; the second call is a no-op by construction.
    restore?.();
  });
}

/** A monotonic stand-in for `Date.now`, for specs whose expectations are tick numbers. */
export interface CountingClock {
  /** What the next `Date.now()` will return. */
  readonly value: number;
  /** Start over — for a spec that wants its own first tick to be `start`. */
  reset(): void;
}

/** Shape of {@link useCountingClock}'s configuration. */
export interface CountingClockOptions {
  /** The first value `Date.now()` returns. Default `1`. */
  start?: number;
  /** Added on every read. Default `1`. */
  step?: number;
}

/**
 * A `Date.now` that counts instead of telling the time, reset before every test.
 *
 * Fake timers give every call inside one test the same "now", so a spec that asserts on *order* or
 * on *duration* — analytics batches, tracing spans, a rate limiter, a TTL cache, dedupe-by-time —
 * cannot express its expectation at all. Counting from one makes the expected values readable
 * (`event_timestamp: 1, 2, 3`) and independent of the wall clock.
 *
 * ```ts
 * describe('MetricsCollector', () => {
 *   const clock = useCountingClock();
 *
 *   it('stamps each event with the next tick', () => {
 *     collector.push('a');
 *     collector.push('b');
 *
 *     expect(sent()).toEqual([{ name: 'a', at: 1 }, { name: 'b', at: 2 }]);
 *     expect(clock.value).toBe(3);
 *   });
 * });
 * ```
 */
export function useCountingClock(options: CountingClockOptions = {}): CountingClock {
  const start = options.start ?? 1;
  const step = options.step ?? 1;
  let next = start;

  const clock: CountingClock = {
    get value(): number {
      return next;
    },
    reset(): void {
      next = start;
    },
  };

  mockNow(() => {
    const current = next;

    next += step;

    return current;
  });

  // Resetting in `beforeEach` rather than inside `mockNow`'s hook keeps the two independent: a spec
  // may call `reset()` itself mid-test, and `mockNow` has no business knowing about counters.
  beforeEach(() => {
    clock.reset();
  });

  return clock;
}
