/**
 * Shared internal constants.
 */

/**
 * Buffer size used for every internal `ReplaySubject`.
 *
 * `1` means "replay the last emitted value to late subscribers", which is what
 * lets a configured spy emit a value *before* the consumer subscribes.
 */
export const REPLAY_BUFFER_SIZE = 1;

/**
 * Marks the one mock that must never leave `@vitest/spy`'s registry.
 *
 * The Vitest adapter registers a single `vi.fn()` whose `mockClear` sweeps this library's own
 * spies — the only way a run-wide `vi.clearAllMocks()` can reach a spy that is not the runner's.
 * {@link pruneMockRegistry} would otherwise treat it as any other mock and drop it at the end of
 * the file that happened to create it, and the sweep would then silently stop happening: mocks stop
 * being cleared between tests, and the suite fails somewhere else entirely.
 *
 * `Symbol.for`, so the mark survives a second copy of this module — which is exactly the situation
 * (`isolate: false` plus a `vi.resetModules()`) where the prune and the sentinel can come from
 * different copies.
 */
export const SWEEP_SENTINEL = Symbol.for('vitest-auto-spy.sweepSentinel');
