/**
 * A spread of an imported binding, evaluated while the module is still loading.
 *
 * ```ts
 * import { BaseEvents } from './base-events';
 *
 * export const webosEvents = [...BaseEvents]; // fine under tsc, a TypeError under a bundler
 * ```
 *
 * Under `tsc` and under a browser's ESM loader this cannot fail: a module never runs before its
 * dependency. Inside one bundle it can. The spec bundle emits shared chunks, a chunk may be
 * evaluated while a binding it re-exports is still `undefined`, and `[...undefined]` throws
 * `Spread syntax requires ...iterable[Symbol.iterator] to be a function` — a `TypeError` raised
 * while the bundle loads, on a tree whose every test passes. It is the same root cause as the
 * barrel-initialisation note in the migration guide, but the symptom names neither a module nor a
 * barrel, so nothing connects the two.
 *
 * The scan is worth having because the population it finds is small: seven sites in an 8 673-file
 * workspace, two of them spreading a workspace barrel. Probing all seven cleared them — none was
 * the failure being chased at the time — so the rule stands on its own terms rather than as a fix
 * for that one flake.
 *
 * Two boundaries are read as "runs later, not now": a function body, and a non-static class field.
 * A `static` field is not one of them — that really does run when the class declaration is
 * evaluated, which is while the module loads.
 */
import { findBinding } from './bindings';
import {
  type EsFix,
  type EsIdentifier,
  type EsNode,
  type EsSpreadElement,
  type RuleContext,
  type SuggestionDescriptor,
  isFunctionNode,
  isIdentifier,
  isVariableDeclarator,
} from './rule-types';

/** eslint-scope's word for a name an import introduced, whichever form the import took. */
const IMPORT_DEFINITION = 'ImportBinding';

/** The operand of a spread, when it is a name this file imported from somewhere else. */
export function spreadOfImport(context: RuleContext, node: EsSpreadElement): EsIdentifier | undefined {
  const { argument } = node;

  if (!isIdentifier(argument)) {
    return undefined;
  }

  const binding = findBinding(context.sourceCode.getScope(node), argument.name);

  return binding?.defs.some((definition) => definition.type === IMPORT_DEFINITION) ? argument : undefined;
}

/** Whether a node's evaluation is deferred past the module's own — a function body, an instance field. */
function isDeferred(node: EsNode): boolean {
  return isFunctionNode(node) || (node.type === 'PropertyDefinition' && Reflect.get(node, 'static') !== true);
}

/** Whether a node is evaluated while the module is loading, rather than whenever something calls it. */
export function runsAtImportTime(node: EsNode): boolean {
  let current = node;

  while (current.type !== 'Program') {
    if (isDeferred(current)) {
      return false;
    }

    current = current.parent;
  }

  return true;
}

/**
 * The initialiser this node is part of, when it is part of one.
 *
 * The whole initialiser rather than the spread alone, because the repair is to defer the *value*:
 * wrapping `[...BaseEvents]` on its own leaves an array holding a function.
 */
function enclosingInitializer(node: EsNode): EsNode | undefined {
  let current = node;

  while (current.type !== 'Program') {
    // A declarator's only other child is the name being declared, which no spread can sit inside.
    if (isVariableDeclarator(current.parent)) {
      return current;
    }

    current = current.parent;
  }

  return undefined;
}

/**
 * Defer the value the spread builds, so the import has landed by the time it is read.
 *
 * Offered only for a spread that is part of an initialiser, which is the shape the failure takes,
 * and it is a suggestion in the strongest sense: accepting it makes every use of the name a call,
 * so the type checker names each site that has to change. The alternative repair — inlining the
 * constant so nothing is imported for this line — cannot be written from one file.
 */
export function lazyValueSuggestion(context: RuleContext, node: EsSpreadElement): SuggestionDescriptor | undefined {
  const initializer = enclosingInitializer(node);

  if (!initializer) {
    return undefined;
  }

  return {
    desc: 'Build the value lazily: wrap the initialiser in an arrow, and call it where it is read',
    fix: (fixer): EsFix => fixer.replaceText(initializer, `() => (${context.sourceCode.getText(initializer)})`),
  };
}
