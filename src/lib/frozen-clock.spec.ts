/**
 * Every case builds the runner's error by hand: making a test actually time out would cost the
 * budget under discussion, once per case, and would fail the test doing the asserting.
 *
 * What could not be faked was established against the real runner instead, with a probe test whose
 * body awaited a `setImmediate` under `vi.useFakeTimers()` and a 300 ms limit. It produced
 * `× … 306ms`, `Error: Test timed out in 300ms.`, an `afterEach` that ran regardless, and
 * `vi.isFakeTimers() === true` with `vi.getTimerCount() === 1` read from inside it — which is the
 * whole of the mechanism this module rests on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { annotateFrozenClockTimeout, describeFrozenClock, readFrozenClock } from './frozen-clock';

/** A clock that reports whatever the case needs, in the shape `vi` offers. */
function clockStub(isFake: boolean, pending: number): Pick<typeof vi, 'getTimerCount' | 'isFakeTimers'> {
  return { isFakeTimers: () => isFake, getTimerCount: () => pending };
}

describe('readFrozenClock', () => {
  it('reports the backlog of a frozen clock', () => {
    expect(readFrozenClock(clockStub(true, 3))).toEqual({ pending: 3 });
  });

  it('says nothing about a real clock, and does not ask it for a count', () => {
    const getTimerCount = vi.fn(() => 3);

    expect(readFrozenClock({ isFakeTimers: () => false, getTimerCount })).toBeUndefined();
    expect(getTimerCount).not.toHaveBeenCalled();
  });

  it('says nothing about a frozen clock with an empty queue — that explains no timeout', () => {
    expect(readFrozenClock(clockStub(true, 0))).toBeUndefined();
  });

  it('reads the real runner when nothing is handed to it', () => {
    // The fakes are off in this file, so the honest answer here is "nothing to report".
    expect(readFrozenClock()).toBeUndefined();
  });
});

describe('describeFrozenClock', () => {
  it('names the backlog, the repair, and the repair that cannot work', () => {
    const message = describeFrozenClock({ pending: 2 });

    expect(message).toContain('[vitest-auto-spy] the clock is frozen and 2 callbacks are queued on it');
    expect(message).toContain('advanceTimersByTimeAsync');
    expect(message).toContain('raising the timeout cannot help');
    expect(message).not.toContain('setImmediate');
    expect(message).toMatch(/\nDocs: \S+\/utilities\/setup#_12-a-timeout-the-clock-explains-not-the-code$/);
  });

  it('adds the server note only when setImmediate callbacks are among them', () => {
    expect(describeFrozenClock({ pending: 1 })).toContain('1 callback is queued on it');
    expect(describeFrozenClock({ pending: 3, immediates: 1 })).toContain(
      '1 of them is a setImmediate callback: an HTTP server ends a request that matched no route that way',
    );
    expect(describeFrozenClock({ pending: 3, immediates: 2 })).toContain('2 of them are setImmediate callbacks');
  });
});

describe('readFrozenClock on the installed fakes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the setImmediate callbacks among the queued ones', () => {
    vi.useFakeTimers();
    setImmediate(() => undefined);
    setTimeout(() => undefined, 10);

    expect(readFrozenClock()).toEqual({ pending: 2, immediates: 1 });
  });

  it('reads the object-shaped queue of an older clock', () => {
    const host = { setTimeout: { clock: { timers: { 1: { immediate: true }, 2: {} } } } };

    expect(readFrozenClock(clockStub(true, 2), host)).toEqual({ pending: 2, immediates: 1 });
  });
});

describe('annotateFrozenClockTimeout', () => {
  const frozen = { pending: 1 };

  it('explains a test that ran out of clock rather than out of time', () => {
    const error = new Error('Test timed out in 5000ms.');

    annotateFrozenClockTimeout([error], frozen);

    expect(error.message).toContain('[vitest-auto-spy] the clock is frozen');
  });

  it('explains a hook the same way, since a frozen clock strands both', () => {
    const error = new Error('Hook timed out in 10000ms.');

    annotateFrozenClockTimeout([error], frozen);

    expect(error.message).toContain('[vitest-auto-spy] the clock is frozen');
  });

  it('appends once, however often the teardown runs', () => {
    const error = new Error('Test timed out in 5000ms.');

    annotateFrozenClockTimeout([error], frozen);
    annotateFrozenClockTimeout([error], frozen);

    expect(error.message.match(/\[vitest-auto-spy] the clock is frozen/g)).toHaveLength(1);
  });

  it('leaves every failure that is not a timeout alone', () => {
    const assertion = new Error('expected 404 to be 401');

    annotateFrozenClockTimeout([assertion], frozen);

    expect(assertion.message).toBe('expected 404 to be 401');
  });

  it('says nothing when the clock had nothing to answer for', () => {
    const error = new Error('Test timed out in 5000ms.');

    annotateFrozenClockTimeout([error], undefined);

    expect(error.message).toBe('Test timed out in 5000ms.');
  });

  it('survives an entry the runner serialised into something without a string message', () => {
    expect(() => annotateFrozenClockTimeout([null, 'a bare string', { message: 42 }], frozen)).not.toThrow();
  });
});
