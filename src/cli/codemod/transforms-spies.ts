/**
 * The two steps that exist nowhere else, because they are this package's own knowledge.
 *
 * Splitting `import { createSpyFromClass, provideAutoSpy, Spy } from 'jest-auto-spies'` needs a
 * table of which name lives behind which entry, and rewriting `TestBed.inject(X) as Spy<X>` needs
 * to know that the cast stopped compiling and what replaced it. Neither is derivable from the Jest
 * side of the migration, and both are decidable from the file — which is the whole argument for a
 * codemod over a checklist.
 */
import type { Finding } from '../report';
import type { Edit, ImportNeed, TransformOutput } from './edits';
import { EMPTY_OUTPUT, note } from './edits';
import { entryFor } from './entry-map';
import type { ImportStatement } from './imports';
import { listImports } from './imports';
import { LEGACY_PACKAGES } from './jest-api';
import type { Range } from './mask';
import { lineOf, matchBracket } from './mask';
import type { TransformContext, TransformSpec } from './transform-context';
import { group, scan } from './transform-context';

const ROOT = 'vitest-auto-spy';

interface Specifier {
  /** As written, aliases and inline `type` included — carried across untouched. */
  readonly raw: string;
  /** The exported name, which is what the entry table is keyed by. */
  readonly imported: string;
}

export function parseSpecifiers(source: string, braces: Range): Specifier[] {
  const [open, close] = braces;

  return source
    .slice(open + 1, close - 1)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((raw) => ({ raw, imported: group(raw.replace(/^type\s+/, '').split(/\s+as\s+/), 0).trim() }));
}

/**
 * Root first — it is the entry that registers the mock adapter — then the subpaths, sorted. The map
 * is in the order the clause named the specifiers, so root can start on either side of a comparison.
 */
function ordered(groups: ReadonlyMap<string, Specifier[]>): [string, Specifier[]][] {
  return [...groups].sort(([a], [b]) => {
    if (a === ROOT || b === ROOT) {
      return a === ROOT ? -1 : 1;
    }

    return a.localeCompare(b);
  });
}

function statementFor(entry: string, typeOnly: boolean, specifiers: readonly Specifier[]): string {
  return `import ${typeOnly ? 'type ' : ''}{ ${specifiers.map((one) => one.raw).join(', ')} } from '${entry}';`;
}

function unresolvedNote(context: TransformContext, statement: ImportStatement, names: readonly string[]): Finding {
  return note({
    check: 'unmapped-legacy-export',
    severity: 'error',
    file: context.file,
    line: lineOf(context.source, statement.start),
    message: `No entry point of the installed ${ROOT} exports ${names.join(', ')}.`,
    fix: `Left importing from '${statement.specifier}'. Either the name was renamed, or it belongs to a helper this package does not have; check the migration table.`,
  });
}

function splitOne(context: TransformContext, statement: ImportStatement, braces: Range): TransformOutput {
  const { entries } = context;

  if (entries === undefined) {
    return { ...EMPTY_OUTPUT, notes: [undecidableSplit(context, statement, true)] };
  }

  const groups = new Map<string, Specifier[]>();
  const unresolved: Specifier[] = [];

  for (const specifier of parseSpecifiers(context.source, braces)) {
    const entry = entryFor(entries, specifier.imported, context.preferredEntry);

    if (entry === undefined) {
      unresolved.push(specifier);
    } else {
      groups.set(entry, [...(groups.get(entry) ?? []), specifier]);
    }
  }

  return rewrite(context, statement, groups, unresolved);
}

function rewrite(
  context: TransformContext,
  statement: ImportStatement,
  groups: ReadonlyMap<string, Specifier[]>,
  unresolved: readonly Specifier[],
): TransformOutput {
  const lines = ordered(groups).map(([entry, specifiers]) => statementFor(entry, statement.typeOnly, specifiers));
  const kept = unresolved.length === 0 ? [] : [statementFor(statement.specifier, statement.typeOnly, unresolved)];
  const notes =
    unresolved.length === 0
      ? []
      : [
          unresolvedNote(
            context,
            statement,
            unresolved.map((one) => one.imported),
          ),
        ];

  if (lines.length === 0) {
    return { ...EMPTY_OUTPUT, notes };
  }

  return {
    edits: [{ start: statement.start, end: statement.end, text: [...lines, ...kept].join('\n') }],
    needs: [],
    dropIfUnused: [],
    notes,
  };
}

function undecidableSplit(context: TransformContext, statement: ImportStatement, missing: boolean): Finding {
  return note({
    check: missing ? 'no-entry-table' : 'unsplittable-import',
    severity: 'error',
    file: context.file,
    line: lineOf(context.source, statement.start),
    message: missing
      ? `The entry-point table could not be generated, so this import of '${statement.specifier}' was left alone.`
      : `A default or namespace import of '${statement.specifier}' cannot be split across entry points.`,
    fix: missing
      ? `Install ${ROOT} in this repository (\`npm i -D ${ROOT}\`) and run again — the table is read from its own export map, never hard-coded.`
      : 'Rewrite it as a named import first; the helpers live behind different entry points and a namespace cannot straddle them.',
  });
}

