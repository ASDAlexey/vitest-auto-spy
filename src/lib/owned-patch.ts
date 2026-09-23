/**
 * Mark a function this library installed over a global, so the library's own restores can step
 * around it.
 *
 * `trackStrayTimers()` replaces `setTimeout` and its cancellers; `trackStrayListeners()` replaces
 * `addEventListener`. A file-scope restore that puts every global's original descriptor back would
 * uninstall those wrappers at the first file boundary — the tracking dies with file one, exactly
 * the leak it exists to catch. The restore therefore checks the value it is about to replace
 * against this mark and leaves a wrapped global to the wrapper's own undo.
 *
 * A `WeakSet`, so marking a wrapper costs nothing once the wrapper is dropped: an uninstall that
 * happened for real is forgotten along with the function.
 */

/** The functions this library currently has installed over somebody else's global. */
const owned: WeakSet<object> = new WeakSet();

/**
 * Say this function is a wrapper of ours — call it where the wrapper is installed, not where it is
 * created, so a wrapper a later refactor keeps but never installs is not marked.
 */
export function markOwnedPatch(fn: object): void {
  owned.add(fn);
}

/** Whether `value` is a wrapper this library installed — `false` for everything else, primitives included. */
export function isOwnedPatch(value: unknown): boolean {
  return typeof value === 'function' && owned.has(value);
}
