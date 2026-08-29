import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockNow, mockSystemTime, useCountingClock, withSystemTime } from './clock';
import { restoreMockedProps } from './prop-mock';

describe('mockSystemTime', () => {
  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }
  });

  it('freezes the clock when no fake timers are running, and undoes only what it installed', () => {
    const restore = mockSystemTime('2025-04-30T00:00:00.000Z');

    expect(new Date().toISOString()).toBe('2025-04-30T00:00:00.000Z');
    expect(vi.isFakeTimers()).toBe(true);

    restore();

    expect(vi.isFakeTimers()).toBe(false);
  });

  it('leaves the suite in charge when fake timers are already installed', () => {
    vi.useFakeTimers();

    const restore = mockSystemTime(new Date('2020-01-01T00:00:00.000Z'));

    expect(new Date().getUTCFullYear()).toBe(2020);

    restore();

    // Uninstalling here would break every later test in a file that installed them itself.
    expect(vi.isFakeTimers()).toBe(true);
  });

  it('is a no-op undo, twice over, when the suite owns the timers', () => {
    vi.useFakeTimers();

    const restore = mockSystemTime(0);

    restore();
    restore();

    expect(vi.isFakeTimers()).toBe(true);
  });

  it('tolerates a body that took the fakes off itself', async () => {
    await withSystemTime(0, () => {
      vi.useRealTimers();
    });

    expect(vi.isFakeTimers()).toBe(false);
  });

  it('leaves alone a set of fakes the suite installed after it', () => {
    const restore = mockSystemTime(0);

    vi.useRealTimers();
    vi.useFakeTimers();

    restore();

    // Not this call's fakes any more: uninstalling them would unfreeze the rest of the file.
    expect(vi.isFakeTimers()).toBe(true);
  });

  it('puts `Date` back when uninstalling the fakes deleted it', () => {
    const restore = mockSystemTime(0);
    const realUseRealTimers = vi.useRealTimers.bind(vi);

    // The happy-dom failure, reproduced by hand because this file does not run under it: there
    // `Date` is inherited from the realm rather than owned by `globalThis`, so `@sinonjs/fake-timers`
    // deletes it on uninstall and the next file dies inside Vitest's own `useFakeTimers`.
    vi.useRealTimers = () => {
      const result = realUseRealTimers();
      Reflect.deleteProperty(globalThis, 'Date');

      return result;
    };

    try {
      restore();
    } finally {
      vi.useRealTimers = realUseRealTimers;
    }

    expect(globalThis.Date).toBeDefined();
    expect(new Date(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('withSystemTime', () => {
  it('restores the clock after the body resolves', async () => {
    const frozen = await withSystemTime('2025-04-30T00:00:00.000Z', () => new Date().toISOString());

    expect(frozen).toBe('2025-04-30T00:00:00.000Z');
    expect(vi.isFakeTimers()).toBe(false);
  });

  it('restores the clock when the body throws', async () => {
    await expect(
      withSystemTime('2025-04-30T00:00:00.000Z', () => {
        throw new Error('FAKE ERROR');
      }),
    ).rejects.toThrow('FAKE ERROR');

    expect(vi.isFakeTimers()).toBe(false);
  });
});

describe('mockNow', () => {
  let reads = 0;

  mockNow(() => {
    reads += 1;

    return 1_000;
  });

  it('answers Date.now from the source', () => {
    expect(Date.now()).toBe(1_000);
    expect(reads).toBeGreaterThan(0);
  });

  it('is re-applied for the next test rather than left on a dead Date', () => {
    expect(Date.now()).toBe(1_000);
  });
});

describe('mockNow under fake timers reinstalled per test', () => {
  // The reason the helper registers hooks instead of patching once: this pair replaces `Date`
  // wholesale before every test, which is what a Jest-style global fake-timer setup does.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreMockedProps();
  });

  mockNow(() => 7);

  it('survives the first reinstall', () => {
    expect(Date.now()).toBe(7);
  });

  it('survives the second reinstall', () => {
    expect(Date.now()).toBe(7);
  });
});

describe('useCountingClock', () => {
  const clock = useCountingClock();

  it('counts from one within a test', () => {
    expect(Date.now()).toBe(1);
    expect(Date.now()).toBe(2);
    expect(clock.value).toBe(3);
  });

  it('starts over for the next test', () => {
    expect(Date.now()).toBe(1);
  });

  it('can be reset mid-test', () => {
    Date.now();
    clock.reset();

    expect(Date.now()).toBe(1);
  });
});

describe('useCountingClock with a step', () => {
  useCountingClock({ start: 100, step: 25 });

  it('walks by the configured step', () => {
    expect([Date.now(), Date.now(), Date.now()]).toEqual([100, 125, 150]);
  });
});
