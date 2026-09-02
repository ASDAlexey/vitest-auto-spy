import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type ScheduledCallback,
  type SchedulerHost,
  cancelStrayTimers,
  countStrayTimers,
  detectsAsyncLeaks,
  trackStrayTimers,
} from './stray-timers';

/**
 * A stand-in scheduler: handles are plain numbers, and every call is recorded, so a test can assert
 * exactly which clears the module issued without touching the real globals.
 */
function createHost(options: { frames?: boolean } = {}): SchedulerHost & {
  cleared: unknown[];
  clearedFrames: number[];
  scheduled: number;
} {
  let next = 1;
  const cleared: unknown[] = [];
  const clearedFrames: number[] = [];

  const host = {
    cleared,
    clearedFrames,
    scheduled: 0,
    setTimeout: () => {
      host.scheduled += 1;

      return next++;
    },
    setInterval: () => {
      host.scheduled += 1;

      return next++;
    },
    clearTimeout: (handle: never) => {
      cleared.push(handle);
    },
    clearInterval: (handle: never) => {
      cleared.push(handle);
    },
  } as unknown as SchedulerHost & { cleared: unknown[]; clearedFrames: number[]; scheduled: number };

  if (options.frames ?? true) {
    host.requestAnimationFrame = (): number => next++;
    host.cancelAnimationFrame = (handle: number): void => {
      clearedFrames.push(handle);
    };
  }

  return host;
}

/**
 * A stand-in whose callbacks are fired by hand, so a test can watch a handle leave the set at the
 * moment the timer runs instead of waiting for a real clock.
 */
function createManualHost(): SchedulerHost & { fire(handle: unknown, ...args: unknown[]): void; pending: number } {
  let next = 1;
  const pending = new Map<unknown, ScheduledCallback>();

  const schedule = (callback: ScheduledCallback): number => {
    const handle = next++;
    pending.set(handle, callback);

    return handle;
  };

  const cancel = (handle: unknown): void => {
    pending.delete(handle);
  };

  return {
    setTimeout: schedule,
    setInterval: schedule,
    clearTimeout: cancel,
    clearInterval: cancel,
    requestAnimationFrame: schedule,
    cancelAnimationFrame: cancel,
    get pending(): number {
      return pending.size;
    },
    fire(handle: unknown, ...args: unknown[]): void {
      pending.get(handle)?.(...args);
    },
  };
}

