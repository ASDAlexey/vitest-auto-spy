/**
 * `vitest-auto-spy/setup` — one call for a project's test-run hygiene.
 *
 * ```ts
 * // vitest.setup.ts
 * import { setupAutoSpy } from 'vitest-auto-spy/setup';
 *
 * setupAutoSpy();
 * ```
 *
 * Kept out of the main entry on purpose: this one registers global `afterEach` hooks, which only
 * makes sense from a setup file, never from a spec that happens to import a spy factory.
 */
import { useVitestAdapter } from './lib/use-vitest-adapter';

useVitestAdapter();

export { setupAutoSpy, type DuplicateCopiesReaction, type SetupAutoSpyOptions } from './lib/setup-auto-spy';
export { describeDuplicateCopies, getPackageCopies } from './lib/package-identity';
