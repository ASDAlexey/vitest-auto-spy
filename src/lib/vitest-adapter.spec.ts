import { describe, expect, it, vi } from 'vitest';

import { describeMockAdapterContract } from './mock-adapter-contract';
import { isFastSpy } from './spy-probe';
import { getSpyEngine, setSpyEngine, vitestMockAdapter } from './vitest-adapter';

describeMockAdapterContract({ describe, it }, { name: 'Vitest', adapter: () => vitestMockAdapter });
describeMockAdapterContract({ describe, it }, { name: "Vitest, 'runner' engine", adapter: () => vitestMockAdapter, engine: 'runner' });

describe('vitestMockAdapter', () => {
  it('createMockFn names the mock', () => {
    const inc = vitestMockAdapter.createMockFn((value: number) => value + 1, 'inc');

    expect(vi.isMockFunction(inc)).toBe(true);
    expect(vi.mocked(inc).getMockName()).toBe('inc');
  });

  /**
   * The accessor spies are the only place this package ever reached for `vi.spyOn`, and `vi.spyOn`
   * is the only call that writes to the runner's restore registry — which `restoreMocks: true`
   * empties before every test body, ahead of the `beforeEach` hooks. A double built in a `beforeAll`
   * or a `describe` body therefore lost its spied accessors between configuration and assertion,
   * with `accessorSpies.getters.x` still answering `mockReturnValue` and the property answering
   * `undefined`. Redefining instead keeps them ours; nothing here belongs to the runner to restore.
   */
  it('installs accessor spies the runner cannot restore out from under the double', () => {
    const backing = 5;
    const target = {
      get value(): number {
        return backing;
      },
    };

    const getter = vitestMockAdapter.spyOnGetter(target, 'value');
    vi.mocked(getter).mockReturnValue(41);

    vi.restoreAllMocks();

    expect(target.value).toBe(41);
    expect(backing).toBe(5);
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
