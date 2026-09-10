/**
 * The default {@link MockAdapter}: Vitest's `vi.fn()`, plus accessor spies installed by redefining
 * the property (see `spyOnGetter` below for why not `vi.spyOn`).
 *
 * This is the only core module that imports `vitest`. It is pulled in solely by
 * the `vitest-auto-spy` (and `vitest-auto-spy/angular`) entries, which register
 * it on import — so a consumer that imports a different runtime entry never
 * pulls Vitest into their bundle.
 */
import { type Mock, vi } from 'vitest';

import { SWEEP_SENTINEL } from './constants';
import { clearAllFastSpies, createFastSpy, resetAllFastSpies } from './fast-spy';
import { type MockAdapter, type MockFn, guardAccessorSpies } from './mock-adapter';
import { spyOnAccessorByRedefine } from './redefine-accessor-spy';
import { getSpyEngine } from './spy-engine';
import type { Func } from './types';

/** View a runtime-agnostic {@link MockFn} as the concrete Vitest mock it actually is here. */
function asVitestMock(mock: MockFn): Mock {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- every `MockFn` this adapter hands out is a `vi.fn()`; the registry type is intentionally runtime-agnostic, so reading `.mock`/resetting narrows the bare callable back to the concrete Vitest mock.
  return mock as any;
}

/**
 * How a run-wide `vi.clearAllMocks()` reaches spies that are not the runner's.
 *
 * Vitest clears every mock by walking a module-level registry inside `@vitest/spy` that only
 * `vi.fn()` and `vi.spyOn()` write to, and there is no API to add to it. What there is, is one
 * `vi.fn()` of our own: the sweep calls `mockClear()` on everything in that set, so a mock whose
 * `mockClear` bumps this library's own sweep counter turns a walk of the runner's registry into a
 * sweep of ours too — for `clearMocks: true` and `mockReset: true` in a config just as much as for a
 * hand-written `vi.clearAllMocks()`, since Vitest applies those through the same two functions.
 *
 * It is created here, at module scope, because that is also what keeps it: {@link pruneMockRegistry}
 * classifies a mock that already exists when a file's hooks start as one that outlives the file, and
 * a mock this library's own pruner dropped would be a sweep that silently stops happening.
 */
const sweepSentinel = vi.fn();

// Never pruned — see `SWEEP_SENTINEL`. Without this the sweep stops the moment the file that first
// loaded this module ends, in exactly the `isolate: false` runs where it matters most.
Object.defineProperty(sweepSentinel, SWEEP_SENTINEL, { value: true, enumerable: false, configurable: true });

sweepSentinel.mockClear = function clearAllMocksSweep(): typeof sweepSentinel {
  clearAllFastSpies();

  return sweepSentinel;
};

sweepSentinel.mockReset = function resetAllMocksSweep(): typeof sweepSentinel {
  resetAllFastSpies();

  return sweepSentinel;
};

// Invoked once, on purpose: Vitest 5's `clearAllMocks()` walks only the mocks called since the last
// clear, so a sentinel that is never called is never swept — and the override above never un-dirties
// it, so this one call keeps it reachable for the worker's life. Vitest 4 reaches it either way.
sweepSentinel();

export { getSpyEngine, setSpyEngine, type SpyEngine } from './spy-engine';

/** A `vi.fn()`, named for diagnostics — the `'runner'` engine, and what the library used before it had one of its own. */
function createRunnerMockFn(implementation?: Func, name?: string): MockFn {
  const mock = implementation ? vi.fn(implementation) : vi.fn();

  if (name !== undefined) {
    mock.mockName(name);
  }

  return mock;
}

/** The adapter's own mock factory, as a plain function the accessor wiring below can hand around. */
function createAdapterMockFn(implementation?: Func, name?: string): MockFn {
  return getSpyEngine() === 'auto-spy' ? createFastSpy(implementation, name) : createRunnerMockFn(implementation, name);
}

export const vitestMockAdapter: MockAdapter = guardAccessorSpies({
  createMockFn: createAdapterMockFn,

  /**
   * Accessor spies are installed by redefining the property, **not** with `vi.spyOn`.
   *
   * `vi.spyOn` is the only call in this package that writes to `@vitest/spy`'s `MOCK_RESTORE` set,
   * and `restoreMocks: true` empties that set in `onBeforeTryTask` — which runs *before* the
   * `beforeEach` hooks, but after `beforeAll` and after a `describe` body. A double built anywhere
   * but a `beforeEach` therefore had its spied accessors put back to the no-op scaffolding before
   * the test body ran, while `accessorSpies.getters.x` stayed a live mock nobody was reading any
   * more: `mockReturnValue` kept working and the property kept answering `undefined`. That is a
   * configuration that silently stops applying — the failure mode this package exists to remove —
   * and it read as a bug in the code under test, not in the spec.
   *
   * Redefining instead puts accessor spies on the same footing as the `mock*Prop` helpers, which
   * keep their own journal (`restoreMockedProps()`) and were never affected, and on the same
   * footing as the Bun and `node:test` adapters, which have no native accessor spy and have always
   * gone through {@link spyOnAccessorByRedefine}. Nothing is lost: the only target this seam is
   * ever given is an object this library has just built or has already journaled itself, so there
   * was never an original for the runner to restore. `vi.clearAllMocks()` / `vi.resetAllMocks()`
   * still reach these spies — through the sweep sentinel above under the `'auto-spy'` engine, and
   * through the runner's own registry under `'runner'`.
   */
  spyOnGetter(target: object, property: string): MockFn {
    return spyOnAccessorByRedefine(createAdapterMockFn, target, property, 'get');
  },

  spyOnSetter(target: object, property: string): MockFn {
    return spyOnAccessorByRedefine(createAdapterMockFn, target, property, 'set');
  },

  getCalls(mock: MockFn): readonly unknown[][] {
    return asVitestMock(mock).mock.calls;
  },

  reset(mock: MockFn): void {
    asVitestMock(mock).mockReset();
  },

  clear(mock: MockFn): void {
    asVitestMock(mock).mockClear();
  },

  restoreImplementation(mock: MockFn, implementation: Func): void {
    asVitestMock(mock).mockImplementation(implementation);
  },
});
