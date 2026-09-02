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
import type { ObservableStream } from './observable-support';

/** Exported so the type-based auto-mock (a Proxy, with no members to brand) can answer to it too. */
export const AUTO_SPY_MARK = Symbol.for('vitest-auto-spy.mock');

/**
 * What a function spy keeps under the mark in place of `true`: its own state, carrying `reset` and
 * `clear` as methods. One property holds the brand and both hooks where three symbol properties
 * used to — a symbol `defineProperty` on a function costs ~100 ns on V8 and ~85 ns on JSC, paid
 * every time a method spy is materialised, and the two hooks had nothing per-spy left in them once
 * they became methods of the state they act on.
 */
export interface MarkHooks {
  reset(): void;
  clear(): void;
  /** The rxjs layer's per-spy state, when that layer is loaded — reached through the mark so it costs no property of its own. */
  readonly observable?: ObservableStream | undefined;
}

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
export function markAsMock(mock: object, mark: MarkHooks | true = true): void {
  Object.defineProperty(mock, AUTO_SPY_MARK, { value: mark, enumerable: false, configurable: true });
}

function isMarkHooks(value: unknown): value is MarkHooks {
  return typeof value === 'object' && value !== null && 'reset' in value && 'clear' in value;
}

/** The hooks a mock carries under its mark — none for a mock marked with plain `true`, or not marked at all. */
export function hooksOf(mock: object): MarkHooks | undefined {
  const mark: unknown = Reflect.get(mock, AUTO_SPY_MARK);

  return isMarkHooks(mark) ? mark : undefined;
}

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
export function runConfigReset(mock: object): void {
  hooksOf(mock)?.reset();
}

export function runClearHook(mock: object): void {
  hooksOf(mock)?.clear();
}
