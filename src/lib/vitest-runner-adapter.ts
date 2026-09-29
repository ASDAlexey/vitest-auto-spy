/**
 * The Vitest {@link MockAdapter}, built from whichever `vi` the caller holds: the static import in
 * `vitest-adapter.ts`, or the one Vitest publishes on `globalThis` for entries that must not import
 * `vitest` themselves (`/console`, `/nestjs`).
 */
import { SWEEP_SENTINEL } from './constants';
import { type MockAdapter, hasMockAdapter, registerMockAdapter } from './mock-adapter';
import { isFunction, vitestModule } from './runner-hooks';
import { type RunnerMock, createRunnerMockAdapter } from './runner-mock-adapter';
import type { Func } from './types';

/** The slice of Vitest's `vi` the adapter needs. */
export interface VitestFnHost {
  fn(implementation?: Func): RunnerMock;
}

/**
 * Vitest clears every mock by walking a registry inside `@vitest/spy` that only `vi.fn()` and
 * `vi.spyOn()` write to, so one `vi.fn()` of our own carries the sweep — for `clearMocks: true` and
 * `mockReset: true` in a config just as much as for a hand-written `vi.clearAllMocks()`.
 */
function prepareVitestSentinel(sentinel: RunnerMock): void {
  // Never pruned — see `SWEEP_SENTINEL`. Without this the sweep stops the moment the file that first
  // built it ends, in exactly the `isolate: false` runs where it matters most.
  Object.defineProperty(sentinel, SWEEP_SENTINEL, { value: true, enumerable: false, configurable: true });

  // Invoked once, on purpose: Vitest 5's `clearAllMocks()` walks only the mocks called since the last
  // clear, and the overridden `mockClear` never un-dirties it, so this keeps it reachable for good.
  sentinel();
}

export function createVitestMockAdapter(vi: VitestFnHost): MockAdapter {
  return createRunnerMockAdapter({
    fn: (implementation) => (implementation ? vi.fn(implementation) : vi.fn()),
    prepareSentinel: prepareVitestSentinel,
  });
}

function vitestFnHost(host: object): VitestFnHost | undefined {
  const vi: unknown = Reflect.get(Object(vitestModule(host)), 'vi');

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `__vitest_index__` is the `vitest` module itself, whose `vi.fn` is exactly this.
  return isFunction(Reflect.get(Object(vi), 'fn')) ? (vi as VitestFnHost) : undefined;
}

/**
 * What a runner-agnostic entry does on import instead of `useVitestAdapter()`: an adapter a runtime
 * entry registered stays, and on Vitest the default adapter is built from the runner's own `vi`.
 */
export function useRunnerAdapter(host: object = globalThis): void {
  if (hasMockAdapter()) {
    return;
  }

  const vi = vitestFnHost(host);

  if (vi) {
    registerMockAdapter(createVitestMockAdapter(vi));
  }
}
