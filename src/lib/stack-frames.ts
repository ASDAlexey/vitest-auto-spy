const FOREIGN_FRAME = /node_modules|node:internal|\(node:/;

/**
 * This package's own built files. The per-module filters name source files, and the bundle has none,
 * so without this a report built from dist quoted the tracking wrapper instead of the caller.
 */
const LIBRARY_FRAME = /[/\\]vitest-auto-spy[/\\]dist[/\\]|[/\\]\.vite[/\\]deps[^/\\]*[/\\]vitest-auto-spy[^/\\]*\.js/;

/** The `vi.defineHelper` wrapper around this package's trackers: it is inside Vitest, not the caller. */
const HELPER_FRAME = /\b__VITEST_HELPER__\b/;

/** This package's built code, or the `vi.defineHelper` wrapper Vitest puts around it. */
export function isLibraryFrame(frame: string): boolean {
  return LIBRARY_FRAME.test(frame) || HELPER_FRAME.test(frame);
}

/** The `at …` lines of a V8 stack, trimmed; a stack in another format yields none. */
export function stackFrames(stack: string | undefined): string[] {
  return String(stack)
    .split('\n')
    .filter((line) => /^\s*at\s/.test(line))
    .map((line) => line.trim());
}

/**
 * Up to `limit` frames outside dependencies; failing that, dependency frames other than this
 * package's and its `defineHelper` wrappers; failing that, the first `limit` as they are.
 */
export function ownFrames(frames: readonly string[], limit: number): string[] {
  const outside = frames.filter((frame) => !isLibraryFrame(frame));
  const own = outside.filter((frame) => !FOREIGN_FRAME.test(frame));

  const shown = [own, outside].find((candidates) => candidates.length > 0) ?? frames;

  return shown.slice(0, limit);
}
