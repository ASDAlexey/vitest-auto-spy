/**
 * `expect(component.total()).toBe(3)` — the signal is read inline, and the failure output names a
 * number, not the signal that produced it.
 *
 * `toHaveSignalValue` — the matcher `registerSignalMatchers()` registers — asserts the same value
 * and reports which signal was wrong, while refusing anything that is not a zero-argument getter,
 * so the "forgot the parentheses" mistake fails instead of silently passing. The rule rewrites the
 * assertions a signal value is usually spelled with: `toBe` and `toEqual` become
 * `toHaveSignalValue`, `toStrictEqual` passes `{ strict: true }` and keeps the comparison it had;
 * `toBeNull()` and `toBeUndefined()` become `toHaveSignalValue(null)` / `toHaveSignalValue(undefined)`.
 *
 * **The signal is recognised by its type, not by its name.** A getter, a plain function or a
 * no-argument method call must stay unreported, and only the checker tells them apart: Angular
 * brands every signal it makes with `ɵSIGNAL`, so the rule asks about the type of the *callee* —
 * `component.total`, not the value `component.total()` returned — and reports nothing unless that
 * type both carries the brand and is callable. Without parser services (`parserOptions.project` /
 * `projectService` absent) it reports nothing at all rather than guessing, like every type-aware
 * rule here.
 *
 * The fix is two text edits — drop the parentheses, rename the matcher — and is issued only for a
 * received call without type arguments of its own, which a text move would silently drop.
 *
 * `toBe` is an identity check and `toHaveSignalValue` compares deeply, so a `toBe` is left alone unless
 * the expected value is a primitive literal or the signal holds a primitive type.
 */
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsCallExpression,
  type EsFix,
  type EsIdentifier,
  type EsNode,
  type RuleContext,
  type RuleModule,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
} from './rule-types';
import {
  type CheckerServices,
  PRIMITIVE_CHECKER_METHODS,
  type PrimitiveChecker,
  askChecker,
  checkerServices,
  isPrimitiveLike,
} from './use-value-types';

/** The assertions a signal value is usually spelled with. */
const MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual']);

/** The argument-free matchers that assert one value, and that value spelled as an argument. */
const VALUE_MATCHERS = new Map([
  ['toBeNull', 'null'],
  ['toBeUndefined', 'undefined'],
]);

/** Angular's brand on every signal it makes. */
const SIGNAL_BRAND = 'ɵSIGNAL';

/**
 * The same brand as the checker spells it: a symbol-keyed property is listed as `__@SIGNAL@53`, the
 * trailing number per program, and `getProperty('ɵSIGNAL')` by plain name finds none of them.
 */
const SIGNAL_BRAND_PROPERTY = /^__@(?:SIGNAL|ɵSIGNAL|ɵWRITABLE_SIGNAL)@\d+$/;

/** What a reported assertion is made of: the signal call that was read, and the matcher applied to it. */
interface SignalAssertion {
  readonly received: EsCallExpression;
  readonly matcher: EsIdentifier;
  readonly strict: boolean;
}

/** The `expect(signalCall()).toBe(…)` shape, or nothing when this call is none of the rule's business. */
function signalAssertionOf(node: EsCallExpression): SignalAssertion | undefined {
  const callee = node.callee;

  if (
    !isMemberExpression(callee) ||
    callee.computed ||
    !isIdentifier(callee.property) ||
    !(MATCHERS.has(callee.property.name) || VALUE_MATCHERS.has(callee.property.name))
  ) {
    return undefined;
  }

  let expected: EsNode = callee.object;

  // `expect(x).not.toBe(…)` unwraps to the same fix: the negation sits between expect and matcher
  if (isMemberExpression(expected) && !expected.computed && isIdentifier(expected.property) && expected.property.name === 'not') {
    expected = expected.object;
  }

  if (
    !isCallExpression(expected) ||
    !isIdentifier(expected.callee) ||
    expected.callee.name !== 'expect' ||
    expected.arguments.length !== 1
  ) {
    return undefined;
  }

  const received = expected.arguments.at(0);

  return received !== undefined && isCallExpression(received)
    ? { received, matcher: callee.property, strict: callee.property.name === 'toStrictEqual' }
    : undefined;
}

