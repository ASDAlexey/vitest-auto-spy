/**
 * `JSON.parse` over a file that may legitimately contain comments and trailing commas — every
 * `tsconfig.json` does. Returns `undefined` when the text is not recoverable rather than throwing:
 * a doctor that dies on one malformed file reports nothing about the other 151.
 */
export function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(stripJsonComments(text));
  } catch {
    return undefined;
  }
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

/**
 * One pass, so a 5 MB `package-lock.json` costs linear time. A trailing comma is dropped only when
 * the next token is `]` or `}`, which leaves `",]"` inside a string value alone.
 */
function stripJsonComments(text: string): string {
  const cuts: [number, number][] = [];
  let pendingComma = -1;
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);

    if (char === '/' && (text.startsWith('//', index) || text.startsWith('/*', index))) {
      const end = text.startsWith('//', index) ? advancePast(text, index, '\n') : advancePast(text, index + 2, '*/');

      cuts.push([index, end]);
      index = end;

      continue;
    }

    if ((char === ']' || char === '}') && pendingComma !== -1) {
      cuts.push([pendingComma, pendingComma + 1]);
    }

    if (!WHITESPACE.has(char)) {
      pendingComma = char === ',' ? index : -1;
    }

    index = char === '"' ? findStringEnd(text, index) : index + 1;
  }

  return withoutCuts(text, cuts);
}

function withoutCuts(text: string, cuts: [number, number][]): string {
  const parts: string[] = [];
  let from = 0;

  for (const [start, end] of cuts.sort((a, b) => a[0] - b[0])) {
    parts.push(text.slice(from, start));
    from = end;
  }

  parts.push(text.slice(from));

  return parts.join('');
}

/**
 * The index just past the string literal opening at `start`, whose quote character is whatever sits
 * there — `"` in JSON, any of the three in TypeScript. `text.length` when it is never closed.
 */
export function findStringEnd(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;

  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;

      continue;
    }

    if (text[index] === quote) {
      return index + 1;
    }

    index += 1;
  }

  return text.length;
}

function advancePast(text: string, start: number, terminator: string): number {
  const found = text.indexOf(terminator, start);

  return found === -1 ? text.length : found + terminator.length;
}
