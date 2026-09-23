/**
 * The `prefer-render-shallow` edit: offered only where the spec's own `configureTestingModule` folds
 * into the call, since a bare swap re-configured an instantiated module in 17 of 49 files.
 */
import { PACKAGE, bindingState, importNamed } from './bindings';
import {
  type EsCallExpression,
  type EsFix,
  type EsNode,
  type EsObjectExpression,
  type RuleContext,
  type SuggestionDescriptor,
  isArrayExpression,
  isAssignmentExpression,
  isBlockStatement,
  isCallExpression,
  isExpressionStatement,
  isIdentifier,
  isMemberExpression,
  isObjectExpression,
  isVariableDeclarator,
  memberName,
  propertyName,
  propertyValue,
} from './rule-types';

const HELPER = 'renderShallow';

/** The keys `renderShallow` takes under the same name, so a literal of only these folds as written. */
const FOLDABLE_KEYS = new Set(['imports', 'providers']);

/** The statement `TestBed.createComponent(X)` is the value of, and the name the fixture lands in. */
function fixtureStatement(node: EsCallExpression): { statement: EsNode; fixture: string } | undefined {
  const { parent } = node;

  if (isVariableDeclarator(parent) && parent.init === node && isIdentifier(parent.id)) {
    const declarations: unknown = Reflect.get(parent.parent, 'declarations');

    return Array.isArray(declarations) && declarations.length === 1 ? { statement: parent.parent, fixture: parent.id.name } : undefined;
  }

  if (isAssignmentExpression(parent) && parent.right === node && isIdentifier(parent.left) && isExpressionStatement(parent.parent)) {
    return { statement: parent.parent, fixture: parent.left.name };
  }

  return undefined;
}

function isTestBedCall(node: EsNode, method: string): node is EsCallExpression {
  return (
    isCallExpression(node) &&
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.object) &&
    node.callee.object.name === 'TestBed' &&
    memberName(node.callee) === method
  );
}

/** `TestBed.configureTestingModule({ … })` as a statement of its own, with a literal of foldable keys. */
function configureLiteral(statement: EsNode): EsObjectExpression | undefined {
  if (!isExpressionStatement(statement) || !isTestBedCall(statement.expression, 'configureTestingModule')) {
    return undefined;
  }

  const [literal, ...rest] = statement.expression.arguments;

  return literal &&
    rest.length === 0 &&
    isObjectExpression(literal) &&
    literal.properties.every((property) => FOLDABLE_KEYS.has(propertyName(property) ?? ''))
    ? literal
    : undefined;
}

/** `spy = injectSpy(X)`: a read of a double that is as good after the render as before it. */
function isBareInjectSpy(statement: EsNode): boolean {
  if (!isExpressionStatement(statement) || !isAssignmentExpression(statement.expression)) {
    return false;
  }

  const { left, right } = statement.expression;

  return isIdentifier(left) && isCallExpression(right) && isIdentifier(right.callee) && right.callee.name === 'injectSpy';
}

function isDetectChanges(statement: EsNode | undefined, fixture: string): statement is EsNode {
  if (!statement || !isExpressionStatement(statement) || !isCallExpression(statement.expression)) {
    return false;
  }

  const { callee, arguments: args } = statement.expression;

  return (
    isMemberExpression(callee) &&
    isIdentifier(callee.object) &&
    callee.object.name === fixture &&
    memberName(callee) === 'detectChanges' &&
    args.length === 0
  );
}

/** `{ providers: […], imports: […] }` with the component dropped from `imports`, or `undefined` when it is not there to drop. */
function foldedOptions(context: RuleContext, literal: EsObjectExpression, component: string): string[] | undefined {
  let importsComponent = false;

  const entries = literal.properties.flatMap((property) => {
    const name = propertyName(property);
    const value = propertyValue(property);

    if (name !== 'imports' || !isArrayExpression(value)) {
      return [`${name}: ${context.sourceCode.getText(value)}`];
    }

    const elements = value.elements.filter((element): element is EsNode => element !== null);
    const kept = elements.filter((element) => !isIdentifier(element) || element.name !== component);

    importsComponent ||= kept.length < elements.length;

    return kept.length > 0 ? [`imports: [${kept.map((element) => context.sourceCode.getText(element)).join(', ')}]`] : [];
  });

  return importsComponent ? entries : undefined;
}

interface Fold {
  configure: EsNode;
  end: EsNode;
  options: string[];
  reads: EsNode[];
}

/** The setup around `target` when it folds: configure, bare reads, the render, and the `detectChanges` it may absorb. */
function foldableSetup(context: RuleContext, target: EsNode, fixture: string, component: string): Fold | undefined {
  if (!isBlockStatement(target.parent)) {
    return undefined;
  }

  const body = target.parent.body;
  const at = body.indexOf(target);
  const start = Math.max(-1, ...body.slice(0, at).map((statement, index) => (configureLiteral(statement) ? index : -1)));
  const configure = body[start];
  const literal = configure && configureLiteral(configure);
  const folded = literal && foldedOptions(context, literal, component);
  const reads = body.slice(start + 1, at);

  if (!configure || !folded || !reads.every(isBareInjectSpy)) {
    return undefined;
  }

  const next = body[at + 1];
  const end = isDetectChanges(next, fixture) ? next : target;
  const options = end === target ? [...folded, 'detectChanges: false'] : folded;
  const squeezed = (text: string): string => text.replace(/\s+/g, '');
  const joined = body.slice(start, body.indexOf(end) + 1).map((statement) => context.sourceCode.getText(statement));

  // A comment between the statements the edit joins would be deleted with them.
  return squeezed(context.sourceCode.getText().slice(configure.range[0], end.range[1])) === squeezed(joined.join(''))
    ? { configure, end, options, reads }
    : undefined;
}

export function renderShallowSuggestion(context: RuleContext, node: EsCallExpression): SuggestionDescriptor | undefined {
  const [component, ...extra] = node.arguments;
  const target = fixtureStatement(node);
  const state = bindingState(context.sourceCode.getScope(node), HELPER);
  const fold =
    target && component && isIdentifier(component) && extra.length === 0 && state !== 'taken'
      ? foldableSetup(context, target.statement, target.fixture, component.name)
      : undefined;

  if (!target || !component || !fold) {
    return undefined;
  }

  const source = context.sourceCode.getText();
  const { statement } = target;
  const call = `${HELPER}(${source.slice(component.range[0], component.range[1])}${fold.options.length > 0 ? `, { ${fold.options.join(', ')} }` : ''}).fixture`;
  const rendered = `${source.slice(statement.range[0], node.range[0])}${call}${source.slice(node.range[1], statement.range[1])}`;
  const indent = source.slice(source.lastIndexOf('\n', statement.range[0] - 1) + 1, statement.range[0]);
  const text = [rendered, ...fold.reads.map((read) => context.sourceCode.getText(read))].join(`\n${indent}`);

  return {
    desc: `Fold the testing module into ${call}, which configures it and renders without the children`,
    fix: (fixer): EsFix[] => {
      const edits = [fixer.replaceTextRange([fold.configure.range[0], fold.end.range[1]], text)];

      if (state === 'free') {
        edits.push(importNamed(fixer, node, HELPER, `${PACKAGE}/angular`));
      }

      return edits;
    },
  };
}
