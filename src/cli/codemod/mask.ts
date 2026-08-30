/**
 * The lexical pass every transform in the codemod is built on.
 *
 * A codemod that matches its patterns against raw source rewrites the sentence in the comment that
 * explains the migration, and the string literal in the assertion that asserts on it. Neither
 * failure is loud: the file still compiles, and the diff looks plausible. So every pattern here is
 * matched against a **mask** — the same string, the same length, with the *contents* of comments,
 * strings, template literals and regular expressions replaced by spaces. Offsets found in the mask
 * are valid in the original, which is what makes "find in the mask, slice from the source" safe.
 *
 * The mask keeps the delimiters (`'`, `"`, `` ` ``), so an import specifier is still findable: the
 * quote is matched in the mask and the text between the quotes is read from the source.
 */

/**
 * Line comment, block comment, the three string forms, then a regular expression literal. Order is
 * the disambiguation: at a given offset the first alternative that matches wins, so `// don't` is a
 * comment rather than the start of a string. A string alternative stops at a newline, so an
 * apostrophe that survived masking cannot swallow the rest of the file.
 */
const TOKENS =
  /\/\/[^\n]*|\/\*[\S\s]*?\*\/|'(?:\\.|[^\n'\\])*'|"(?:\\.|[^\n"\\])*"|`(?:\\.|[^\\`])*`|\/(?![*/])(?:\\.|\[(?:\\.|[^\\\]])*]|[^\n/[\\])+\/[a-z]*/g;

/** A `/` after a value is division, after anything else it opens a regular expression. */
function isRegexPosition(source: string, offset: number): boolean {
  for (let index = offset - 1; index >= 0; index -= 1) {
    const char = source.charAt(index);

    if (!/\s/.test(char)) {
      return !/[\w$)\]]/.test(char);
    }
  }

  return true;
}

/** Same length, same line breaks, no content. */
function blank(token: string): string {
  return token.replace(/[^\n]/g, ' ');
}

/**
 * A string keeps its quotes. That is what lets an import specifier still be *found* in the mask —
 * the quote is matched there and the text between the quotes is read from the source — while its
 * contents cannot be mistaken for code.
 */
function blankInside(token: string): string {
  return `${token.slice(0, 1)}${blank(token.slice(1, -1))}${token.slice(-1)}`;
}

export interface MaskOptions {
  /**
   * Which of the two views to build.
   *
   * `code` is what every transform matches against: comments and every literal are blank, so a
   * rewrite can never touch the sentence in a comment or the text of an assertion.
   *
   * `residue` is what the after-the-fact check matches against, and it differs in exactly two
   * places, both because the thing it is looking for lives inside a literal. A module specifier
   * stays visible, because `from 'jest-auto-spies'` is the leftover. A template literal stays
   * visible, because the transforms decline to edit inside one and a `jest.` left there is real. An
   * ordinary string stays blank — `expect(text).toBe('jest.spyOn(…)')` is prose about the migration,
   * not a thing to migrate.
   */
  readonly view: 'code' | 'residue';
}

/** The quoted argument of `from`, `import` or `require` — the only string this codemod is about. */
function isModuleSpecifier(source: string, offset: number): boolean {
  return /\b(?:from|import|require)\s*\(?\s*$/.test(source.slice(Math.max(0, offset - 40), offset));
}

export function buildMask(source: string, options: MaskOptions): string {
  return source.replace(TOKENS, (token: string, offset: number): string => {
    const comment = token.startsWith('//') || token.startsWith('/*');

    if (!comment && token.startsWith('/') && !isRegexPosition(source, offset)) {
      return token;
    }

    if (comment || options.view === 'code') {
      return comment ? blank(token) : maskLiteral(token);
    }

    return token.startsWith('`') || isModuleSpecifier(source, offset) ? token : maskLiteral(token);
  });
}

function maskLiteral(token: string): string {
  return /^["'`]/.test(token) ? blankInside(token) : blank(token);
}

/** The view the transforms match against: code only. */
export function maskCode(source: string): string {
  return buildMask(source, { view: 'code' });
}

/** The view the residue check matches against: code, template literals and module specifiers. */
export function maskComments(source: string): string {
  return buildMask(source, { view: 'residue' });
}

const PAIRS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}', '<': '>' };

/**
 * The index just past the bracket closing the one at `open`, or `undefined` when the source is
 * unbalanced — in which case the caller must leave the region alone rather than guess where it ends.
 *
 * `=>` is skipped as a unit. Without that, `jest.Mock<() => void, []>` closes its type-argument list
 * at the arrow, and the rewrite silently takes half the type.
 */
export function matchBracket(masked: string, open: number): number | undefined {
  const openChar = masked.charAt(open);
  const closeChar = PAIRS[openChar];

  if (closeChar === undefined) {
    return undefined;
  }

  let depth = 0;

  for (let index = open; index < masked.length; index += 1) {
    const char = masked.charAt(index);

    if (char === '=' && masked.charAt(index + 1) === '>') {
      index += 1;

      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;

      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return undefined;
}

/** Half-open `[start, end)` index ranges into the source. */
export type Range = readonly [number, number];

/**
 * The comma-separated parts of `masked[start, end)` that are at nesting depth zero. Used for a type
 * argument list and for a tuple's elements — the two places where "the second one" has to be the
 * second one and not the second comma.
 */
export function splitTopLevel(masked: string, start: number, end: number): Range[] {
  const parts: Range[] = [];
  let depth = 0;
  let from = start;

  for (let index = start; index < end; index += 1) {
    const char = masked.charAt(index);

    if (char === '=' && masked.charAt(index + 1) === '>') {
      index += 1;
    } else if (PAIRS[char] !== undefined) {
      depth += 1;
    } else if (char === ')' || char === ']' || char === '}' || char === '>') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      parts.push([from, index]);
      from = index + 1;
    }
  }

  const [tailFrom, tailTo] = trimmed(masked, [from, end]);

  if (parts.length === 0 && tailFrom === tailTo) {
    return [];
  }

  return [...parts, [from, end]];
}

/** `range` with leading and trailing whitespace dropped. */
export function trimmed(text: string, [start, end]: Range): Range {
  let from = start;
  let to = end;

  while (from < to && /\s/.test(text.charAt(from))) {
    from += 1;
  }

  while (to > from && /\s/.test(text.charAt(to - 1))) {
    to -= 1;
  }

  return [from, to];
}

/** The 1-based line number of an index, for a report line a person can jump to. */
export function lineOf(source: string, index: number): number {
  let line = 1;

  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charAt(cursor) === '\n') {
      line += 1;
    }
  }

  return line;
}
