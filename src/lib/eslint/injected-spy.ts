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
import { PACKAGE, bindingState, dropNamedImport, findBinding, initializerOf, insertImport } from './bindings';
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsNode,
  type EsTypeReference,
  type EsVariable,
  type RuleContext,
  type RuleModule,
  type SuggestionDescriptor,
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

/**
 * The tokens `prefer-inject-spy` says nothing about, because for these the advice is not a
 * trade-off — it is either impossible or it deletes the thing the spec came for.
 *
 * - `DestroyRef` cannot be substituted at all. It carries `__NG_ENV_ID__`, and `R3Injector.get()`
 *   answers `token[NG_ENV_ID](this)` on the first line of the method, *before* it reads its own
 *   records — so `{ provide: DestroyRef, useValue }` is accepted, ignored, and never mentioned
 *   again. It is the only class in `@angular/core` carrying that flag, which is why the rest of
 *   this list is argued differently.
 * - `ApplicationRef` is the harness. `TestBed` drives change detection through it, and a spec that
 *   creates a component by hand reads the renderer out of `ApplicationRef.injector`; an auto-spy
 *   answers `undefined` there and the component never comes up. The real shape is the one this
 *   list was written from: the instance stays real and `attachView` / `detachView` are spied so
 *   nothing is attached.
 * - `Injector` and `EnvironmentInjector` answer *other* dependencies. Spied, `get()` returns a
 *   spy for every token that follows, so the substitution propagates to everything the code under
 *   test resolves lazily.
 * - `HttpClient` has a framework-sanctioned double already: `provideHttpClientTesting()` swaps the
 *   backend and hands the spec a `HttpTestingController`. A spy on `get` there is an assertion
 *   about the options the caller passed, taken on the way to a request the controller still flushes.
 *
 * Node-injector tokens (`ElementRef`, `Renderer2`, `ChangeDetectorRef`) are deliberately absent:
 * `TestBed.inject()` cannot hand any of them back — there is no such record in an environment
 * injector — so an entry for them would exempt a line that cannot be written.
 */
const KEPT_REAL_TOKENS = ['ApplicationRef', 'DestroyRef', 'EnvironmentInjector', 'HttpClient', 'Injector'];

/** The rule's options: further tokens to leave alone, added to the ones above rather than replacing them. */
export const INJECTED_SPY_SCHEMA = [
  {
    type: 'object',
    properties: { ignoreTokens: { type: 'array', items: { type: 'string' }, uniqueItems: true } },
    additionalProperties: false,
  },
];

/**
 * Whether the token this instance was injected with is one the rule stays quiet about.
 *
 * Tokens are compared as source text, the same way `no-unregistered-inject-spy` compares them: a
 * rule that reads one file has no identity to compare, and the text is what a project configuring
 * `ignoreTokens` can see. An aliased import (`import { DestroyRef as NgDestroyRef }`) therefore
 * misses this list and is reported — with a message that says what to do about it.
 */
export function keepsTheRealInstance(context: RuleContext, injectCall: EsCallExpression): boolean {
  const [token] = injectCall.arguments;

  if (!token) {
    return false;
  }

  const text = context.sourceCode.getText(token);
  const configured: unknown = Reflect.get(Object(context.options[0]), 'ignoreTokens');

  return KEPT_REAL_TOKENS.includes(text) || (Array.isArray(configured) && configured.includes(text));
}

/** The string a literal argument spells, when it is one and it can be written after a dot. */
function memberName(node: EsNode | undefined): string | undefined {
  const value: unknown = node?.type === 'Literal' ? Reflect.get(node, 'value') : undefined;

  return typeof value === 'string' && /^[$A-Z_a-z][\w$]*$/.test(value) ? value : undefined;
}

/**
 * `injectSpy(Token).method` for a `vi.spyOn` that is provably about an injected instance, or nothing
 * when any part of the rewrite would have to be invented.
 *
 * `TestBed.inject(X, null, InjectFlags.Optional)` is deliberately not translated: `injectSpy` takes
 * the token alone, and dropping the rest would change which instance — if any — comes back.
 */
export function injectSpySuggestion(
  context: RuleContext,
  node: EsCallExpression,
  injectCall: EsCallExpression,
): SuggestionDescriptor | undefined {
  const [token, ...extra] = injectCall.arguments;
  const method = memberName(node.arguments[1]);
  const state = bindingState(context.sourceCode.getScope(node), 'injectSpy');

  if (!token || extra.length > 0 || method === undefined || state === 'taken') {
    return undefined;
  }

  const replacement = `injectSpy(${context.sourceCode.getText(token)}).${method}`;

  return {
    desc: `Read the spy from DI instead: ${replacement}`,
    fix: (fixer): EsFix[] => {
      const edits = [fixer.replaceText(node, replacement)];

      if (state === 'free') {
        edits.push(insertImport(fixer, `import { injectSpy } from '${PACKAGE}/angular';`));
      }

      return edits;
    },
  };
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

/** `TestBed.inject(X) as Spy<X>` → `asSpy(TestBed.inject(X))`. */
export const preferAsSpy: RuleModule = defineRule({
  anchor: '-reading-a-spy-back-from-di',
  description: 'Read a spy back out of the container with asSpy(), not with a cast to Spy<T>',
  fixable: true,
  messages: {
    preferAsSpy:
      'A cast is not how a spy comes back out of a container. `TestBed.inject(X) as Spy<X>` is the line a `jest-auto-spies` suite carries in every file, and it stops compiling here: `Spy<T>` adds `accessorSpies` and the per-method helpers, so neither type sufficiently overlaps the other and the line fails with `TS2352: Conversion of type ‘X’ to type ‘Spy<X>’ may be a mistake`. `asSpy(...)` makes exactly the same assertion as a typed identity function — the same object at run time, the same claim, no cast — and `injectSpy(X)` is that with the `TestBed.inject` folded in. Neither is for the object under test: a service a spec exercises is not a double, and typing it as the class is the repair there.',
  },
  create: (context) => ({
    'TSAsExpression[typeAnnotation.type="TSTypeReference"][typeAnnotation.typeName.name="Spy"]': (node: EsSpyCast): void => {
      const spy = findBinding(context.sourceCode.getScope(node), 'Spy');

      // A `Spy` the file declares itself is not this library's, whatever it is called — and unlike
      // `no-mocked-for-spy`, which reports a `Mocked<T>` it cannot rewrite because the *declaration*
      // is wrong either way, there is nothing to say about a cast to somebody else's type.
      if (spy && !spy.defs.some((definition) => definition.type === 'ImportBinding')) {
        return;
      }

      const value = assertedValue(node);

      if (!value) {
        return;
      }

      const rewritable = bindingState(context.sourceCode.getScope(node), 'asSpy') !== 'taken';

      context.report(
        rewritable
          ? { node, messageId: 'preferAsSpy', fix: (fixer: EsFixer): EsFix[] => asSpyFixes(context, fixer, node, value, spy) }
          : { node, messageId: 'preferAsSpy' },
      );
    },
  }),
});
