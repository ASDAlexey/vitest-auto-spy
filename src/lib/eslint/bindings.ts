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
  type EsImportDeclaration,
  type EsImportSpecifier,
  type EsNode,
  type EsScope,
  type EsSourceCode,
  type EsVariable,
  isIdentifier,
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

/** The file itself. Declared here because one fixer needs the import list, which hangs off nothing else. */
interface EsProgram extends EsNode {
  body: EsNode[];
}

function isImportDeclaration(node: EsNode): node is EsImportDeclaration {
  return node.type === 'ImportDeclaration';
}

function isProgram(node: EsNode): node is EsProgram {
  return node.type === 'Program';
}

function importsOf(node: EsNode): EsImportDeclaration[] {
  let program: EsNode = node;

  while (!isProgram(program)) {
    program = program.parent;
  }

  return program.body.filter(isImportDeclaration);
}

/** `vitest-auto-spy` for `vitest-auto-spy/angular`, `@scope/pkg` for `@scope/pkg/sub`. */
function packageOf(module: string): string {
  const parts = module.split('/');

  return parts.slice(0, module.startsWith('@') ? 2 : 1).join('/');
}

/**
 * Add `import <clause> from 'module'` to the file.
 *
 * Directly above the file's first import of the same package that sorts after it — `vitest-auto-spy`
 * above `vitest-auto-spy/angular` — or above the last one when none does, so an `import/order` the
 * project enforces finds the new line inside the group it belongs to. Above rather than below,
 * because the same fix may be removing that import, and a line written after a removed one starts
 * with the newline the removal left. A file with no import of the package gets it before the first
 * character: "does this file open with a licence header, a directive or a comment" is a question
 * with no answer a fixer could take without a branch nothing would ever exercise, and the formatter
 * the project already runs owns the final placement.
 */
export function insertImport(fixer: EsFixer, node: EsNode, module: string, clause: string): EsFix {
  const family = importsOf(node).filter((declaration) => packageOf(String(declaration.source.value)) === packageOf(module));
  const anchor = family.find((declaration) => String(declaration.source.value) > module) ?? family.at(-1);
  const at = anchor?.range[0] ?? 0;

  return fixer.insertTextBeforeRange([at, at], `import ${clause} from '${module}';\n`);
}

/** The file's own `import … from 'module'`, when it has exactly one and every specifier in it is named. */
function namedImportFrom(node: EsNode, module: string): EsImportDeclaration | undefined {
  const declarations = importsOf(node).filter((declaration) => declaration.source.value === module && declaration.importKind !== 'type');

  const [only] = declarations;

  return declarations.length === 1 && only?.specifiers.every(isNamedImportSpecifier) === true ? only : undefined;
}

/**
 * Import a name, taking the specifier into an import of that module the file already has.
 *
 * A second `import { … } from 'vitest-auto-spy/angular'` next to the first is valid and would read as
 * the fix having worked, and then `import/no-duplicates` — an error in every repository that enables
 * it — reports the line the fixer just wrote. Measured while rolling `prefer-provide-auto-spy` over a
 * suite of 1771 spec files: 20 of the 49 files it rewrites already import from that entry point.
 *
 * Into a list that is already in order — case aside, which is how `sort-imports` and most formatters
 * read it — the name goes where it sorts; into one that is not, at the end.
 */
export function importNamed(fixer: EsFixer, node: EsNode, name: string, module: string): EsFix {
  const specifiers = namedImportFrom(node, module)?.specifiers.filter(isNamedImportSpecifier) ?? [];
  const entries = specifiers.map((specifier) => ({
    specifier,
    key: (isIdentifier(specifier.imported) ? specifier.imported.name : '').toLowerCase(),
  }));
  const ordered = entries.every((entry, index) => entries.slice(0, index).every((before) => before.key <= entry.key));
  const next = ordered ? entries.find((entry) => entry.key > name.toLowerCase())?.specifier : undefined;
  const last = specifiers.at(-1);

  if (next) {
    return fixer.insertTextBeforeRange([next.range[0], next.range[0]], `${name}, `);
  }

  return last ? fixer.replaceTextRange([last.range[1], last.range[1]], `, ${name}`) : insertImport(fixer, node, module, `{ ${name} }`);
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
