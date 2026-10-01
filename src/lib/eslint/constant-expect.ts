/**
 * `expect(true).toBe(true)` — an assertion whose outcome the spelling of the spec already decided, so it
 * passes (or fails) the same way whatever the code under test does.
 */
import { EQUALITY_MATCHERS, matcherOf } from './absence-assertion';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsCallExpression,
  type EsNode,
  isArrayExpression,
  isCast,
  isObjectExpression,
  propertyName,
  propertyValue,
} from './rule-types';

/** Matchers that ask what kind of value it is — decided for any literal, whatever it holds. */
const CLASSIFIES = new Set(['toBeDefined', 'toBeFalsy', 'toBeNaN', 'toBeNull', 'toBeTruthy', 'toBeUndefined']);

/** Always an object, so never nullish, never falsy and never `NaN` — whatever is inside. */
const OBJECT_LITERALS = new Set([
  'ArrayExpression',
  'ArrowFunctionExpression',
  'ClassExpression',
  'FunctionExpression',
  'ObjectExpression',
]);

/** Values whose identity and content are fixed by the spelling alone. */
const LITERALS = new Set(['ArrowFunctionExpression', 'ClassExpression', 'FunctionExpression', 'Literal']);

function unwrapped(node: EsNode): EsNode {
  return isCast(node) ? unwrapped(node.expression) : node;
}

/** A value fixed by its spelling, down to every element. */
function isConstant(node: EsNode): boolean {
  const value = unwrapped(node);

  if (isArrayExpression(value)) {
    return value.elements.every((element) => element === null || isConstant(element));
  }

  if (isObjectExpression(value)) {
    return value.properties.every(
      (property) => propertyName(property) !== undefined && Reflect.get(property, 'kind') === 'init' && isConstant(propertyValue(property)),
    );
  }

  switch (value.type) {
    case 'Identifier':
      return Reflect.get(value, 'name') === 'undefined';
    case 'TemplateLiteral':
      return Reflect.get(value, 'expressions').length === 0;
    case 'UnaryExpression':
      return isConstant(Reflect.get(value, 'argument'));
    default:
      return LITERALS.has(value.type);
  }
}

function isDecided(actual: EsNode, matcher: { name: string; args: EsNode[] }): boolean {
  if (EQUALITY_MATCHERS.has(matcher.name)) {
    return isConstant(actual) && matcher.args.every(isConstant);
  }

  return CLASSIFIES.has(matcher.name) && (OBJECT_LITERALS.has(unwrapped(actual).type) || isConstant(actual));
}

export const noConstantExpect = defineRule({
  name: 'no-constant-expect',
  description: 'Assert on a value the code under test produced, not on one the spec spelled out',
  messages: {
    noConstantExpect:
      "`expect({{actual}}).{{matcher}}(…)` checks a value written in the spec, so it gives the same answer on every run whatever the code under test does. Assert on something the code under test produced; for a line that must never run, write `expect.fail('…')`.",
  },
  create: (context) => ({
    'CallExpression[callee.name="expect"]': (node: EsCallExpression): void => {
      const [actual] = node.arguments;
      const matcher = matcherOf(node);

      if (actual && matcher && isDecided(actual, matcher)) {
        context.report({ node, messageId: 'noConstantExpect', data: { actual: excerpt(context, actual, 40), matcher: matcher.name } });
      }
    },
  }),
});
