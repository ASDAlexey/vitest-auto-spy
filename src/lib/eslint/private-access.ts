/**
 * Reading a `private` / `protected` member out of a spec — the two spellings that get past the
 * compiler, and the only rule here that needs a type checker.
 *
 * `instance['secret']` is not a loophole TypeScript forgot to close: bracket access is how an index
 * signature is read, and the visibility check is deliberately spelled only on the dotted form. So a
 * spec written that way compiles, runs, and pins a member the class never promised anybody —
 * renaming it is a green refactor that turns red in a test file, and the test proves nothing about
 * what a caller can actually do.
 *
 * **The whole rule is the type check.** The same brackets are ordinary and everywhere:
 * `process.env['APP_KM_ENABLED']`, `dataset['error']`, `queryParams['isShowPurchaseModal']` are index
 * signatures, and `ProductOffer['subscription']` in a type position is an indexed access type. A
 * syntactic version of this rule would report all of them, be switched off within a day, and leave
 * the suite worse off than with no rule — so nothing is reported unless the checker resolves the
 * name to a class member declared `private` or `protected`. Without parser services
 * (`parserOptions.project` / `projectService` absent) it reports nothing at all rather than
 * guessing: a type-aware rule that degrades into a syntactic one is the noisy rule wearing a hat.
 *
 * Resolution goes through the **object's type**, not through `getSymbolAtLocation` on the element
 * access — that answers nothing for `a['b']`, which is the shape this rule exists for. The name
 * comes from the literal *type* of the key rather than from the source text, so a key parked in a
 * `const` resolves the same way an inline string does.
 *
 * The second shape needs no types at all, because nothing about it is ambiguous:
 * `vi.spyOn(Object.getPrototypeOf(component), 'privateMethod')` reaches the prototype precisely to
 * step around the modifier, and `Object.getPrototypeOf` is typed `any`, so no checker would have an
 * opinion on it anyway.
 */
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsMemberExpression,
  type EsNode,
  type EsToTsMap,
  type RuleContext,
  type RuleModule,
  type TsNode,
  isCallExpression,
  isCast,
  isIdentifier,
  isMemberCall,
} from './rule-types';

/** The modifiers that make a member somebody else's business. */
const HIDDEN = new Set(['private', 'protected']);

/** `vi.spyOn` / `jest.spyOn`, the call the prototype escape is always written for. */
const RUNNERS = new Set(['jest', 'vi']);

const SPY_ON = new Set(['spyOn']);

const GET_PROTOTYPE_OF = new Set(['getPrototypeOf']);

const OBJECT = new Set(['Object']);

/** What a resolved report needs: which modifier hides the member, and what it is called. */
interface HiddenMember {
  accessibility: string;
  name: string;
}

/** The parser's type-aware services, once both of them are known to be there. */
interface TypeServices {
  checker: {
    getTypeAtLocation(node: TsNode): {
      getProperty(name: string): { readonly declarations?: readonly TsNode[] } | undefined;
      readonly value?: unknown;
    };
  };
  toTs: EsToTsMap;
}

/**
 * The services `@typescript-eslint/parser` publishes when it was given a project, and nothing when
 * it was not.
 *
 * Both or neither: the property is `{}` under a parser with no type information at all, and
 * `program` is absent under `@typescript-eslint/parser` without `project` / `projectService`. Both
 * are the same answer for this rule — say nothing.
 */
function typeServices(context: RuleContext): TypeServices | undefined {
  const { program, esTreeNodeToTSNodeMap } = context.sourceCode.parserServices;

  if (!program || !esTreeNodeToTSNodeMap) {
    return undefined;
  }

  return { checker: program.getTypeChecker(), toTs: esTreeNodeToTSNodeMap };
}

/**
 * The member name a computed key spells, read off its **type**.
 *
 * A literal type is the only kind carrying a `value`, and a string one is the only kind that names a
 * member — so this one check covers the inline `obj['secret']` and the `const KEY = 'secret'` parked
 * above it, and answers nothing for `obj[key]` where `key` is a plain `string`, which is an index
 * read and none of this rule's business.
 */
function keyName(services: TypeServices, property: EsNode): string | undefined {
  const value: unknown = services.checker.getTypeAtLocation(services.toTs.get(property)).value;

  return typeof value === 'string' ? value : undefined;
}

/**
 * `'private'` / `'protected'` when a declaration of the member carries one, otherwise nothing.
 *
 * The modifier is read as **text** off the TypeScript declaration. Two alternatives were tried and
 * are worse. `ts.SyntaxKind` numbers would pin this plugin to a TypeScript version and put
 * `typescript` in the way of every consumer of the published `.d.ts`. The ESTree `accessibility`
 * field is the obvious answer and was the first implementation — but it is only reachable through
 * `tsNodeToESTreeNodeMap`, a map that covers the **linted file alone**, and the class under test is
 * declared in another file nine times out of ten. That version reported nothing at all on the shape
 * the rule exists for, while passing every single-file test written for it.
 *
 * A declaration with no modifiers is the quiet case this rule is built around, and it is also what a
 * member of `lib.es5.d.ts` or of a package's `.d.ts` looks like from here.
 */
