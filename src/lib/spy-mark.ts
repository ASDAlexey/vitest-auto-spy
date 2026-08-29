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

/** Exported so the type-based auto-mock (a Proxy, with no members to brand) can answer to it too. */
export const AUTO_SPY_MARK = Symbol.for('vitest-auto-spy.mock');
const RESET_CONFIG = Symbol.for('vitest-auto-spy.resetConfig');
const CLEAR_HOOK = Symbol.for('vitest-auto-spy.clearHook');

/**
 * Key under which a deep-mock node hands out its materialised children.
 *
 * A `mockDeep` node keeps its children in a closure and deliberately does not publish them as own
 * keys — `getOwnPropertyDescriptor` falls through to the underlying function spy, so `Object.keys`
 * on a node answers with nothing. That is right for the mock's own surface and wrong for the reset
 * helpers, which walk own keys and therefore reset nothing at any depth. This is the one seam that
 * lets them recurse without making the children visible to a spec.
 */
export const DEEP_CHILDREN = Symbol.for('vitest-auto-spy.deepChildren');

/** Brand a mock so {@link isMarkedMock} recognises it as one this library created. */
export function markAsMock(mock: object): void {
  Object.defineProperty(mock, AUTO_SPY_MARK, { value: true, enumerable: false, configurable: true });
}

/**
 * Whether a value looks like an auto-spy this library assembled — the object, not one of its
 * members.
 *
 * Two shapes qualify, because there are two factories: a class-based spy owns an `accessorSpies`
 * bag, and the type-based `createAutoMock` is a Proxy with no members to brand, so it answers to
 * {@link AUTO_SPY_MARK} directly.
 */
export function isAutoSpyLike(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (AUTO_SPY_MARK in value) {
    return true;
  }

  const accessorSpies: unknown = Reflect.get(value, 'accessorSpies');

  return typeof accessorSpies === 'object' && accessorSpies !== null;
}

/** Whether a value is a mock this library created (a branded callable). */
export function isMarkedMock(value: unknown): value is MockFn {
  return typeof value === 'function' && AUTO_SPY_MARK in value;
}

/**
 * A deep-mock node's materialised children, or nothing for any other value.
 *
 * Reads through the node's own `get` trap, so it never materialises a child that no test touched.
 * Every child is itself a node and every node is a function spy behind a Proxy, so the callable
 * check is a narrowing rather than a filter — nothing a deep mock stores as a child can fail it.
 */
export function readDeepChildren(value: object): MockFn[] {
  const children: unknown = Reflect.get(value, DEEP_CHILDREN);

  if (!(children instanceof Map)) {
    return [];
  }

  return [...children.values()].filter(isMarkedMock);
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
