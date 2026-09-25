import { count as plural } from '../message-text';
import { boundValueOf, findBinding } from './bindings';
import { defineRule } from './define-rule';
import {
  boundName,
  carriesValues,
  countRunnerFns,
  insideFactorySeed,
  insideFixtureSeed,
  insideModuleMock,
  isObserverArgument,
  isOptionsArgument,
  minRunnerFns,
  runnerFnNames,
  substitutesADependency,
} from './hand-rolled-doubles';
import { bindingName, excerpt, nameList } from './message-data';
import {
  type EsFunction,
  type EsIdentifier,
  type EsNode,
  type EsObjectExpression,
  type EsScope,
  type EsTypeAnnotation,
  type RuleContext,
  findProperty,
  hasAncestor,
  isArrayExpression,
  isCallExpression,
  isFunctionNode,
  isIdentifier,
  isObjectExpression,
  isVariableDeclarator,
  propertyName,
  propertyValue,
} from './rule-types';

/** `setInputs(fixture, { … })`: the second argument is checked against the component's inputs. */
function isSetInputsMap(node: EsObjectExpression): boolean {
  const call = node.parent;

  return isCallExpression(call) && isIdentifier(call.callee) && call.callee.name === 'setInputs' && call.arguments[1] === node;
}

/** `renderShallow(C, { inputs: { … } })`: the same check, through the render options. */
function isRenderShallowInputs(node: EsObjectExpression): boolean {
  const property = node.parent;

  if (propertyName(property) !== 'inputs' || propertyValue(property) !== node) {
    return false;
  }

  const options = property.parent;
  const call = options.parent;

  return isCallExpression(call) && isIdentifier(call.callee) && call.callee.name === 'renderShallow' && call.arguments[1] === options;
}

/**
 * `return { preventDefault, stopPropagation }` after installing both on an event: handles handed back
 * for destructuring. A factory building a double never reads its spies anywhere but in the return.
 */
function returnsInstalledHandles(context: RuleContext, node: EsObjectExpression): boolean {
  if (node.parent.type !== 'ReturnStatement') {
    return false;
  }

  const scope = context.sourceCode.getScope(node);
  const installed = new Set(runnerFnNames(context, node));

  return node.properties.every((property) => {
    const name = propertyName(property);

    if (name === undefined) {
      return false;
    }

    const value = propertyValue(property);

    return isIdentifier(value) && (!installed.has(name) || readOutside(scope, value.name, node));
  });
}

/** Whether the name a spy is bound to is read anywhere but inside `object`. */
function readOutside(scope: EsScope, name: string, object: EsObjectExpression): boolean {
  return (
    findBinding(scope, name)?.references.some(
      (reference) => !reference.writeExpr && !hasAncestor(reference.identifier, (candidate) => candidate === object),
    ) === true
  );
}

/** The `: T` of the name the literal is bound to, when it has one. */
function declaredTypeOf(context: RuleContext, node: EsNode): EsNode | undefined {
  const name = boundName(node);

  if (!name || !isIdentifier(name)) {
    return undefined;
  }

  const definition = findBinding(context.sourceCode.getScope(node), name.name)?.defs[0]?.node;
  const declared = definition && isVariableDeclarator(definition) ? definition.id : undefined;

  return declared && isIdentifier(declared) ? declared.typeAnnotation?.typeAnnotation : undefined;
}

/** A function this file declares under the name a call reads, as a declaration or a single binding. */
function localFunction(context: RuleContext, callee: EsIdentifier): EsFunction | undefined {
  const scope = context.sourceCode.getScope(callee);
  const declared = findBinding(scope, callee.name)
    ?.defs.map((definition) => definition.node)
    .find(isFunctionNode);
  const bound = declared ?? boundValueOf(scope, callee);

  return bound && isFunctionNode(bound) ? bound : undefined;
}

/** A parameter that can carry `: T` — a name or a destructuring pattern. */
interface EsAnnotatedParameter extends EsNode {
  typeAnnotation?: EsTypeAnnotation;
}

interface EsAssignmentPattern extends EsNode {
  left: EsNode;
}

function isAssignmentPattern(node: EsNode): node is EsAssignmentPattern {
  return node.type === 'AssignmentPattern';
}

function isAnnotatedParameter(node: EsNode): node is EsAnnotatedParameter {
  return node.type === 'Identifier' || node.type === 'ObjectPattern';
}

/** The `: T` of a parameter, bare or with a default. */
function parameterType(parameter: EsNode | undefined): EsNode | undefined {
  const target = parameter && isAssignmentPattern(parameter) ? parameter.left : parameter;

  return target && isAnnotatedParameter(target) ? target.typeAnnotation?.typeAnnotation : undefined;
}

/**
 * `build({ onChange })` over `const build = (overrides?: Partial<Options>) => …` in the same file: the
 * helper's parameter declares the type the argument is checked against. An imported helper is out of reach.
 */
function declaredParameterTypeOf(context: RuleContext, node: EsNode): EsNode | undefined {
  const call = node.parent;

  if (!isCallExpression(call) || !isIdentifier(call.callee)) {
    return undefined;
  }

  const helper = localFunction(context, call.callee);

  return parameterType(helper?.params[call.arguments.indexOf(node)]);
}

/** The literal or array a nested object is data inside of: `{ nested: { fn } }`, `[{ parameters: { fn } }]`. */
function outermostData(node: EsNode): EsNode {
  let current = node;

  for (;;) {
    const { parent } = current;

    if (isArrayExpression(parent)) {
      current = parent;
    } else if (propertyValue(parent) === current && isObjectExpression(parent.parent)) {
      current = parent.parent;
    } else {
      return current;
    }
  }
}

