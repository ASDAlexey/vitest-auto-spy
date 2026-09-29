/**
 * The Rstest adapter factory, exercised with a stub that mirrors Rstest's
 * Vitest-shaped mock surface (bare-array `mock.calls`, `mockClear` /
 * `mockReset` / `mockImplementation`). `@rstest/core` only runs under the Rstest
 * runner, so the factory shape is what we can verify here.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { describeMockAdapterContract } from './mock-adapter-contract';
import { type RstestApi, type RstestMock, createRstestMockAdapter } from './rstest-adapter';
import { setSpyEngine } from './spy-engine';
import type { Func } from './types';

afterEach(() => {
  setSpyEngine('auto-spy');
});

/** Build a Rstest-like utilities object, recording every mock it creates. */
function makeRstestApi(): { api: RstestApi; created: RstestMock[]; names: string[]; sweepSentinel: RstestMock } {
  const created: RstestMock[] = [];
  const names: string[] = [];
  // The adapter's own `fn()` call — the one before any spy — is the sweep sentinel.
  let sweepSentinel!: RstestMock;

  const fn = (implementation?: Func): RstestMock => {
    const calls: unknown[][] = [];
    let currentImplementation = implementation;
    const mock = function (this: unknown, ...args: unknown[]): unknown {
      calls.push(args);

      return currentImplementation?.apply(this, args);
    } as RstestMock;
    mock.mock = { calls };
    mock.mockName = (name: string): void => {
      names.push(name);
    };
    mock.mockClear = (): void => {
      calls.length = 0;
    };
    mock.mockReset = (): void => {
      calls.length = 0;
      currentImplementation = undefined;
    };
    mock.mockImplementation = (next: Func): void => {
      currentImplementation = next;
    };
    created.push(mock);

    if (created.length === 1) {
      sweepSentinel = mock;
    }

    return mock;
  };

  const api: RstestApi = { fn };

  return {
    api,
    created,
    names,
    get sweepSentinel(): RstestMock {
      return sweepSentinel;
    },
  };
}

describeMockAdapterContract({ describe, it }, { name: 'Rstest (stub)', adapter: () => createRstestMockAdapter(makeRstestApi().api) });
describeMockAdapterContract(
  { describe, it },
  { name: "Rstest (stub), 'runner' engine", adapter: () => createRstestMockAdapter(makeRstestApi().api), engine: 'runner' },
);

describe('createRstestMockAdapter', () => {
  it('builds the sweep sentinel with the adapter, so the entry fails on import outside the runner', () => {
    const { api, created } = makeRstestApi();

    createRstestMockAdapter(api);

    expect(created).toHaveLength(1);
    expect(() =>
      createRstestMockAdapter({
        fn: () => {
          throw new Error('not in rstest');
        },
      }),
    ).toThrow('not in rstest');
  });

  it('createMockFn builds a fast spy under the default engine', () => {
    const { api, created } = makeRstestApi();
    const adapter = createRstestMockAdapter(api);

    adapter.createMockFn((value: number) => value + 1);

    expect(created).toHaveLength(1);
  });

  it('createMockFn falls back to the runner mock under the runner engine', () => {
    const { api, created, names } = makeRstestApi();
    const adapter = createRstestMockAdapter(api);
    setSpyEngine('runner');

    const inc = adapter.createMockFn((value: number) => value + 1, 'inc');

    expect(inc(1)).toBe(2);
    expect(created).toHaveLength(2);
    expect(names).toEqual(['inc']);
  });

  it('createMockFn skips naming when no name is given', () => {
    const { api, names } = makeRstestApi();
    const adapter = createRstestMockAdapter(api);
    setSpyEngine('runner');

    adapter.createMockFn(() => undefined);

    expect(names).toEqual([]);
  });

  it('the sweep sentinel clears the library fast spies on mockClear and mockReset', () => {
    const rstestApi = makeRstestApi();
    const adapter = createRstestMockAdapter(rstestApi.api);
    const fast = adapter.createMockFn() as RstestMock;

    fast(1);
    expect(fast.mock.calls).toHaveLength(1);

    rstestApi.sweepSentinel.mockClear();
    expect(fast.mock.calls).toHaveLength(0);

    fast(2);
    expect(fast.mock.calls).toHaveLength(1);

    rstestApi.sweepSentinel.mockReset();
    expect(fast.mock.calls).toHaveLength(0);
  });
});
