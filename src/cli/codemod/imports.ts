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
import { group } from './transform-context';

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

const DECLARATION = /\b(?:class|const|enum|function\s*\*?|interface|let|namespace|type|var)\s+([$A-Z_a-z][\w$]*)/g;

/** Names the file declares itself, with where — importing one of them again is a duplicate binding. */
export function declaredNames(masked: string): Map<string, number> {
  const declared = new Map<string, number>();

  for (const match of masked.matchAll(DECLARATION)) {
    const name = group(match, 1);

    if (!declared.has(name)) {
      declared.set(name, match.index);
    }
  }

  return declared;
}

/** A need the file already declares a binding for, and the offset of that declaration. */
export interface Shadowed {
  readonly need: ImportNeed;
  readonly at: number;
}

interface Needs {
  readonly wanted: ImportNeed[];
  readonly shadowed: Shadowed[];
}

function uniqueNeeds(source: string, masked: string, statements: readonly ImportStatement[], needs: readonly ImportNeed[]): Needs {
  const bound = allBound(source, masked, statements);
  const declared = declaredNames(masked);
  const seen = new Set<string>();
  const wanted: ImportNeed[] = [];
  const shadowed: Shadowed[] = [];

  for (const need of needs) {
    const key = `${need.specifier} ${need.name}`;
    const at = declared.get(need.name);

    if (bound.has(need.name) || seen.has(key)) {
      continue;
    }

    seen.add(key);

    if (at === undefined) {
      wanted.push(need);
    } else {
      shadowed.push({ need, at });
    }
  }

  return { wanted, shadowed };
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

/** The code with every import statement blanked, so a name found in it is a real reference. */
function codeOutsideImports(masked: string, statements: readonly ImportStatement[]): string {
  let result = '';
  let cursor = 0;

  for (const statement of statements) {
    result += masked.slice(cursor, statement.start) + ' '.repeat(statement.end - statement.start);
    cursor = statement.end;
  }

  return result + masked.slice(cursor);
}

function mentions(code: string, name: string): boolean {
  return new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(code);
}

/** Whether a name is still referenced anywhere outside the import block. */
export function referencedOutsideImports(
  source: string,
  statements: readonly ImportStatement[],
  name: string,
  masked: string = maskCode(source),
): boolean {
  return mentions(codeOutsideImports(masked, statements), name);
}

/** A line comment that rides the specifier being removed, so it goes with it. */
function trailingComment(source: string, from: number): number {
  const comment = /^[\t ]*\/\/[^\n\r]*/.exec(source.slice(from));

  return comment === null ? from : from + comment[0].length;
}

/** Past the statement's own line break, whichever one the file uses. */
function statementEnd(source: string, end: number): number {
  if (source.startsWith('\r\n', end)) {
    return end + 2;
  }

  return source.charAt(end) === '\n' ? end + 1 : end;
}

/**
 * The edits removing `names` from one statement. A run of adjacent specifiers goes as one span, so
 * two removals never overlap: the run takes the comma after it, or — at the end of the clause — the
 * comma before it. Every named specifier gone means the whole statement goes.
 */
function dropFrom(source: string, masked: string, host: Host, names: ReadonlySet<string>): Edit[] {
  const slots = slotsOf(masked, host.braces);
  const named = slots.filter((slot) => slot.name.length > 0);

  if (named.every((slot) => names.has(slot.name))) {
    return [{ start: host.statement.start, end: statementEnd(source, host.statement.end), text: '' }];
  }

  const runs: { first: Slot; last: Slot }[] = [];
  let open: { first: Slot; last: Slot } | undefined;

  for (const slot of slots) {
    if (!names.has(slot.name)) {
      open = undefined;
    } else if (open === undefined) {
      open = { first: slot, last: slot };
      runs.push(open);
    } else {
      open.last = slot;
    }
  }

  return runs.map(({ first, last }) =>
    last.comma === -1
      ? { start: first.start - 1, end: last.codeEnd, text: '' }
      : { start: first.start, end: trailingComment(source, last.comma + 1), text: '' },
  );
}

function dropUnused(source: string, masked: string, statements: readonly ImportStatement[], names: readonly string[]): Edit[] {
  const code = codeOutsideImports(masked, statements);
  const unused = new Set(names.filter((name) => !mentions(code, name)));

  return statements.flatMap((statement) => {
    const { braces } = statement;

    return braces === undefined || !slotsOf(masked, braces).some((slot) => unused.has(slot.name))
      ? []
      : dropFrom(source, masked, { statement, braces }, unused);
  });
}

export interface ImportPlan {
  readonly text: string;
  /** Needs left unimported because the file declares a binding of that name itself. */
  readonly shadowed: readonly Shadowed[];
}

/**
 * Adds the imports the rewrites need and removes the ones they orphaned. Runs against the text the
 * edits already produced, so a name inserted into an import a transform has just written lands in
 * the statement as it now reads rather than as it read before.
 */
export function planImports(source: string, needs: readonly ImportNeed[], dropIfUnused: readonly string[]): ImportPlan {
  const masked = maskCode(source);
  const statements = listImports(source, masked);
  const { wanted, shadowed } = uniqueNeeds(source, masked, statements, needs);
  const added = applyEdits(source, planEdits(source, masked, statements, wanted)).text;

  if (dropIfUnused.length === 0) {
    return { text: added, shadowed };
  }

  const afterMask = maskCode(added);

  return { text: applyEdits(added, dropUnused(added, afterMask, listImports(added, afterMask), dropIfUnused)).text, shadowed };
}

export function applyImportPlan(source: string, needs: readonly ImportNeed[], dropIfUnused: readonly string[]): string {
  return planImports(source, needs, dropIfUnused).text;
}
