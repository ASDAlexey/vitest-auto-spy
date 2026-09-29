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

  return QUOTES.has(char) ? findStringEnd(source, index) : endOfTemplate(source, index);
}

/** The only characters a span can open with; everything between two of them is code. */
const SPAN_OPENER = /["'/`]/g;

let lastSource: string | undefined;
let lastSpans: readonly Span[] = [];

/**
 * Every non-code span of a file, in order and disjoint. The last answer is kept: the doctor hands
 * one text to several checks in a row, and each asks for the same spans.
 */
export function literalSpans(source: string): readonly Span[] {
  if (source === lastSource) {
    return lastSpans;
  }

  const spans: Span[] = [];
  let index = 0;

  while (index < source.length) {
    SPAN_OPENER.lastIndex = index;

    const opener = SPAN_OPENER.exec(source);

    if (opener === null) {
      break;
    }

    const end = spanEnd(source, opener.index);

    if (end === -1) {
      index = opener.index + 1;

      continue;
    }

    spans.push({ start: opener.index, end });
    index = end;
  }

  lastSource = source;
  lastSpans = spans;

  return spans;
}

/** Whether a match at this offset is quoted or commented out rather than executed. */
export function isInsideLiteral(spans: readonly Span[], offset: number): boolean {
  return spans.some((span) => span.start <= offset && offset < span.end);
}

/** Every match of a global pattern that sits in code; the spans are only worked out when something matched. */
export function codeMatches(text: string, pattern: RegExp): RegExpExecArray[] {
  const matches = [...text.matchAll(pattern)];

  if (matches.length === 0) {
    return matches;
  }

  const spans = literalSpans(text);

  return matches.filter((match) => !isInsideLiteral(spans, match.index));
}

/** The text with every string, template and comment blanked out, offsets and line breaks kept. */
export function codeOnly(text: string): string {
  let result = '';
  let last = 0;

  for (const span of literalSpans(text)) {
    result += text.slice(last, span.start) + text.slice(span.start, span.end).replace(/[^\n]/g, ' ');
    last = span.end;
  }

  return result + text.slice(last);
}
