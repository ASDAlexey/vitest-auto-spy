/**
 * The private-`MockTracker` routing, exercised against a stand-in for `node:test`.
 *
 * `node:test` is a Node built-in Vitest cannot bundle, and the subject is specifically what happens
 * when a tracker is constructed from `mock.constructor` — so the host is injected exactly the way
 * `createNodeMockAdapter()` takes its tracker as a parameter. The stand-in trackers below are the
 * shapes that matter: one that behaves like `MockTracker`, and the several ways a future runtime
 * could fail to.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { NodeMock, NodeTestApi } from './node-adapter';
import {
  type NodeTestHost,
  countNodeMocks,
  createSwappableNodeTracker,
  pruneNodeMocks,
  resetNodeMockTracking,
  trackNodeMocks,
} from './node-mock-tracker';
import type { Func } from './types';

/** A `mock.fn()` stand-in with the `{ arguments }`-shaped call log `node:test` records. */
function makeMock(implementation?: Func): NodeMock {
  const calls: { arguments: unknown[] }[] = [];
  let current = implementation;
  const fn = (...args: unknown[]): unknown => {
    calls.push({ arguments: args });

    return current?.(...args);
  };

  return Object.assign(fn, {
    mock: {
      calls,
      resetCalls: (): void => {
        calls.length = 0;
      },
      mockImplementation: (next: Func): void => {
        current = next;
      },
    },
  });
}

/** A stand-in `MockTracker`: a real class, so instances carry it on `constructor` as Node's do. */
class FakeTracker implements NodeTestApi {
  readonly mocks: NodeMock[] = [];

  fn(implementation?: Func): NodeMock {
    const created = makeMock(implementation);
    this.mocks.push(created);

    return created;
  }
}

/** The host the `/node` entry builds from `node:test`, with hooks recorded rather than registered. */
function makeHost(mock: NodeTestApi = new FakeTracker()): NodeTestHost & { hooks: (() => void)[] } {
  const hooks: (() => void)[] = [];

  return {
    mock,
    hooks,
    afterEach: (hook: () => void): void => {
      hooks.push(hook);
    },
  };
}

beforeEach(() => {
  resetNodeMockTracking();
});

describe('createSwappableNodeTracker', () => {
  it('routes spies at the runtime tracker until tracking is asked for', () => {
    const runtime = new FakeTracker();
    const tracker = createSwappableNodeTracker(makeHost(runtime));

    tracker.fn();
    tracker.fn();

    expect(runtime.mocks).toHaveLength(2);
    expect(countNodeMocks()).toBe(0);
  });

  it('keeps the spies working — implementation and call log — whichever tracker made them', () => {
    const tracker = createSwappableNodeTracker(makeHost());

    trackNodeMocks();
    const spy = tracker.fn((value: number) => value + 1);

    expect(spy(1)).toBe(2);
    expect(spy.mock.calls).toEqual([{ arguments: [1] }]);
  });
});

