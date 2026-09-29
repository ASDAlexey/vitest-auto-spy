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
import { afterEach, beforeEach, vi } from 'vitest';

import type { MockAdapter } from './mock-adapter';
import type { RunnerHooks } from './runner-hooks';
import { createVitestMockAdapter } from './vitest-runner-adapter';

export { getSpyEngine, setSpyEngine, type SpyEngine } from './spy-engine';

export const vitestMockAdapter: MockAdapter = createVitestMockAdapter(vi);

export const vitestRunnerHooks: RunnerHooks = { beforeEach, afterEach };
