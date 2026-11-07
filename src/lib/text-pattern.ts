/**
 * Whether `pattern` occurs in `text`. `search` ignores `lastIndex`, so a global or sticky RegExp
 * answers the same on every call, where `test` would alternate.
 */
export function searchesPattern(pattern: RegExp, text: string): boolean {
  return text.search(pattern) !== -1;
}

/** Whether any entry matches: a string as a substring, a RegExp as a search. */
export function includesAnyPattern(text: string, patterns: readonly (RegExp | string)[]): boolean {
  return patterns.some((pattern) => (typeof pattern === 'string' ? text.includes(pattern) : searchesPattern(pattern, text)));
}
