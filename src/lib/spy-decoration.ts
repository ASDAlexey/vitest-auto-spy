/**
 * Shared decoration primitive.
 *
 * The promise/observable spy factories attach a bundle of helper methods
 * (`resolveWith`, `nextWith`, …) onto a target that is either a `vi.fn()` spy,
 * a `calledWith` backing object, or an `Observable`. Both are dynamically-shaped
 * objects, so this single helper centralises the "attach these named functions
 * onto the target" step — keeping the assignment in one place instead of
 * duplicating it across the promise/observable factories.
 */

/** A bundle of helper methods to attach. */
export type Helpers = Record<string, (...args: never[]) => unknown>;

/**
 * Attach every entry of `helpers` onto `target`, returning the same object typed
 * as the intersection of its original type and the helper bundle.
 */
export function decorate<Target extends object, H extends Helpers>(target: Target, helpers: H): H & Target {
  return Object.assign(target, helpers);
}