/** The library's member stubs, whose value argument is typed against the member it replaces. */
const MEMBER_STUBS = new Set(['mockReadonlyProp', 'mockSignalProp', 'mockValueProp']);

function isMemberStubValue(node: EsNode): boolean {
  const call = node.parent;

  return isCallExpression(call) && isIdentifier(call.callee) && MEMBER_STUBS.has(call.callee.name) && call.arguments[2] === node;
}

/**
 * A one-member literal whose type is already declared — by the name it is bound to, the parameter of
 * a local helper it is passed to, or the member a stub replaces — is checked against it, which is all
 * `createMock<T>` would add. An inline object type of mocks proves nothing, so it is still reported.
 */
function isCheckedByDeclaration(context: RuleContext, node: EsObjectExpression): boolean {
  const data = outermostData(node);
  const declared = declaredTypeOf(context, data) ?? declaredParameterTypeOf(context, data);

  return isMemberStubValue(data) || (declared !== undefined && declared.type !== 'TSTypeLiteral');
}

const SIGNAL_WRITERS = new Set(['set', 'update']);

/** `{ hide: { set: vi.fn() } }`: the inner literal stands in for a writable or model signal. */
function signalMemberName(node: EsObjectExpression, member: string): string | undefined {
  const property = node.parent;

  return SIGNAL_WRITERS.has(member) && isObjectExpression(property.parent) && propertyValue(property) === node
    ? propertyName(property)
    : undefined;
}

/** What the report quotes: the name the double is bound to, its mocks, and the factory for its declared type. */
function describeDouble(context: RuleContext, node: EsObjectExpression, callbacks: readonly string[]): Record<string, string> {
  const name = boundName(node);
  const type = declaredTypeOf(context, node);

  return {
    subject: name ? `\`${bindingName(context, name)}\`` : 'This object',
    count: plural(callbacks.length, '`vi.fn()`'),
    members: nameList(callbacks),
    fix: type ? `\`createAutoMock<${excerpt(context, type, 40)}>()\`` : '`createSpyFromClass(Class)` or `createAutoMock<T>()`',
  };
}

const dataCallbackHint = (name: string): string =>
  ` For a data object with one callback field, \`createMock<T>({ …, ${name}: vi.fn() })\` keeps the values and checks the field against \`T\`.`;

/** `{ a: vi.fn(), b: vi.fn() }` → `createSpyFromClass(X)` / `createAutoMock<T>()`. */
export const preferCreateSpyFromClass = defineRule({
  name: 'prefer-create-spy-from-class',
  description: 'Build a spy from the class (createSpyFromClass / createAutoMock) instead of an object of vi.fn()s',
  schema: [{ type: 'object', properties: { minRunnerFns: { type: 'integer', minimum: 1 } }, additionalProperties: false }],
  messages: {
    preferCreateSpyFromClass:
      '{{subject}} holds {{count}} ({{members}}), so it mocks only the methods someone listed and the class is free to grow one it lacks. Build it with {{fix}}, which stays in step with the class.{{lower}}',
    signalMember:
      "`{ {{name}}: vi.fn() }` under `{{signal}}` stands in for a signal, and `createMock<T>` cannot seed a `ModelSignal` or `WritableSignal` partially. Keep the real signal: `mockSignalProp(instance, '{{signal}}', value)`, then assert the value it holds.",
    singleMember:
      '`{ {{name}}: vi.fn() }` has no class for `createSpyFromClass` to read, and nothing checks its key or signature. Type it: `createMock<T>({ {{name}}: vi.fn() })` checks both against `T`.',
  },
  create: (context) => ({
    ObjectExpression: (node: EsObjectExpression): void => {
      // The provider form is `prefer-provide-auto-spy`'s business — do not report it twice; a seed
      // handed to one of this library's own factories is the fix rather than the problem; and a
      // module mock's exports are not a service double at all.
      //
      // "The provider form" is read one name wide, because that is how far the provider rule reads:
      // a literal parked in a `const` and passed to `useValue` by name drew a report from each of
      // the two, one recommending `createSpyFromClass` and one `provideAutoSpy`, on the same double.
      if (
        substitutesADependency(context, node) ||
        findProperty(node, 'provide') !== undefined ||
        countRunnerFns(context, node) < minRunnerFns(context) ||
        insideFactorySeed(node) ||
        insideFixtureSeed(node) ||
        insideModuleMock(node) ||
        isOptionsArgument(context, node) ||
        isObserverArgument(node) ||
        isSetInputsMap(node) ||
        isRenderShallowInputs(node) ||
        returnsInstalledHandles(context, node)
      ) {
        return;
      }

      const threshold = minRunnerFns(context);

      if (node.properties.length === 1) {
        const name = runnerFnNames(context, node).join('');
        const signal = signalMemberName(node, name);

        if (signal !== undefined) {
          context.report({ node, messageId: 'signalMember', data: { name, signal } });
        } else if (!isCheckedByDeclaration(context, node)) {
          context.report({ node, messageId: 'singleMember', data: { name } });
        }

        return;
      }

      const callbacks = runnerFnNames(context, node);
      const dataWithOneCallback = threshold === 1 && callbacks.length === 1 && carriesValues(context, node);
      const lower = dataWithOneCallback ? dataCallbackHint(callbacks.join('')) : '';

      context.report({
        node,
        messageId: 'preferCreateSpyFromClass',
        data: { ...describeDouble(context, node, callbacks), lower },
      });
    },
  }),
});
