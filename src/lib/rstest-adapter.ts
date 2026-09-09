/**
 * The Rstest (`@rstest/core`) {@link MockAdapter}, built as a factory.
 *
 * Like the Bun and Node adapters, this module never imports the runner — the
 * `vitest-auto-spy/rstest` entry supplies Rstest's own utilities via
 * {@link createRstestMockAdapter}, which also keeps the factory unit-testable
 * with a stub off the real runner.
 *
 * Rstest's mock surface is Vitest-shaped — bare argument arrays in `mock.calls`,
 * `mockClear` / `mockReset` / `mockImplementation`, native accessor spies through
 * `spyOn(obj, key, 'get' | 'set')` — so the mapping is one-to-one.
 */
import { clearAllFastSpies, createFastSpy, resetAllFastSpies } from './fast-spy';
import { type MockAdapter, type MockFn, guardAccessorSpies } from './mock-adapter';
import { getSpyEngine } from './spy-engine';
import type { Func } from './types';

/** A Rstest mock function — the surface this adapter relies on. */
export interface RstestMock {
  (...args: unknown[]): unknown;
  mockName(name: string): unknown;
  mock: { calls: readonly unknown[][] };
  mockClear(): unknown;
  mockReset(): unknown;
  mockImplementation(implementation: Func): unknown;
}

/** The slice of Rstest's utilities the Rstest entry injects. */
export interface RstestApi {
  fn(implementation?: Func): RstestMock;
  spyOn(target: object, property: string, accessType: 'get' | 'set'): RstestMock;
}

/** View a runtime-agnostic {@link MockFn} as the concrete Rstest mock it actually is here. */
function asRstestMock(mock: MockFn): RstestMock {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- every `MockFn` this adapter hands out is a `rstest.fn()` / `rstest.spyOn()`; the registry type is intentionally runtime-agnostic, so reading `.mock`/resetting narrows the bare callable back to the concrete Rstest mock.
  return mock as any;
}

/** A `rstest.fn()`, named for diagnostics — the `'runner'` engine. */
function createRunnerMockFn(rstest: RstestApi, implementation?: Func, name?: string): MockFn {
  const mock = rstest.fn(implementation);

  if (name !== undefined) {
    mock.mockName(name);
  }

  return mock;
}

/** Build a Rstest {@link MockAdapter} from the runner's own utilities. */
export function createRstestMockAdapter(rstest: RstestApi): MockAdapter {
  /**
   * How a run-wide `rstest.clearAllMocks()` reaches spies that are not the runner's.
   *
   * Rstest walks every mock it created — called or not — so a `rstest.fn()` of our own whose
   * `mockClear` / `mockReset` sweep this library's fast spies turns the runner's walk into a
   * sweep of ours. Unlike the Vitest sentinel it needs no bootstrap call and no never-prune
   * guard: Rstest reaches never-called mocks, and the mock-registry pruner is Vitest-only and
   * never loads here.
   */
  const sweepSentinel = rstest.fn();

  sweepSentinel.mockClear = function clearAllMocksSweep(): RstestMock {
    clearAllFastSpies();

    return sweepSentinel;
  };

  sweepSentinel.mockReset = function resetAllMocksSweep(): RstestMock {
    resetAllFastSpies();

    return sweepSentinel;
  };

  return guardAccessorSpies({
    createMockFn(implementation?: Func, name?: string): MockFn {
      return getSpyEngine() === 'auto-spy' ? createFastSpy(implementation, name) : createRunnerMockFn(rstest, implementation, name);
    },

    spyOnGetter(target: object, property: string): MockFn {
      return rstest.spyOn(target, property, 'get');
    },

    spyOnSetter(target: object, property: string): MockFn {
      return rstest.spyOn(target, property, 'set');
    },

    getCalls(mock: MockFn): readonly unknown[][] {
      return asRstestMock(mock).mock.calls;
    },

    reset(mock: MockFn): void {
      asRstestMock(mock).mockReset();
    },

    clear(mock: MockFn): void {
      asRstestMock(mock).mockClear();
    },

    restoreImplementation(mock: MockFn, implementation: Func): void {
      asRstestMock(mock).mockImplementation(implementation);
    },
  });
}
