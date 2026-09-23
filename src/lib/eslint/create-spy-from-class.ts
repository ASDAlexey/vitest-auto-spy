import { findBinding } from './bindings';
import { defineRule } from './define-rule';
import {
  boundName,
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
import {
  type EsNode,
  type EsObjectExpression,
  type EsScope,
  type RuleContext,
  findProperty,
  hasAncestor,
  isArrayExpression,
  isCallExpression,
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
 * A one-member literal whose type is already declared — by the name it is bound to, or by the member
 * a stub replaces — is checked against it, which is all `createMock<T>` would add. An inline object
 * type of mocks proves nothing, so it is still reported.
 */
function isCheckedByDeclaration(context: RuleContext, node: EsObjectExpression): boolean {
  const data = outermostData(node);
  const declared = declaredTypeOf(context, data);

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

const LOWER_THRESHOLD =
  ' An object with fewer is not flagged: on its own it is indistinguishable from an options bag with a callback in it. Lower the threshold with `{ minRunnerFns: 1 }` if the suite has no such objects — a one-method double handed to DI, or one whose declared type is an object of Vitest `Mock`s, is reported at one either way.';

/** `{ a: vi.fn(), b: vi.fn() }` → `createSpyFromClass(X)` / `createAutoMock<T>()`. */
export const preferCreateSpyFromClass = defineRule({
  anchor: '-a-service-without-di',
  description: 'Build a spy from the class (createSpyFromClass / createAutoMock) instead of an object of vi.fn()s',
  schema: [{ type: 'object', properties: { minRunnerFns: { type: 'integer', minimum: 1 } }, additionalProperties: false }],
  messages: {
    preferCreateSpyFromClass:
      'An object of {{threshold}} `vi.fn()`s only mocks the methods you remembered. `createSpyFromClass(X)` reads the class, `createAutoMock<T>()` the type — both stay in step with it.{{lower}}',
    signalMember:
      "A one-member object of `{{name}}: vi.fn()` under `{{signal}}` stands in for a signal, and `createMock<T>` cannot seed a callable partially — it does not compile for a `ModelSignal` / `WritableSignal`. Keep the real signal instead: `mockSignalProp(instance, '{{signal}}', value)`, then assert the value it holds.",
    singleMember:
      'A one-member object of a `vi.fn()` — a thenable, a callback holder — has no class for `createSpyFromClass` to read. Type it instead: `createMock<T>({ {{name}}: vi.fn() })` checks the key and the signature against `T`, which this literal is checked against nowhere.',
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

      context.report({
        node,
        messageId: 'preferCreateSpyFromClass',
        data: threshold === 1 ? { threshold: 'one or more', lower: '' } : { threshold: `${threshold} or more`, lower: LOWER_THRESHOLD },
      });
    },
  }),
});
