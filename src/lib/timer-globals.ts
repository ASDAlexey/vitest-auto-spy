/**
 * Putting the timer globals back after the fakes come off.
 *
 * `vi.useRealTimers()` reads like the inverse of `vi.useFakeTimers()`, and in a plain Node realm it
 * is. Under a DOM environment it is not: `@sinonjs/fake-timers` restores a global by assigning the
 * original back **when it was an own property of the global object**, and deletes it otherwise. In
 * happy-dom (and any environment whose globals are inherited from its realm rather than defined on
 * `globalThis`) `Date` is not an own property, so uninstalling removes it outright.
 *
 * With `isolate: true` nothing notices — the next file gets a fresh environment. With
 * `isolate: false` the next file in the same worker meets a realm with no `Date` at all and dies
 * inside Vitest's own `useFakeTimers`, several files away from whatever installed the fakes:
 *
 * ```text
 * TypeError: Cannot read properties of undefined (reading 'now')
 *  ❯ hijackMethod node_modules/@sinonjs/fake-timers/src/fake-timers-src.js
 *  ❯ Object.useFakeTimers node_modules/vitest/dist/chunks/vi.js
 * ```
 *
 * So the real globals are captured once, at import time — before any spec has had the chance to
 * install fakes — and anything left `undefined` afterwards is put back. Only that: a value a spec
 * deliberately replaced is still there and must not be overwritten.
 */

/** Globals `vi.useFakeTimers()` can replace, and `vi.useRealTimers()` can delete instead of restore. */
const TIMER_GLOBALS = [
  'Date',
  'performance',
  'queueMicrotask',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
] as const;

// Reached through `Reflect` rather than an index signature: the names below carry the DOM *and*
// Node typings for the same global, so any interface written for them would need an assertion at
// the point where the real `globalThis` is handed over. `Reflect.get`/`set` take a plain `object`.
const environment: object = globalThis;

/**
 * The snapshot, taken while this module is first evaluated.
 *
 * Only globals that actually exist are recorded: `setImmediate` is absent in a browser environment
 * and `requestAnimationFrame` in a bare Node one, and re-creating either would hand the code under
 * test an API the real environment does not offer.
 */
const realTimerGlobals = new Map<string, unknown>(
  TIMER_GLOBALS.filter((name) => Reflect.get(environment, name) !== undefined).map((name) => [name, Reflect.get(environment, name)]),
);

/**
 * Restore any timer global that has gone missing.
 *
 * Safe to call at any point and as often as you like: a global that is still present is left alone,
 * so a spec's own replacement survives, and only an actual deletion is undone.
 */
export function restoreTimerGlobals(): void {
  for (const [name, value] of realTimerGlobals) {
    if (Reflect.get(environment, name) === undefined) {
      Reflect.set(environment, name, value);
    }
  }
}

/** The names this module watches — exported for the diagnostics that report what went missing. */
export function getWatchedTimerGlobals(): string[] {
  return [...realTimerGlobals.keys()];
}

/**
 * The `Date`-only fakes `mockSystemTime()` installs, remembered by identity.
 *
 * `vi.isFakeTimers()` answers "is *some* clock faked", and that one question used to decide two
 * different things: `setupFakeTimers()` skipped its own install when it found these, leaving
 * `setTimeout` real and `advanceTimers()` silently running nothing. Both helpers need to tell the
 * two sets apart, so the identity lives here, in the module they already share, on `globalThis` for
 * the same reason as the tracker registries — a `vi.resetModules()` must not forget it.
 */
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyDateOnlyFakes__: unknown;
}

/** Remember the `Date` a `Date`-only install left on the globals. */
export function markDateOnlyFakes(): void {
  globalThis.__vitestAutoSpyDateOnlyFakes__ = globalThis.Date;
}

/** Whether the fakes currently installed are the `Date`-only ones — i.e. no timer is faked at all. */
export function hasDateOnlyFakes(): boolean {
  return globalThis.__vitestAutoSpyDateOnlyFakes__ === globalThis.Date;
}

/** Forget them: something else has taken the clock over, or this call put it back. */
export function forgetDateOnlyFakes(): void {
  globalThis.__vitestAutoSpyDateOnlyFakes__ = undefined;
}
