/**
 * Test data written inline in a spec: one literal too long to read past, or the same literal spelled
 * out again and again. Both belong in a `*.mock.ts` file next to the spec, where one edit reaches every
 * test that uses the value.
 */
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsArrayExpression,
  type EsNode,
  type EsObjectExpression,
  type RuleContext,
  hasAncestor,
  isArrayExpression,
  isCallExpression,
  isFunctionNode,
  isObjectExpression,
  isRunnerCall,
  memberName,
  propertyName,
  propertyValue,
} from './rule-types';

const DEFAULT_MAX_LINES = 20;
const DEFAULT_REPEATS = 3;
const DEFAULT_MIN_VALUES = 2;

/** Where the literal is the file the rule points at, not the spec. */
const MOCK_FILE = /(?:^|[/\\])__mocks__[/\\]|\.(?:fixtures?|mocks?)\.[cm]?[jt]sx?$/;

/** Keys whose value wires a testing module rather than holding data. */
const WIRING_KEYS = new Set([
  'bootstrap',
  'declarations',
  'exports',
  'extraImports',
  'extraProviders',
  'imports',
  'providers',
  'schemas',
  'viewProviders',
]);

const MOCK_FACTORIES = new Set(['doMock', 'mock']);

/** Types a literal is spelled through without becoming another value: casts, `satisfies`, `!`. */
const WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);

function isLiteral(node: EsNode): node is EsArrayExpression | EsObjectExpression {
  return isObjectExpression(node) || isArrayExpression(node);
}

/** What a literal lists: its properties, or its elements without the holes. */
function members(node: EsArrayExpression | EsObjectExpression): EsNode[] {
  return isObjectExpression(node) ? node.properties : node.elements.filter((element) => element !== null);
}

/** The node a literal is an element or a property value of, read through casts and spreads. */
function container(node: EsNode): EsNode {
  let current = node.parent;

  while (WRAPPERS.has(current.type) || current.type === 'Property' || current.type === 'SpreadElement') {
    current = current.parent;
  }

  return current;
}

function isWiring(node: EsNode): boolean {
  return WIRING_KEYS.has(propertyName(node) ?? '');
}

/** `it.each([...])`, `describe.each([...])`: a table of cases reads best next to the test it drives. */
function isEachTable(node: EsNode): boolean {
  return isCallExpression(node) && memberName(node.callee) === 'each';
}

function isInMockFactory(node: EsNode): boolean {
  return isFunctionNode(node) && isCallExpression(node.parent) && isRunnerCall(node.parent, MOCK_FACTORIES);
}

/** A literal that holds a function holds behaviour — a hand-written double, an options object — not data. */
function holdsBehaviour(node: EsArrayExpression | EsObjectExpression): boolean {
  return members(node).some((member) => {
    const value = propertyName(member) === undefined ? member : propertyValue(member);

    return Reflect.get(member, 'method') === true || isFunctionNode(value) || (isLiteral(value) && holdsBehaviour(value));
  });
}

function isData(node: EsArrayExpression | EsObjectExpression): boolean {
  return (
    members(node).length > 0 &&
    !members(node).some(isWiring) &&
    !holdsBehaviour(node) &&
    !hasAncestor(node.parent, (ancestor) => isWiring(ancestor) || isEachTable(ancestor) || isInMockFactory(ancestor))
  );
}

/** The values a literal holds, nested literals opened up: `{ a: 1, b: [x, 'y'] }` holds `1`, `x` and `'y'`. */
function leaves(node: EsArrayExpression | EsObjectExpression): EsNode[] {
  return members(node).flatMap((member) => {
    const value = propertyName(member) === undefined ? member : propertyValue(member);

    return isLiteral(value) ? leaves(value) : [value];
  });
}

const isPrimitive = (node: EsNode): boolean =>
  node.type === 'Literal' || (node.type === 'UnaryExpression' && Reflect.get(Object(Reflect.get(node, 'argument')), 'type') === 'Literal');

