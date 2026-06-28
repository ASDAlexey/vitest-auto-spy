/**
 * `vitest-auto-spy/vue` — auto-spy helpers for Vue / Pinia test suites.
 *
 * ```ts
 * import { createSpyFromClass } from 'vitest-auto-spy/vue';
 * ```
 *
 * Importing this entry registers the default Vitest mock adapter (`vi.fn()` /
 * `vi.spyOn()`) and re-exports the full framework-agnostic core, so a Vue suite
 * is zero-config. Nothing here imports `vue`, `pinia` or `@vue/test-utils` — the
 * core stays runtime-agnostic and these stay optional peers.
 *
 * Class-based services injected via `provide`/`inject` and class-based Pinia
 * stores are the natural fit: `createSpyFromClass(MyStore)` turns every action
 * into a `vi.fn()`, complete with the `calledWith` / `resolveWith` / `nextWith`
 * helpers. A small `provideAutoSpy(token, Class)` builds a `global.provide`
 * entry for `@vue/test-utils`.
 *
 * ```ts
 * import { createSpyFromClass, provideAutoSpy } from 'vitest-auto-spy/vue';
 *
 * // Spy a Pinia store's actions
 * const store = createSpyFromClass(CartStore);
 * store.checkout.resolveWith({ ok: true });
 *
 * // Provide a spied service to a mounted component
 * const provide = provideAutoSpy(UserServiceKey, UserService);
 * provide[UserServiceKey].getName.mockReturnValue('Fake Name');
 * ```
 *
 * Angular suites run on Vitest, so this entry registers the default adapter even
 * when imported without the core (`provideAutoSpy` builds spies on its own).
 */
import { registerMockAdapter } from './lib/mock-adapter';
import { vitestMockAdapter } from './lib/vitest-adapter';

registerMockAdapter(vitestMockAdapter);

export {
  provideAutoSpy,
  type VueInjectionToken,
  type VueProvideSpy,
} from './lib/vue';

export * from './auto-spy';
