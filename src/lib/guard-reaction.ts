/** How a per-test guard reacts to what it found: fail the test, only report it, or not run at all. */
export type GuardReaction = 'off' | 'throw' | 'warn';

/**
 * The two maps of the stray-console guard this module reads.
 *
 * Read off `globalThis` structurally rather than through `stray-console`'s own type: the guard is
 * armed only by `setupAutoSpy({ strayConsole })`, and every module that reports a finding — the
 * factory bundles included — would otherwise pull the whole guard in behind one `console.warn`.
 */
interface StrayConsoleChannel {
  readonly originals: ReadonlyMap<string, unknown>;
  readonly sentinels: ReadonlyMap<string, unknown>;
}

function strayConsoleGuard(): StrayConsoleChannel | undefined {
  const guard: unknown = Reflect.get(globalThis, '__vitestAutoSpyStrayConsole__');
  const originals: unknown = Reflect.get(Object(guard), 'originals');
  const sentinels: unknown = Reflect.get(Object(guard), 'sentinels');

  return originals instanceof Map && sentinels instanceof Map ? { originals, sentinels } : undefined;
}

/**
 * Print one of this library's own reports, past the stray-console guard.
 *
 * Every `'warn'` grade the library offers — `propsOutsideHooks`, `guardGlobals`, `prototypePollution`,
 * `unconfiguredReads` — writes through `console.warn`, and `strayConsole` watches exactly that. A
 * suite running both therefore failed on the library's own advice: the finding arrived as "this test
 * wrote to the console and nothing absorbed it", quoting three truncated lines of it and pointing at
 * a frame inside `dist/`. `'warn'` and `'throw'` then meant the same thing, which is not what the
 * grade says.
 *
 * The real `console.warn` the guard replaced is the channel that stays honest: the report is printed
 * where the reader expects it, and the guard never sees a call it did not come from the suite.
 */
export function libraryWarn(message: string): void {
  const guard = strayConsoleGuard();
  const original: unknown = guard?.originals.get('warn');

  // Only the guard's own wrapper is stepped over. A spy the test installed on top of it absorbs this
  // report as it absorbs any other — which is what a suite asserting on the library's warnings wants,
  // and the guard never sees a call the spy took.
  // eslint-disable-next-line no-console -- reading the method to compare it with the wrapper the guard installed.
  if (typeof original === 'function' && guard?.sentinels.get('warn') === console.warn) {
    Reflect.apply(original, globalThis.console, [message]);

    return;
  }

  // eslint-disable-next-line no-console -- nothing is guarding the console, so the ordinary channel is the right one.
  console.warn(message);
}

/** Fail the test with every report joined, or print them without failing it; nothing found is a no-op. */
export function reactToFindings(found: readonly string[], reaction: GuardReaction): void {
  if (found.length === 0) {
    return;
  }

  if (reaction === 'throw') {
    throw new Error(found.join('\n'));
  }

  libraryWarn(found.join('\n'));
}
