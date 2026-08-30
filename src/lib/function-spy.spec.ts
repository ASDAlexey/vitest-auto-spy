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
    ];

    for (const configure of configured) {
      const each = strictSpy();
      configure(each.spy);

      // `mustBeCalledWith` answers a mismatch with its own error, which is the point: strict mode
      // is about a method nobody configured, never about a call nobody configured.
      await Promise.allSettled([each.spy(1)]);
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
