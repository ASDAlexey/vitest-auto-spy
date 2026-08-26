import { afterEach, describe, expect, it, vi } from 'vitest';

import { type SchedulerHost, cancelStrayTimers, countStrayTimers, trackStrayTimers } from './stray-timers';

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

  it('passes the arguments through and returns the original handle', () => {
    const host = createHost();
    const callback = (): void => undefined;

    const original = vi.fn(() => 42);

    host.setTimeout = original as unknown as SchedulerHost['setTimeout'];
    track(host);

    // `host.setTimeout` is the wrapper now; the spy is the original it delegates to.
    expect((host.setTimeout as (cb: unknown, ms: number) => number)(callback, 300)).toBe(42);
    expect(original).toHaveBeenCalledWith(callback, 300);
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
