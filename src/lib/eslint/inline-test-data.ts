/**
 * Test data written inline in a spec: one literal too long to read past, or the same literal spelled
 * out again and again. Both belong in a `*.mock.ts` file next to the spec, where one edit reaches every
 * test that uses the value.
 */
import { findBinding } from './bindings';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsArrayExpression,
  type EsCast,
  type EsIdentifier,
  type EsNode,
  type EsObjectExpression,
  type EsSpreadElement,
  type RuleContext,
  anyInSubtree,
  hasAncestor,
  isArrayExpression,
  isCallExpression,
  isFunctionNode,
  isIdentifier,
  isMemberExpression,
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

/** Calls whose argument is the value the test expects rather than data it feeds in. */
const EXPECTATIONS = new Set([
  'arrayContaining',
  'lastCalledWith',
  'nthCalledWith',
  'objectContaining',
  'toBeCalledWith',
  'toContainEqual',
  'toEqual',
  'toHaveBeenCalledWith',
  'toHaveBeenLastCalledWith',
  'toHaveBeenNthCalledWith',
  'toHaveLastReturnedWith',
  'toHaveNthReturnedWith',
  'toHaveReturnedWith',
  'toMatchObject',
  'toStrictEqual',
]);

/** A tuple this short is a coordinate or an id list, not a record worth a name: `[1, 5]`, `['0', '1']`. */
const TUPLE_LENGTH = 3;
const TUPLE_ITEM_CHARS = 8;
const FLAG_KEYS = 3;
const SHORT_EXPECTED_KEYS = 3;

/** Types a literal is spelled through without becoming another value: casts, `satisfies`, `!`. */
const WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);

function isLiteral(node: EsNode): node is EsArrayExpression | EsObjectExpression {
  return isObjectExpression(node) || isArrayExpression(node);
}

const isSpread = (node: EsNode): node is EsSpreadElement => node.type === 'SpreadElement';

const isWrapper = (node: EsNode): node is EsCast => WRAPPERS.has(node.type);

const unwrap = (node: EsNode): EsNode => (isWrapper(node) ? unwrap(node.expression) : node);

/** The value a member holds: a property's value, a spread's argument, or the element itself. */
function memberValue(member: EsNode): EsNode {
  if (member.type === 'Property') {
    return propertyValue(member);
  }

  return isSpread(member) ? member.argument : member;
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

  return values.length >= minValues && values.some(isPrimitive) && !isTuple(node) && !isFlagBag(node);
}

function isTuple(node: EsArrayExpression | EsObjectExpression): boolean {
  return (
    isArrayExpression(node) &&
    node.elements.length <= TUPLE_LENGTH &&
    node.elements.every((element) => element !== null && isPrimitive(element) && span(element) <= TUPLE_ITEM_CHARS)
  );
}

/** `{ recursive: true, force: true }` switches behaviour on and off; it is an options bag, not a value under test. */
function isFlagBag(node: EsArrayExpression | EsObjectExpression): boolean {
  return (
    isObjectExpression(node) &&
    node.properties.length <= FLAG_KEYS &&
    node.properties.every(
      (property) => propertyName(property) !== undefined && typeof Reflect.get(propertyValue(property), 'value') === 'boolean',
    )
  );
}

const isExpectation = (node: EsNode): boolean => isCallExpression(node) && EXPECTATIONS.has(memberName(node.callee) ?? '');

const isExpected = (node: EsNode): boolean => isExpectation(container(node));

/** Anywhere inside an expected value: `{ id: 1 }` in `toEqual([{ id: 1 }])` is expected too. */
function isInExpected(node: EsNode): boolean {
  let current = container(node);

  while (isLiteral(current)) {
    current = container(current);
  }

  return isExpectation(current);
}

/** `{ name: 'HttpErrorResponse', status: 401 }` reads as well as any name it could be given. */
function isShortRecord(node: EsNode): boolean {
  return (
    isObjectExpression(node) &&
    node.properties.length <= SHORT_EXPECTED_KEYS &&
    node.properties.every((property) => propertyName(property) !== undefined && isPrimitive(propertyValue(property)))
  );
}

