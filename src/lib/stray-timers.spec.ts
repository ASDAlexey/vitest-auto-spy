import { EventEmitter } from 'node:events';
import * as nodeTimers from 'node:timers';
import { promisify } from 'node:util';
import { Subject, config } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isOwnedPatch } from './owned-patch';
import { mockReadonlyProp, mockValueProp, restoreMockedProps } from './prop-mock';
import {
  type ScheduledCallback,
  type SchedulerHost,
  cancelStrayTimers,
  countStrayTimers,
  describeStrayTimers,
  detectsAsyncLeaks,
  expectUnhandledObservableErrors,
  flushUnhandledObservableErrors,
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

/** Node's own `Timeout.close()`, on a handle {@link createNodeLikeHost} made. */
function closeHandle(handle: unknown): void {
  (handle as { close(): void }).close();
}

/**
 * A stand-in whose handles behave like Node's `Timeout`: they coerce to a number, and they can be
 * cancelled through the object, through that number, or by their own `close()`.
 */
function createNodeLikeHost(): SchedulerHost & { pending: number } {
  let next = 1;
  const live = new Set<{ _destroyed: boolean }>();

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
    // Node cancels by id too, and a library that stores the handle as a number is why.
    const byId = typeof handle !== 'object';

    live.forEach((candidate) => {
      if (candidate === handle || (byId && Number(candidate) === Number(handle))) {
        candidate._destroyed = true;
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
    expect(() => countStrayTimers(createHost())).toThrow(
      /^\[vitest-auto-spy\] countStrayTimers\(\) found no tracking[\s\S]*setupAutoSpy\(\{ strayTimers: true \}\)[\s\S]*#_4-cancelling-timers-that-outlive-their-file$/,
    );
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
    expect(strays[0]?.test).toBe('describeStrayTimers > names each outstanding callback, the spec file that scheduled it, and the line');
    expect(strays.every((stray) => stray.frames.length <= 5)).toBe(true);
  });

  it('records the delay of a timeout and an interval, and none for a frame', () => {
    const host = createManualHost();
    const stop = trackStrayTimers(host);

    host.setTimeout(() => undefined, 250);
    host.setInterval(() => undefined);
    host.setTimeout(() => undefined, -5);
    host.requestAnimationFrame?.(() => undefined);

    const strays = describeStrayTimers(host);

    stop();

    expect(strays.map((stray) => stray.delay)).toEqual([250, 0, 0, undefined]);
    expect(strays[3]).not.toHaveProperty('delay');
  });

  it('reaches the caller behind a deep chain of dependency frames', () => {
    const host = createManualHost();
    const stop = trackStrayTimers(host);
    const emitter = new EventEmitter();

    // What a zone or an rxjs scheduler looks like from here: nothing between the test and the
    // scheduler but frames outside the project. Twelve frames used to run out inside them.
    emitter.on(
      'hop-0',
      host.setTimeout.bind(host, () => undefined, 10),
    );

    for (let hop = 1; hop <= 15; hop += 1) {
      emitter.on(`hop-${hop}`, emitter.emit.bind(emitter, `hop-${hop - 1}`));
    }

    emitter.emit('hop-15');

    const [stray] = describeStrayTimers(host);

    stop();

    expect(stray?.frames[0]).toMatch(/stray-timers\.spec\.ts:\d+:\d+/);
  });

  it('describes the caller where the runtime has no captureStackTrace', () => {
    const host = createManualHost();
    const stop = trackStrayTimers(host);
    const restore = mockValueProp(Error, 'captureStackTrace', undefined);

    try {
      host.setTimeout(() => undefined, 10);
    } finally {
      restore();
    }

    const [stray] = describeStrayTimers(host);

    stop();

    expect(stray?.frames[0]).toMatch(/stray-timers\.spec\.ts:\d+:\d+/);
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
    const restore = mockValueProp(Object(worker), 'filepath', undefined);

    try {
      host.setTimeout(() => undefined, 10);
    } finally {
      restore();
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

    closeHandle(handle);

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
    const restore = mockReadonlyProp(host, 'requestAnimationFrame', () => 1);

    expect(() => trackStrayTimers(host)).toThrow();
    expect(host.setTimeout).toBe(realSetTimeout);
    expect(() => countStrayTimers(host)).toThrow(/nothing called trackStrayTimers\(\) for this host/);
    restore();
  });
});

/** Calls `target` from a frame that reports `file` as its source, the way a dependency's own code would. */
function relayFrom(file: string): (target: (...args: never[]) => unknown, ...args: unknown[]) => unknown {
  return new Function('target', '...args', `return target(...args);\n//# sourceURL=${file}`) as (
    target: (...args: never[]) => unknown,
    ...args: unknown[]
  ) => unknown;
}

function callFrom(file: string, work: () => unknown): unknown {
  return relayFrom(file)(work);
}

const NODE_UNDICI = 'node:internal/deps/undici/undici';
const PACKAGE_UNDICI = '/app/node_modules/undici/lib/dispatcher/client-h1.js';
const ZONE = '/app/node_modules/zone.js/fesm2015/zone.js';

describe('timers left alone', () => {
  const stops: (() => void)[] = [];

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
  });

  it.each([NODE_UNDICI, PACKAGE_UNDICI])('neither counts nor cancels a timer %s scheduled, and forgets it at the sweep', (file) => {
    const host = createHost();

    stops.push(trackStrayTimers(host));
    relayFrom(file)(host.setTimeout, () => undefined, 3000);

    expect(countStrayTimers(host)).toBe(0);
    expect(describeStrayTimers(host)).toEqual([]);
    expect(cancelStrayTimers(host)).toBe(0);
    expect(host.cleared).toEqual([]);
  });

  it('looks past zone.js to the code that asked', () => {
    const host = createHost();

    stops.push(trackStrayTimers(host));
    relayFrom(NODE_UNDICI)(relayFrom(ZONE), host.setTimeout, () => undefined, 499);

    expect(countStrayTimers(host)).toBe(0);
  });

  it('still charges a timer to a spec callback undici happens to call', () => {
    const host = createHost();

    stops.push(trackStrayTimers(host));
    callFrom(PACKAGE_UNDICI, function replyFromSpec() {
      return host.setTimeout(() => undefined, 10);
    });

    expect(countStrayTimers(host)).toBe(1);
    expect(cancelStrayTimers(host)).toBe(1);
  });

  it('leaves alone what an ignore pattern matches in the scheduling stack, a substring or a RegExp', () => {
    const host = createHost();

    stops.push(trackStrayTimers(host, { ignore: ['some-sdk/poll.js', /other-sdk[\\/]heartbeat/g] }));
    callFrom('/app/node_modules/some-sdk/poll.js', () => host.setTimeout(() => undefined, 100));
    callFrom('/app/node_modules/other-sdk/heartbeat.js', () => host.setInterval(() => undefined, 100));
    callFrom('/app/node_modules/other-sdk/heartbeat.js', () => host.requestAnimationFrame?.(() => undefined));
    host.setTimeout(() => undefined, 100);

    expect(countStrayTimers(host)).toBe(1);
    expect(describeStrayTimers(host)).toHaveLength(1);
    expect(cancelStrayTimers(host)).toBe(1);
    expect(host.cleared).toEqual([4, 4]);
    expect(host.clearedFrames).toEqual([]);
  });

  it('takes the ignore list of the latest call', () => {
    const host = createHost();

    stops.push(trackStrayTimers(host, { ignore: ['some-sdk'] }));
    trackStrayTimers(host);
    callFrom('/app/node_modules/some-sdk/poll.js', () => host.setTimeout(() => undefined, 100));

    expect(countStrayTimers(host)).toBe(1);
  });
});

