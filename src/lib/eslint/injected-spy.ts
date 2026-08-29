/**
 * How a spy comes back out of the DI container, and the two shapes a migrated suite writes it in.
 *
 * `TestBed.inject(X)` is typed against the class, so a spec that wants the spy surface has to say so
 * — and `jest-auto-spies` said it with a cast, `TestBed.inject(X) as Spy<X>`, written once per
 * injected double. That cast is what stops compiling under this library: `Spy<T>` adds
 * `accessorSpies` and the per-method helpers, so neither type sufficiently overlaps the other.
 *
 * Both rules that read this file are about that one line, from opposite sides. `prefer-inject-spy`
 * reports the instance being re-spied with `vi.spyOn`, which is a run-time defect; `prefer-as-spy`
 * reports the cast, which is a correct intention spelled in a way the compiler no longer takes.
 */
import { PACKAGE, bindingState, dropNamedImport, initializerOf, insertImport } from './bindings';
import {
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsNode,
  type EsTypeReference,
  type EsVariable,
  type RuleContext,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
} from './rule-types';

/** Whether a node is `TestBed.inject(...)`, the call whose result should have been read with `injectSpy`. */
export function isTestBedInject(node: EsNode): node is EsCallExpression {
  if (
    !isCallExpression(node) ||
    !isMemberExpression(node.callee) ||
    !isIdentifier(node.callee.object) ||
    !isIdentifier(node.callee.property)
  ) {
    return false;
  }

  return node.callee.object.name === 'TestBed' && node.callee.property.name === 'inject';
}

/** The `TestBed.inject()` behind a plain name, when the name is one and it holds one. */
export function injectedFromVariable(context: RuleContext, target: EsNode): EsCallExpression | undefined {
  if (!isIdentifier(target)) {
    return undefined;
  }

  const initializer = initializerOf(context.sourceCode.getScope(target), target);

  return initializer && isTestBedInject(initializer) ? initializer : undefined;
}

/** A type assertion — `x as T`, whatever `T` turns out to be. */
interface EsAsExpression extends EsNode {
  expression: EsNode;
  typeAnnotation: EsNode;
}

/** The one the selector matches: an assertion whose type is a reference spelled `Spy`. */
export interface EsSpyCast extends EsAsExpression {
  typeAnnotation: EsTypeReference;
}

/** Narrow to a type assertion, the same discriminant check ESLint's own selectors perform. */
function isAsExpression(node: EsNode): node is EsAsExpression {
  return node.type === 'TSAsExpression';
}

/**
 * The value the assertion is about, or nothing when the file itself says the value is not one.
 *
 * `x as Spy<T>` asserts that `x` **is** the spy, so the value is `x` and the rewrite is exact.
 * `x as unknown as Spy<T>` asserts the opposite — the hop through `unknown` is there precisely
 * because `x` and `T` have nothing to do with each other — and `asSpy<T>(x)` would then be a call
 * whose argument does not type-check. The one shape where that second form still means the first is
 * the injected instance: `TestBed.inject(X)` answers an `X` by construction, and the `as unknown`
 * was added to silence the very `TS2352` this is about. Everything else keeps its cast and its
 * silence — a double cast over a hand-built object wants a real double (`createAutoMock<T>()`),
 * which is another rule's business.
 */
export function assertedValue(node: EsSpyCast): EsNode | undefined {
  const { expression } = node;

  if (!isAsExpression(expression)) {
    return expression;
  }

  return expression.typeAnnotation.type === 'TSUnknownKeyword' && isTestBedInject(expression.expression)
    ? expression.expression
    : undefined;
}

/** Rewrite the cast as the call, import `asSpy`, and drop a `Spy` import the rewrite orphans. */
export function asSpyFixes(context: RuleContext, fixer: EsFixer, node: EsSpyCast, value: EsNode, spy: EsVariable | undefined): EsFix[] {
  const { sourceCode } = context;
  // The type arguments are carried across rather than left to inference: `Spy<T, Options>` and
  // `asSpy<T, Options>` take the same parameter list, so moving them is a transposition and the line
  // after the fix asserts character for character what the line before it did. Inference is not
  // that — on a generic class `TestBed.inject` answers `Service<any>`, and the `any` surfaces eight
  // levels down as a mismatch between `AddPromiseSpyMethods<unknown>` and `WithMockReturnValue<…>`,
  // with nothing in the message pointing back here.
  const { typeArguments } = node.typeAnnotation;
  const call = `asSpy${typeArguments ? sourceCode.getText(typeArguments) : ''}(${sourceCode.getText(value)})`;
  const edits = [fixer.replaceText(node, call)];

  if (bindingState(sourceCode.getScope(node), 'asSpy') === 'free') {
    edits.push(insertImport(fixer, `import { asSpy } from '${PACKAGE}';`));
  }

  // The cast was the last thing naming the type: the same bookkeeping `no-mocked-for-spy` does, and
  // for the same reason — a file left importing a name nothing mentions fails a lint rule of its own.
  const orphaned = spy?.references.length === 1 ? dropNamedImport(sourceCode, fixer, spy) : undefined;

  if (orphaned) {
    edits.push(orphaned);
  }

  return edits;
}
