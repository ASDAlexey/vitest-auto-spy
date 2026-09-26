/**
 * The default {@link MockAdapter}: Vitest's `vi.fn()`, plus accessor spies installed by redefining
 * the property.
 *
 * This is the only core module that imports `vitest`. It is pulled in solely by
 * the `vitest-auto-spy` (and `vitest-auto-spy/angular`) entries, which register
 * it on import — so a consumer that imports a different runtime entry never
 * pulls Vitest into their bundle.
 *
 * Accessors are not spied with `vi.spyOn`: that is the only call writing to `@vitest/spy`'s
 * `MOCK_RESTORE` set, and `restoreMocks: true` empties it before the `beforeEach` hooks — a double
 * built in a `beforeAll` or a `describe` body lost its spied accessors between configuration and
 * assertion. `vi.clearAllMocks()` / `vi.resetAllMocks()` still reach them — through the sweep
 * sentinel under the `'auto-spy'` engine, and through the runner's own registry under `'runner'`.
 */
import { vi } from 'vitest';

import { SWEEP_SENTINEL } from './constants';
import type { MockAdapter } from './mock-adapter';
import { type RunnerMock, createRunnerMockAdapter } from './runner-mock-adapter';
import type { Func } from './types';

export { getSpyEngine, setSpyEngine, type SpyEngine } from './spy-engine';

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

export const vitestMockAdapter: MockAdapter = createRunnerMockAdapter({
  fn: (implementation) => (implementation ? vi.fn(implementation) : vi.fn<Func>()),
  prepareSentinel: prepareVitestSentinel,
});