/**
 * Worth a name in a mock file when repeated: `minValues` values at least, one of them spelled out.
 * `[node]`, `{ property }` and `{ method: 'GET' }` wrap a binding or pass one option, and naming them
 * hides more than it saves.
 */
function isRecord(node: EsArrayExpression | EsObjectExpression, minValues: number): boolean {
  const values = leaves(node);

  return values.length >= minValues && values.some(isPrimitive);
}

interface Limits {
  readonly maxLines: number;
  readonly repeats: number;
  readonly minValues: number;
}

function limits(context: RuleContext): Limits {
  const option = (name: keyof Limits, fallback: number): number => {
    const value: unknown = Reflect.get(Object(context.options[0]), name);

    return typeof value === 'number' ? value : fallback;
  };

  return {
    maxLines: option('maxLines', DEFAULT_MAX_LINES),
    repeats: option('repeats', DEFAULT_REPEATS),
    minValues: option('minValues', DEFAULT_MIN_VALUES),
  };
}

const lineCount = (node: EsNode): number => node.loc.end.line - node.loc.start.line + 1;

const within = (node: EsNode, outer: EsNode): boolean => node.range[0] >= outer.range[0] && node.range[1] <= outer.range[1];

const span = (node: EsNode): number => node.range[1] - node.range[0];

export const noInlineTestData = defineRule({
  name: 'no-inline-test-data',
  description: 'Keep long or repeated test data in a *.mock.ts file next to the spec',
  schema: [
    {
      type: 'object',
      properties: {
        maxLines: { type: 'integer', minimum: 1 },
        repeats: { type: 'integer', minimum: 2 },
        minValues: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    longLiteral:
      'This literal spans {{lines}} lines of test data (the limit is {{max}}). Move it to a `*.mock.ts` file next to the spec and import it, so the test shows what it checks rather than the data it feeds in.',
    repeatedLiteral:
      '`{{literal}}` is written {{count}} times in this file (first at line {{first}}). Export it once from a `*.mock.ts` file next to the spec and import it, so one edit reaches every test that uses it.',
  },
  create: (context) => {
    if (MOCK_FILE.test(context.filename)) {
      return {};
    }

    const { maxLines, repeats, minValues } = limits(context);
    const seen = new Map<string, { first: EsNode; rest: EsNode[] }>();

    const visit = (node: EsArrayExpression | EsObjectExpression): void => {
      if (isLiteral(container(node)) || !isData(node)) {
        return;
      }

      if (lineCount(node) > maxLines) {
        context.report({ node, messageId: 'longLiteral', data: { lines: String(lineCount(node)), max: String(maxLines) } });
      }
    };

    const collect = (node: EsArrayExpression | EsObjectExpression): void => {
      if (!isData(node) || !isRecord(node, minValues)) {
        return;
      }

      const key = context.sourceCode.getText(node).replace(/\s+/g, '');
      const group = seen.get(key);

      if (group) {
        group.rest.push(node);
      } else {
        seen.set(key, { first: node, rest: [] });
      }
    };

    return {
      'ObjectExpression, ArrayExpression': (node: EsArrayExpression | EsObjectExpression): void => {
        visit(node);
        collect(node);
      },
      'Program:exit': (): void => {
        const reported: EsNode[] = [];
        // Outermost first, so a repeated literal is reported once rather than once per repeated piece of it.
        const groups = [...seen.values()].filter((group) => group.rest.length + 1 >= repeats).sort((a, b) => span(b.first) - span(a.first));

        for (const { first, rest } of groups) {
          if (reported.some((outer) => within(first, outer))) {
            continue;
          }

          reported.push(first, ...rest);

          for (const node of rest) {
            context.report({
              node,
              messageId: 'repeatedLiteral',
              data: { literal: excerpt(context, node, 40), count: String(rest.length + 1), first: String(first.loc.start.line) },
            });
          }
        }
      },
    };
  },
});
