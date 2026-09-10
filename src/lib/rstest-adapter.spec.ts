/**
 * The Rstest adapter factory, exercised with a stub that mirrors Rstest's
 * Vitest-shaped mock surface (bare-array `mock.calls`, `mockClear` /
 * `mockReset` / `mockImplementation`). `@rstest/core` only runs under the Rstest
 * runner, so the factory shape is what we can verify here.
 */
import { afterEach, describe, expect, it } from 'vitest';

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
    const mock = ((...args: unknown[]): unknown => {
      calls.push(args);

      return currentImplementation?.(...args);
    }) as RstestMock;
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

describe('createRstestMockAdapter', () => {
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

  it('getCalls returns the bare argument tuples and reset drops the implementation', () => {
    const adapter = createRstestMockAdapter(makeRstestApi().api);
    setSpyEngine('runner');
    const fn = adapter.createMockFn(() => 'original');

    fn(1, 'a');
    fn(2);
    expect(adapter.getCalls(fn)).toEqual([[1, 'a'], [2]]);

    adapter.reset(fn);
    expect(adapter.getCalls(fn)).toEqual([]);
    expect(fn()).toBeUndefined();
  });

  it('clear drops the recorded calls but keeps the implementation', () => {
    const adapter = createRstestMockAdapter(makeRstestApi().api);
    setSpyEngine('runner');
    const fn = adapter.createMockFn(() => 'kept');

    fn('x');
    adapter.clear(fn);

    expect(adapter.getCalls(fn)).toEqual([]);
    expect(fn()).toBe('kept');
  });

  it('restoreImplementation re-installs the given implementation', () => {
    const adapter = createRstestMockAdapter(makeRstestApi().api);
    setSpyEngine('runner');
    const fn = adapter.createMockFn(() => 'original');

    expect(fn()).toBe('original');

    adapter.restoreImplementation(fn, () => 'restored');
    expect(fn()).toBe('restored');
  });

  it('spyOnGetter / spyOnSetter install accessor spies by redefining the property', () => {
    const adapter = createRstestMockAdapter(makeRstestApi().api);
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
