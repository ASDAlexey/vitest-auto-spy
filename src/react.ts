/**
 * `vitest-auto-spy/react` — auto-spy your service/store CLASSES in React tests.
 *
 * ```ts
 * import { createSpyFromClass, type Spy } from 'vitest-auto-spy/react';
 * ```
 *
 * React has no DI container, so this entry ships no `provide*` helper — it would
 * add nothing over the core. Instead it is a *recipe*: spy the **classes** you
 * own (services, stores, API clients, the deps you inject into hooks or hand to
 * a Context provider) — not the components themselves. The spy is a plain object
 * of `vi.fn()`s, so you pass it straight into a `<Context.Provider value={spy}>`
 * or a hook's dependency argument, then drive return values with `calledWith` /
 * `resolveWith` / `mockReturnValue` and assert against `spy.method.mock.calls`.
 *
 * React test suites run on Vitest, so importing this entry registers the default
 * Vitest mock adapter (`vi.fn()` / `vi.spyOn()`) and then re-exports the exact
 * same public API as the core. It pulls in `vitest` only — never `react` or
 * `@testing-library/react`, which stay the consumer's own (dev) dependencies.
 */
import { registerMockAdapter } from './lib/mock-adapter';
import { vitestMockAdapter } from './lib/vitest-adapter';

// This entry may be imported on its own (without the core `vitest-auto-spy`
// import), so register the default Vitest adapter here too — same as `angular.ts`.
registerMockAdapter(vitestMockAdapter);

export * from './auto-spy';
