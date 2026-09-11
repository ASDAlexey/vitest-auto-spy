/**
 * `expect(true).toBe(true)` — an assertion whose outcome the spelling of the spec already decided, so it
 * passes (or fails) the same way whatever the code under test does.
 */
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsNode,
  isArrayExpression,
  isCallExpression,
  isCast,
  isObjectExpression,
  memberName,
  propertyName,
  propertyValue,
} from './rule-types';

/** Matchers that compare the value with their argument — decided when both sides are spelled out. */
const COMPARES = new Set(['toBe', 'toEqual', 'toStrictEqual']);

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

/** The matcher an `expect(…)` chain ends in, read through any number of `.not` — `undefined` past `.resolves` or a bare chain. */
function matcherOf(expectCall: EsCallExpression): { name: string; args: EsNode[] } | undefined {
  let member = expectCall.parent;

  while (memberName(member) === 'not') {
    member = member.parent;
  }

  const name = memberName(member);
  const call = member.parent;

  return name && isCallExpression(call) && call.callee === member ? { name, args: call.arguments } : undefined;
}

function isDecided(actual: EsNode, matcher: { name: string; args: EsNode[] }): boolean {
  if (COMPARES.has(matcher.name)) {
    return isConstant(actual) && matcher.args.every(isConstant);
  }

  return CLASSIFIES.has(matcher.name) && (OBJECT_LITERALS.has(unwrapped(actual).type) || isConstant(actual));
}

export const noConstantExpect = defineRule({
  anchor: '-a-promise-a-test-forgets-to-await',
  description: 'Assert on a value the code under test produced, not on one the spec spelled out',
  messages: {
    noConstantExpect:
      'This assertion was decided when the spec was written: `expect` is handed a value spelled out in the spec, and ' +
      '`{{matcher}}` gives the same answer for it on every run, whatever the code under test does — so a test whose only ' +
      'assertion this is proves that the file loaded, and nothing else. Assert on something the code under test produced. ' +
      "If the line marks a branch the test must never reach, `expect.fail('…')` says that and names the branch.",
  },
  create: (context) => ({
    'CallExpression[callee.name="expect"]': (node: EsCallExpression): void => {
      const [actual] = node.arguments;
      const matcher = matcherOf(node);

      if (actual && matcher && isDecided(actual, matcher)) {
        context.report({ node, messageId: 'noConstantExpect', data: { matcher: matcher.name } });
      }
    },
  }),
});
