/**
 * The spy factory hands its dispatch to the adapter *before* the pieces the dispatch needs exist —
 * the `settledResults` recorder can only be installed once the host mock is there, and the host
 * mock is built from the dispatch. Nothing in the three shipped adapters calls the implementation
 * that early, so the ordering is invisible until one does; this spec is the adapter that does.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createFunctionSpy } from './function-spy';
import { type MockAdapter, type MockFn, registerMockAdapter } from './mock-adapter';
import { resetAutoSpy } from './reset-auto-spy';
import type { Func, UnstubbedCall } from './types';
import { vitestMockAdapter } from './vitest-adapter';

/** An adapter that warms the implementation while the mock is being created. */
const warmingAdapter: MockAdapter = {
  ...vitestMockAdapter,
  createMockFn(implementation?: Func, name?: string): MockFn {
    const mock = vitestMockAdapter.createMockFn(implementation, name);

    implementation?.();

    return mock;
  },
};

afterEach(() => {
  registerMockAdapter(vitestMockAdapter);
});

describe('createFunctionSpy', () => {
  it('survives an adapter that calls the implementation while the mock is still being created', () => {
    registerMockAdapter(warmingAdapter);

    const load = createFunctionSpy<() => string>('load');

    load.calledWith().mockReturnValue('configured');

    expect(load()).toBe('configured');
  });
});

describe('createFunctionSpy — strict mode', () => {
  /** The shape the guard is exercised against — a Promise return, so every helper bundle is there. */
  type Load = (n?: number) => Promise<string>;

  /** A strict spy whose guard records rather than throws, so a call can be inspected. */
  function strictSpy(): { calls: UnstubbedCall[]; spy: ReturnType<typeof createFunctionSpy<Load>> } {
    const calls: UnstubbedCall[] = [];

    return {
      calls,
      spy: createFunctionSpy<Load>('load', {
        className: 'Repo',
        handle: (call): unknown => {
          calls.push(call);

          return 'unstubbed';
        },
      }),
    };
  }

  it('fires only while the spy carries no configuration of any kind', async () => {
    const { calls, spy } = strictSpy();

    expect(spy(1)).toBe('unstubbed');
    expect(calls).toEqual([{ className: 'Repo', method: 'load', args: [1] }]);

    // Each of the four things that count as configuration, on its own spy — the guard must stand
    // down for every one of them.
    const configured = [
      (s: typeof spy): void => s.calledWith(1).resolveWith('x'),
      (s: typeof spy): void => s.mustBeCalledWith(1).resolveWith('x'),
      (s: typeof spy): void => s.resolveWith('x'),
      (s: typeof spy): void => s.rejectWith(undefined),
      (s: typeof spy): void => s.resolveWithPerCall([{ value: 'x' }]),
      (s: typeof spy): void => s.failWith(new Error('configured')),
    ];

    for (const configure of configured) {
      const each = strictSpy();
      configure(each.spy);

      // `mustBeCalledWith` answers a mismatch with its own error, which is the point: strict mode
      // is about a method nobody configured, never about a call nobody configured. `failWith`
      // answers with a throw of its own, so the call is made where both outcomes are survivable.
      try {
        await Promise.allSettled([each.spy(1)]);
      } catch {
        // The configured outcome, not a failure of this assertion.
      }

      expect(each.calls).toEqual([]);
    }
  });

  it('fires again once a reset has dropped that configuration', async () => {
    const { calls, spy } = strictSpy();
    spy.calledWith(1).resolveWith('x');

    await expect(spy(1)).resolves.toBe('x');
    expect(calls).toEqual([]);

    resetAutoSpy({ load: spy });

    expect(spy(1)).toBe('unstubbed');
    expect(calls).toHaveLength(1);
  });
});

/**
 * `failWith` — the sync outcome the container could not carry.
 *
 * Two things are being pinned here, and only one of them is "it throws". The other is precedence:
 * a spy owns **one** container for its whole life, so every helper that writes into it has to
 * supersede what the previous one left rather than layer on top of it. Without that, what a call
 * does depends on the order the spec happened to configure it in — the most expensive kind of
 * silent test bug, since both configurations read as correct on their own line.
 */
describe('createFunctionSpy — failWith', () => {
  it('throws the same error on every call', () => {
    const load = createFunctionSpy<() => string>('load');
    const boom = new Error('boom');

    load.failWith(boom);

    expect(() => load()).toThrow(boom);
    expect(() => load()).toThrow(boom);
  });

  it('throws `undefined` when nothing was handed to it, rather than refusing the call', () => {
    const load = createFunctionSpy<() => string>('load');

    load.failWith();

    expect(() => load()).toThrow();
  });

  it('throws for exactly the arguments a chain configured, leaving the rest alone', () => {
    const load = createFunctionSpy<(n: number) => string>('load');

    load.calledWith(1).failWith(new Error('one'));
    load.calledWith(2).mockReturnValue('two');

    expect(() => load(1)).toThrow('one');
    expect(load(2)).toBe('two');
  });

  it('supersedes a promise configuration made before it', () => {
    const load = createFunctionSpy<() => Promise<string>>('load');

    load.resolveWith('value');
    load.failWith(new Error('boom'));

    expect(() => load()).toThrow('boom');
  });

  it('supersedes a per-call batch made before it, instead of draining the queue first', () => {
    const load = createFunctionSpy<() => Promise<string>>('load');

    load.resolveWithPerCall([{ value: 'first' }, { value: 'second' }]);
    load.failWith(new Error('boom'));

    expect(() => load()).toThrow('boom');
  });

  it('is superseded by a promise configuration made after it', async () => {
    const load = createFunctionSpy<() => Promise<string>>('load');

    load.failWith(new Error('boom'));
    load.resolveWith('value');

    await expect(load()).resolves.toBe('value');
  });

  it('is dropped by a reset, like every other configuration', () => {
    const load = createFunctionSpy<() => string>('load');

    load.failWith(new Error('boom'));
    resetAutoSpy({ load });

    expect(load()).toBeUndefined();
  });
});
