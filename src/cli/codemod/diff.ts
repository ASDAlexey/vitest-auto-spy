/**
 * A unified diff, because the default run writes nothing and the diff is the whole output.
 *
 * The comparison trims the common prefix and suffix first and runs the quadratic part only over
 * what is left, which for a codemod is a handful of lines in a file of hundreds. A middle larger
 * than {@link MAX_MIDDLE} is printed as one replaced block rather than aligned: a diff nobody can
 * read is not worth a second of CPU, and a file that changed that much wants an eye, not a hunk.
 */

const MAX_MIDDLE = 400;
const CONTEXT = 3;

type Kind = '-' | '+' | '=';

interface Line {
  readonly kind: Kind;
  readonly text: string;
  /** 1-based line number on the left and on the right. */
  readonly a: number;
  readonly b: number;
}

/**
 * `slice().join('')` rather than an index: under `noUncheckedIndexedAccess` a line that cannot be
 * absent still types as optional, and the guard for it is a branch no input can ever take.
 */
function lineAt(list: readonly string[], index: number): string {
  return list.slice(index, index + 1).join('');
}

function commonPrefix(before: readonly string[], after: readonly string[]): number {
  let index = 0;

  while (index < before.length && index < after.length && lineAt(before, index) === lineAt(after, index)) {
    index += 1;
  }

  return index;
}

function commonSuffix(before: readonly string[], after: readonly string[], prefix: number): number {
  let index = 0;

  while (
    index < before.length - prefix &&
    index < after.length - prefix &&
    lineAt(before, before.length - 1 - index) === lineAt(after, after.length - 1 - index)
  ) {
    index += 1;
  }

  return index;
}

/**
 * The longest-common-subsequence lengths, in a `Map` rather than a matrix: a lookup past the edge
 * is a real miss with a real answer (zero), so the fallback is exercised by every diff instead of
 * being a guard for a cell that cannot be absent.
 */
function lcsTable(before: readonly string[], after: readonly string[]): Map<number, number> {
  const width = after.length + 1;
  const table = new Map<number, number>();
  const get = (i: number, j: number): number => table.get(i * width + j) ?? 0;

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const same = lineAt(before, i) === lineAt(after, j);

      table.set(i * width + j, same ? get(i + 1, j + 1) + 1 : Math.max(get(i + 1, j), get(i, j + 1)));
    }
  }

  return table;
}

function align(before: readonly string[], after: readonly string[]): [Kind, string][] {
  if (before.length > MAX_MIDDLE || after.length > MAX_MIDDLE) {
    return [...before.map((text): [Kind, string] => ['-', text]), ...after.map((text): [Kind, string] => ['+', text])];
  }

  const width = after.length + 1;
  const table = lcsTable(before, after);
  const get = (i: number, j: number): number => table.get(i * width + j) ?? 0;
  const ops: [Kind, string][] = [];
  let i = 0;
  let j = 0;

  while (i < before.length && j < after.length) {
    if (lineAt(before, i) === lineAt(after, j)) {
      ops.push(['=', lineAt(before, i)]);
      i += 1;
      j += 1;
    } else if (get(i + 1, j) >= get(i, j + 1)) {
      ops.push(['-', lineAt(before, i)]);
      i += 1;
    } else {
      ops.push(['+', lineAt(after, j)]);
      j += 1;
    }
  }

  return [
    ...ops,
    ...before.slice(i).map((text): [Kind, string] => ['-', text]),
    ...after.slice(j).map((text): [Kind, string] => ['+', text]),
  ];
}

function numbered(ops: readonly [Kind, string][]): Line[] {
  let a = 1;
  let b = 1;

  return ops.map(([kind, text]) => {
    const line: Line = { kind, text, a, b };

    a += kind === '+' ? 0 : 1;
    b += kind === '-' ? 0 : 1;

    return line;
  });
}

function group(lines: readonly Line[]): { start: number; end: number }[] {
  const groups: { start: number; end: number }[] = [];

  for (const [index, line] of lines.entries()) {
    if (line.kind === '=') {
      continue;
    }

    const last = groups.at(-1);

    if (last !== undefined && index - last.end <= CONTEXT * 2 + 1) {
      last.end = index;

      continue;
    }

    groups.push({ start: index, end: index });
  }

  return groups;
}

/** `Math.min` over the whole hunk rather than reading its first line: the numbers only increase. */
function header(hunk: readonly Line[]): string {
  const removed = hunk.filter((line) => line.kind !== '+');
  const added = hunk.filter((line) => line.kind !== '-');

  return `@@ -${Math.min(...hunk.map((line) => line.a))},${removed.length} +${Math.min(...hunk.map((line) => line.b))},${added.length} @@`;
}

function render(lines: readonly Line[], span: { readonly start: number; readonly end: number }): string {
  const hunk = lines.slice(Math.max(0, span.start - CONTEXT), Math.min(lines.length, span.end + CONTEXT + 1));

  return [header(hunk), ...hunk.map((line) => `${line.kind === '=' ? ' ' : line.kind}${line.text}`)].join('\n');
}

/** The diff of one file, or the empty string when nothing changed. */
export function unifiedDiff(file: string, before: string, after: string): string {
  if (before === after) {
    return '';
  }

  const left = before.split('\n');
  const right = after.split('\n');
  const prefix = commonPrefix(left, right);
  const suffix = commonSuffix(left, right, prefix);
  const lines = numbered([
    ...left.slice(0, prefix).map((text): [Kind, string] => ['=', text]),
    ...align(left.slice(prefix, left.length - suffix), right.slice(prefix, right.length - suffix)),
    ...left.slice(left.length - suffix).map((text): [Kind, string] => ['=', text]),
  ]);

  return [`--- a/${file}`, `+++ b/${file}`, ...group(lines).map((span) => render(lines, span))].join('\n');
}
