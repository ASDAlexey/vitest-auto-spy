/**
 * Spy identity + reset plumbing shared by the spy factories and the public
 * {@link resetAutoSpy} / {@link clearAutoSpy} helpers.
 *
 * Every mock the library hands out is branded with {@link AUTO_SPY_MARK} so the
 * reset helpers can pick them out of an assembled spy by value (without touching
 * live accessors). Function spies additionally carry a {@link RESET_CONFIG} hook
 * that reverts their `calledWith` / return-value configuration to pristine —
 * something the host runner's own `mockClear`/`mockReset` cannot do, since that
 * state lives in this library's closures, not on the runner mock.
 */
import type { MockFn } from './mock-adapter';

const AUTO_SPY_MARK = Symbol.for('vitest-auto-spy.mock');
const RESET_CONFIG = Symbol.for('vitest-auto-spy.resetConfig');
const CLEAR_HOOK = Symbol.for('vitest-auto-spy.clearHook');

/** Brand a mock so {@link isMarkedMock} recognises it as one this library created. */
export function markAsMock(mock: object): void {
  Object.defineProperty(mock, AUTO_SPY_MARK, { value: true, enumerable: false, configurable: true });
}

/** Whether a value is a mock this library created (a branded callable). */
export function isMarkedMock(value: unknown): value is MockFn {
  return typeof value === 'function' && AUTO_SPY_MARK in value;
}

/** Attach a hook that clears a function spy's `calledWith`/return-value configuration. */
export function attachConfigReset(spy: object, reset: () => void): void {
  Object.defineProperty(spy, RESET_CONFIG, { value: reset, enumerable: false, configurable: true });
}

/** Run a spy's configuration-reset hook if it has one (function spies do; accessor spies don't). */
export function runConfigReset(mock: object): void {
  if (!(RESET_CONFIG in mock)) {
    return;
  }

  const reset = Reflect.get(mock, RESET_CONFIG);

  if (typeof reset === 'function') {
    reset();
  }
}

/**
 * Attach a hook that clears a spy's polyfilled, call-derived state (the
 * `settledResults` array on Bun / `node:test`). Runs on both `clearAutoSpy` and
 * `resetAutoSpy`, since either drops recorded call history.
 */
export function attachClearHook(spy: object, clear: () => void): void {
  Object.defineProperty(spy, CLEAR_HOOK, { value: clear, enumerable: false, configurable: true });
}

/** Run a spy's clear hook if it has one. */
export function runClearHook(mock: object): void {
  if (!(CLEAR_HOOK in mock)) {
    return;
  }

  const clear = Reflect.get(mock, CLEAR_HOOK);

  if (typeof clear === 'function') {
    clear();
  }
}
