// The mutable state behind the emission helpers — the default timeout, and the register of waits
// that are still open. It lives apart from `expect-emission.ts` so the build can pin 0.3 kB of
// state into `dist/shared-state.js` instead of the whole 10 kB helper, and so `setupAutoSpy()` can
// sweep the register from its teardown without pulling the helper into the setup entry.

let defaultTimeoutMs = 1000;

/**
 * Change the wait every emission helper uses when a call does not name one. Process-wide; belongs
 * in a setup file, next to `setupAutoSpy()`.
 *
 * It exists for one shape, and that shape is common enough to deserve a knob: a suite running under
 * **global fake timers**. The watchdog in `expect-emission.ts` deliberately runs on the real clock,
 * so a *failing* assertion in such a suite spends a real second before it reports — and the reflex
 * that produces, `{ timeout: 0 }` at every call site, is the worst of the options: it disables the
 * watchdog, so the next silent stream hangs until the runner's own timeout with no message worth
 * reading. One line here instead:
 *
 * ```ts
 * // vitest.setup.ts
 * setupAutoSpy({ globalFakeTimers: true });
 * setEmissionTimeout(100); // the clock is frozen; a real second buys nothing
 * ```
 *
 * 100 ms of *real* time is a large budget under fake timers, where the only real time that can pass
 * is the microtask/macrotask drain between `await`s — nothing that waits on the clock can advance
 * without the spec advancing it. Leave the default alone in a suite with real timers.
 *
 * `expectNoEmission` is unaffected: its wait is a quiet window, not a watchdog, and it defaults to
 * one macrotask.
 */
export function setEmissionTimeout(milliseconds: number): void {
  // `NaN` used to be accepted and then silently disabled every watchdog in the run — the failure
  // this whole module exists to prevent, installed by the line meant to tune it.
  if (Number.isNaN(milliseconds) || milliseconds < 0) {
    throw new Error(
      `[vitest-auto-spy] setEmissionTimeout(${String(milliseconds)}) needs a non-negative number of milliseconds. ` +
        'Use `0` to disable the watchdog, or `Infinity` to wait as long as the runner allows.',
    );
  }

  defaultTimeoutMs = milliseconds;
}

/** The current process-wide default, read at call time so `setEmissionTimeout()` is never missed. */
export function emissionTimeout(): number {
  return defaultTimeoutMs;
}

/**
 * One emission helper that was still waiting when its test ended.
 *
 * The shape a helper registers while it holds a subscription, and the one thing `setupAutoSpy()`
 * needs in order to close it: a promise nobody awaited keeps its subscription live into the *next*
 * test, where a cold HTTP stream or `router.events` goes on feeding it, and its watchdog then
 * rejects — unhandled, blamed on an innocent test.
 */
export interface PendingEmissionWait {
  /** How a failure would have named the source: the call's `label`, or "the observable". */
  readonly describe: string;
  /** Unsubscribe and clear the watchdog. The promise is left unsettled: its test is already over. */
  readonly abandon: () => void;
}

const pendingWaits = new Set<PendingEmissionWait>();

/** Announce a wait for as long as it holds a subscription — `expect-emission.ts` pairs it with {@link forgetEmissionWait}. */
export function registerEmissionWait(wait: PendingEmissionWait): void {
  pendingWaits.add(wait);
}

/** Drop a wait that settled on its own. */
export function forgetEmissionWait(wait: PendingEmissionWait): void {
  pendingWaits.delete(wait);
}

/**
 * Tear down every emission wait still open, and say what they were waiting for.
 *
 * Belongs in an `afterEach`, which is where `setupAutoSpy()` calls it. A non-empty result means a
 * helper's promise was never awaited — the test passed without the assertion it was written around.
 */
export function abandonEmissionWaits(): string[] {
  if (pendingWaits.size === 0) {
    return [];
  }

  const abandoned = [...pendingWaits];

  pendingWaits.clear();
  abandoned.forEach((wait) => wait.abandon());

  return abandoned.map((wait) => wait.describe);
}
