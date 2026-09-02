/**
 * The generic half of the migration: everything that says `jest`.
 *
 * It is the half that "exists in a dozen half-finished gists", and the gists are all the same
 * find-and-replace. Three things separate this from one: a member with no `vi` twin is reported
 * instead of renamed, an unknown member is left alone instead of renamed, and `jest.Mock` is
 * rebuilt rather than renamed — because Jest writes the return type first and Vitest takes a call
 * signature, so the rename compiles into the reverse meaning and nothing fails until a call site
 * disagrees with it.
 */
import type { Finding } from '../report';
import type { Edit, ImportNeed, TransformOutput } from './edits';
import { EMPTY_OUTPUT, note } from './edits';
import type { ImportStatement } from './imports';
import { listImports } from './imports';
import { JASMINE_ALIASES, NO_TWIN, RENAMED, RETURN_FIRST, TYPE_NAMES } from './jest-api';
import type { Range } from './mask';
import { lineOf, matchBracket, splitTopLevel, trimmed } from './mask';
import type { Match, TransformContext, TransformSpec } from './transform-context';
import { group, scan, textOf } from './transform-context';

const MEMBER = /\bjest\s*\.\s*([$A-Z_a-z][\w$]*)/g;
const VITEST = 'vitest';

function at(context: TransformContext, index: number): number {
  return lineOf(context.source, index);
}

function collect(outputs: readonly TransformOutput[]): TransformOutput {
  return {
    edits: outputs.flatMap((output) => output.edits),
    needs: outputs.flatMap((output) => output.needs),
    dropIfUnused: [],
    notes: outputs.flatMap((output) => output.notes),
  };
}

