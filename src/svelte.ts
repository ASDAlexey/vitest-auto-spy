/**
 * `vitest-auto-spy/svelte` — auto-spy recipe for Svelte test suites.
 *
 * ```ts
 * import { createSpyFromClass } from 'vitest-auto-spy/svelte';
 * ```
 *
 * Svelte has no class-based dependency injection, so this entry adds **no**
 * helper of its own — it is a recipe, not a framework integration. Svelte apps
 * typically keep their logic in plain class-based services or stores that a
 * component imports and calls; `createSpyFromClass` spies that class, and you
 * inject the spy into the component under test (props, context, or a mocked
 * module) exactly the way the component receives the real one.
 *
 * Importing this entry registers the default Vitest mock adapter (`vi.fn()` /
 * `vi.spyOn()`) and re-exports the whole framework-agnostic core, so a Svelte
 * suite needs a single import. It pulls in neither `svelte` nor
 * `@testing-library/svelte`: the core stays framework-agnostic and never
 * references Svelte.
 *
 * @example Spying a class-based store used by a component
 * ```ts
 * import { createSpyFromClass } from 'vitest-auto-spy/svelte';
 * import { render } from '@testing-library/svelte';
 * import Cart from './Cart.svelte';
 * import { CartStore } from './cart-store';
 *
 * const cartStore = createSpyFromClass(CartStore);
 * cartStore.total.mockReturnValue(42);
 *
 * render(Cart, { props: { store: cartStore } });
 * ```
 */
import { registerMockAdapter } from './lib/mock-adapter';
import { vitestMockAdapter } from './lib/vitest-adapter';

// Svelte suites run on Vitest. This entry may be imported on its own (it
// re-exports the core below), so register the default adapter here too.
registerMockAdapter(vitestMockAdapter);

export * from './auto-spy';
