/**
 * These specs cover the three things the helpers promise: `setupFakeTimers()` really installs the
 * clock for each test and really gives it back afterwards, `advanceTimers()` flushes the microtasks
 * a timer callback queues (the failure mode a bare `vi.advanceTimersByTime()` produces), and it
 * refuses to run on real timers with a message that names the fix.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { mockSystemTime } from './clock';
import { advanceTimers, setupFakeTimers } from './fake-timers';
import { type RestoreProp } from './prop-mock';
import { forgetDateOnlyFakes } from './timer-globals';

describe('setupFakeTimers', () => {
  describe('inside a describe block', () => {
    setupFakeTimers();

    it('has fake timers installed', () => {
      expect(vi.isFakeTimers()).toBe(true);
    });

    it('installs them again for the next test', () => {
      expect(vi.isFakeTimers()).toBe(true);
    });
  });

  it('has restored real timers once that block is over', () => {
    expect(vi.isFakeTimers()).toBe(false);
  });

  describe('with a config', () => {
    setupFakeTimers({ toFake: ['setTimeout'] });

    it('forwards it to vi.useFakeTimers', () => {
      const before = Date.now();

      vi.advanceTimersByTime(1_000);

      // A faked `Date` jumps with the clock. `toFake` listed only `setTimeout`, so it must not have.
      expect(Date.now() - before).toBeLessThan(1_000);
    });
  });

  describe('when the suite drives the clock itself', () => {
    setupFakeTimers();

    // The hook already installed the fakes; taking them off mid-test is what a spec that wants real
    // timers for one assertion does. The `afterEach` must then not uninstall a second time.
    it('tolerates the spec uninstalling them first', () => {
      vi.useRealTimers();

      expect(vi.isFakeTimers()).toBe(false);
    });

    it('still has a working environment in the next test', () => {
      expect(typeof clearInterval).toBe('function');
      expect(typeof Date.now()).toBe('number');
    });
  });

  describe('nested inside another setupFakeTimers', () => {
    setupFakeTimers();

    describe('the inner block', () => {
      setupFakeTimers();

      it('does not install twice', () => {
        expect(vi.isFakeTimers()).toBe(true);
      });
    });

    it('leaves the outer block with a usable clock', () => {
      expect(vi.isFakeTimers()).toBe(true);
      expect(typeof Date.now()).toBe('number');
    });
  });

  describe('nested with a config of its own', () => {
    setupFakeTimers({ now: new Date('2000-01-01T00:00:00.000Z') });

    describe('the inner block', () => {
      setupFakeTimers({ now: new Date('2030-01-01T00:00:00.000Z') });

      it('installs the config it was given rather than deferring to the outer one', () => {
        // `vi.isFakeTimers()` answers "somebody has fakes on", so the inner config used to be
        // dropped on the floor — silently, with the outer clock left in place.
        expect(new Date().getUTCFullYear()).toBe(2030);
      });
    });

    it('is back on the outer config once the inner block is over', () => {
      expect(new Date().getUTCFullYear()).toBe(2000);
    });
  });

  describe('when only the clock was faked before it', () => {
    let restore: RestoreProp | undefined;

    beforeAll(() => {
      // `mockSystemTime()` installs `Date`-only fakes. Finding those, the hook used to skip its own
      // install: `setTimeout` stayed real, and `advanceTimers()` passed its check and ran nothing.
      restore = mockSystemTime('2030-01-01T00:00:00.000Z');
    });

    afterAll(() => {
      restore?.();
      forgetDateOnlyFakes();
    });

    setupFakeTimers();

    it('installs the full set, so the timers can actually be advanced', async () => {
      const ran = vi.fn();

      setTimeout(ran, 100);
      await advanceTimers(100);

      expect(ran).toHaveBeenCalledTimes(1);
    });
  });
});

describe('advanceTimers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a due timer callback', async () => {
    vi.useFakeTimers();
    const ran = vi.fn();

    setTimeout(ran, 300);
    await advanceTimers(300);

    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('settles the microtasks a timer callback queues', async () => {
    vi.useFakeTimers();
    let resolved = false;

    setTimeout(() => {
      void Promise.resolve().then(() => {
        resolved = true;
      });
    }, 0);

    await advanceTimers();

    expect(resolved).toBe(true);
  });

  it('leaves a timer that is not yet due alone', async () => {
    vi.useFakeTimers();
    const ran = vi.fn();

    setTimeout(ran, 500);
    await advanceTimers(499);

    expect(ran).not.toHaveBeenCalled();
  });

  it('throws on real timers and names the fix', async () => {
    await expect(advanceTimers(10)).rejects.toThrow(
      /^\[vitest-auto-spy\] advanceTimers\(\) requires fake timers, and the timers in this test are real\. Call setupFakeTimers\(\)[\s\S]*#advancetimers-ms$/,
    );
  });

  it('refuses to pretend it advanced anything when only `Date` is faked', async () => {
    const restore = mockSystemTime(0);

    try {
      await expect(advanceTimers(10)).rejects.toThrow(/only the clock faked, not the timers/);
    } finally {
      restore();
      forgetDateOnlyFakes();
    }
  });

  it('settles a promise chain deeper than two levels', async () => {
    vi.useFakeTimers();

    const seen: string[] = [];

    setTimeout(() => {
      void Promise.resolve()
        .then(() => seen.push('a'))
        .then(() => seen.push('b'))
        .then(() => seen.push('c'));
    }, 10);

    await advanceTimers(10);

    // `await Promise.resolve()` inserts the continuation at a fixed place in the microtask queue,
    // so anything appended after it — a third `.then`, the rxjs `delay()` hand-off — was left over.
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('runs a timer a promise continuation scheduled inside the window', async () => {
    vi.useFakeTimers();

    const seen: string[] = [];

    // The rxjs `delay()` / retry / poll shape: the timer that keeps the chain going is scheduled
    // from a promise continuation, so a sync advance plus one `await` never reached it at all.
    setTimeout(() => {
      void Promise.resolve().then(() => {
        setTimeout(() => seen.push('nested'), 5);
      });
    }, 10);

    await advanceTimers(20);

    expect(seen).toEqual(['nested']);
  });
});
