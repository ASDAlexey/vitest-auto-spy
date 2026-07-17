/**
 * Inversion-of-control seam that keeps the framework-agnostic core free of any
 * direct test-runner import.
 *
 * The single runtime dependency of the core used to be Vitest's `vi.fn()` /
 * `vi.spyOn()`. Those are now hidden behind the {@link MockAdapter} interface:
 * the core (`function-spy.ts`, `accessor-spy.ts`, the Angular accessor helper)
 * asks the registry for the active adapter instead of importing `vitest`.
 *
 * A public entry registers an adapter on import — `vitest-auto-spy` registers
 * the default {@link vitest-adapter Vitest adapter}, keeping the package
 * zero-config — while future entries (`vitest-auto-spy/bun`, `…/node`) register
 * their own adapter over the very same core. This is the same refactor spirit as
 * the rxjs decouple in `observable-support.ts`.
 */
import type { Func } from './types';

/**
 * A host-runner mock function: a callable spy (Vitest `vi.fn()`, Bun `mock()`,
 * `node:test` `mock.fn()`). The host's own richer surface (`.mock`,
 * `mockReturnValue`, …) lives on the concrete object; the core treats it as a
 * plain callable and reads/resets it only through the adapter.
 */
export type MockFn = Func;

/**
 * The runtime-specific mock primitives the core needs. Each test runner ships
 * one implementation; the core never learns which.
 */
export interface MockAdapter {
  /** Create a mock function wrapping `implementation` (a no-op when omitted), optionally named for diagnostics. */
  createMockFn(implementation?: Func, name?: string): MockFn;
  /** Wrap the `get` accessor of `target[property]` with a spy, returning the mock. */
  spyOnGetter(target: object, property: string): MockFn;
  /** Wrap the `set` accessor of `target[property]` with a spy, returning the mock. */
  spyOnSetter(target: object, property: string): MockFn;
  /** The recorded argument tuples of a mock created by this adapter. */
  getCalls(mock: MockFn): readonly unknown[][];
  /** Reset a mock created by this adapter (clears its recorded calls and any configured implementation). */
  reset(mock: MockFn): void;
  /** Clear a mock's recorded calls only, preserving its implementation. */
  clear(mock: MockFn): void;
}

let registeredAdapter: MockAdapter | undefined;

/** Called once by a public entry on import to install the active mock adapter. */
export function registerMockAdapter(adapter: MockAdapter): void {
  registeredAdapter = adapter;
}

/**
 * Whether an entry has already registered an adapter. Side-effect entries that
 * are not runtime-specific (e.g. `vitest-auto-spy/console`) check this before
 * registering the default Vitest adapter, so they never stomp a runtime
 * adapter installed by `vitest-auto-spy/bun` / `…/node`.
 */
export function hasMockAdapter(): boolean {
  return registeredAdapter !== undefined;
}

const MISSING_MOCK_ADAPTER =
  'No mock adapter registered. Import a runtime entry once before creating spies — ' +
  "'vitest-auto-spy' (default, Vitest) or a runtime variant such as 'vitest-auto-spy/bun'.";

/** The active mock adapter, throwing an actionable hint if no entry registered one. */
export function getMockAdapter(): MockAdapter {
  if (!registeredAdapter) {
    throw new Error(MISSING_MOCK_ADAPTER);
  }

  return registeredAdapter;
}
