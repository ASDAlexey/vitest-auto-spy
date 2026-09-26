/**
 * The {@link MockAdapter} shared by the runners whose mock surface is Vitest-shaped — Vitest itself
 * and Rstest: bare argument arrays in `mock.calls`, `mockClear` / `mockReset` / `mockImplementation`.
 *
 * Each runner supplies only its `fn()`; the engine switch, the accessor wiring and the sweep sentinel
 * live here. The sentinel is built on the adapter's first mock, never at import: Bun resolves
 * `vitest` to its own `vi`, whose mocks refuse a reassigned `mockClear`, so a sentinel built at
 * module scope crashed every Vitest entry imported after `vitest-auto-spy/bun`.
 */
import { clearAllFastSpies, createFastSpy, resetAllFastSpies } from './fast-spy';
import type { MockAdapter, MockFn } from './mock-adapter';
import { guardAccessorSpies, spyOnAccessorByRedefine } from './redefine-accessor-spy';
import { getSpyEngine } from './spy-engine';
import type { Func } from './types';

/** A runner mock function — the surface the shared adapter relies on. */
export interface RunnerMock {
  (...args: unknown[]): unknown;
  mockName(name: string): unknown;
  mock: { calls: readonly unknown[][] };
  mockClear(): unknown;
  mockReset(): unknown;
  mockImplementation(implementation: Func): unknown;
}

/** What a runner hands the shared adapter. */
export interface RunnerMockParts {
  /** The runner's own mock factory — the `'runner'` engine, and the sentinel's body. */
  fn(implementation?: Func): RunnerMock;
  /** Runner-specific setup of the sentinel, after its sweep is installed. */
  prepareSentinel?(sentinel: RunnerMock): void;
  /** Build the sentinel with the adapter rather than with its first mock. */
  eagerSentinel?: boolean;
}

/** View a runtime-agnostic {@link MockFn} as the concrete runner mock it actually is here. */
function asRunnerMock(mock: MockFn): RunnerMock {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- every `MockFn` this adapter hands out is the runner's `fn()` or one of this library's own spies, both Vitest-shaped; the registry type is intentionally runtime-agnostic.
  return mock as any;
}

/**
 * Turn a runner mock into the bridge a run-wide `clearAllMocks()` / `resetAllMocks()` crosses to
 * reach this library's own spies, which sit in no registry the runner walks.
 */
function buildSweepSentinel(sentinel: RunnerMock): RunnerMock {
  sentinel.mockClear = function clearAllMocksSweep(): RunnerMock {
    clearAllFastSpies();

    return sentinel;
  };

  sentinel.mockReset = function resetAllMocksSweep(): RunnerMock {
    resetAllFastSpies();

    return sentinel;
  };

  return sentinel;
}

/** Build a {@link MockAdapter} over a Vitest-shaped runner. */
export function createRunnerMockAdapter({ fn, prepareSentinel, eagerSentinel }: RunnerMockParts): MockAdapter {
  let sentinel: RunnerMock | undefined;

  const ensureSentinel = (): void => {
    if (!sentinel) {
      sentinel = buildSweepSentinel(fn());
      prepareSentinel?.(sentinel);
    }
  };

  // A fast spy only exists once this has run, so a sweep can never miss one the sentinel predates.
  const createMockFn = (implementation?: Func, name?: string): MockFn => {
    ensureSentinel();

    if (getSpyEngine() === 'auto-spy') {
      return createFastSpy(implementation, name);
    }

    const mock = fn(implementation);

    if (name !== undefined) {
      mock.mockName(name);
    }

    return mock;
  };

  if (eagerSentinel) {
    ensureSentinel();
  }

  return guardAccessorSpies({
    createMockFn,

    spyOnGetter(target: object, property: string): MockFn {
      return spyOnAccessorByRedefine(createMockFn, target, property, 'get');
    },

    spyOnSetter(target: object, property: string): MockFn {
      return spyOnAccessorByRedefine(createMockFn, target, property, 'set');
    },

    getCalls(mock: MockFn): readonly unknown[][] {
      return asRunnerMock(mock).mock.calls;
    },

    reset(mock: MockFn): void {
      asRunnerMock(mock).mockReset();
    },

    clear(mock: MockFn): void {
      asRunnerMock(mock).mockClear();
    },

    restoreImplementation(mock: MockFn, implementation: Func): void {
      asRunnerMock(mock).mockImplementation(implementation);
    },
  });
}
