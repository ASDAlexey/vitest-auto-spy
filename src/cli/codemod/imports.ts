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

const STATEMENT = /(?:^|\n)[\t ]*import\b/g;
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

/** The names a statement binds, as written — `type Foo` counts as `Foo`. */
export function boundNames(source: string, braces: Range): string[] {
  const [open, close] = braces;

  return source
    .slice(open + 1, close - 1)
    .split(',')
    .map((part) => part.trim().replace(/^type\s+/, ''))
    .map((part) => (part.includes(' as ') ? part.slice(part.lastIndexOf(' as ') + 4).trim() : part))
    .filter((part) => part.length > 0);
}

function allBound(source: string, statements: readonly ImportStatement[]): Set<string> {
  return new Set(statements.flatMap((statement) => (statement.braces === undefined ? [] : boundNames(source, statement.braces))));
}

function spell(need: ImportNeed): string {
  return need.typeOnly ? `type ${need.name}` : need.name;
}

/** All-type imports become one `import type`, which is what a hand-written line would have said. */
function newStatement(specifier: string, needs: readonly ImportNeed[]): string {
  const allTypes = needs.every((need) => need.typeOnly);
  const names = needs.map((need) => (allTypes ? need.name : spell(need))).sort((a, b) => a.localeCompare(b));

  return `import ${allTypes ? 'type ' : ''}{ ${names.join(', ')} } from '${specifier}';\n`;
}

function insertionPoint(statements: readonly ImportStatement[]): { readonly at: number; readonly blankAfter: boolean } {
  const last = statements.filter((statement) => !statement.specifier.startsWith('.')).at(-1);

  if (last !== undefined) {
    return { at: last.end + 1, blankAfter: false };
  }

  return { at: statements[0]?.start ?? 0, blankAfter: statements.length > 0 };
}

function insertIntoBraces(source: string, host: Host, needs: readonly ImportNeed[]): Edit {
  const [open, close] = host.braces;
  const [first, last] = trimmed(source, [open + 1, close - 1]);
  const addition = needs.map((need) => (host.statement.typeOnly ? need.name : spell(need))).join(', ');

  if (first === last) {
    return { start: open + 1, end: close - 1, text: ` ${addition} ` };
  }

  // After the last name rather than before the closing brace: `{ a, b }` has a space in front of
  // that brace, and inserting there produces `{ a, b , c }`.
  return { start: last, end: last, text: /,$/.test(source.slice(open + 1, last)) ? ` ${addition}` : `, ${addition}` };
}

function pickHost(statements: readonly ImportStatement[], specifier: string, needs: readonly ImportNeed[]): Host | undefined {
  const candidates = hostsFor(statements, specifier);
  const value = candidates.find((host) => !host.statement.typeOnly);

  if (value !== undefined) {
    return value;
  }

  return needs.every((need) => need.typeOnly) ? candidates[0] : undefined;
}

function uniqueNeeds(source: string, statements: readonly ImportStatement[], needs: readonly ImportNeed[]): ImportNeed[] {
  const bound = allBound(source, statements);
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

function planEdits(source: string, statements: readonly ImportStatement[], needs: readonly ImportNeed[]): Edit[] {
  const specifiers = [...new Set(needs.map((need) => need.specifier))].sort((a, b) => a.localeCompare(b));
  const { at, blankAfter } = insertionPoint(statements);

  return specifiers.map((specifier) => {
    const group = needs.filter((need) => need.specifier === specifier);
    const host = pickHost(statements, specifier, group);

    if (host === undefined) {
      return { start: at, end: at, text: `${newStatement(specifier, group)}${blankAfter ? '\n' : ''}` };
    }

    return insertIntoBraces(source, host, group);
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

function dropOne(source: string, statements: readonly ImportStatement[], name: string): Edit[] {
  const host = statements
    .flatMap((statement): Host[] => (statement.braces === undefined ? [] : [{ statement, braces: statement.braces }]))
    .find((candidate) => boundNames(source, candidate.braces).includes(name));

  if (host === undefined || referencedOutsideImports(source, statements, name)) {
    return [];
  }

  const kept = boundNames(source, host.braces).filter((bound) => bound !== name);
  const [open, close] = host.braces;

  if (kept.length === 0) {
    return [{ start: host.statement.start, end: Math.min(host.statement.end + 1, source.length), text: '' }];
  }

  return [{ start: open + 1, end: close - 1, text: ` ${kept.join(', ')} ` }];
}

/**
 * Adds the imports the rewrites need and removes the ones they orphaned. Runs against the text the
 * edits already produced, so a name inserted into an import a transform has just written lands in
 * the statement as it now reads rather than as it read before.
 */
export function applyImportPlan(source: string, needs: readonly ImportNeed[], dropIfUnused: readonly string[]): string {
  const statements = listImports(source);
  const withImports = applyEdits(source, planEdits(source, statements, uniqueNeeds(source, statements, needs)));
  const after = listImports(withImports);

  return applyEdits(
    withImports,
    dropIfUnused.flatMap((name) => dropOne(withImports, after, name)),
  );
}
