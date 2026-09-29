/**
 * The Bun adapter factory, exercised with a stub that mirrors `bun:test`'s
 * Jest-compatible `mock()` (bare-array `mock.calls`, `mockReset`, optional
 * `mockName`) and held to the shared contract. `bun:test` itself only resolves under the Bun runtime, so the
 * factory shape is what we can verify here.
 */
import { describe, expect, it } from 'vitest';

import { type BunMock, type BunTestApi, createBunMockAdapter } from './bun-adapter';
import { describeMockAdapterContract } from './mock-adapter-contract';
import type { Func } from './types';

/** Build a `bun:test`-like `mock()`; `withName` toggles the optional `mockName`. */
function makeBunTestApi(withName = true): { api: BunTestApi; names: string[] } {
  const names: string[] = [];
  const api: BunTestApi = {
    mock: (implementation?: Func): BunMock => {
      const calls: unknown[][] = [];
      let currentImplementation = implementation;
      const fn = function (this: unknown, ...args: unknown[]): unknown {
        calls.push(args);

        return currentImplementation?.apply(this, args);
      } as BunMock;
      fn.mock = { calls };
      fn.mockReset = (): void => {
        calls.length = 0;
        currentImplementation = undefined;
      };
      fn.mockClear = (): void => {
        calls.length = 0;
      };
      fn.mockImplementation = (next: Func): void => {
        currentImplementation = next;
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

describeMockAdapterContract({ describe, it }, { name: 'Bun (stub)', adapter: () => createBunMockAdapter(makeBunTestApi().api) });

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
});