/** The largest literal directly inside `node`: the part of an expectation worth a name of its own. */
function largestPart(node: EsArrayExpression | EsObjectExpression): EsNode | undefined {
  const parts = members(node)
    .map((member) => unwrap(memberValue(member)))
    .filter(isLiteral);

  return parts.sort((a, b) => span(b) - span(a))[0];
}

/** Every literal and template string nested in `node`, at any depth. */
function nestedParts(node: EsArrayExpression | EsObjectExpression): EsNode[] {
  return members(node).flatMap((member) => {
    const value = unwrap(memberValue(member));

    if (isLiteral(value)) {
      return [value, ...nestedParts(value)];
    }

    return value.type === 'TemplateLiteral' ? [value] : [];
  });
}

/** A word list or a text block is data; a `['error', { ... }]` tuple is the shape under test. */
const isPlainData = (node: EsNode): boolean =>
  node.type === 'TemplateLiteral' || (isArrayExpression(node) && members(node).every(isPrimitive));

/** The smallest part whose move alone brings the expectation under `maxLines`, plain data first. */
function partToMove(node: EsArrayExpression | EsObjectExpression, maxLines: number): EsNode | undefined {
  const excess = lineCount(node) - maxLines;
  const enough = nestedParts(node).filter((part) => lineCount(part) > excess);

  enough.sort((a, b) => Number(isPlainData(b)) - Number(isPlainData(a)) || span(a) - span(b));

  return enough[0] ?? largestPart(node);
}

/** An identifier that reads a value: not a property key, not a member name after a dot, not a type. */
function isValueReference(node: EsNode): node is EsIdentifier {
  const { parent } = node;

  return (
    isIdentifier(node) &&
    !(parent.type === 'Property' && Reflect.get(parent, 'key') === node && Reflect.get(parent, 'computed') === false) &&
    !(isMemberExpression(parent) && parent.property === node && !parent.computed) &&
    !(parent.type.startsWith('TS') && !WRAPPERS.has(parent.type))
  );
}

