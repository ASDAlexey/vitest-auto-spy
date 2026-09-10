/**
 * What a name means in the file being linted, and how to add or drop one.
 *
 * A fixer that rewrites a type or a call is only safe if it knows what the names around it are
 * bound to. `Mocked` is Vitest's type in every spec but the one that declares its own; `Spy`,
 * `injectSpy` and `mockValueProp` are either this library's already or a name that is not free to
 * take. Both questions are answered by the scope manager the parser has already built — which is
 * also the only thing that can say whether a `const` came out of `TestBed.inject()` and was never
 * assigned again.
 *
 * The one judgement call is what an *imported* name means. A name already imported under the
 * spelling a fix wants is treated as the same thing, whatever module it comes from: re-exporting a
 * test helper through a project barrel (`import { injectSpy } from '@app/testing'`) is ordinary, and
 * refusing to fix those would rule out most of the suites the rules were written for. A name the
 * file *declares* is a different matter — that one is left alone.
 */
import {
  type EsFix,
  type EsFixer,
  type EsIdentifier,
  type EsImportSpecifier,
  type EsNode,
  type EsScope,
  type EsSourceCode,
  type EsVariable,
  isNamedImportSpecifier,
  isVariableDeclarator,
} from './rule-types';

/** The package every fix imports from, spelled once. */
export const PACKAGE = 'vitest-auto-spy';

/** What stands in the way of a fix that wants to use a name. */
export type BindingState =
  /** Nothing claims it — the fix has to add the import itself. */
  | 'free'
  /** Already imported under this name; the fix can use it as it is. */
  | 'imported'
  /** Declared in this file as something else. Hands off. */
  | 'taken';

/** eslint-scope's word for a name an import introduced, whichever form the import took. */
const IMPORT_DEFINITION = 'ImportBinding';

/** The innermost binding of `name` visible from `scope`, or `undefined` for a global or a typo. */
export function findBinding(scope: EsScope, name: string): EsVariable | undefined {
  for (let current: EsScope | null = scope; current; current = current.upper) {
    const found = current.variables.find((variable) => variable.name === name);

    if (found) {
      return found;
    }
  }

  return undefined;
}

/** Whether a fix may write `name` here, and whether it has to import it first. */
export function bindingState(scope: EsScope, name: string): BindingState {
  const binding = findBinding(scope, name);

  if (!binding) {
    return 'free';
  }

  return binding.defs.some((definition) => definition.type === IMPORT_DEFINITION) ? 'imported' : 'taken';
}

/** The named import specifier a binding came from, if that is where it came from. */
export function importSpecifierOf(variable: EsVariable): EsImportSpecifier | undefined {
  return variable.defs.map((definition) => definition.node).find(isNamedImportSpecifier);
}

/**
 * Put an import at the very top of the file.
 *
 * Before the first character rather than before the first statement, and deliberately so: "does
 * this file open with a licence header, a directive or a comment" is a question with no answer a
 * fixer could take without a branch nothing would ever exercise. The formatter the project already
 * runs owns the final placement; this only has to be valid.
 */
export function insertImport(fixer: EsFixer, statement: string): EsFix {
  return fixer.insertTextBeforeRange([0, 0], `${statement}\n`);
}

/**
 * Take one named specifier out of its import declaration, or the declaration out of the file when
 * it was the last one.
 *
 * The surviving specifiers are re-printed as a list rather than the dropped one cut out by range:
 * a range needs the comma next to it, which sits on a different side depending on whether the
 * specifier is the first — arithmetic with two off-by-one errors in it and no third case to check
 * them against.
 */
export function dropNamedImport(source: EsSourceCode, fixer: EsFixer, variable: EsVariable): EsFix | undefined {
  const specifier = importSpecifierOf(variable);

  if (!specifier) {
    return undefined;
  }

  const { specifiers } = specifier.parent;
  const kept = specifiers.filter((candidate) => candidate !== specifier);

  if (kept.length === 0) {
    return fixer.remove(specifier.parent);
  }

  // A default or namespace import sits outside the braces, so re-joining the survivors with commas
  // would move it inside them. Rare enough next to a named type import to simply decline.
  if (!kept.every(isNamedImportSpecifier)) {
    return undefined;
  }

  const names = kept.map((candidate) => source.getText(candidate)).join(', ');

  return fixer.replaceTextRange(
    [Math.min(...specifiers.map((candidate) => candidate.range[0])), Math.max(...specifiers.map((candidate) => candidate.range[1]))],
    names,
  );
}

/**
 * What a name holds, when the file settles that in one place — whichever of the two spellings put
 * it there.
 *
 * "Settles" is the whole job, and it is what lets a rule follow one step through a variable. Two
 * shapes qualify and they are the same statement written differently:
 *
 * ```ts
 * const nav = { go: vi.fn() };                     // an initialiser
 *
 * let nav: { go: Mock };                           // …and a declaration whose value arrives below
 * beforeEach(() => { nav = { go: vi.fn() }; });
 * ```
 *
 * The second is not a refinement of the first; in one consumer's 1759 spec files it is how a double
 * is written by default — not one of the 120 doubles whose declaration named a Vitest `Mock`
 * carried an initialiser. What disqualifies a name is a *second* write: from the second assignment
 * on, what the name holds at the use site depends on run order, which no rule reading one file can
 * decide. A name bound by an import or a parameter has no write at all and is disqualified by the
 * same count.
 */
export function boundValueOf(scope: EsScope, identifier: EsIdentifier): EsNode | undefined {
  const written =
    findBinding(scope, identifier.name)?.references.flatMap((reference) => (reference.writeExpr ? [reference.writeExpr] : [])) ?? [];

  return written.length === 1 ? written[0] : undefined;
}

/**
 * The same reading, restricted to a name that was **declared** with its value.
 *
 * The narrower one is what a *fixer* needs. `no-mocked-for-spy` rewrites a declaration, and the
 * repair only holds together when the declaration is where the value is: a `let` filled in by a
 * `beforeEach` has a type annotation the fix would edit and a literal three lines below that the new
 * type has to accept, which is the shape that rule was already burnt by (see `rules.ts`). Rules that
 * only *report* take {@link boundValueOf} and follow either spelling.
 */
export function initializerOf(scope: EsScope, identifier: EsIdentifier): EsNode | undefined {
  const binding = findBinding(scope, identifier.name);
  const declarator = binding?.defs.map((definition) => definition.node).find(isVariableDeclarator);

  return declarator?.init && boundValueOf(scope, identifier) === declarator.init ? declarator.init : undefined;
}
