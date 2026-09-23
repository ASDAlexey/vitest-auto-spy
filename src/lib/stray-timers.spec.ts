import * as nodeTimers from 'node:timers';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isOwnedPatch } from './owned-patch';
import {
  type ScheduledCallback,
  type SchedulerHost,
  cancelStrayTimers,
  countStrayTimers,
  describeStrayTimers,
  detectsAsyncLeaks,
  trackStrayTimers,
  withoutStrayTimerTracking,
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

/**
 * A stand-in whose handles behave like Node's `Timeout`: they coerce to a number, and they can be
 * cancelled through the object, through that number, or by their own `close()`.
 */
function createNodeLikeHost(): SchedulerHost & { pending: number } {
  let next = 1;
  const live = new Set<object>();

  const schedule = (): object => {
    const id = next++;
    const handle = {
      _destroyed: false,
      [Symbol.toPrimitive]: (): number => id,
      close(): void {
        handle._destroyed = true;
        live.delete(handle);
      },
    };

    live.add(handle);

    return handle;
  };

  const cancel = (handle: unknown): void => {
    if (typeof handle === 'object' && handle !== null) {
      Reflect.set(handle, '_destroyed', true);
      live.delete(handle);

      return;
    }

    // Node cancels by id too, and a library that stores the handle as a number is why.
    live.forEach((candidate) => {
      if (Number(candidate) === Number(handle)) {
        Reflect.set(candidate, '_destroyed', true);
        live.delete(candidate);
      }
    });
  };

  return {
    setTimeout: schedule,
    setInterval: schedule,
    clearTimeout: cancel,
    clearInterval: cancel,
    get pending(): number {
      return live.size;
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

  it('marks every installed wrapper as owned by the library, so a global restore steps around it', () => {
    const host = createHost();

    track(host);

    const installed = [
      host.setTimeout,
      host.setInterval,
      host.clearTimeout,
      host.clearInterval,
      host.requestAnimationFrame,
      host.cancelAnimationFrame,
    ];

    expect(installed.every(isOwnedPatch)).toBe(true);
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

describe('withoutStrayTimerTracking', () => {
  it('runs the work as it is on a host nothing tracks', () => {
    expect(withoutStrayTimerTracking(() => 'ran', createHost())).toBe('ran');
  });

  it('keeps what the work schedules out of the count and the sweep, and tracks again afterwards', () => {
    const host = createHost();
    const stop = trackStrayTimers(host);

    withoutStrayTimerTracking(() => {
      host.setTimeout(() => undefined, 0);
      host.setInterval(() => undefined, 10);
      host.requestAnimationFrame?.(() => undefined);
    }, host);

    expect(countStrayTimers(host)).toBe(0);
    expect(host.scheduled).toBe(2);

    host.setTimeout(() => undefined, 0);

    expect(countStrayTimers(host)).toBe(1);
    stop();
  });

  it('tracks again even when the work throws', () => {
    const host = createHost();
    const stop = trackStrayTimers(host);

    expect(() =>
      withoutStrayTimerTracking(() => {
        throw new Error('probe failed');
      }, host),
    ).toThrow('probe failed');

    host.setTimeout(() => undefined, 0);

    expect(countStrayTimers(host)).toBe(1);
    stop();
  });
});

describe('describeStrayTimers', () => {
  it('names each outstanding callback, the spec file that scheduled it, and the line', () => {
    const host = createManualHost();
    const stop = trackStrayTimers(host);

    host.setTimeout(() => undefined, 10);
    host.setInterval(() => undefined, 10);
    host.requestAnimationFrame?.(() => undefined);

    const strays = describeStrayTimers(host);

    stop();

    expect(strays.map((stray) => stray.kind)).toEqual(['timeout', 'interval', 'frame']);
    expect(strays[0]?.file).toMatch(/stray-timers\.spec\.ts$/);
    expect(strays[0]?.frames[0]).toMatch(/stray-timers\.spec\.ts:\d+:\d+/);
    expect(strays.every((stray) => stray.frames.length <= 5)).toBe(true);
  });

  it('drops what fired or was cleared, and knows nothing about a host nobody tracks', () => {
    const host = createManualHost();
    const stop = trackStrayTimers(host);
    const fired = host.setTimeout(() => undefined, 10);
    const cleared = host.setTimeout(() => undefined, 10);

    host.fire(fired);
    host.clearTimeout(cleared);

    expect(describeStrayTimers(host)).toEqual([]);
    stop();
    expect(describeStrayTimers(createHost())).toEqual([]);
  });

  it('leaves the file out when the runner reports none', () => {
    const host = createHost();
    const stop = trackStrayTimers(host);
    const worker: unknown = Reflect.get(globalThis, '__vitest_worker__');
    const ownFile: unknown = Reflect.get(Object(worker), 'filepath');

    Reflect.set(Object(worker), 'filepath', undefined);

    try {
      host.setTimeout(() => undefined, 10);
    } finally {
      Reflect.set(Object(worker), 'filepath', ownFile);
    }

    expect(describeStrayTimers(host)[0]?.file).toBeUndefined();
    stop();
  });
});

describe("a handle cancelled behind the wrappers' back", () => {
  it('forgets a timeout cleared by the number its handle coerces to', () => {
    const host = createNodeLikeHost();
    const stop = trackStrayTimers(host);
    const handle = host.setTimeout(() => undefined, 10_000);

    // What a library that stores ids as numbers does — `clearTimeout(+handle)`. The `Map` is keyed
    // by the object, so this used to miss and the timer was reported as a stray of healthy code.
    host.clearTimeout(Number(handle));

    expect(countStrayTimers(host)).toBe(0);
    expect(describeStrayTimers(host)).toEqual([]);
    stop();
  });

  it('forgets an interval cleared the same way', () => {
    const host = createNodeLikeHost();
    const stop = trackStrayTimers(host);
    const handle = host.setInterval(() => undefined, 10_000);

    host.clearInterval(Number(handle));

    expect(countStrayTimers(host)).toBe(0);
    stop();
  });

  it('shrugs off a clear for a handle it never handed out, in either form', () => {
    const host = createNodeLikeHost();
    const stop = trackStrayTimers(host);

    host.setTimeout(() => undefined, 10_000);
    host.clearTimeout(9_999);
    host.clearTimeout({ handleOf: 'somebody else' });

    expect(countStrayTimers(host)).toBe(1);
    stop();
  });

  it('does not count a timeout the code under test closed itself', () => {
    const host = createNodeLikeHost();
    const stop = trackStrayTimers(host);
    const handle = host.setTimeout(() => undefined, 10_000);

    Reflect.get(Object(handle), 'close')?.call(handle);

    expect(countStrayTimers(host)).toBe(0);
    expect(cancelStrayTimers(host)).toBe(0);
    stop();
  });

  it('still counts and cancels one that is genuinely outstanding', () => {
    const host = createNodeLikeHost();
    const stop = trackStrayTimers(host);

    host.setTimeout(() => undefined, 10_000);

    expect(countStrayTimers(host)).toBe(1);
    expect(cancelStrayTimers(host)).toBe(1);
    expect(host.pending).toBe(0);
    stop();
  });

  it('keeps the promise-returning twin Node attaches to setTimeout', async () => {
    // Node's own schedulers, not the environment's: only they carry the custom `promisify`
    // implementation this is about, and jsdom's do not.
    const host: SchedulerHost = {
      setTimeout: nodeTimers.setTimeout,
      setInterval: nodeTimers.setInterval,
      clearTimeout: nodeTimers.clearTimeout,
      clearInterval: nodeTimers.clearInterval,
    };
    const stop = trackStrayTimers(host);

    try {
      // `const sleep = promisify(setTimeout)` is evaluated at import, before any test; losing the
      // custom implementation made `promisify` build the callback-last form, and the first call
      // threw ERR_INVALID_ARG_TYPE in every Node and NestJS suite.
      // Typed off the host interface, which carries neither Node's overloads nor its `__promisify__`.
      const sleep: (ms: number, value: string) => Promise<unknown> = promisify(host.setTimeout);

      await expect(sleep(1, 'value')).resolves.toBe('value');
    } finally {
      stop();
    }
  });
});

describe('an installation that cannot be completed', () => {
  it('puts every wrapper back rather than leaving half of them on', () => {
    const host = createHost({ frames: false });
    const realSetTimeout = host.setTimeout;

    // A host whose `requestAnimationFrame` is an accessor with no setter — a frozen stand-in, or a
    // DOM shim. The frame wrap assigns, so it throws, and the four timer wrappers were left
    // installed with no undo and no registry entry: `countStrayTimers()` then threw for the rest of
    // the run, and a second call wrapped everything twice.
    Object.defineProperty(host, 'requestAnimationFrame', { configurable: true, get: () => () => 1 });

    expect(() => trackStrayTimers(host)).toThrow();
    expect(host.setTimeout).toBe(realSetTimeout);
    expect(() => countStrayTimers(host)).toThrow(/needs trackStrayTimers\(\) to have run first/);
  });
});
