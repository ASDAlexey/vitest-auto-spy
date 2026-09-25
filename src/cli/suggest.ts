function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (const [row, left] of [...a].entries()) {
    const current = [row + 1];

    for (const [column, right] of [...b].entries()) {
      current.push(
        Math.min(Number(previous[column + 1]) + 1, Number(current[column]) + 1, Number(previous[column]) + (left === right ? 0 : 1)),
      );
    }

    previous = current;
  }

  return Number(previous[b.length]);
}

/** The candidate a typo most likely meant, or `undefined` when none is close enough to guess. */
export function nearest(input: string, candidates: readonly string[]): string | undefined {
  const typed = input.toLowerCase();
  const limit = Math.max(2, Math.floor(typed.length / 3));
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: candidate.startsWith(typed) && typed.length >= 3 ? 0 : distance(typed, candidate.toLowerCase()),
    }))
    .filter((entry) => entry.score <= limit)
    .sort((a, b) => a.score - b.score);

  return ranked[0]?.candidate;
}
