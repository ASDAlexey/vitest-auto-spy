/**
 * The default {@link MockAdapter}: Vitest's `vi.fn()` / `vi.spyOn()`.
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
import type { Func } from './types';

/** View a runtime-agnostic {@link MockFn} as the concrete Vitest mock it actually is here. */
function asVitestMock(mock: MockFn): Mock {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- every `MockFn` this adapter hands out is a `vi.fn()`; the registry type is intentionally runtime-agnostic, so reading `.mock`/resetting narrows the bare callable back to the concrete Vitest mock.
  return mock as any;
}

/**
 * How a run-wide `vi.clearAllMocks()` reaches spies that are not the runner's.
 *
 * Vitest clears every mock by walking one module-level `Set` inside `@vitest/spy` that only
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

/**
 * Which factory a double's method spies come out of.
 *
 * `'auto-spy'` — this library's own, the default and the one every published number is measured on.
 * `'runner'` — Vitest's `vi.fn()`, method for method, as every release before 4.1 built them.
 *
 * The switch exists for the one thing the two do not share: `mock.invocationCallOrder` is a
 * different scale in each, so `expect(a).toHaveBeenCalledBefore(b)` across an auto-spy and a
 * hand-written `vi.fn()` compares two counters that never met. Everything else — `vi.isMockFunction`,
 * every matcher, `vi.clearAllMocks()`, the whole `mockReturnValue` family — behaves identically, and
 * the suite pins that by putting the two side by side.
 */
export type SpyEngine = 'auto-spy' | 'runner';

let engine: SpyEngine = 'auto-spy';

/** Build every method spy from `engine` from here on. Doubles already built keep the engine they were built with. */
export function setSpyEngine(next: SpyEngine): void {
  engine = next;
}

/** The engine every double built from here on will use. */
export function getSpyEngine(): SpyEngine {
  return engine;
}

/** A `vi.fn()`, named for diagnostics — the `'runner'` engine, and what the library used before it had one of its own. */
function createRunnerMockFn(implementation?: Func, name?: string): MockFn {
  const mock = implementation ? vi.fn(implementation) : vi.fn();

  if (name !== undefined) {
    mock.mockName(name);
  }

  return mock;
}

export const vitestMockAdapter: MockAdapter = guardAccessorSpies({
  createMockFn(implementation?: Func, name?: string): MockFn {
    return engine === 'auto-spy' ? createFastSpy(implementation, name) : createRunnerMockFn(implementation, name);
  },

  spyOnGetter(target: object, property: string): MockFn {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `vi.spyOn`'s key parameter is typed against the static object shape, but `property` is only known at runtime; `as never` satisfies the accessor overload.
    return vi.spyOn(target as Record<string, unknown>, property as never, 'get');
  },

  spyOnSetter(target: object, property: string): MockFn {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see `spyOnGetter`: the key is a runtime-only string, narrowed via `as never` to satisfy `vi.spyOn`'s accessor overload.
    return vi.spyOn(target as Record<string, unknown>, property as never, 'set');
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