/** A `vi.mock` of a path is a silent no-op once the builder has bundled the spec into it. */
function bundlingNote(context: TransformContext, member: string, end: number): Finding[] {
  const quoted = /^\s*\(\s*["']([^"']*)/.exec(context.source.slice(end, end + 200));

  if (!['doMock', 'mock', 'unmock'].includes(member) || quoted === null || !group(quoted, 1).startsWith('.')) {
    return [];
  }

  return [
    note({
      check: 'module-mock-of-a-relative-path',
      severity: 'warning',
      file: context.file,
      line: at(context, end),
      message: `\`vi.mock('${group(quoted, 1)}')\` was renamed, but a relative specifier has no module boundary left once the spec is bundled.`,
      fix: 'Replace the mock with a real seam — a provider, an argument, or `vi.hoisted()` for a package that genuinely must be replaced.',
    }),
  ];
}

function memberOutput(context: TransformContext, match: Match, name: string): TransformOutput {
  const replacement = RENAMED[name];

  if (replacement !== undefined) {
    const end = match.index + match.whole.length;

    return {
      edits: [{ start: match.index, end, text: `vi.${replacement}` }],
      needs: [],
      dropIfUnused: [],
      notes: bundlingNote(context, name, end),
    };
  }

  const reason = NO_TWIN[name];

  return {
    ...EMPTY_OUTPUT,
    notes: [
      note({
        check: reason === undefined ? 'unknown-jest-member' : 'no-vi-twin',
        severity: 'warning',
        file: context.file,
        line: at(context, match.index),
        message: `\`jest.${name}\` was left alone.`,
        fix: reason ?? 'No `vi` member of that name is known to this codemod; check the Vitest API and rewrite it by hand.',
      }),
    ],
  };
}

/** `jest.fn` → `vi.fn`, and a report for every member where that rename would be a lie. */
export const jestNamespace: TransformSpec = {
  id: 'jest-namespace',
  family: 'jest',
  summary: 'jest.<member> → vi.<member>, reporting the members with no vi twin instead of renaming them.',
  residue: /\bjest\s*\./,
  run: (context) =>
    collect(
      scan(context.masked, MEMBER).flatMap((match) => {
        const name = group(match.groups, 1);

        return TYPE_NAMES[name] === undefined ? [memberOutput(context, match, name)] : [];
      }),
    ),
};

/**
 * One tuple element as a parameter. A labelled element keeps its label, which is the whole reason
 * to expand the tuple rather than spread it; an unlabelled one is numbered, because a function type
 * has to name its parameters and Jest's tuple did not.
 */
export function renderElement(context: TransformContext, range: Range, index: number): string | undefined {
  const text = textOf(context, range);
  const rest = text.startsWith('...') ? '...' : '';
  const body = text.slice(rest.length).trim();
  const labelled = /^([$A-Z_a-z][\w$]*\??)\s*:([\S\s]*)$/.exec(body);

  if (labelled !== null) {
    return `${rest}${group(labelled, 1)}: ${group(labelled, 2).trim()}`;
  }

  if (body.length === 0) {
    return undefined;
  }

  const optional = rest === '' && body.endsWith('?') ? '?' : '';

  return `${rest}arg${index}${optional}: ${optional === '' ? body : body.slice(0, -1).trim()}`;
}

/**
 * Jest's argument tuple as a parameter list. A tuple literal is expanded element by element;
 * anything else — a type alias, `any`, a generic parameter — becomes `...args: A`, which is what
 * Jest's second type argument means for every possible `A` and needs nothing parsed.
 */
export function parameterList(context: TransformContext, range: Range): string {
  const [start, end] = trimmed(context.masked, range);

  if (context.masked.charAt(start) === '[' && matchBracket(context.masked, start) === end) {
    const rendered = splitTopLevel(context.masked, start + 1, end - 1).map((element, index) => renderElement(context, element, index));
    const kept = rendered.flatMap((entry) => (entry === undefined ? [] : [entry]));

    if (kept.length === rendered.length) {
      return kept.join(', ');
    }
  }

  return `...args: ${context.source.slice(start, end)}`;
}

/** `<R, [A]>` → `<(arg0: A) => R>`, the transposition the whole command exists for. */
export function signature(context: TransformContext, target: string, parts: readonly Range[]): string | undefined {
  const [returnType, args] = parts;

  if (returnType === undefined || parts.length > 2) {
    return undefined;
  }

  const returns = textOf(context, returnType);

  return args === undefined ? `${target}<() => ${returns}>` : `${target}<(${parameterList(context, args)}) => ${returns}>`;
}

function typeOutput(context: TransformContext, match: Match, name: string, target: string): TransformOutput {
  const need: ImportNeed = { specifier: VITEST, name: target, typeOnly: true };
  const after = match.index + match.whole.length;
  const gap = /^\s*</.exec(context.masked.slice(after));
  const open = gap === null ? -1 : after + group(gap, 0).length - 1;
  const close = open === -1 ? undefined : matchBracket(context.masked, open);

  if (close === undefined || !RETURN_FIRST.has(name)) {
    return { edits: [{ start: match.index, end: after, text: target }], needs: [need], dropIfUnused: [], notes: [] };
  }

  const text = signature(context, target, splitTopLevel(context.masked, open + 1, close - 1));

  if (text === undefined) {
    return { ...EMPTY_OUTPUT, notes: [unreadableTypeArguments(context, match.index, name)] };
  }

  return { edits: [{ start: match.index, end: close, text }], needs: [need], dropIfUnused: [], notes: [] };
}

function unreadableTypeArguments(context: TransformContext, index: number, name: string): Finding {
  return note({
    check: 'jest-mock-type-arguments',
    severity: 'error',
    file: context.file,
    line: at(context, index),
    message: `\`jest.${name}\` here has a type argument list this codemod will not transpose.`,
    fix: 'Write the call signature by hand: Jest puts the return type first, Vitest takes `(args) => return`. Renaming it in place means the opposite.',
  });
}

/**
 * `jest.Mocked<T>` → `Mocked<T>`, and `jest.Mock<R, [A]>` → `Mock<(arg0: A) => R>`.
 *
 * The second one is the reason this is a codemod and not a search-and-replace. It is also the one
 * transform here that refuses rather than approximates: a type argument list it cannot split at the
 * top level is reported as an error and left exactly as it was.
 */
export const jestTypes: TransformSpec = {
  id: 'jest-types',
  family: 'jest',
  summary:
    'jest.Mock<R, [A]> → Mock<(a: A) => R>, jest.SpyInstance → MockInstance the same way, and the four plain type renames, importing the Vitest name.',
  residue: /\bjest\s*\.\s*(?:Mock|MockedClass|MockedFunction|MockedObject|Mocked|SpyInstance)\b/,
  run: (context) =>
    collect(
      scan(context.masked, MEMBER).flatMap((match) => {
        const name = group(match.groups, 1);
        const target = TYPE_NAMES[name];

        return target === undefined ? [] : [typeOutput(context, match, name, target)];
      }),
    ),
};

const NO_ARGUMENT = /\.\s*(mockImplementation(?:Once)?)\s*\(\s*\)/g;

/**
 * `mockImplementation()` with no argument is a compile error Jest never had — it installed the
 * no-op for you, and Vitest requires the function. Worth a codemod step rather than a lint rule
 * precisely because a suite with a type gate already reports it as `TS2554` and a suite without one
 * reports nothing at all, so the rule would only fire where it was not needed.
 */
export const mockImplementationArity: TransformSpec = {
  id: 'mock-implementation-arity',
  family: 'shared',
  summary: 'mockImplementation() with no argument → mockImplementation(() => undefined).',
  residue: /\.\s*mockImplementation(?:Once)?\s*\(\s*\)/,
  run: (context) => ({
    ...EMPTY_OUTPUT,
    edits: scan(context.masked, NO_ARGUMENT).map((match) => ({
      start: match.index,
      end: match.index + match.whole.length,
      text: `.${group(match.groups, 1)}(() => undefined)`,
    })),
  }),
};

/**
 * `xit` is not a skip under Vitest, it is `TS2304: Cannot find name 'xit'`.
 *
 * One pattern per alias rather than one alternation and a lookup: the table drives the regexes, so
 * there is no "the name matched but the table did not have it" branch to leave untested.
 */
export const jasmineAliases: TransformSpec = {
  id: 'jasmine-aliases',
  family: 'shared',
  summary: 'xit / xdescribe / fit / fdescribe → it.skip / describe.skip / it.only / describe.only.',
  residue: /(?:^|[^\w$.])(?:fdescribe|fit|xdescribe|xit|xtest)\s*\(/,
  run: (context) => ({
    ...EMPTY_OUTPUT,
    edits: Object.entries(JASMINE_ALIASES).flatMap(([alias, replacement]) =>
      scan(context.masked, new RegExp(`(^|[^\\w$.])${alias}\\s*\\(`, 'g')).map((match): Edit => {
        const start = match.index + group(match.groups, 1).length;

        return { start, end: start + alias.length, text: replacement };
      }),
    ),
  }),
};

const JEST_GLOBALS = '@jest/globals';

/**
 * `import { jest } from '@jest/globals'` → `import { vi } from 'vitest'`.
 *
 * Only the specifier and the `jest` binding are touched: `describe`, `it`, `expect` and the hooks
 * are named the same on both sides, so rewriting the whole clause would churn the line for nothing.
 */
export const jestGlobalsImport: TransformSpec = {
  id: 'jest-globals-import',
  family: 'jest',
  summary: "import … from '@jest/globals' → from 'vitest', with the jest binding renamed to vi.",
  residue: /["']@jest\/globals["']/,
  run: (context) => ({
    ...EMPTY_OUTPUT,
    edits: listImports(context.source, context.masked)
      .filter((statement) => statement.specifier === JEST_GLOBALS)
      .flatMap((statement) => globalsEdits(context, statement)),
  }),
};

function globalsEdits(context: TransformContext, statement: ImportStatement): Edit[] {
  const specifierAt = context.source.indexOf(JEST_GLOBALS, statement.start);
  const [open, close] = statement.braces ?? [statement.start, statement.start];
  const renames = scan(context.masked.slice(open, close), /\bjest\b/g).map(
    (match): Edit => ({ start: open + match.index, end: open + match.index + 'jest'.length, text: 'vi' }),
  );

  return [...renames, { start: specifierAt, end: specifierAt + JEST_GLOBALS.length, text: VITEST }];
}
