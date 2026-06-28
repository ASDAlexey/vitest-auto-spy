/**
 * The Bun adapter factory, exercised with a stub that mirrors `bun:test`'s
 * Jest-compatible `mock()` (bare-array `mock.calls`, `mockReset`, optional
 * `mockName`). `bun:test` itself only resolves under the Bun runtime, so the
 * factory shape is what we can verify here.
 */
import { describe, expect, it } from 'vitest';

import { type BunMock, type BunTestApi, createBunMockAdapter } from './bun-adapter';
import type { Func } from './types';

/** Build a `bun:test`-like `mock()`; `withName` toggles the optional `mockName`. */
function makeBunTestApi(withName = true): { api: BunTestApi; names: string[] } {
  const names: string[] = [];
  const api: BunTestApi = {
    mock: (implementation?: Func): BunMock => {
      const calls: unknown[][] = [];
      const fn = ((...args: unknown[]): unknown => {
        calls.push(args);

        return implementation?.(...args);
      }) as BunMock;
      fn.mock = { calls };
      fn.mockReset = (): void => {
        calls.length = 0;
      };

      if (withName) {
        fn.mockName = (name: string): void => {
          names.push(name);
        };
      }

      return fn;
    },
  };

  return { api, names };
}

describe('createBunMockAdapter', () => {
  it('createMockFn wraps an implementation and names the mock when supported', () => {
    const { api, names } = makeBunTestApi();
    const adapter = createBunMockAdapter(api);

    const inc = adapter.createMockFn((value: number) => value + 1, 'inc');

    expect(inc(1)).toBe(2);
    expect(names).toEqual(['inc']);
  });

  it('createMockFn skips naming when no name is given', () => {
    const { api, names } = makeBunTestApi();
    const adapter = createBunMockAdapter(api);

    adapter.createMockFn(() => undefined);

    expect(names).toEqual([]);
  });

  it('createMockFn tolerates a mock without mockName', () => {
    const { api } = makeBunTestApi(false);
    const adapter = createBunMockAdapter(api);

    const fn = adapter.createMockFn(() => undefined, 'ignored');

    expect(fn()).toBeUndefined();
  });

  it('createMockFn defaults to a no-op when no implementation is given', () => {
    const adapter = createBunMockAdapter(makeBunTestApi().api);

    expect(adapter.createMockFn()()).toBeUndefined();
  });

  it('getCalls returns the bare argument tuples and reset clears them', () => {
    const adapter = createBunMockAdapter(makeBunTestApi().api);
    const fn = adapter.createMockFn();

    fn(1, 'a');
    fn(2);
    expect(adapter.getCalls(fn)).toEqual([[1, 'a'], [2]]);

    adapter.reset(fn);
    expect(adapter.getCalls(fn)).toEqual([]);
  });

  it('spyOnGetter / spyOnSetter record accessor access', () => {
    const adapter = createBunMockAdapter(makeBunTestApi().api);
    const target: Record<string, unknown> = {};
    Object.defineProperty(target, 'value', {
      get: (): undefined => undefined,
      set: (_value: unknown): void => undefined,
      configurable: true,
    });

    const getter = adapter.spyOnGetter(target, 'value');
    const setter = adapter.spyOnSetter(target, 'value');

    void target['value'];
    target['value'] = 7;

    expect(adapter.getCalls(getter)).toEqual([[]]);
    expect(adapter.getCalls(setter)).toEqual([[7]]);
  });
});