describe('stray timers', () => {
  const stops: (() => void)[] = [];

  const track = (host: SchedulerHost): (() => void) => {
    const stop = trackStrayTimers(host);
    stops.push(stop);

    return stop;
  };

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
  });

  it('records the handles the wrapped schedulers hand out', () => {
    const host = createHost();

    track(host);

    const timeout = (host.setTimeout as () => number)();
    const interval = (host.setInterval as () => number)();
    const frame = host.requestAnimationFrame?.(undefined as never);

    expect(countStrayTimers(host)).toBe(3);
    expect([timeout, interval, frame]).toEqual([1, 2, 3]);
  });

  it('passes the delay through, and the callback its own arguments', () => {
    const host = createHost();
    const callback = vi.fn();

    const original = vi.fn((scheduled: ScheduledCallback, ms: number) => {
      void scheduled;
      void ms;

      return 42;
    });

    host.setTimeout = original as unknown as SchedulerHost['setTimeout'];
    track(host);

    // `host.setTimeout` is the wrapper now; the spy is the original it delegates to. The callback
    // reaches it wrapped — that is how a fired timeout forgets its own handle — so what the test
    // pins down is that everything else arrives unchanged and that the wrapper stays transparent.
    expect(host.setTimeout(callback, 300)).toBe(42);

    const [scheduled, ms] = original.mock.calls[0] ?? [];

    expect(ms).toBe(300);

    scheduled?.('a', 2);

    expect(callback).toHaveBeenCalledWith('a', 2);
  });

  it('cancels every outstanding handle with both clears, and reports how many', () => {
    const host = createHost();

    track(host);
    (host.setTimeout as () => number)();
    (host.setInterval as () => number)();
    host.requestAnimationFrame?.(undefined as never);

    expect(cancelStrayTimers(host)).toBe(3);
    // one timeout + one interval, each cleared twice because the kind is not recorded
    expect(host.cleared).toEqual([1, 1, 2, 2]);
    expect(host.clearedFrames).toEqual([3]);
    expect(countStrayTimers(host)).toBe(0);
  });

  it('is idempotent — a second call does not install a second wrapper', () => {
    const host = createHost();
    const stop = track(host);
    const wrapped = host.setTimeout;

    expect(trackStrayTimers(host)).toBe(stop);
    expect(host.setTimeout).toBe(wrapped);
  });

  it('restores the original schedulers and cancels what is left', () => {
    const host = createHost();
    const originalTimeout = host.setTimeout;
    const originalInterval = host.setInterval;
    const originalFrame = host.requestAnimationFrame;

    const stop = track(host);
    (host.setTimeout as () => number)();

    stop();

    expect(host.setTimeout).toBe(originalTimeout);
    expect(host.setInterval).toBe(originalInterval);
    expect(host.requestAnimationFrame).toBe(originalFrame);
    expect(host.cleared).toEqual([1, 1]);
  });

  it('works on a host with no animation frames at all', () => {
    const host = createHost({ frames: false });

    track(host);
    (host.setTimeout as () => number)();

    expect(host.requestAnimationFrame).toBeUndefined();
    expect(cancelStrayTimers(host)).toBe(1);
  });

  it('skips frame cancellation when the host schedules frames but cannot cancel them', () => {
    const host = createHost();

    delete (host as Partial<SchedulerHost>).cancelAnimationFrame;
    track(host);
    host.requestAnimationFrame?.(undefined as never);

    expect(cancelStrayTimers(host)).toBe(1);
    expect(host.clearedFrames).toEqual([]);
  });

  it('cancelling an untracked host is a no-op rather than an error', () => {
    expect(cancelStrayTimers(createHost())).toBe(0);
  });

  it('counting an untracked host says what is missing', () => {
    expect(() => countStrayTimers(createHost())).toThrow(/needs trackStrayTimers\(\) to have run first/);
  });

  it('forgets a timeout once it has fired', () => {
    const host = createManualHost();
    const ran = vi.fn();

    track(host);

    const handle = host.setTimeout(ran);

    expect(countStrayTimers(host)).toBe(1);

    host.fire(handle, 'payload');

    expect(ran).toHaveBeenCalledWith('payload');
    expect(countStrayTimers(host)).toBe(0);
  });

  it('keeps an interval after it fires, because it will fire again', () => {
    const host = createManualHost();

    track(host);
    host.fire(host.setInterval(() => undefined));

    expect(countStrayTimers(host)).toBe(1);
  });

  it('forgets a frame once it has run', () => {
    const host = createManualHost();

    track(host);
    host.fire(host.requestAnimationFrame?.(() => undefined));

    expect(countStrayTimers(host)).toBe(0);
  });

  it('forgets a handle the code under test cancelled itself', () => {
    const host = createManualHost();

    track(host);

    host.clearTimeout(host.setTimeout(() => undefined));
    host.clearInterval(host.setInterval(() => undefined));
    host.cancelAnimationFrame?.(host.requestAnimationFrame?.(() => undefined) ?? 0);

    // Cancelling has to reach the real schedulers as well, or the callbacks still run.
    expect(host.pending).toBe(0);
    expect(countStrayTimers(host)).toBe(0);
  });

  it('restores the cancellers along with the schedulers', () => {
    const host = createManualHost();
    const originals = [host.clearTimeout, host.clearInterval, host.cancelAnimationFrame];

    const stop = track(host);

    stop();

    expect([host.clearTimeout, host.clearInterval, host.cancelAnimationFrame]).toEqual(originals);
  });

  it('leaves a non-function handler untouched — the legacy string form of setTimeout', () => {
    const host = createHost();
    const original = vi.fn(() => 42);

    host.setTimeout = original as unknown as SchedulerHost['setTimeout'];
    track(host);

    host.setTimeout('doThing()' as unknown as ScheduledCallback, 300);

    expect(original).toHaveBeenCalledWith('doThing()', 300);
  });

  it('does not count the legacy string form as pending, but still cancels it', () => {
    const host = createHost();

    track(host);

    const handle = host.setTimeout('doThing()' as unknown as ScheduledCallback, 300);

    // Nothing reports when a string handler ran, so counting it would leave the suite's own
    // `expect(countStrayTimers()).toBe(0)` failing for the rest of the file.
    expect(countStrayTimers(host)).toBe(0);
    expect(cancelStrayTimers(host)).toBe(0);
    // Cleared all the same, and once — it can only ever have been a timeout.
    expect(host.cleared).toEqual([handle]);
  });

  it('defaults to the real globals', () => {
    const stop = trackStrayTimers();

    try {
      const handle = setTimeout(() => undefined, 10_000);

      expect(countStrayTimers()).toBeGreaterThan(0);
      expect(handle).toBeDefined();
    } finally {
      stop();
    }

    expect(() => countStrayTimers()).toThrow();
  });
});

/**
 * `detectsAsyncLeaks` decides whether the sweep is allowed to stay quiet, so what matters is that
 * every shape it cannot read answers "no" rather than throwing: it is consulted from an `afterAll`
 * that has already done its real work, and a throw there would fail a file over a warning.
 */
describe('detectsAsyncLeaks', () => {
  it('reads the flag the runner resolved', () => {
    expect(detectsAsyncLeaks({ __vitest_worker__: { config: { detectAsyncLeaks: true } } })).toBe(true);
  });

  it('is false when the run left the flag off', () => {
    expect(detectsAsyncLeaks({ __vitest_worker__: { config: { detectAsyncLeaks: false } } })).toBe(false);
  });

  it('is false when the config says nothing about it — an older Vitest has no such option', () => {
    expect(detectsAsyncLeaks({ __vitest_worker__: { config: {} } })).toBe(false);
  });

  it('is false outside a Vitest worker, rather than throwing on the way there', () => {
    expect(detectsAsyncLeaks({})).toBe(false);
  });
});
