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

/**
 * How to share a bundle on the prototype a fast spy inherits from.
 *
 * Registered by `fast-spy` when that module loads, rather than imported from it: an entry whose
 * runtime is Bun or `node:test` never loads the library's own engine, and a static import here
 * would put its whole 21 kB into those graphs to reach one function — measured at +1.0 kB min+gzip
 * on `/bun`, `/node` and `/rxjs` each. The sharing itself lives there too, for the same reason:
 * it is the module that owns the prototypes and the descriptors they are written with.
 *
 * The sink answers whether it took the bundle. It is free to refuse — a target that is not one of
 * its spies, or a prototype another copy's bundle already claimed — and a refusal means the bundle
 * is copied onto the target instead.
 */
let shareOnPrototype: ((target: object, helpers: Helpers) => boolean) | undefined;

/** Called once by `fast-spy` on load. */
export function setSharedHelperSink(share: (target: object, helpers: Helpers) => boolean): void {
  shareOnPrototype = share;
}

/**
 * Attach `helpers` to a function spy — through the prototype where there is one to share.
 *
 * The library's own engine gives every spy the same prototype, so a bundle goes on it once for the
 * run instead of becoming six or seven own property slots on each spy. A runner-backed mock
 * (`setSpyEngine('runner')`, Bun, `node:test`) is a foreign object with no prototype of ours, and
 * copying the bundle onto it is the only way in — as it is for a spy whose prototype another copy of
 * the package got to first.
 *
 * Which copy's sink happens to be registered here does not matter, and that is deliberate: the sink
 * decides from the **target**, and its record of what a prototype already carries lives on that
 * prototype. Before 5.4.1 it decided from its own module scope, so a sink belonging to one copy of
 * `fast-spy` wrote a bundle onto that copy's prototype while the spy inherited from another's — see
 * `shareFastSpyHelpers`.
 */
export function attachHelpers<Target extends object, H extends Helpers>(target: Target, helpers: H): H & Target {
  if (shareOnPrototype?.(target, helpers) !== true) {
    return decorate(target, helpers);
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the helpers are on the prototype the spy inherits from; only the type has to be told.
  return target as H & Target;
}
