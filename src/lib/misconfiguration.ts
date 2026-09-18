/**
 * On `globalThis`: the core, `/angular` and `/setup` are separate bundles, and the grade `setupAutoSpy`
 * sets has to reach the factories every one of them carries.
 */
import { libraryWarn } from './guard-reaction';

/** How the library reports a configuration of its own API that cannot do what it says. */
export type MisconfigurationReaction = 'throw' | 'warn';

declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyMisconfiguration__: MisconfigurationReaction | undefined;
}

/** Set the grade for every bundle in the process; `undefined` goes back to the default, `'warn'`. */
export function setMisconfigurationReaction(reaction: MisconfigurationReaction | undefined): void {
  globalThis.__vitestAutoSpyMisconfiguration__ = reaction;
}

/** Whether a report should fail at the call site — and skip any de-duplication, since a throw is seen once by definition. */
export function misconfigurationThrows(): boolean {
  return globalThis.__vitestAutoSpyMisconfiguration__ === 'throw';
}

/** Fail with the message, or print it, according to the grade. */
export function reportMisconfiguration(message: string): void {
  if (misconfigurationThrows()) {
    throw new Error(message);
  }

  // Through the library's own channel: `strayConsole` watches `console.warn`, and a report printed
  // there failed the test it was advising — see {@link libraryWarn}.
  libraryWarn(message);
}
