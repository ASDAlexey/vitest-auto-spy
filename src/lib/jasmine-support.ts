/**
 * Inversion-of-control registry for the optional jasmine compatibility layer.
 *
 * `jasmine-auto-spies` puts every configuration helper behind a `.and` namespace
 * (`spy.load.and.returnValue(…)`, `spy.load.and.nextWith(…)`) because that is where jasmine's own
 * spy strategies live, and it exposes jasmine's call bookkeeping as `.calls`. Neither name means
 * anything to Vitest, Bun or `node:test`, so a suite moving over would have to be rewritten before
 * it could run at all — which is the one thing that stops a large jasmine suite from moving.
 *
 * `vitest-auto-spy/jasmine` (and `…/jasmine-compat`, for the runtimes that cannot load Vitest)
 * registers the two namespaces here on import; the core (`function-spy.ts`, `accessor-spy.ts`)
 * consults this registry lazily, exactly the way `observable-support.ts` handles rxjs. A consumer
 * that never imports either entry pays one `undefined` check per spy and ships none of the code.
 *
 * **This module is listed in `SHARED_STATE_MODULES`** (`tsup.config.ts`), beside `mock-adapter` and
 * `observable-support`, and for both of their reasons. The correctness one: `registeredSupport` is
 * module-scope state, so a second copy would mean `enableJasmineCompat()` writing into one registry
 * while `createFunctionSpy` reads another — spies silently built without `.and`, which is the
 * `observable-support` failure wearing a different hat. The size one: every entry reaches this
 * module through the spy factories, and any module shared between the core graph and the jasmine
 * entries is one the bundler splits into a chunk of its own. Pinned into `shared-state.js`, which
 * every entry already loads, it adds no file to anybody's graph.
 */
import type { MockFn } from './mock-adapter';

/** What the core hands the compatibility layer so `.and.callThrough()` can undo `.and.returnValue(…)`. */
export interface JasmineSpyHooks {
  /** The spy's name, which jasmine publishes as `spy.and.identity`. */
  name: string;
  /**
   * Re-install the library's own dispatch — the one that answers `calledWith` chains and
   * `resolveWith` / `nextWith` values.
   *
   * `.and.returnValue(…)` and friends replace the implementation outright (jasmine's strategies do
   * the same), so `callThrough` needs a way back to the behaviour the spy was born with.
   */
  restoreDispatch(): void;
}

/** The namespaces the `/jasmine` entry plugs into the core. */
export interface JasmineSupport {
  /** Install `.and` and `.calls` on a fully-assembled function spy. */
  addToFunctionSpy(spy: MockFn, hooks: JasmineSpyHooks): void;
  /**
   * Install `.and` and `.calls` on an accessor spy.
   *
   * An accessor spy is a bare adapter mock with no library dispatch behind it, so it gets the
   * jasmine strategies and the call bookkeeping but none of the promise/observable helpers — which
   * is exactly what `spy.accessorSpies.getters.name.and.returnValue('x')` needs.
   */
  addToAccessorSpy(spy: MockFn): void;
}

let registeredSupport: JasmineSupport | undefined;

/** Called once by `vitest-auto-spy/jasmine` on import to enable the `.and` / `.calls` namespaces. */
export function registerJasmineSupport(support: JasmineSupport): void {
  registeredSupport = support;
}

/** The registered jasmine support, or `undefined` when `/jasmine` was never imported. */
export function getJasmineSupport(): JasmineSupport | undefined {
  return registeredSupport;
}

/**
 * Forget the registered jasmine support.
 *
 * Internal, and for the same reason `resetObservableSupport` exists: the registry is process-wide,
 * so the spec that proves a spy carries **no** `.and` must empty it rather than assume its file ran
 * before `vitest-auto-spy/jasmine` was ever imported.
 */
export function resetJasmineSupport(): void {
  registeredSupport = undefined;
}