/** The first name a literal reads that this file declares, which a `*.mock.ts` could not see. */
function localBinding(context: RuleContext, node: EsNode): string | undefined {
  let found: string | undefined;

  anyInSubtree(
    context,
    node,
    (candidate) => {
      if (!isValueReference(candidate)) {
        return false;
      }

      const definitions = findBinding(context.sourceCode.getScope(candidate), candidate.name)?.defs ?? [];

      if (definitions.length > 0 && definitions.every((definition) => definition.type !== 'ImportBinding')) {
        found = candidate.name;
      }

      return found !== undefined;
    },
    true,
  );

  return found;
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

function span(node: EsNode): number {
  return node.range[1] - node.range[0];
}

const sourceKey = (context: RuleContext, node: EsNode): string => context.sourceCode.getText(node).replace(/\s+/g, '');

/**
 * A long literal outside an expectation is data to move; inside one it is what the test checks, and a
 * part written only there needs no file of its own.
 */
function reportLong(
  context: RuleContext,
  node: EsArrayExpression | EsObjectExpression,
  maxLines: number,
  copies: (part: EsNode) => number,
): void {
  const data = { lines: String(lineCount(node)), max: String(maxLines) };

  if (!isExpected(node)) {
    context.report({ node, messageId: 'longLiteral', data });

    return;
  }

  const part = partToMove(node, maxLines);

  if (part && lineCount(part) > 1) {
    context.report({
      node,
      messageId: copies(part) > 1 ? 'longExpected' : 'longExpectedOnce',
      data: { ...data, part: excerpt(context, part, 40), line: String(part.loc.start.line) },
    });
  } else {
    context.report({ node, messageId: 'longExpectedFlat', data });
  }
}

interface Copies {
  readonly first: EsNode;
  readonly rest: EsNode[];
}

function reportRepeats(context: RuleContext, seen: Iterable<Copies>, repeats: number): void {
  const reported: EsNode[] = [];
  // Outermost first, so a repeated literal is reported once rather than once per repeated piece of it.
  const groups = [...seen].filter((group) => group.rest.length + 1 >= repeats).sort((a, b) => span(b.first) - span(a.first));

  for (const group of groups) {
    // Every copy is checked, not just the first: a copy inside an outer literal already reported moves with it.
    const [first, ...rest] = [group.first, ...group.rest].filter((node) => !reported.some((outer) => within(node, outer)));

    if (!first || rest.length + 1 < repeats) {
      continue;
    }

    const expected = [first, ...rest].every(isInExpected);

    if (expected && isShortRecord(first)) {
      continue;
    }

    reported.push(first, ...rest);

    const binding = localBinding(context, first);

    for (const node of rest) {
      const data = { literal: excerpt(context, node, 40), count: String(rest.length + 1), first: String(first.loc.start.line) };

      if (binding !== undefined) {
        context.report({ node, messageId: 'repeatedLocalLiteral', data: { ...data, binding } });
      } else {
        context.report({ node, messageId: expected ? 'repeatedExpected' : 'repeatedLiteral', data });
      }
    }
  }
}

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
    longExpected:
      'This expected value spans {{lines}} lines (the limit is {{max}}). It is what the test checks, so keep its shape inline and move `{{part}}` at line {{line}} to a `*.mock.ts` file next to the spec.',
    longExpectedOnce:
      'This expected value spans {{lines}} lines (the limit is {{max}}). It is what the test checks, so keep its shape inline and move `{{part}}` at line {{line}} to a `const` in this spec; it is written only here, so it needs no `*.mock.ts` file.',
    longExpectedFlat:
      'This expected value spans {{lines}} lines (the limit is {{max}}). It is what the test checks, so check only the entries this test is about, or move it to a `*.mock.ts` file next to the spec under a name that says what the test expects.',
    repeatedLiteral:
      '`{{literal}}` is written {{count}} times in this file (first at line {{first}}). Export it once from a `*.mock.ts` file next to the spec and import it, so one edit reaches every test that uses it.',
    repeatedExpected:
      '`{{literal}}` is expected {{count}} times in this file (first at line {{first}}). It is what these tests check, so keep it in the spec: name it once in a `const` and reuse it, so one edit reaches every test that checks it.',
    repeatedLocalLiteral:
      '`{{literal}}` is written {{count}} times in this file (first at line {{first}}) and reads `{{binding}}`, which this spec declares. Name it once in a `const` beside `{{binding}}` and reuse it, so one edit reaches every test that uses it.',
  },
  create: (context) => {
    if (MOCK_FILE.test(context.filename)) {
      return {};
    }

    const { maxLines, repeats, minValues } = limits(context);
    const seen = new Map<string, { first: EsNode; rest: EsNode[] }>();
    const written = new Map<string, number>();
    const long: (EsArrayExpression | EsObjectExpression)[] = [];

    const tally = (node: EsNode): string => {
      const key = sourceKey(context, node);

      written.set(key, (written.get(key) ?? 0) + 1);

      return key;
    };

    const collect = (node: EsArrayExpression | EsObjectExpression): void => {
      const key = tally(node);

      if (!isData(node) || !isRecord(node, minValues)) {
        return;
      }

      const group = seen.get(key);

      if (group) {
        group.rest.push(node);
      } else {
        seen.set(key, { first: node, rest: [] });
      }
    };

    return {
      'ObjectExpression, ArrayExpression': (node: EsArrayExpression | EsObjectExpression): void => {
        if (!isLiteral(container(node)) && isData(node) && lineCount(node) > maxLines) {
          long.push(node);
        }

        collect(node);
      },
      TemplateLiteral: tally,
      'Program:exit': (): void => {
        for (const node of long) {
          reportLong(context, node, maxLines, (part) => Number(written.get(sourceKey(context, part))));
        }

        reportRepeats(context, seen.values(), repeats);
      },
    };
  },
});