describe('flushUnhandledObservableErrors', () => {
  const stops: (() => void)[] = [];

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    config.onUnhandledError = null;
    vi.useRealTimers();
    restoreMockedProps();
  });

  const failUnhandled = (error: unknown): void => {
    const subject = new Subject<never>();

    subject.subscribe();
    subject.error(error);
  };

  it('runs the pending rethrow of rxjs now and hands back what it threw, with the test that scheduled it', () => {
    stops.push(trackStrayTimers());

    const error = new Error('502 from /api');

    failUnhandled(error);

    expect(countStrayTimers()).toBe(1);
    expect(flushUnhandledObservableErrors()).toEqual([
      {
        error,
        test: 'flushUnhandledObservableErrors > runs the pending rethrow of rxjs now and hands back what it threw, with the test that scheduled it',
      },
    ]);
    expect(countStrayTimers()).toBe(0);
    expect(flushUnhandledObservableErrors()).toEqual([]);
  });

  it('asserts the errors alone with toMatchObject, which checks the count and ignores the test name', () => {
    stops.push(trackStrayTimers());
    failUnhandled(new Error('502 from /api'));
    failUnhandled(new Error('404 from /api'));

    const flushed = flushUnhandledObservableErrors();

    expect(flushed).toMatchObject([{ error: new Error('502 from /api') }, { error: new Error('404 from /api') }]);
    expect(flushed).not.toMatchObject([{ error: new Error('502 from /api') }]);
  });

  it('hands the error to config.onUnhandledError instead, and reports nothing', () => {
    stops.push(trackStrayTimers());

    const handler = vi.fn();

    config.onUnhandledError = handler;
    failUnhandled('plain value');

    expect(flushUnhandledObservableErrors()).toEqual([]);
    expect(handler).toHaveBeenCalledWith('plain value');
    expect(countStrayTimers()).toBe(0);
  });

  it('leaves every other timer alone', () => {
    const host = createHost();

    stops.push(trackStrayTimers(host));
    host.setTimeout(() => undefined);
    callFrom('/app/node_modules/rxjs/dist/cjs/internal/util/reportUnhandledError.js', () => host.setTimeout(() => undefined, 10));
    host.setInterval(() => undefined, 0);
    host.requestAnimationFrame?.(() => undefined);

    expect(flushUnhandledObservableErrors(host)).toEqual([]);
    expect(countStrayTimers(host)).toBe(4);
  });

  it('skips a rethrow already cancelled through its own close()', () => {
    const host = createNodeLikeHost();

    stops.push(trackStrayTimers(host));

    const handle = callFrom('/app/node_modules/rxjs/dist/cjs/internal/util/reportUnhandledError.js', () =>
      host.setTimeout(() => {
        throw new Error('never');
      }),
    );

    closeHandle(handle);

    expect(flushUnhandledObservableErrors(host)).toEqual([]);
  });

  it('reads the fake clock when fake timers are installed', () => {
    vi.useFakeTimers();

    const error = new Error('under a fake clock');

    failUnhandled(error);

    expect(vi.getTimerCount()).toBe(1);
    expect(flushUnhandledObservableErrors()).toEqual([
      { error, test: 'flushUnhandledObservableErrors > reads the fake clock when fake timers are installed' },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves a fake-clock rethrow that config.onUnhandledError took to it', () => {
    vi.useFakeTimers();

    const handler = vi.fn();

    config.onUnhandledError = handler;
    failUnhandled('handled');

    expect(flushUnhandledObservableErrors()).toEqual([]);
    expect(handler).toHaveBeenCalledWith('handled');
  });

  it('reads the plain-object timer table of an older fake clock, and skips what is not a rethrow', () => {
    const cleared: unknown[] = [];
    const host = createHost();
    const rethrow = (value: unknown): void => {
      const onUnhandledError = null;

      if (onUnhandledError) {
        return;
      }

      throw value;
    };

    mockValueProp(host.setTimeout, 'clock', {
      timers: {
        1: { id: 1, func: rethrow, args: ['old clock'] },
        2: { id: 2, func: () => undefined },
        3: { id: 3, func: 'code' },
        4: { id: 4, func: rethrow },
      },
      clearTimeout: (id: unknown) => cleared.push(id),
    });

    expect(flushUnhandledObservableErrors(host)).toEqual([
      { error: 'old clock', test: expect.any(String) },
      { error: undefined, test: expect.any(String) },
    ]);
    expect(cleared).toEqual([1, 4]);
  });

  it.each([
    ['no clock', undefined],
    ['a clock with no timer table', { clearTimeout: () => undefined }],
    ['a clock that cannot clear', { timers: new Map() }],
  ])('finds nothing on a scheduler with %s', (_name, clock) => {
    const host = createHost();

    mockValueProp(host.setTimeout, 'clock', clock);

    expect(flushUnhandledObservableErrors(host)).toEqual([]);
  });
});

