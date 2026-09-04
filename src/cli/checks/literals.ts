/**
 * The spans of a source file that are not code: strings, template literals and comments.
 *
 * Both checks in this directory match a pattern against raw text, and text that merely *quotes* an
 * import statement or a helper call is not a defect — a codemod fixture, a docs generator, a
 * `describe` title and this package's own specs all contain one. Reporting it is the failure a
 * check whose selling point is zero false positives can least afford.
 *
 * Comments are scanned before quotes, because an apostrophe in prose (`doesn't`) would otherwise
 * open a string that swallows the rest of the file. Over-masking is the safe direction anyway: a
 * regular expression literal containing a quote is read here as a string, and a masked span can
 * only ever hide a finding, never invent one.
 */
import { findStringEnd } from '../fs-scan';

export interface Span {
  /** Inclusive index of the opening delimiter. */
  readonly start: number;
  /** Exclusive index just past the closing one. */
  readonly end: number;
}

const QUOTES = new Set(["'", '"']);
const BLOCK_END = '*/';

function endOfLineComment(source: string, start: number): number {
  const newline = source.indexOf('\n', start);

  return newline === -1 ? source.length : newline;
}

function endOfBlockComment(source: string, start: number): number {
  const close = source.indexOf(BLOCK_END, start + BLOCK_END.length);

  return close === -1 ? source.length : close + BLOCK_END.length;
}

/** The index just past the `}` closing a `${` interpolation, which may hold literals of its own. */
function endOfInterpolation(source: string, start: number): number {
  let depth = 1;
  let index = start;

  while (index < source.length) {
    const char = source.charAt(index);

    if (char === '`') {
      index = endOfTemplate(source, index);

      continue;
    }

    if (QUOTES.has(char)) {
      index = findStringEnd(source, index);

      continue;
    }

    if (char === '{') {
      depth += 1;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return index + 1;
      }
    }

    index += 1;
  }

  return source.length;
}

function endOfTemplate(source: string, start: number): number {
  let index = start + 1;

  while (index < source.length) {
    const char = source.charAt(index);

    if (char === '\\') {
      index += 2;

      continue;
    }

    if (char === '`') {
      return index + 1;
    }

    if (char === '$' && source.charAt(index + 1) === '{') {
      index = endOfInterpolation(source, index + 2);

      continue;
    }

    index += 1;
  }

  return source.length;
}

function spanEnd(source: string, index: number): number {
  const char = source.charAt(index);

  if (char === '/') {
    const next = source.charAt(index + 1);

    if (next === '/') {
      return endOfLineComment(source, index);
    }

    return next === '*' ? endOfBlockComment(source, index) : -1;
  }

  if (QUOTES.has(char)) {
    return findStringEnd(source, index);
  }

  return char === '`' ? endOfTemplate(source, index) : -1;
}

/** Every non-code span of a file, in order and disjoint. */
export function literalSpans(source: string): Span[] {
  const spans: Span[] = [];
  let index = 0;

  while (index < source.length) {
    const end = spanEnd(source, index);

    if (end === -1) {
      index += 1;

      continue;
    }

    spans.push({ start: index, end });
    index = end;
  }

  return spans;
}

/** Whether a match at this offset is quoted or commented out rather than executed. */
export function isInsideLiteral(spans: readonly Span[], offset: number): boolean {
  return spans.some((span) => span.start <= offset && offset < span.end);
}
