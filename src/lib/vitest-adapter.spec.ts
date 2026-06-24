/**
 * The default Vitest adapter must implement the full {@link MockAdapter}
 * contract — including the `getCalls` / `reset` introspection the core does not
 * call itself but upcoming runtime adapters rely on. Exercised directly here.
 */
import { describe, expect, it, vi } from 'vitest';

import { vitestMockAdapter } from './vitest-adapter';

describe('vitestMockAdapter', () => {
  it('createMockFn wraps an implementation and names the mock', () => {
    const inc = vitestMockAdapter.createMockFn((value: number) => value + 1, 'inc');

    expect(vi.isMockFunction(inc)).toBe(true);
    expect(inc(1)).toBe(2);
    expect(vi.mocked(inc).getMockName()).toBe('inc');
  });

  it('createMockFn defaults to a no-op when no implementation is given', () => {
    const noop = vitestMockAdapter.createMockFn();

    expect(noop()).toBeUndefined();
  });

  it('getCalls returns the recorded argument tuples', () => {
    const fn = vitestMockAdapter.createMockFn();

    fn(1, 'a');
    fn(2);

    expect(vitestMockAdapter.getCalls(fn)).toEqual([[1, 'a'], [2]]);
  });

  it('reset clears the recorded calls', () => {
    const fn = vitestMockAdapter.createMockFn();
    fn('x');

    vitestMockAdapter.reset(fn);

    expect(vitestMockAdapter.getCalls(fn)).toEqual([]);
  });

  it('spyOnGetter / spyOnSetter wrap the property accessors', () => {
    let backing = 5;
    const target: Record<string, unknown> = {};
    Object.defineProperty(target, 'value', {
      get: () => backing,
      set: (next: number) => {
        backing = next;
      },
      configurable: true,
    });

    const getter = vitestMockAdapter.spyOnGetter(target, 'value');
    const setter = vitestMockAdapter.spyOnSetter(target, 'value');

    void target['value'];
    target['value'] = 9;

    expect(getter).toHaveBeenCalled();
    expect(setter).toHaveBeenCalledWith(9);
    expect(backing).toBe(9);
  });
});
