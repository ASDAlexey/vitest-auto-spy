/**
 * The fast spy is only worth having if it is indistinguishable from the runner's mock, so most of
 * these assert the two side by side rather than against a hand-written expectation: a `vi.fn()` and
 * a `createFastSpy()` are put through the same steps and their `mock` state is compared. That is
 * the only form of this test that keeps meaning when Vitest changes what a mock records.
 *
 * The exception is the sweep. `vi.clearAllMocks()` walks a registry a fast spy is deliberately not
 * in, and the counters that replace the walk are what those specs pin — including the one that
 * caught a real bug: a `mockReturnValue` applied *after* a reset sweep and read before the next call
 * was undone by the sweep the spy had not answered yet.
 */
import { type MockInstance, describe, expect, it, vi } from 'vitest';

import { type FastSpy, clearAllFastSpies, createFastSpy, isFastSpy, resetAllFastSpies } from './fast-spy';

/**
 * The one place the two types diverge: `toHaveBeenCalledBefore` takes the runner's `MockInstance` as
 * an *argument*, and a fast spy declares its own surface rather than importing the runner's. At
 * runtime the matcher reads `mock.invocationCallOrder` and nothing else, which is what this pins.
 */
function asRunnerMock(spy: FastSpy): MockInstance {
  return spy as unknown as MockInstance;
}

describe('createFastSpy', () => {
  it('answers to the runner as one of its own mocks', () => {
    const spy = createFastSpy();

    expect(vi.isMockFunction(spy)).toBe(true);
    expect(typeof spy).toBe('function');
    expect(isFastSpy(spy)).toBe(true);
    expect(isFastSpy(vi.fn())).toBe(false);
    expect(isFastSpy('not a spy')).toBe(false);
  });

  it('records a call exactly as the runner does', () => {
    const ours = createFastSpy((value: unknown) => value, 'load');
    const theirs = vi.fn((value: unknown) => value);
    const context = { id: 1 };

    ours.call(context, 'a');
    theirs.call(context, 'a');

    expect(ours.mock.calls).toEqual(theirs.mock.calls);
    expect(ours.mock.results).toEqual(theirs.mock.results);
    expect(ours.mock.settledResults).toEqual(theirs.mock.settledResults);
    expect(ours.mock.contexts).toEqual(theirs.mock.contexts);
    expect(ours.mock.instances).toEqual(theirs.mock.instances);
    expect(ours.mock.lastCall).toEqual(theirs.mock.lastCall);
    expect(ours.mock.invocationCallOrder).toHaveLength(1);
  });

  it('satisfies the call matchers', () => {
    const spy = createFastSpy(undefined, 'load');

    spy(1);
    spy(2);

    expect(spy).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(1);
    expect(spy).toHaveBeenLastCalledWith(2);
    expect(spy).toHaveBeenNthCalledWith(1, 1);
  });

  it('orders one spy against another for the call-order matchers', () => {
    const first = createFastSpy();
    const second = createFastSpy();

    first();
    second();

    expect(first).toHaveBeenCalledBefore(asRunnerMock(second));
    expect(second).toHaveBeenCalledAfter(asRunnerMock(first));
  });

  it('records a thrown error as the runner does, and rethrows it', () => {
    const failure = new Error('nope');
    const ours = createFastSpy(() => {
      throw failure;
    });
    const theirs = vi.fn(() => {
      throw failure;
    });

    expect(() => ours()).toThrow(failure);
    expect(() => theirs()).toThrow(failure);

    expect(ours.mock.results).toEqual(theirs.mock.results);
    expect(ours.mock.settledResults).toEqual(theirs.mock.settledResults);
  });

  it('settles a returned promise into `settledResults`', async () => {
    const resolving = createFastSpy(() => Promise.resolve('value'));
    const rejecting = createFastSpy(() => Promise.reject(new Error('no')));

    await resolving();
    await expect(rejecting()).rejects.toThrow('no');

    expect(resolving).toHaveResolved();
    expect(resolving.mock.settledResults[0]).toEqual({ type: 'fulfilled', value: 'value' });
    expect(rejecting.mock.settledResults[0]?.type).toBe('rejected');
  });

  it('prints in a snapshot exactly as the runner s mock does', () => {
    const ours = createFastSpy(undefined, 'load');
    const theirs = vi.fn();

    theirs.mockName('load');
    ours(1);
    theirs(1);

    // The serialiser keys on `_isMockFunction` and reads `getMockName()`, `mock.calls` and
    // `mock.results`, so a spy that gets any of those wrong shows up here rather than in a
    // consumer's committed snapshot. Inline and side by side, because the assertion is that the two
    // blocks below are the same text.
    expect(ours).toMatchInlineSnapshot(`
      [MockFunction load] {
        "calls": [
          [
            1,
          ],
        ],
        "results": [
          {
            "type": "return",
            "value": undefined,
          },
        ],
      }
    `);
    expect(theirs).toMatchInlineSnapshot(`
      [MockFunction load] {
        "calls": [
          [
            1,
          ],
        ],
        "results": [
          {
            "type": "return",
            "value": undefined,
          },
        ],
      }
    `);
  });

  it('is named for diagnostics, and defaults to the runner s own default name', () => {
    expect(createFastSpy(undefined, 'load').getMockName()).toBe('load');
    expect(createFastSpy().getMockName()).toBe('vi.fn()');
    expect(createFastSpy().mockName('renamed').getMockName()).toBe('renamed');
    // A non-string is ignored, as the runner ignores it.
    expect(createFastSpy(undefined, 'kept').mockName(1 as unknown as string).getMockName()).toBe('kept');
  });

  it('reports the implementation the next call will use', () => {
    const base = (): string => 'base';
    const once = (): string => 'once';
    const spy = createFastSpy(base);

    expect(spy.getMockImplementation()).toBe(base);

    spy.mockImplementationOnce(once);

    expect(spy.getMockImplementation()).toBe(once);
  });
});

