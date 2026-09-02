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
import { DOCS_LINKS, withDocs } from './docs-links';

/**
 * The failure a shared helper raises when it cannot find its spy through `this`.
 *
 * `const { resolveWith } = spy.method` compiles — the helper is a plain property — and used to
 * work, because each helper was a closure over its own spy. The helpers are shared now, one set
 * for the run, so a detached call has no spy to configure: it fails at the call, naming the helper
 * and the two shapes that do work.
 */
export function detachedHelperError(helper: string): Error {
  return new Error(
    withDocs(
      `[vitest-auto-spy] ${helper} was called off its spy: \`const { ${helper} } = spy.method\` loses the spy it configures. ` +
        `Call it as a method — spy.method.${helper}(…) — or bind it first.`,
      DOCS_LINKS.controlHelpers,
    ),
  );
}

export type Helpers = Record<string, (...args: never[]) => unknown>;

/**
 * Attach every entry of `helpers` onto `target`, returning the same object typed
 * as the intersection of its original type and the helper bundle.
 */
export function decorate<Target extends object, H extends Helpers>(target: Target, helpers: H): H & Target {
  return Object.assign(target, helpers);
}
