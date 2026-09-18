/**
 * The real timers, captured at import time, for the helpers whose own timeout is the assertion.
 *
 * A watchdog the code under test can stop is not a watchdog. `vi.useFakeTimers()` replaces
 * `setTimeout`, and a faked one never fires — the wait would then hang to the runner's own file
 * timeout, which is precisely the failure these timeouts exist to replace. Capturing at import time
 * is enough for that one, and it is not order-dependent in any way that matters: a fake clock is
 * installed from `beforeAll`/`beforeEach`, which the module graph is fully evaluated before.
 *
 * **A virtual watchdog would also race the source.** Under fake timers there is one clock and the
 * spec drives it, so `expectEmission(source$, { timeout: 200 })` followed by
 * `vi.advanceTimersByTime(5_000)` would fire at 200 ms and reject the stream the spec was about to
 * advance into. A timeout built on these is a wall-clock safety net, not a deadline the source has
 * to beat; the spec named "still resolves a stream a spec advances by hand" is the canary for it.
 *
 * **zone.js is the faker a capture alone does not escape.** It replaces `setTimeout` while it loads,
 * long before this module is imported, and the replacement picks its scheduler from `Zone.current`
 * at *call* time — so inside `fakeAsync` the watchdog lands in the virtual queue, and
 * `tick(1_500)` towards a `debounceTime(2_000)` rejects the very stream it was advancing. zone.js
 * keeps the untouched function under `__zone_symbol__setTimeout`, and that is the one a watchdog
 * wants. Without zone.js nothing changes.
 *
 * Nothing here imports anything: `zoneless.ts` reads these through the `/angular` entry, which has
 * to load without rxjs, and `expect-emission.ts` through the rxjs-free core.
 */

/** The function zone.js parked aside under `name`, or `patched` where no zone has replaced it. */
export function unpatchedTimer<T>(name: 'clearTimeout' | 'setTimeout', patched: T): T {
  const unpatched: unknown = Reflect.get(globalThis, `__zone_symbol__${name}`);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- zone.js parks the global it replaced under this name, so it is the same function the fallback binds.
  return typeof unpatched === 'function' ? (unpatched.bind(globalThis) as T) : patched;
}

export const unpatchedSetTimeout: typeof setTimeout = unpatchedTimer('setTimeout', globalThis.setTimeout.bind(globalThis));
export const unpatchedClearTimeout: typeof clearTimeout = unpatchedTimer('clearTimeout', globalThis.clearTimeout.bind(globalThis));
