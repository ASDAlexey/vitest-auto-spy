/**
 * Reading and editing the import block, which is the half of this codemod a reviewer actually looks
 * at.
 *
 * Two rules shape the placement. A new import goes at the **end of the third-party group**, not
 * before the first relative import: `vitest` and `vitest-auto-spy` are third-party, and a spec that
 * lands them under `./service` — or on the far side of the blank line that separates the groups —
 * fails `import/order` in every repository that runs it, which is the one lint error a migration
 * does not need on top of the rest. And a name already bound in the file is never imported again,
 * because a duplicate binding is a syntax error rather than a lint warning.
 */
import { applyEdits } from './edits';
import type { Edit, ImportNeed } from './edits';
import type { Range } from './mask';
import { maskCode, matchBracket, trimmed } from './mask';

export interface ImportStatement {
  readonly start: number;
  /** Index just past the specifier's closing quote, and past a `;` when there is one. */
  readonly end: number;
  readonly specifier: string;
  readonly typeOnly: boolean;
  /** `[index of {, index just past }]`, absent for a default, namespace or side-effect import. */
  readonly braces: Range | undefined;
}

/** A statement that has braces, so the edit does not have to re-check that it does. */
interface Host {
  readonly statement: ImportStatement;
  readonly braces: Range;
}

