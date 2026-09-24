const FOREIGN_FRAME = /node_modules|node:internal|\(node:/;

/**
 * This package's own built files. The per-module filters name source files, and the bundle has none,
 * so without this a report built from dist quoted the tracking wrapper instead of the caller.
 */
const LIBRARY_FRAME = /[/\\]vitest-auto-spy[/\\]dist[/\\]|[/\\]\.vite[/\\]deps[^/\\]*[/\\]vitest-auto-spy[^/\\]*\.js/;

/** The `at …` lines of a V8 stack, trimmed; a stack in another format yields none. */
export function stackFrames(stack: string | undefined): string[] {
  return String(stack)
    .split('\n')
    .filter((line) => /^\s*at\s/.test(line))
    .map((line) => line.trim());
}

/**
 * Up to `limit` frames outside dependencies; failing that, dependency frames other than this
 * package's; failing that, the first `limit` as they are.
 */
export function ownFrames(frames: readonly string[], limit: number): string[] {
  const outside = frames.filter((frame) => !LIBRARY_FRAME.test(frame));
  const own = outside.filter((frame) => !FOREIGN_FRAME.test(frame));

  const shown = [own, outside].find((candidates) => candidates.length > 0) ?? frames;

  return shown.slice(0, limit);
}