describe('expectUnhandledObservableErrors', () => {
  const stops: (() => void)[] = [];

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    config.onUnhandledError = null;
    vi.useRealTimers();
  });

  const failUnhandled = (error: unknown): void => {
    const subject = new Subject<never>();

    subject.subscribe();
    subject.error(error);
  };

  it('passes when nothing was left and nothing was expected', () => {
    expect(expectUnhandledObservableErrors()).toStrictEqual([]);
  });

  it('asserts the errors a test deliberately leaves, by instance, class and message', () => {
    stops.push(trackStrayTimers());
    failUnhandled(new TypeError('id is not a number'));
    failUnhandled(new RangeError('offset out of bounds'));
    failUnhandled(new Error('502 from /api'));

    const flushed = expectUnhandledObservableErrors([new TypeError('id is not a number'), RangeError, { message: /502/ }]);

    expect(flushed).toHaveLength(3);
    expect(countStrayTimers()).toBe(0);
  });

  it('matches a plain message string', () => {
    stops.push(trackStrayTimers());
    failUnhandled(new Error('502 from /api'));

    expect(expectUnhandledObservableErrors([{ message: '502 from /api' }])).toHaveLength(1);
  });

  it('fails when an error was left and none was expected', () => {
    stops.push(trackStrayTimers());
    failUnhandled(new Error('502 from /api'));

    expect(() => expectUnhandledObservableErrors()).toThrow(/do not match what the test expected/);
  });

  it('fails on a message mismatch, listing what was expected and what was found', () => {
    stops.push(trackStrayTimers());
    failUnhandled(new Error('404 from /api'));

    expect(() => expectUnhandledObservableErrors([{ message: '502 from /api' }])).toThrow(
      /expected \[0\] "502 from \/api"[\s\S]*found {4}\[0\] Error: 404 from \/api/,
    );
  });

  it('lists a pattern expectation as the pattern it is', () => {
    stops.push(trackStrayTimers());
    failUnhandled(new Error('404 from /api'));

    expect(() => expectUnhandledObservableErrors([{ message: /502/ }])).toThrow(
      /expected \[0\] \/502\/[\s\S]*found {4}\[0\] Error: 404 from \/api/,
    );
  });

  it('fails when the same count does not match the expected error instance', () => {
    stops.push(trackStrayTimers());
    failUnhandled(new TypeError('id is not a number'));

    expect(() => expectUnhandledObservableErrors([new Error('id is not a number')])).toThrow(
      /found {4}\[0\] TypeError: id is not a number/,
    );
  });

  it('fails on a wrong class', () => {
    stops.push(trackStrayTimers());
    failUnhandled(new TypeError('id is not a number'));

    expect(() => expectUnhandledObservableErrors([RangeError])).toThrow(
      /expected \[0\] RangeError[\s\S]*found {4}\[0\] TypeError: id is not a number/,
    );
  });

  it('matches an error that does not extend Error, by class and by message', () => {
    class HttpFailure {
      readonly message: string;

      constructor(readonly status: number) {
        this.message = `Http failure response: ${status}`;
      }
    }

    stops.push(trackStrayTimers());
    failUnhandled(new HttpFailure(502));
    failUnhandled(new HttpFailure(404));

    expect(expectUnhandledObservableErrors([HttpFailure, { message: /404/ }])).toHaveLength(2);
  });

  it.each([
    ['a string', 'boom'],
    ['an object without a message', { status: 502 }],
    ['an object with a numeric message', { message: 502 }],
  ])('does not match a message against %s', (_name, error) => {
    stops.push(trackStrayTimers());
    failUnhandled(error);

    expect(() => expectUnhandledObservableErrors([{ message: /./ }])).toThrow(/do not match what the test expected/);
  });

  it('fails on a count mismatch', () => {
    stops.push(trackStrayTimers());
    failUnhandled(new Error('boom'));

    expect(() => expectUnhandledObservableErrors([new Error('boom'), new Error('later')])).toThrow(/do not match what the test expected/);
  });
});