describe('the configured-value helpers', () => {
  it('returns, throws, resolves and rejects on demand', async () => {
    const spy = createFastSpy();

    expect(spy.mockReturnValue(1)()).toBe(1);
    expect(spy.mockReturnValueOnce(2)()).toBe(2);
    expect(spy()).toBe(1);

    await expect(spy.mockResolvedValue('r')()).resolves.toBe('r');
    await expect(spy.mockResolvedValueOnce('o')()).resolves.toBe('o');
    await expect(spy.mockRejectedValue(new Error('x'))()).rejects.toThrow('x');
    await expect(spy.mockRejectedValueOnce(new Error('y'))()).rejects.toThrow('y');

    expect(() => spy.mockThrow(new Error('t'))()).toThrow('t');
    expect(() => spy.mockThrowOnce(new Error('to'))()).toThrow('to');

    const target = { spy: spy.mockReturnThis() };

    expect(target.spy()).toBe(target);
  });

  it('calls through to an implementation, once or from then on', () => {
    const spy = createFastSpy();

    spy.mockImplementation((value: number) => value + 1);
    spy.mockImplementationOnce((value: number) => value * 10);

    expect(spy(2)).toBe(20);
    expect(spy(2)).toBe(3);
  });

  it('refuses the value shorthands when the spy is called with `new`, as the runner does', () => {
    const returning = createFastSpy().mockReturnValue(1);
    const resolving = createFastSpy().mockResolvedValue(1);
    const rejecting = createFastSpy().mockRejectedValue(1);

    expect(() => new (returning as unknown as new () => unknown)()).toThrow(/Cannot use `mockReturnValue`/);
    expect(() => new (resolving as unknown as new () => unknown)()).toThrow(/Cannot use `mockResolvedValue`/);
    expect(() => new (rejecting as unknown as new () => unknown)()).toThrow(/Cannot use `mockRejectedValue`/);

    const returningOnce = createFastSpy().mockReturnValueOnce(1);
    const resolvingOnce = createFastSpy().mockResolvedValueOnce(1);
    const rejectingOnce = createFastSpy().mockRejectedValueOnce(1);

    expect(() => new (returningOnce as unknown as new () => unknown)()).toThrow(/Cannot use `mockReturnValueOnce`/);
    expect(() => new (resolvingOnce as unknown as new () => unknown)()).toThrow(/Cannot use `mockResolvedValueOnce`/);
    expect(() => new (rejectingOnce as unknown as new () => unknown)()).toThrow(/Cannot use `mockRejectedValueOnce`/);
  });

  it('constructs an instance of the spy when called with `new`, configured or not', () => {
    const bare = createFastSpy();
    const instance = new (bare as unknown as new () => object)();

    expect(instance).toBeInstanceOf(bare as unknown as new () => object);
    expect(bare.mock.instances[0]).toBe(instance);
    expect(bare.mock.contexts[0]).toBe(instance);

    class Built {
      readonly built = true;
    }

    const constructing = createFastSpy(Built as unknown as (...args: unknown[]) => unknown);

    expect(new (constructing as unknown as new () => Built)().built).toBe(true);
  });

  it('swaps the implementation for the length of a callback, synchronous or not', async () => {
    const spy = createFastSpy(() => 'base');

    spy.withImplementation(() => 'swapped', () => {
      expect(spy()).toBe('swapped');
    });

    expect(spy()).toBe('base');

    await spy.withImplementation(
      () => 'async',
      async () => {
        expect(spy()).toBe('async');
      },
    );

    expect(spy()).toBe('base');
  });
});

