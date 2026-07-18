/**
 * `spy-mark` brands the mocks this library creates and carries their
 * config-reset / clear hooks. Exercised directly so every branch (branded vs
 * plain, hook present vs absent, hook value not a function) is covered without
 * routing through the full spy factory.
 */
import { describe, expect, it, vi } from 'vitest';

import { attachClearHook, attachConfigReset, isMarkedMock, markAsMock, runClearHook, runConfigReset } from './spy-mark';

const RESET_CONFIG = Symbol.for('vitest-auto-spy.resetConfig');
const CLEAR_HOOK = Symbol.for('vitest-auto-spy.clearHook');

describe('spy-mark', () => {
  it('isMarkedMock recognises branded functions only', () => {
    const fn = (): void => undefined;

    expect(isMarkedMock(fn)).toBe(false);

    markAsMock(fn);
    expect(isMarkedMock(fn)).toBe(true);

    expect(isMarkedMock({})).toBe(false);
    expect(isMarkedMock('x')).toBe(false);
  });

  it('runConfigReset runs an attached hook and is a no-op without one', () => {
    const withHook = {};
    const reset = vi.fn();
    attachConfigReset(withHook, reset);

    runConfigReset(withHook);
    expect(reset).toHaveBeenCalledTimes(1);

    expect(() => runConfigReset({})).not.toThrow();
  });

  it('runClearHook runs an attached hook and is a no-op without one', () => {
    const withHook = {};
    const clear = vi.fn();
    attachClearHook(withHook, clear);

    runClearHook(withHook);
    expect(clear).toHaveBeenCalledTimes(1);

    expect(() => runClearHook({})).not.toThrow();
  });

  it('ignores a hook slot that does not hold a function', () => {
    const configTarget = {};
    Object.defineProperty(configTarget, RESET_CONFIG, { value: 'not-a-fn', configurable: true });
    expect(() => runConfigReset(configTarget)).not.toThrow();

    const clearTarget = {};
    Object.defineProperty(clearTarget, CLEAR_HOOK, { value: 42, configurable: true });
    expect(() => runClearHook(clearTarget)).not.toThrow();
  });
});
