/**
 * Which factory a double's method spies come out of, shared by every adapter
 * that has a runner mock to fall back to.
 *
 * `'auto-spy'` — this library's own, the default and the one every published number is measured on.
 * `'runner'` — the host's own mock (`vi.fn()` on Vitest, `rstest.fn()` on Rstest), method for method,
 * as every release before 4.1 built them.
 *
 * The switch exists for the one thing the two do not share: `mock.invocationCallOrder` is a different
 * scale in each, so `expect(a).toHaveBeenCalledBefore(b)` across an auto-spy and a hand-written
 * runner mock compares two counters that never met. Everything else behaves identically, and the
 * suites pin that by putting the two side by side.
 */
export type SpyEngine = 'auto-spy' | 'runner';

// On `globalThis`: `setSpyEngine` from `/setup` has to reach the adapter another bundle registered.
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyEngine__: { engine: SpyEngine } | undefined;
}

let sharedEngine: { engine: SpyEngine } | undefined;

function engineHolder(): { engine: SpyEngine } {
  return (sharedEngine ??= globalThis.__vitestAutoSpyEngine__ ??= { engine: 'auto-spy' });
}

/** Build every method spy from `engine` from here on. Doubles already built keep the engine they were built with. */
export function setSpyEngine(next: SpyEngine): void {
  engineHolder().engine = next;
}

/** The engine every double built from here on will use. */
export function getSpyEngine(): SpyEngine {
  return engineHolder().engine;
}
