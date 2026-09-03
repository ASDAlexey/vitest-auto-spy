/**
 * The default Vitest adapter must implement the full {@link MockAdapter}
 * contract — including the `getCalls` / `reset` introspection the core does not
 * call itself but upcoming runtime adapters rely on. Exercised directly here.
 */
import { describe, expect, it, vi } from 'vitest';

import { isFastSpy } from './spy-probe';
import { getSpyEngine, setSpyEngine, vitestMockAdapter } from './vitest-adapter';

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

  it('clear drops recorded calls while keeping the implementation', () => {
    const fn = vitestMockAdapter.createMockFn((value: number) => value + 1);
    fn(1);

    vitestMockAdapter.clear(fn);

    expect(vitestMockAdapter.getCalls(fn)).toEqual([]);
    expect(fn(2)).toBe(3);
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

/**
 * The escape hatch back to `vi.fn()`.
 *
 * Every spec here restores the default in a `finally`: the engine is process-wide by design — a
 * setup file sets it once — so a spec that left it on `'runner'` would quietly measure and test a
 * different library from the one the next file expects.
 */
describe('the spy engine', () => {
  /** Run `body` with `engine` selected, putting the default back whatever happens. */
  function withEngine(engine: 'auto-spy' | 'runner', body: () => void): void {
    setSpyEngine(engine);

    try {
      body();
    } finally {
      setSpyEngine('auto-spy');
    }
  }

  it("defaults to this library's own spy", () => {
    expect(getSpyEngine()).toBe('auto-spy');
    expect(isFastSpy(vitestMockAdapter.createMockFn())).toBe(true);
  });

  it("builds every spy out of `vi.fn()` on 'runner', named and wrapping the implementation just the same", () => {
    withEngine('runner', () => {
      expect(getSpyEngine()).toBe('runner');

      const inc = vitestMockAdapter.createMockFn((value: number) => value + 1, 'inc');

      expect(isFastSpy(inc)).toBe(false);
      expect(vi.isMockFunction(inc)).toBe(true);
      expect(inc(1)).toBe(2);
      expect(vi.mocked(inc).getMockName()).toBe('inc');

      const anonymous = vitestMockAdapter.createMockFn();

      expect(isFastSpy(anonymous)).toBe(false);
      expect(anonymous()).toBeUndefined();
      expect(vi.mocked(anonymous).getMockName()).toBe('vi.fn()');
    });
  });

  it('leaves doubles built before the switch on the engine they were built with', () => {
    const before = vitestMockAdapter.createMockFn();

    withEngine('runner', () => {
      expect(isFastSpy(before)).toBe(true);
    });
  });
});

/**
 * The bridge that keeps `vi.clearAllMocks()` honest.
 *
 * A spy this adapter builds is in no registry Vitest walks, so a sweep can only reach it through
 * the one `vi.fn()` this module registers on purpose. These two run the real `vi.clearAllMocks()` /
 * `vi.resetAllMocks()` — `isolate: true` keeps the blast radius to this file — because the whole
 * value of the bridge is that a suite with `clearMocks: true` needs no change at all.
 */
describe('the run-wide sweeps', () => {
  it('clears an auto-spy through `vi.clearAllMocks()`', () => {
    const spy = vitestMockAdapter.createMockFn();

    spy(1);
    vi.clearAllMocks();

    expect(vitestMockAdapter.getCalls(spy)).toEqual([]);
  });

  it('puts the implementation back through `vi.resetAllMocks()`', () => {
    const spy = vitestMockAdapter.createMockFn(() => 'original');

    vi.mocked(spy).mockReturnValue('configured');

    expect(spy()).toBe('configured');

    vi.resetAllMocks();

    expect(spy()).toBe('original');
    expect(vitestMockAdapter.getCalls(spy)).toEqual([[]]);
  });
});