/** Whether the checker resolves `node` to a signal: callable, and branded with the signal brand. */
function readsSignal(context: RuleContext, node: EsNode): boolean {
  const { program, esTreeNodeToTSNodeMap } = context.sourceCode.parserServices;

  if (!program || !esTreeNodeToTSNodeMap) {
    return false;
  }

  const type = program.getTypeChecker().getTypeAtLocation(esTreeNodeToTSNodeMap.get(node));
  const signatures = type.getCallSignatures();

  return (
    type.getProperties().some((property) => property.getName() === SIGNAL_BRAND || SIGNAL_BRAND_PROPERTY.test(property.getName())) &&
    signatures.length > 0
  );
}

function isPrimitiveLiteral(node: EsNode | undefined): boolean {
  if (node === undefined) {
    return false;
  }

  switch (node.type) {
    case 'Literal':
      return Reflect.get(node, 'regex') === undefined;
    case 'Identifier':
      return isIdentifier(node) && node.name === 'undefined';
    case 'UnaryExpression':
      return isPrimitiveLiteral(Reflect.get(node, 'argument'));
    case 'TemplateLiteral':
      return Reflect.get(node, 'expressions')?.length === 0;
    default:
      return false;
  }
}

function primitiveValue({ checker, toTs }: CheckerServices<PrimitiveChecker>, received: EsCallExpression): boolean {
  const value = checker.getTypeAtLocation(toTs.get(received));

  return checker.typeToString(value) !== 'any' && isPrimitiveLike(checker, value);
}

/** Whether rewriting `toBe` into the deep `toHaveSignalValue` keeps what the assertion meant. */
function identityIsMoot(context: RuleContext, node: EsCallExpression, shape: SignalAssertion): boolean {
  if (shape.matcher.name !== 'toBe' || isPrimitiveLiteral(node.arguments.at(0))) {
    return true;
  }

  const services = checkerServices<PrimitiveChecker>(context, PRIMITIVE_CHECKER_METHODS);

  return services !== undefined && askChecker(() => primitiveValue(services, shape.received)) === true;
}

/** Assert the signal itself, and let `toHaveSignalValue` read it. */
export const preferToHaveSignalValue: RuleModule = defineRule({
  name: 'prefer-to-have-signal-value',
  description: 'Assert a signal with toHaveSignalValue instead of reading it inline into toBe/toEqual/toBeNull',
  messages: {
    preferToHaveSignalValue:
      "Assert the signal, not the value it happens to hold: `expect({{signal}}).toHaveSignalValue(…)` keeps the signal's name in the failure output and refuses a value that is not a signal.",
  },
  fixable: true,
  create: (context) => ({
    CallExpression: (node: EsCallExpression): void => {
      const shape = signalAssertionOf(node);

      if (!shape || !readsSignal(context, shape.received.callee) || !identityIsMoot(context, node, shape)) {
        return;
      }

      context.report({
        node,
        messageId: 'preferToHaveSignalValue',
        data: { signal: excerpt(context, shape.received.callee, 40) },
        ...(shape.received.typeArguments === undefined && {
          fix: (fixer): EsFix[] => {
            const value = VALUE_MATCHERS.get(shape.matcher.name);
            const fixes = [
              fixer.replaceText(shape.received, context.sourceCode.getText(shape.received.callee)),
              value === undefined
                ? fixer.replaceText(shape.matcher, 'toHaveSignalValue')
                : fixer.replaceTextRange([shape.matcher.range[0], node.range[1]], `toHaveSignalValue(${value})`),
            ];
            const last = node.arguments.at(-1);

            if (shape.strict && last !== undefined) {
              fixes.push(fixer.insertTextBeforeRange([last.range[1], last.range[1]], ', { strict: true }'));
            }

            return fixes;
          },
        }),
      });
    },
  }),
});