/**
 * Splits a legacy import across the entry points of the installed version.
 *
 * The table it looks names up in is generated from the `exports` map of the `vitest-auto-spy` this
 * repository has, so it is right for that version and not for the one this file was written
 * against. A name no entry exports is left where it is and reported — never moved to a plausible
 * guess, which is the one outcome that would still compile and mean something else.
 */
export const autoSpiesImport: TransformSpec = {
  id: 'auto-spies-import',
  summary: `import … from 'jest-auto-spies' → the ${ROOT} entry points that export each name.`,
  residue: /from\s*["'](?:@bugsplat\/vitest-auto-spies|jest-auto-spies)["']/,
  run: (context) => {
    const outputs = listImports(context.source, context.masked)
      .filter((statement) => LEGACY_PACKAGES.includes(statement.specifier))
      .map((statement) =>
        statement.braces === undefined
          ? { ...EMPTY_OUTPUT, notes: [undecidableSplit(context, statement, false)] }
          : splitOne(context, statement, statement.braces),
      );

    return {
      edits: outputs.flatMap((output) => output.edits),
      needs: [],
      dropIfUnused: [],
      notes: outputs.flatMap((output) => output.notes),
    };
  },
};

const INJECT = /\bTestBed\s*\.\s*inject\s*\(/g;
const CAST = /^\s*as\s+(?:unknown\s+as\s+)?Spy\s*</;
const ANY_SPY_CAST = /\bas\s+Spy\s*</g;

interface Cast {
  readonly edit: Edit;
  /** Index of the `<` that opens the cast's type arguments, used to pair it with a stray match. */
  readonly angle: number;
}

/** `TestBed.inject(X) as Spy<X>` → `asSpy<X>(TestBed.inject(X))`, type arguments carried across. */
export function castAt(context: TransformContext, index: number, length: number): Cast | undefined {
  const close = matchBracket(context.masked, index + length - 1);

  if (close === undefined) {
    return undefined;
  }

  const tail = CAST.exec(context.masked.slice(close));

  if (tail === null) {
    return undefined;
  }

  const angle = close + group(tail, 0).length - 1;
  const end = matchBracket(context.masked, angle);

  if (end === undefined) {
    return undefined;
  }

  return { edit: { start: index, end, text: `asSpy${context.source.slice(angle, end)}(${context.source.slice(index, close)})` }, angle };
}

function castNote(context: TransformContext, index: number): Finding {
  return note({
    check: 'spy-cast-not-on-inject',
    severity: 'warning',
    file: context.file,
    line: lineOf(context.source, index),
    message: 'A cast to `Spy<T>` over something other than `TestBed.inject(...)` was left alone.',
    fix: 'If the value really is a spy, wrap it in `asSpy(...)`; if it is a hand-built double, build it with `createAutoMock<T>()` instead of asserting over it.',
  });
}

function missingHelperNote(context: TransformContext): Finding {
  return note({
    check: 'no-entry-table',
    severity: 'error',
    file: context.file,
    line: 1,
    message: 'The entry-point table could not be generated, so `asSpy` has no import to be added from.',
    fix: `Install ${ROOT} in this repository and run again.`,
  });
}

/**
 * The cast every migrated Angular suite is full of, and the first thing that stops compiling:
 * `Spy<T>` adds the per-method helpers, so neither type sufficiently overlaps the other and
 * `TS2352` names both. `asSpy` is the typed identity that asserts what `provideAutoSpy` already put
 * in the container. The type arguments move across rather than being left to inference, for the
 * reason `prefer-as-spy` gives: on a generic class inference answers `any` and the mismatch
 * surfaces eight levels down with nothing pointing back at the line.
 */
export const injectCast: TransformSpec = {
  id: 'inject-cast',
  summary: 'TestBed.inject(X) as Spy<X> → asSpy<X>(TestBed.inject(X)), adding the import.',
  residue: /\bas\s+Spy\s*</,
  run: (context) => {
    const helper = context.entries === undefined ? undefined : entryFor(context.entries, 'asSpy', context.preferredEntry);
    const casts = scan(context.masked, INJECT).flatMap((match) => {
      const cast = castAt(context, match.index, match.whole.length);

      return cast === undefined ? [] : [cast];
    });

    if (helper === undefined) {
      return { ...EMPTY_OUTPUT, notes: casts.length === 0 ? [] : [missingHelperNote(context)] };
    }

    return withHelper(context, casts, { specifier: helper, name: 'asSpy', typeOnly: false });
  },
};

function withHelper(context: TransformContext, casts: readonly Cast[], need: ImportNeed): TransformOutput {
  const covered = new Set(casts.map((cast) => cast.angle));
  const strays = scan(context.masked, ANY_SPY_CAST)
    .filter((match) => !covered.has(match.index + match.whole.length - 1))
    .map((match) => castNote(context, match.index));

  return {
    edits: casts.map((cast) => cast.edit),
    needs: casts.length === 0 ? [] : [need],
    dropIfUnused: casts.length === 0 ? [] : ['Spy'],
    notes: strays,
  };
}