// A byte-order mark sits between `^` and the first statement, and a file that starts with one is
// still a file whose first import has to be found.
const STATEMENT = /(?:^\uFEFF?|\n)[\t ]*import\b/g;
const QUOTE = /["']/;

function findQuote(masked: string, from: number, to: number): number {
  for (let index = from; index < to; index += 1) {
    if (QUOTE.test(masked.charAt(index))) {
      return index;
    }
  }

  return -1;
}

function parseOne(source: string, masked: string, start: number, limit: number): ImportStatement | undefined {
  const afterKeyword = start + 'import'.length;

  if (/^\s*\(/.test(masked.slice(afterKeyword, afterKeyword + 4))) {
    return undefined;
  }

  const open = findQuote(masked, afterKeyword, limit);
  const close = open === -1 ? -1 : findQuote(masked, open + 1, limit);

  if (close === -1) {
    return undefined;
  }

  const brace = masked.indexOf('{', afterKeyword);
  const braceEnd = brace !== -1 && brace < open ? matchBracket(masked, brace) : undefined;

  return {
    start,
    end: close + 1 + (masked.charAt(close + 1) === ';' ? 1 : 0),
    specifier: source.slice(open + 1, close),
    typeOnly: /^import\s+type\b/.test(source.slice(start, open)),
    braces: braceEnd === undefined ? undefined : [brace, braceEnd],
  };
}

/** Every top-level import statement, in source order. */
export function listImports(source: string, masked: string = maskCode(source)): ImportStatement[] {
  const starts: number[] = [];

  masked.replace(STATEMENT, (whole: string, offset: number): string => {
    starts.push(offset + whole.indexOf('import'));

    return whole;
  });

  return starts.flatMap((start, position) => {
    const parsed = parseOne(source, masked, start, starts[position + 1] ?? masked.length);

    return parsed === undefined ? [] : [parsed];
  });
}

function hostsFor(statements: readonly ImportStatement[], specifier: string): Host[] {
  return statements.flatMap((statement) => {
    const { braces } = statement;

    return braces === undefined || statement.specifier !== specifier ? [] : [{ statement, braces }];
  });
}

/** One specifier of a clause, with the commas around it — what a removal has to take with it. */
interface Slot {
  /** The local name, or `''` for a part that is only a comment. */
  readonly name: string;
  /** Just past the comma before it, or just past the `{`. */
  readonly start: number;
  /** Index of the comma that ends it, or `-1` when it is the last part. */
  readonly comma: number;
  /** Just past its last code character. */
  readonly codeEnd: number;
}

/**
 * The parts of a clause, split on the *masked* commas.
 *
 * Splitting the raw text made a line comment after a specifier part of the next name — and then an
 * insertion landed inside the comment, or a removal rebuilt the clause around the comment's words.
 */
function slotsOf(masked: string, [open, close]: Range): Slot[] {
  const slots: Slot[] = [];
  let from = open + 1;

  for (let index = open + 1; index < close - 1; index += 1) {
    if (masked.charAt(index) === ',') {
      slots.push(slotAt(masked, from, index, index));
      from = index + 1;
    }
  }

  slots.push(slotAt(masked, from, close - 1, -1));

  return slots;
}

function slotAt(masked: string, from: number, end: number, comma: number): Slot {
  const [, codeEnd] = trimmed(masked, [from, end]);
  const text = masked
    .slice(from, end)
    .trim()
    .replace(/^type\s+/, '');

  return { name: text.includes(' as ') ? text.slice(text.lastIndexOf(' as ') + 4).trim() : text, start: from, comma, codeEnd };
}

/** The names a statement binds, as written — `type Foo` counts as `Foo`. */
export function boundNames(source: string, braces: Range, masked: string = maskCode(source)): string[] {
  return slotsOf(masked, braces)
    .map((slot) => slot.name)
    .filter((name) => name.length > 0);
}

function allBound(source: string, masked: string, statements: readonly ImportStatement[]): Set<string> {
  return new Set(statements.flatMap((statement) => (statement.braces === undefined ? [] : boundNames(source, statement.braces, masked))));
}

function spell(need: ImportNeed): string {
  return need.typeOnly ? `type ${need.name}` : need.name;
}

/** The file's own line ending, so a statement added to a CRLF file does not split a line in two. */
function eolOf(source: string): string {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

/** All-type imports become one `import type`, which is what a hand-written line would have said. */
function newStatement(specifier: string, needs: readonly ImportNeed[], eol: string): string {
  const allTypes = needs.every((need) => need.typeOnly);
  const names = needs.map((need) => (allTypes ? need.name : spell(need))).sort((a, b) => a.localeCompare(b));

  return `import ${allTypes ? 'type ' : ''}{ ${names.join(', ')} } from '${specifier}';${eol}`;
}

interface Insertion {
  readonly at: number;
  /** Text that has to come first, when the statement above does not end in a line break. */
  readonly lead: string;
  readonly blankAfter: boolean;
}

/**
 * Where a new statement goes: the start of the line *after* the last third-party import.
 *
 * "One character past its end" assumed that character was the newline. A trailing comment, a CRLF
 * file or a file that ends without a line break each put something else there, and the statement
 * landed inside the comment or between the `\r` and the `\n`.
 */
function insertionPoint(source: string, statements: readonly ImportStatement[]): Insertion {
  const last = statements.filter((statement) => !statement.specifier.startsWith('.')).at(-1);

  if (last === undefined) {
    return { at: statements[0]?.start ?? 0, lead: '', blankAfter: statements.length > 0 };
  }

  const lineEnd = source.indexOf('\n', last.end);

  return lineEnd === -1 ? { at: source.length, lead: eolOf(source), blankAfter: false } : { at: lineEnd + 1, lead: '', blankAfter: false };
}

function insertIntoBraces(masked: string, host: Host, needs: readonly ImportNeed[]): Edit {
  const [open, close] = host.braces;
  const [first, last] = trimmed(masked, [open + 1, close - 1]);
  const addition = needs.map((need) => (host.statement.typeOnly ? need.name : spell(need))).join(', ');

  if (first === last) {
    return { start: open + 1, end: close - 1, text: ` ${addition} ` };
  }

  // After the last name rather than before the closing brace: `{ a, b }` has a space in front of
  // that brace, and inserting there produces `{ a, b , c }`. The end of the last name is read off
  // the mask, so a line comment on that name does not swallow the addition.
  return { start: last, end: last, text: /,$/.test(masked.slice(open + 1, last)) ? ` ${addition}` : `, ${addition}` };
}

function pickHost(statements: readonly ImportStatement[], specifier: string, needs: readonly ImportNeed[]): Host | undefined {
  const candidates = hostsFor(statements, specifier);
  const value = candidates.find((host) => !host.statement.typeOnly);

  if (value !== undefined) {
    return value;
  }

  return needs.every((need) => need.typeOnly) ? candidates[0] : undefined;
}

function uniqueNeeds(source: string, masked: string, statements: readonly ImportStatement[], needs: readonly ImportNeed[]): ImportNeed[] {
  const bound = allBound(source, masked, statements);
  const seen = new Set<string>();

  return needs.filter((need) => {
    const key = `${need.specifier} ${need.name}`;

    if (bound.has(need.name) || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function planEdits(source: string, masked: string, statements: readonly ImportStatement[], needs: readonly ImportNeed[]): Edit[] {
  const specifiers = [...new Set(needs.map((need) => need.specifier))].sort((a, b) => a.localeCompare(b));
  const { at, lead, blankAfter } = insertionPoint(source, statements);
  const eol = eolOf(source);

  return specifiers.map((specifier) => {
    const group = needs.filter((need) => need.specifier === specifier);
    const host = pickHost(statements, specifier, group);

    if (host === undefined) {
      return { start: at, end: at, text: `${lead}${newStatement(specifier, group, eol)}${blankAfter ? eol : ''}` };
    }

    return insertIntoBraces(masked, host, group);
  });
}

/** Whether a name is still referenced anywhere outside the import block. */
export function referencedOutsideImports(source: string, statements: readonly ImportStatement[], name: string): boolean {
  const masked = maskCode(source).split('');

  for (const statement of statements) {
    for (let index = statement.start; index < statement.end; index += 1) {
      masked[index] = ' ';
    }
  }

  return new RegExp(`\\b${name}\\b`).test(masked.join(''));
}

/** The statement that binds `name`, with the clause already split into its parts. */
function bindingOf(
  masked: string,
  statements: readonly ImportStatement[],
  name: string,
): { host: Host; slots: Slot[]; slot: Slot } | undefined {
  for (const statement of statements) {
    const { braces } = statement;
    const slots = braces === undefined ? [] : slotsOf(masked, braces);
    const slot = slots.find((candidate) => candidate.name === name);

    if (braces !== undefined && slot !== undefined) {
      return { host: { statement, braces }, slots, slot };
    }
  }

  return undefined;
}

/** A line comment that rides the specifier being removed, so it goes with it. */
function trailingComment(source: string, from: number): number {
  const comment = /^[\t ]*\/\/[^\n]*/.exec(source.slice(from));

  return comment === null ? from : from + comment[0].length;
}

function dropOne(source: string, masked: string, statements: readonly ImportStatement[], name: string): Edit[] {
  const binding = bindingOf(masked, statements, name);

  if (binding === undefined || referencedOutsideImports(source, statements, name)) {
    return [];
  }

  const { host, slots, slot } = binding;

  if (slots.filter((candidate) => candidate.name.length > 0).length === 1) {
    return [{ start: host.statement.start, end: Math.min(host.statement.end + 1, source.length), text: '' }];
  }

  // One specifier's span, not a rebuilt clause: rebuilding it lost the aliases as they were written
  // and moved every comment in the clause onto the wrong line. A part that ends in a comma takes the
  // comma; the last part takes the comma in front of it instead, which is the character at `start - 1`.
  return [slot.comma === -1 ? { start: slot.start - 1, end: slot.codeEnd, text: '' } : dropWithComma(source, slot)];
}

function dropWithComma(source: string, slot: Slot): Edit {
  return { start: slot.start, end: trailingComment(source, slot.comma + 1), text: '' };
}

/**
 * Adds the imports the rewrites need and removes the ones they orphaned. Runs against the text the
 * edits already produced, so a name inserted into an import a transform has just written lands in
 * the statement as it now reads rather than as it read before.
 */
export function applyImportPlan(source: string, needs: readonly ImportNeed[], dropIfUnused: readonly string[]): string {
  const masked = maskCode(source);
  const statements = listImports(source, masked);
  const withImports = applyEdits(source, planEdits(source, masked, statements, uniqueNeeds(source, masked, statements, needs)));
  const afterMask = maskCode(withImports);
  const after = listImports(withImports, afterMask);

  return applyEdits(
    withImports,
    dropIfUnused.flatMap((name) => dropOne(withImports, afterMask, after, name)),
  );
}
