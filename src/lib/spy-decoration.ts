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
import { isFastSpy } from './spy-probe';

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

/**
 * How to put a bundle on the prototype every fast spy inherits.
 *
 * Registered by `fast-spy` when that module loads, rather than imported from it: an entry whose
 * runtime is Bun or `node:test` never loads the library's own engine, and a static import here
 * would put its whole 21 kB into those graphs to reach one function — measured at +1.0 kB min+gzip
 * on `/bun`, `/node` and `/rxjs` each.
 */
let shareOnPrototype: ((helpers: Helpers) => void) | undefined;

/** Called once by `fast-spy` on load. */
export function setSharedHelperSink(share: (helpers: Helpers) => void): void {
  shareOnPrototype = share;
}

/** Helper bundles already on the shared prototype, so the second spy of a run does nothing. */
const shared = new WeakSet<object>();

/**
 * Attach `helpers` to a function spy — through the prototype where there is one to share.
 *
 * The library's own engine gives every spy the same prototype, so a bundle goes on it once for the
 * run instead of becoming six or seven own property slots on each spy. A runner-backed mock
 * (`setSpyEngine('runner')`, Bun, `node:test`) is a foreign object with no prototype of ours, and
 * copying the bundle onto it is the only way in.
 */
export function attachHelpers<Target extends object, H extends Helpers>(target: Target, helpers: H): H & Target {
  if (shareOnPrototype === undefined || !isFastSpy(target)) {
    return decorate(target, helpers);
  }

  if (!shared.has(helpers)) {
    shared.add(helpers);
    shareOnPrototype(helpers);
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the helpers are on the prototype the spy inherits from; only the type has to be told.
  return target as H & Target;
}
