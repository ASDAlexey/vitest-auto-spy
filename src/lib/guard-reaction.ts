/** How a per-test guard reacts to what it found: fail the test, only report it, or not run at all. */
export type GuardReaction = 'off' | 'throw' | 'warn';

/** Fail the test with every report joined, or print them without failing it; nothing found is a no-op. */
export function reactToFindings(found: readonly string[], reaction: GuardReaction): void {
  if (found.length === 0) {
    return;
  }

  if (reaction === 'throw') {
    throw new Error(found.join('\n'));
  }

  // eslint-disable-next-line no-console -- `'warn'` exists precisely to surface this without failing the run.
  console.warn(found.join('\n'));
}
