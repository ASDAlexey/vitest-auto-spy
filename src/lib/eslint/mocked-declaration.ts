/**
 * What `no-mocked-for-spy` is allowed to rewrite unattended.
 *
 * Renaming `Mocked<T>` to `Spy<T>` is an edit to a *declaration*, and the worst a wrong one can do
 * is fail to compile — which is why that rule was the first here to run under `--fix`. The claim
 * holds only as far as the declaration, though, and a real file showed where it stops:
 *
 * ```ts
 * let register: Mocked<Pick<Registry, 'metrics'>> & { contentType: string };
 * register = { contentType: '…', metrics: vi.fn().mockResolvedValue(payload) };
 * ```
 *
 * `eslint --fix` rewrote the first line, reported clean, and the type gate then failed on the
 * second — `Mock<Procedure>` is not an `AddSpyMethodsByReturnTypes<…>`. That is the worst shape an
 * autofix has: the rule's own check passes, so nothing points back at it.
 *
 * So the fix is narrowed to the case where the declaration really is the whole story — the value
 * the name holds came out of one of this library's own factories, and `Spy<T>` is what those
 * return. Everything else keeps the report and offers the same edit as a *suggestion*, which an
 * editor shows and a human accepts along with the repair to the creation site.
 *
 * The edit itself lives here too, since the two questions — what to rewrite, and whether rewriting
 * it is the whole job — are the same question read twice.
 */
import { PACKAGE, bindingState, dropNamedImport, insertImport } from './bindings';
import {
  type EsFix,
  type EsFixer,
  type EsIdentifier,
  type EsNode,
  type EsTypeReference,
  type EsVariable,
  type RuleContext,
  isCallExpression,
  isIdentifier,
  isVariableDeclarator,
} from './rule-types';

/** Type nodes an annotation can nest the reference inside — `Mocked<T> & { … }`, `Mocked<T>[]`, a union. */
const TYPE_COMPOSITES = new Set(['TSArrayType', 'TSIntersectionType', 'TSUnionType']);

/**
 * The calls that answer with a value `Spy<T>` accepts.
 *
 * Deliberately not the `SPY_FACTORIES` set `prefer-create-spy-from-class` reads: this one also
 * counts the two that hand an *existing* double back (`asSpy`, `injectSpy`), and adding those there
 * would stop that rule flagging the hand-rolled object inside `asSpy({ a: vi.fn(), b: vi.fn() })`.
 */
const SPY_SOURCES = new Set([
  'asSpy',
  'autoMocked',
  'createAutoMock',
  'createMock',
  'createSpyClass',
  'createSpyFromClass',
  'injectSpy',
  'mockConstructor',
  'mockDeep',
]);

/** A declared name, and the value its own declaration gives it. */
export interface AnnotatedVariable {
  name: string;
  /** The initialiser, when the declaration has one. */
  init: EsNode | null;
}

/**
 * The variable a type reference annotates, when annotating a variable is what it does.
 *
 * A parameter, a return type and an `as` expression all reach the same `Mocked<T>` identifier and
 * none of them has an initialiser to judge — those keep the plain fix, exactly as before. The walk
 * up through composite types is what finds the case this exists for: the intersection in
 * `Mocked<Pick<Registry, 'metrics'>> & { contentType: string }` sits between the reference and the
 * annotation.
 */
export function annotatedVariable(reference: EsNode): AnnotatedVariable | undefined {
  let current = reference;

  while (TYPE_COMPOSITES.has(current.parent.type)) {
    current = current.parent;
  }

  if (current.parent.type !== 'TSTypeAnnotation') {
    return undefined;
  }

  const annotated = current.parent.parent;

  if (!isIdentifier(annotated) || !isVariableDeclarator(annotated.parent)) {
    return undefined;
  }

  return { name: annotated.name, init: annotated.parent.init };
}

/** Whether a value came out of one of this library's factories, and is therefore already a `Spy<T>`. */
export function buildsLibraryDouble(node: EsNode): boolean {
  return isCallExpression(node) && isIdentifier(node.callee) && SPY_SOURCES.has(node.callee.name);
}

/** The identifier of a `Mocked<…>` annotation, whose parent the selector guarantees to be the type reference. */
export interface EsMockedTypeName extends EsIdentifier {
  parent: EsTypeReference;
}

/**
 * Whether the annotation is `Mocked<SomeNamedType>` and nothing more inventive.
 *
 * `Mocked<{ isKeyEnabled: Mock }>` is a real shape in migrated suites, and `Spy<T>` reads a *class*
 * or interface — handing it an object literal of `Mock`s asks a different question of the type
 * system than the one the rule is making. Reported, never rewritten.
 */
export function namesOneType(reference: EsTypeReference): boolean {
  const params = reference.typeArguments?.params ?? [];

  return params.length === 1 && params.every((param) => param.type === 'TSTypeReference');
}

/** Rename the annotation, import `Spy`, and drop the `Mocked` import once nothing else uses it. */
export function spyTypeFixes(context: RuleContext, fixer: EsFixer, node: EsMockedTypeName, mocked: EsVariable | undefined): EsFix[] {
  const edits = [fixer.replaceText(node, 'Spy')];

  if (bindingState(context.sourceCode.getScope(node), 'Spy') === 'free') {
    edits.push(insertImport(fixer, `import type { Spy } from '${PACKAGE}';`));
  }

  // One reference left means this is it: renaming it orphans the import. Several, and the import is
  // dropped on the pass that rewrites the last one — ESLint re-lints after every applied fix.
  const orphaned = mocked?.references.length === 1 ? dropNamedImport(context.sourceCode, fixer, mocked) : undefined;

  if (orphaned) {
    edits.push(orphaned);
  }

  return edits;
}

/**
 * Whether the rename is the *whole* edit: every value the annotated name is given came out of one
 * of this library's factories, so it is a `Spy<T>` already.
 *
 * The assignments are matched by name rather than by binding, and that is safe in the one direction
 * that matters: a same-named assignment in some other scope can only ever demote a fix to a
 * suggestion, never promote one. An annotation that belongs to no variable at all — a parameter, a
 * return type, an `as` expression — has no creation site in view and keeps the plain fix, which is
 * also what stops `--fix` from rewriting a declaration and leaving the cast beneath it saying
 * `Mocked`.
 */
export function rewritesTheWholeDeclaration(node: EsMockedTypeName, assignments: Map<string, EsNode[]>): boolean {
  const variable = annotatedVariable(node.parent);

  if (!variable) {
    return true;
  }

  const initialisers = variable.init ? [variable.init] : [];

  return [...initialisers, ...(assignments.get(variable.name) ?? [])].every(buildsLibraryDouble);
}
