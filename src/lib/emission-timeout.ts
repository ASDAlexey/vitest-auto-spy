// The one mutable cell behind `setEmissionTimeout()`. It lives apart from `expect-emission.ts` so
// the build can pin 0.3 kB of state into `dist/shared-state.js` instead of the whole 10 kB helper.

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
  defaultTimeoutMs = milliseconds;
}

/** The current process-wide default, read at call time so `setEmissionTimeout()` is never missed. */
export function emissionTimeout(): number {
  return defaultTimeoutMs;
}
