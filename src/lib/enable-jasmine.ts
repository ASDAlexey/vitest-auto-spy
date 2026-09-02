/**
 * The one call that turns on the jasmine compatibility layer.
 *
 * Kept apart from the `vitest-auto-spy/jasmine` entry because that entry registers the Vitest mock
 * adapter, and registering it means importing `vitest` — which a `bun test` or `node --test` process
 * cannot do. This module imports neither, so `/bun` and `/node` can re-export it and a suite on
 * either runtime gets `.and` / `.calls` / `.withArgs` without pulling Vitest into the process.
 *
 * ```ts
 * // bun test
 * import { enableJasmineCompat } from 'vitest-auto-spy/jasmine-compat';
 *
 * enableJasmineCompat();
 * ```
 */
import { addJasmineNamespacesToAccessorSpy, addJasmineNamespacesToFunctionSpy } from './jasmine-namespaces';
import { registerJasmineSupport } from './jasmine-support';

/**
 * Install the `.and`, `.calls` and `.withArgs` namespaces on every spy built afterwards.
 *
 * Idempotent, and order matters only in one direction: spies built *before* the call do not get the
 * namespaces, so this belongs in a setup file rather than inside a `beforeEach` that runs after the
 * double is created. The `vitest-auto-spy/jasmine` entry calls it on import, which is the usual way
 * in.
 */
export function enableJasmineCompat(): void {
  registerJasmineSupport({
    addToFunctionSpy: addJasmineNamespacesToFunctionSpy,
    addToAccessorSpy: addJasmineNamespacesToAccessorSpy,
  });
}