function hiddenBy(declarations: readonly TsNode[]): string | undefined {
  return declarations
    .flatMap((declaration) => declaration.modifiers ?? [])
    .map((modifier) => modifier.getText())
    .find((text) => HIDDEN.has(text));
}

/**
 * The expression a chain of casts was applied to.
 *
 * Unwrapping is what makes the third form work, and it has to go all the way down rather than one
 * step: `service as unknown as { hidden: T }` puts `unknown` in the middle, and asking the checker
 * about *that* answers nothing. The bottom of the chain is the only node still carrying the real
 * type, and it is the one the modifier has to be read from.
 */
function underlying(node: EsNode): EsNode {
  let current = node;

  while (isCast(current)) {
    current = current.expression;
  }

  return current;
}

/**
 * The name a member access reads, or nothing when this access is none of the rule's business.
 *
 * Two spellings reach a hidden member, and they need opposite treatment. A **computed** key is
 * always worth resolving: `obj['x']` is not visibility-checked whatever `obj` is. A **dotted** one is
 * checked by the compiler and therefore fine — unless the object was cast first, which is the third
 * escape (`(service as any).hidden`). So the dotted branch asks the checker only when there is a cast
 * in front of it, which is also what keeps the rule off every `a.b` in the file.
 */
function accessedName(services: TypeServices, node: EsMemberExpression): string | undefined {
  if (node.computed) {
    return keyName(services, node.property);
  }

  return isCast(node.object) && isIdentifier(node.property) ? node.property.name : undefined;
}

/** The member `node` reads, when the checker resolves it to one the class hid. */
export function hiddenMemberOf(context: RuleContext, node: EsMemberExpression): HiddenMember | undefined {
  const services = typeServices(context);

  if (!services) {
    return undefined;
  }

  const name = accessedName(services, node);

  if (name === undefined) {
    return undefined;
  }

  const target = services.toTs.get(underlying(node.object));
  const declarations = services.checker.getTypeAtLocation(target).getProperty(name)?.declarations;
  const accessibility = declarations && hiddenBy(declarations);

  return accessibility === undefined ? undefined : { accessibility, name };
}

/** Whether a call is `vi.spyOn(Object.getPrototypeOf(x), …)`, or the `jest` spelling of it. */
function spiesThroughPrototype(node: EsCallExpression): boolean {
  const [target] = node.arguments;

  return (
    isMemberCall(node, RUNNERS, SPY_ON) &&
    target !== undefined &&
    isCallExpression(target) &&
    isMemberCall(target, OBJECT, GET_PROTOTYPE_OF)
  );
}

/** `component['privateMethod']()` → a test written against something no caller can reach. */
export const noPrivateMemberAccess: RuleModule = defineRule({
  anchor: '-a-service-without-di',
  description: 'Do not reach a private or protected member from a spec; test through the public surface',
  messages: {
    noPrivateMemberAccess:
      "`{{name}}` is declared `{{accessibility}}`, and bracket access is how a spec gets past that: TypeScript checks visibility on `obj.{{name}}` and not on `obj['{{name}}']`, because the second spelling is also how an index signature is read. So this compiles, runs, and pins a member the class never promised anyone — renaming it is a green refactor that turns red in a test file, and nothing here proves what a caller can do. Drive the member through the public API that uses it, and assert the effect. On a **component**, the rendered template is the other public surface, and it is the one `protected` members exist for: `renderShallow(Cmp)` and read the DOM rather than the field. When nothing public reaches it at all, that is a fact about the design rather than a reason to step around the modifier — the member either wants to be public, or wants to move into a collaborator the spec can provide a double for.",
    noCastPastModifier:
      '`{{name}}` is declared `{{accessibility}}`, and the cast in front of it is what makes this line compile: the dotted access **is** visibility-checked, so the modifier was removed by retyping the object rather than by reaching around it. `as any`, `as unknown as { {{name}}: … }` and a decoy interface declared in the spec are the same move, and it leaves the same test — one pinned to a member no caller can reach, red on a rename that no caller could have noticed. Drive the member through the public API that uses it, and assert the effect. On a **component**, the rendered template is the other public surface, and it is the one `protected` members exist for: `renderShallow(Cmp)` and read the DOM rather than the field. When nothing public reaches it at all, that is a fact about the design rather than a reason to retype the object.',
    noPrototypeSpy:
      '`Object.getPrototypeOf(...)` is here to reach a method the class hid, and spying it pins an implementation detail: the test then fails on a rename that no caller could have noticed. It is also a worse double than it looks — it patches the **prototype**, so every instance in the worker sees it, and `vi.restoreAllMocks()` is the only thing that puts it back. Assert through the public method that calls it, or provide the collaborator it delegates to with `provideAutoSpy(X)` and assert on that.',
  },
  create: (context) => ({
    MemberExpression: (node: EsMemberExpression): void => {
      const hidden = hiddenMemberOf(context, node);

      if (hidden) {
        context.report({
          node,
          messageId: isCast(node.object) ? 'noCastPastModifier' : 'noPrivateMemberAccess',
          data: { ...hidden },
        });
      }
    },

    CallExpression: (node: EsCallExpression): void => {
      if (spiesThroughPrototype(node)) {
        context.report({ node, messageId: 'noPrototypeSpy' });
      }
    },
  }),
});
