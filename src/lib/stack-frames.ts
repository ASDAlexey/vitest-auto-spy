const FOREIGN_FRAME = /node_modules|node:internal|\(node:/;

/** The `at …` lines of a V8 stack, trimmed; a stack in another format yields none. */
export function stackFrames(stack: string | undefined): string[] {
  return String(stack)
    .split('\n')
    .filter((line) => /^\s*at\s/.test(line))
    .map((line) => line.trim());
}

/** Up to `limit` frames outside dependencies, or the first `limit` when every frame is a dependency. */
export function ownFrames(frames: readonly string[], limit: number): string[] {
  const own = frames.filter((frame) => !FOREIGN_FRAME.test(frame));

  return (own.length > 0 ? own : frames).slice(0, limit);
}
