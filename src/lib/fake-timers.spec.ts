/**
 * These specs cover the three things the helpers promise: `setupFakeTimers()` really installs the
 * clock for each test and really gives it back afterwards, `advanceTimers()` flushes the microtasks
 * a timer callback queues (the failure mode a bare `vi.advanceTimersByTime()` produces), and it
 * refuses to run on real timers with a message that names the fix.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { advanceTimers, setupFakeTimers } from './fake-timers';

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
    await expect(advanceTimers(10)).rejects.toThrow(/requires fake timers .* setupFakeTimers\(\)/);
  });
});
