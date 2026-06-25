/**
 * Side-effect module: register the default Vitest {@link MockAdapter} on import.
 *
 * Every public entry that runs on Vitest — the core (`vitest-auto-spy`) and the
 * `angular` / `nestjs` / `react` / `vue` / `svelte` recipes — needs the Vitest
 * adapter installed before any spy is built. Each of those entries may also be
 * imported on its own (the framework `provideAutoSpy` helpers build spies
 * without the core), so the registration cannot live only in `index.ts`.
 *
 * Importing this module once performs that registration, so every Vitest entry
 * reduces to a single `import './lib/use-vitest-adapter';` instead of repeating
 * the registry wiring (and its rationale) in six places. The Bun and `node:test`
 * entries register their own adapter and deliberately do not import this.
 */
import { registerMockAdapter } from './mock-adapter';
import { vitestMockAdapter } from './vitest-adapter';

registerMockAdapter(vitestMockAdapter);
