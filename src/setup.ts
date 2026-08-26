/**
 * `vitest-auto-spy/setup` — one call for a project's test-run hygiene.
 *
 * ```ts
 * // vitest.setup.ts
 * import { setupAutoSpy } from 'vitest-auto-spy/setup';
 *
 * setupAutoSpy();
 * ```
 *
 * Everything here registers runner hooks, which is why none of it lives in the main entry: a spec
 * that imports a spy factory must not acquire an `afterEach` as a side effect. The two halves differ
 * in scope, not in kind — `setupAutoSpy()` belongs in the project's setup file and covers the whole
 * run; `setupFakeTimers()` belongs inside the one `describe` that needs a frozen clock.
 *
 * ```ts
 * // some.spec.ts
 * import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';
 * ```
 */
import { useVitestAdapter } from './lib/use-vitest-adapter';

useVitestAdapter();

export { setupAutoSpy, type DuplicateCopiesReaction, type SetupAutoSpyOptions } from './lib/setup-auto-spy';
export { advanceTimers, setupFakeTimers, type FakeTimersConfig } from './lib/fake-timers';
export { describeDuplicateCopies, getPackageCopies } from './lib/package-identity';
export { cancelStrayTimers, countStrayTimers, trackStrayTimers, type SchedulerHost, type StopTrackingTimers } from './lib/stray-timers';
export { getWatchedTimerGlobals, restoreTimerGlobals } from './lib/timer-globals';
export { BLOCKED_FETCH_MESSAGE, blockNetwork } from './lib/network-stub';
