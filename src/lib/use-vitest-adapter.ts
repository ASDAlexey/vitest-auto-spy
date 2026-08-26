/**
 * Register the default Vitest {@link MockAdapter}.
 *
 * Every public entry that runs on Vitest — the core (`vitest-auto-spy`) and the
 * `angular` / `nestjs` / `react` / `vue` / `svelte` recipes — needs the Vitest
 * adapter installed before any spy is built. Each of those entries may also be
 * imported on its own (the framework `provideAutoSpy` helpers build spies
 * without the core), so the registration cannot live only in `index.ts`.
 *
 * Calling this once is what an entry does instead of repeating the registry wiring
 * (and its rationale). It is a function rather than a bare side-effect import
 * because `sideEffects` in `package.json` lists entry files only, and a bundler
 * drops a bare import of a module it believes to be pure. The Bun and `node:test`
 * entries register their own adapter and deliberately do not call this.
 */
import { registerMockAdapter } from './mock-adapter';
import { vitestMockAdapter } from './vitest-adapter';

export function useVitestAdapter(): void {
  registerMockAdapter(vitestMockAdapter);
}