describe('trackNodeMocks', () => {
  it('moves new spies off the runtime tracker onto a private one', () => {
    const runtime = new FakeTracker();
    const tracker = createSwappableNodeTracker(makeHost(runtime));

    trackNodeMocks();
    tracker.fn();
    tracker.fn();
    tracker.fn();

    expect(runtime.mocks).toHaveLength(0);
    expect(countNodeMocks()).toBe(3);
  });

  it('is idempotent — a second call neither swaps the tracker nor stacks a second sweep', () => {
    const host = makeHost();
    const tracker = createSwappableNodeTracker(host);

    trackNodeMocks();
    tracker.fn();
    trackNodeMocks();

    expect(countNodeMocks()).toBe(1);
    expect(host.hooks).toHaveLength(1);
  });

  it('sweeps on afterEach, dropping what the test created', () => {
    const host = makeHost();
    const tracker = createSwappableNodeTracker(host);

    trackNodeMocks();
    tracker.fn();
    tracker.fn();
    host.hooks.forEach((hook) => hook());

    expect(countNodeMocks()).toBe(0);
  });

  it('leaves the spies a spec created by hand on the runtime tracker untouched', () => {
    const runtime = new FakeTracker();
    const tracker = createSwappableNodeTracker(makeHost(runtime));
    const byHand = runtime.fn(() => 'configured');

    trackNodeMocks();
    tracker.fn();
    pruneNodeMocks();

    expect(byHand()).toBe('configured');
    expect(byHand.mock.calls).toHaveLength(1);
  });

  it('tracks without an afterEach hook, leaving the sweep to be called by hand', () => {
    const runtime = new FakeTracker();
    const tracker = createSwappableNodeTracker({ mock: runtime });

    trackNodeMocks();
    tracker.fn();

    expect(countNodeMocks()).toBe(1);
    expect(pruneNodeMocks()).toBe(1);
  });

  it('is a no-op with a stop that does nothing when no host was ever installed', () => {
    const stop = trackNodeMocks();

    expect(countNodeMocks()).toBe(0);
    expect(() => stop()).not.toThrow();
  });

  it('falls back to the runtime tracker when the constructor is not a function', () => {
    const runtime = new FakeTracker();
    Object.defineProperty(runtime, 'constructor', { value: 'MockTracker', configurable: true });
    const tracker = createSwappableNodeTracker(makeHost(runtime));

    trackNodeMocks();
    tracker.fn();

    expect(runtime.mocks).toHaveLength(1);
    expect(countNodeMocks()).toBe(0);
  });

  it('falls back when constructing the tracker throws', () => {
    const runtime = new FakeTracker();
    Object.defineProperty(runtime, 'constructor', {
      value: class Hostile {
        constructor() {
          throw new Error('private');
        }
      },
      configurable: true,
    });
    const tracker = createSwappableNodeTracker(makeHost(runtime));

    trackNodeMocks();
    tracker.fn();

    expect(runtime.mocks).toHaveLength(1);
  });

  it('falls back when the constructed tracker has no fn()', () => {
    const runtime = new FakeTracker();
    Object.defineProperty(runtime, 'constructor', { value: class Empty {}, configurable: true });
    const tracker = createSwappableNodeTracker(makeHost(runtime));

    trackNodeMocks();
    tracker.fn();

    expect(runtime.mocks).toHaveLength(1);
  });

  it('falls back when fn() does not hand back something callable', () => {
    const runtime = new FakeTracker();
    Object.defineProperty(runtime, 'constructor', {
      value: class NotCallable {
        fn(): unknown {
          return { mock: { calls: [] } };
        }
      },
      configurable: true,
    });
    const tracker = createSwappableNodeTracker(makeHost(runtime));

    trackNodeMocks();
    tracker.fn();

    expect(runtime.mocks).toHaveLength(1);
  });

  it('falls back when the probe mock does not record the call', () => {
    const runtime = new FakeTracker();
    Object.defineProperty(runtime, 'constructor', {
      value: class NotRecording {
        fn(): unknown {
          return Object.assign((): void => undefined, { mock: { calls: [] } });
        }
      },
      configurable: true,
    });
    const tracker = createSwappableNodeTracker(makeHost(runtime));

    trackNodeMocks();
    tracker.fn();

    expect(runtime.mocks).toHaveLength(1);
  });

  it('the stop puts later spies back on the runtime tracker', () => {
    const runtime = new FakeTracker();
    const host = makeHost(runtime);
    const tracker = createSwappableNodeTracker(host);

    const stop = trackNodeMocks();
    tracker.fn();
    stop();
    tracker.fn();

    expect(runtime.mocks).toHaveLength(1);
    expect(countNodeMocks()).toBe(0);

    // The sweep outlives the stop — `node:test` cannot remove a hook — so it has to stay harmless.
    expect(() => host.hooks.forEach((hook) => hook())).not.toThrow();
  });
});

describe('pruneNodeMocks', () => {
  it('answers 0 while tracking is off', () => {
    createSwappableNodeTracker(makeHost());

    expect(pruneNodeMocks()).toBe(0);
  });

  it('reports what it dropped and starts the count again', () => {
    const tracker = createSwappableNodeTracker(makeHost());

    trackNodeMocks();
    tracker.fn();
    tracker.fn();

    expect(pruneNodeMocks()).toBe(2);
    expect(pruneNodeMocks()).toBe(0);
  });

  it('keeps the current tracker when a replacement cannot be built', () => {
    const runtime = new FakeTracker();
    const tracker = createSwappableNodeTracker(makeHost(runtime));

    trackNodeMocks();
    tracker.fn();

    // Poison the route to the class only after tracking started, so the swap — not the start — is
    // the step that fails; a tracker that grows still beats spies falling back to the global one.
    Object.defineProperty(runtime, 'constructor', {
      get: (): never => {
        throw new Error('gone');
      },
      configurable: true,
    });

    expect(pruneNodeMocks()).toBe(0);

    tracker.fn();
    expect(countNodeMocks()).toBe(2);
    expect(runtime.mocks).toHaveLength(0);
  });
});
