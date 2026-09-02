/**
 * `spy-mark` brands the mocks this library creates and carries their
 * config-reset / clear hooks. Exercised directly so every branch (branded vs
 * plain, hook present vs absent, hook value not a function) is covered without
 * routing through the full spy factory.
 */
import { describe, expect, it, vi } from 'vitest';

import { createAutoMock } from './auto-mock';
import { createSpyFromClass } from './create-spy-from-class';
import { isAutoSpyLike, isMarkedMock, markAsMock, runClearHook, runConfigReset } from './spy-mark';

describe('spy-mark', () => {
  it('isMarkedMock recognises branded functions only', () => {
    const fn = (): void => undefined;

    expect(isMarkedMock(fn)).toBe(false);

    markAsMock(fn);
    expect(isMarkedMock(fn)).toBe(true);

    expect(isMarkedMock({})).toBe(false);
    expect(isMarkedMock('x')).toBe(false);
  });

  it('runConfigReset runs the reset hook a mark carries and is a no-op without one', () => {
    const withHooks = {};
    const reset = vi.fn();
    markAsMock(withHooks, { reset, clear: vi.fn() });

    runConfigReset(withHooks);
    expect(reset).toHaveBeenCalledTimes(1);

    expect(() => runConfigReset({})).not.toThrow();
  });

  it('runClearHook runs the clear hook a mark carries and is a no-op without one', () => {
    const withHooks = {};
    const clear = vi.fn();
    markAsMock(withHooks, { reset: vi.fn(), clear });

    runClearHook(withHooks);
    expect(clear).toHaveBeenCalledTimes(1);

    expect(() => runClearHook({})).not.toThrow();
  });

  it('treats a plain `true` mark, or an object that is not a pair of hooks, as carrying no hooks', () => {
    const plain = {};
    markAsMock(plain);
    expect(() => runConfigReset(plain)).not.toThrow();
    expect(() => runClearHook(plain)).not.toThrow();

    // Half a pair is not a pair: both hooks are required, so a stray object under the mark runs nothing.
    const halfway = {};
    Object.defineProperty(halfway, Symbol.for('vitest-auto-spy.mock'), { value: { reset: vi.fn() }, configurable: true });
    expect(() => runConfigReset(halfway)).not.toThrow();

    const empty = {};
    Object.defineProperty(empty, Symbol.for('vitest-auto-spy.mock'), { value: {}, configurable: true });
    expect(() => runClearHook(empty)).not.toThrow();
  });

  it('calls the hooks with the mark as receiver, which is how a function spy reaches its state', () => {
    const state = { count: 0 };
    const hooks = {
      count: 0,
      reset(): void {
        this.count += 1;
        state.count = this.count;
      },
      clear(): void {
        this.count += 10;
        state.count = this.count;
      },
    };
    const spy = {};
    markAsMock(spy, hooks);

    runConfigReset(spy);
    runClearHook(spy);

    expect(state.count).toBe(11);
  });
});

describe('isAutoSpyLike', () => {
  class Cart {
    total(): number {
      return 0;
    }
  }

  it('recognises both factories', () => {
    expect(isAutoSpyLike(createSpyFromClass(Cart))).toBe(true);
    expect(isAutoSpyLike(createAutoMock<Cart>())).toBe(true);
  });

  it('does not mistake a real instance, a hand-rolled double or a primitive for one', () => {
    expect(isAutoSpyLike(new Cart())).toBe(false);
    expect(isAutoSpyLike({ total: vi.fn() })).toBe(false);
    expect(isAutoSpyLike(null)).toBe(false);
    expect(isAutoSpyLike('cart')).toBe(false);
  });

  it('is not fooled by an accessorSpies field that is not the bag', () => {
    expect(isAutoSpyLike({ accessorSpies: 'yes' })).toBe(false);
  });
});