describe('clearing and resetting one spy', () => {
  it('drops the recorded calls but keeps the configuration on `mockClear`', () => {
    const spy = createFastSpy().mockReturnValue(7);

    spy();
    spy.mockClear();

    expect(spy.mock.calls).toEqual([]);
    expect(spy()).toBe(7);
  });

  it('puts the creation-time implementation back on `mockReset`', () => {
    const original = (): string => 'original';
    const spy = createFastSpy(original);

    spy.mockReturnValue('configured');
    spy.mockReset();

    expect(spy()).toBe('original');

    const bare = createFastSpy();

    bare.mockReturnValue('configured');
    bare.mockRestore();

    expect(bare()).toBeUndefined();
  });

  it('keeps the name a reset would otherwise wipe', () => {
    const spy = createFastSpy(undefined, 'load');

    spy.mockReset();

    // Deliberate, and the same rule `vi.spyOn` follows for a *named* mock: the name a spy was
    // created with is diagnostics, not configuration, and every matcher message in the suite prints
    // it. A bare `vi.fn()` has no creation-time name to keep, which is why it falls back to
    // `vi.fn()` there.
    expect(spy.getMockName()).toBe('load');
  });

  it('resets through `Symbol.dispose`, so `using` works on a spy', () => {
    const spy = createFastSpy();

    spy.mockReturnValue('configured');
    (spy as unknown as Record<symbol, () => void>)[Symbol.dispose]?.();

    expect(spy()).toBeUndefined();
  });
});

describe('the run-wide sweeps', () => {
  it('clears every spy at once, including one a spec is holding the state of', () => {
    const spy = createFastSpy();
    const state = spy.mock;

    spy(1);
    clearAllFastSpies();

    expect(state.calls).toEqual([]);
    expect(spy.mock.calls).toEqual([]);
  });

  it('leaves the configuration alone when it only clears', () => {
    const spy = createFastSpy().mockReturnValue(3);

    spy();
    clearAllFastSpies();

    expect(spy()).toBe(3);
    expect(spy.mock.calls).toHaveLength(1);
  });

  it('reinstates the creation-time implementation when it resets', () => {
    const spy = createFastSpy(() => 'original');

    spy.mockReturnValue('configured');
    resetAllFastSpies();

    expect(spy()).toBe('original');
  });

  it('does not undo a configuration applied after the sweep', () => {
    const spy = createFastSpy(() => 'original');

    resetAllFastSpies();
    spy.mockReturnValue('configured');

    expect(spy()).toBe('configured');
    expect(spy.getMockImplementation()).not.toBe(undefined);
  });

  it('lets the state fields be assigned over, as the runner lets its own be', () => {
    const spy = createFastSpy();

    spy();

    const state = spy.mock;

    state.calls = [];
    state.contexts = [];
    state.instances = [];
    state.invocationCallOrder = [];
    state.results = [];
    state.settledResults = [];

    expect(state.calls).toEqual([]);
    expect(state.contexts).toEqual([]);
    expect(state.instances).toEqual([]);
    expect(state.invocationCallOrder).toEqual([]);
    expect(state.results).toEqual([]);
    expect(state.settledResults).toEqual([]);
  });

  it('costs an untouched spy nothing — it owns no call state until something asks', () => {
    const spy = createFastSpy();

    clearAllFastSpies();
    resetAllFastSpies();

    expect(spy.mock.calls).toEqual([]);
  });
});
