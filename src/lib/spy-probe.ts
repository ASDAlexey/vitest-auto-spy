/**
 * The two predicates `settled-results` needs about a value it was handed.
 *
 * They live apart from `fast-spy` so that the `node:test` and Bun entries, which never build a fast
 * spy, do not bundle the module that does: `settled-results` is on every runtime's create path, and
 * importing the predicates from `fast-spy` pulled roughly a kilobyte of gzipped dead code into
 * `/node` and `/bun`.
 */

/** The brand {@link isFastSpy} reads. A symbol, so nothing a spec puts on a double can collide with it. */
export const FAST_SPY_BRAND = Symbol.for('vitest-auto-spy.fastSpy');

/** Whether `value` is a spy `fast-spy` created — one inherited property read, so it allocates nothing. */
export function isFastSpy(value: unknown): boolean {
  return typeof value === 'function' && FAST_SPY_BRAND in value;
}

/** Whether a value is thenable, deciding whether a settled result is filled in now or later. */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return false;
  }

  return typeof Reflect.get(value, 'then') === 'function';
}
