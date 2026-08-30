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
import { DOCS_LINKS, withDocs } from './docs-links';
import { registerPackageCopy } from './package-identity';
import { isCannotRedefine, redefineFailure } from './redefine-failure';
import type { Func } from './types';

// Every entry bundles this module, so importing any of them records which install of the library
// was loaded. `setupAutoSpy()` turns two recorded installs into an actionable failure instead of
// the order-dependent breakage that split spies produce.
registerPackageCopy();

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
  /**
   * Re-install `implementation` as the mock's implementation, discarding any
   * host-level `mockReturnValue` / `mockImplementation` override. Used by
   * {@link resetAutoSpy} to revert a function spy to its library dispatch — a
   * plain `clear` (`mockClear`) cannot, and a full `reset` (`mockReset`) would
   * wipe the dispatch itself.
   */
  restoreImplementation(mock: MockFn, implementation: Func): void;
}

/** Run an accessor spy, translating a non-configurable property into a failure that names the way out. */
function spyOrExplain(spy: () => MockFn, target: object, property: string, accessor: 'get' | 'set'): MockFn {
  try {
    return spy();
  } catch (error) {
    if (isCannotRedefine(error)) {
      throw redefineFailure(
        `Cannot spy on the '${accessor}' accessor of '${property}': the property is not configurable, so it cannot be redefined.`,
        target,
        error,
      );
    }

    throw error;
  }
}

/**
 * Wrap an adapter so its two accessor spies report a non-configurable property in full.
 *
 * Applied by each adapter to itself rather than by {@link registerMockAdapter}, so the exported
 * adapter object and the registered one stay the same value — and so an adapter used directly (the
 * Bun and Node factories are exported) carries the diagnostic too.
 */
export function guardAccessorSpies(adapter: MockAdapter): MockAdapter {
  return {
    ...adapter,
    spyOnGetter: (target: object, property: string): MockFn =>
      spyOrExplain(() => adapter.spyOnGetter(target, property), target, property, 'get'),
    spyOnSetter: (target: object, property: string): MockFn =>
      spyOrExplain(() => adapter.spyOnSetter(target, property), target, property, 'set'),
  };
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

/**
 * Forget the registered adapter.
 *
 * Internal — no public entry re-exports the registry. It exists because the registry is
 * *process-wide*: a spec that exercises the "nothing registered yet" path cannot rely on its file
 * being the first to touch it (under `isolate: false` every spec shares one module graph), so it
 * has to empty the registry itself and put the previous adapter back afterwards.
 */
export function resetMockAdapter(): void {
  registeredAdapter = undefined;
}

const MISSING_MOCK_ADAPTER = withDocs(
  'No mock adapter registered. Import a runtime entry once before creating spies — ' +
    "'vitest-auto-spy' (default, Vitest) or a runtime variant such as 'vitest-auto-spy/bun' / 'vitest-auto-spy/node'. " +
    'Importing the entry is what registers the adapter, so it has to happen before the first spy is built.',
  DOCS_LINKS.installation,
);

/** The active mock adapter, throwing an actionable hint if no entry registered one. */
export function getMockAdapter(): MockAdapter {
  if (!registeredAdapter) {
    throw new Error(MISSING_MOCK_ADAPTER);
  }

  return registeredAdapter;
}
