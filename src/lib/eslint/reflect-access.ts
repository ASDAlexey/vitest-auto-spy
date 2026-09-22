/**
 * `Reflect.get(component, 'privateField')` — the second door out of `no-private-member-access`, and
 * the one no compiler stands in.
 *
 * `component['privateField']` at least keeps the member in a position a type-aware rule can resolve,
 * which is what `no-private-member-access` does with it. `Reflect.get` and `Reflect.set` take the
 * name as an ordinary **string argument**: `Reflect.get(x, 'y')` is typed `any` on a `string` key, so
 * neither the compiler nor a template gate nor a strict `tsc` pass has an opinion about it. The
 * consumer this rule was measured on opened the door itself — its `no-restricted-syntax` ban on
 * double casts named `Reflect.get` / `Reflect.set` as the sanctioned way around the cast — and
 * arrived at 214 sites in 50 of its 2 030 spec files — 125 reads, 85 writes and 4 of the double form.
 *
 * **`Reflect.set` is the half that outlives what it tests.** It installs an **own** property over the
 * prototype rather than writing the member: rename the field in production and the spec keeps
 * compiling, keeps running, and now writes a **dead** property nothing reads, while the
 * `expect(spy).not.toHaveBeenCalled()` under it passes forever. The test then survives the deletion
 * of the thing it was written for, which is the one failure no assertion in it can report.
 *
 * **The sub-form has a mechanical repair, so it gets its own message.** `Reflect.set(someDouble,
 * 'prop', value)` patches a property on a double this library built, behind the library's back: no
 * journal entry and no restore, so the patch is live for every later test of the file and — under
 * `isolate: false` — for every later file of the worker. `mockValueProp` does the same write and
 * registers the undo with `restoreMockedProps()`, which `setupAutoSpy()` runs in a hook.
 *
 * **Syntax and scope only, never types.** That is the point of the rule rather than a limitation of
 * it: `no-private-member-access` needs a program and says nothing without one, and this shape is
 * exactly what a suite reaches for where the program would have objected.
 *
 * **What is not reported, and why each one is silence rather than an exception list.**
 *
 * - `Reflect.get(window, 'process')`, `Reflect.set(globalThis, '__probe', x)` — the idiom's real
 *   purpose: a property the environment's type does not declare, where there is no member to reach
 *   around. Decided by the binding, not by a list of names: a bare identifier that resolves to no
 *   declaration in the file is the environment's, and so is a spec's own name declared as `Window`
 *   or `typeof globalThis` (`let win: Window` holding an injected `WINDOW`).
 * - A name an **import** introduced — a module namespace object, most often. Patching one is
 *   `vi.mock`'s business and the advice here would be wrong.
 * - A **computed** key: `Reflect.get(component, method)` in a helper that takes the name as a
 *   parameter is the one shape where the string is not a member written out in the spec, and
 *   nothing this rule says would repair it.
 * - `Reflect.apply`, `Reflect.has`, `Reflect.deleteProperty`, `Reflect.construct`. Only the two that
 *   read and write a member are the bracket escape in another spelling; the rest say something
 *   else, and on the measured consumer they sit almost entirely on globals.
 */
import { PACKAGE, bindingState, boundValueOf, findBinding, importNamed } from './bindings';
import { defineRule } from './define-rule';
import { isFactoryCall } from './hand-rolled-doubles';
import {
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsLiteral,
  type EsNode,
  type EsVariableDefinition,
  type RuleContext,
  type SuggestionDescriptor,
  isCallExpression,
  isIdentifier,
  isMemberCall,
  isMemberExpression,
  isObjectExpression,
  isTypeReference,
  isVariableDeclarator,
} from './rule-types';

/** The helper that performs the same write and registers the undo. */
const HELPER = 'mockValueProp';

/** The namespace, and the two members of it that name a member with a string. */
const REFLECT = new Set(['Reflect']);

const ACCESSORS = new Set(['get', 'set']);

/** eslint-scope's word for a name an import introduced — a module namespace is nobody's subject. */
const IMPORT_DEFINITION = 'ImportBinding';

/** The helpers that hand back a double this library owns, on top of the factories `isFactoryCall` reads. */
const DOUBLE_READERS = new Set(['createSpyFromInstance', 'injectSpy', 'injectSpyForToken']);

/** The member name a key argument spells, or `undefined` for a computed one. */
function literalKey(node: EsNode | undefined): string | undefined {
  if (node?.type !== 'Literal') {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `type === 'Literal'` is ESTree's own discriminant for the node this interface mirrors.
  const { value } = node as EsLiteral;

  return typeof value === 'string' ? value : undefined;
}

/** The identifier a member chain is rooted at — `loaderProvider` for `loaderProvider.useValue`. */
function rootIdentifier(node: EsNode): EsNode | undefined {
  let current = node;

  while (isMemberExpression(current)) {
    current = current.object;
  }

  return isIdentifier(current) ? current : undefined;
}

/** `typeof globalThis`. */
interface EsTypeQuery extends EsNode {
  exprName: EsNode;
}

/** `Window & { extra?: number }`. */
interface EsIntersectionType extends EsNode {
  types: EsNode[];
}

function isTypeQuery(node: EsNode): node is EsTypeQuery {
  return node.type === 'TSTypeQuery';
}

function isIntersectionType(node: EsNode): node is EsIntersectionType {
  return node.type === 'TSIntersectionType';
}

/** `Window`, `typeof globalThis`, or an intersection with either — the environment's type. */
function isEnvironmentType(node: EsNode): boolean {
  if (isIntersectionType(node)) {
    return node.types.some(isEnvironmentType);
  }

  if (isTypeQuery(node)) {
    return isIdentifier(node.exprName) && node.exprName.name === 'globalThis';
  }

  return isTypeReference(node) && isIdentifier(node.typeName) && node.typeName.name === 'Window';
}

/** `let win: Window` — a name of the spec's own for the environment, which is what the idiom is for. */
function declaresEnvironment(definition: EsVariableDefinition): boolean {
  const { node } = definition;
  const annotation = isVariableDeclarator(node) && isIdentifier(node.id) ? node.id.typeAnnotation : undefined;

  return annotation !== undefined && isEnvironmentType(annotation.typeAnnotation);
}

/**
 * Whether the target is something this file has in hand, rather than the environment's.
 *
 * A bare identifier has to resolve to a declaration of this file that no import made: that is what
 * separates `component` from `window`, and a spec-local subject from a module namespace. Anything
 * else — a member chain, a call's result, `this` — is a value the file computed, and no `Reflect`
 * is needed to read a property off it.
 */
function isLocalSubject(context: RuleContext, target: EsNode): boolean {
  const root = rootIdentifier(target);

  if (!root || !isIdentifier(root)) {
    return true;
  }

  const binding = findBinding(context.sourceCode.getScope(root), root.name);

  return (
    binding !== undefined &&
    binding.defs.length > 0 &&
    !binding.defs.some((definition) => definition.type === IMPORT_DEFINITION || declaresEnvironment(definition))
  );
}

/** Whether the value a name holds came out of one of this library's double factories. */
function isDouble(context: RuleContext, target: EsNode): boolean {
  const root = rootIdentifier(target);

  if (!root || !isIdentifier(root)) {
    return false;
  }

  const value = boundValueOf(context.sourceCode.getScope(root), root);

  if (!value) {
    return false;
  }

  return isFactoryCall(value) || (isCallExpression(value) && isIdentifier(value.callee) && DOUBLE_READERS.has(value.callee.name));
}

/** Whether the name holds an object literal the spec wrote itself — a fixture, not a subject. */
function isFixtureLiteral(context: RuleContext, target: EsNode): boolean {
  const value = isIdentifier(target) ? boundValueOf(context.sourceCode.getScope(target), target) : undefined;

  return value !== undefined && isObjectExpression(value);
}

/** `Reflect.set(double, 'prop', value)` → `mockValueProp(double, 'prop', value)`, importing the helper. */
function restoreSuggestion(context: RuleContext, node: EsCallExpression): SuggestionDescriptor | undefined {
  const parts = node.arguments.map((argument) => context.sourceCode.getText(argument));
  const state = bindingState(context.sourceCode.getScope(node), HELPER);

  // A file that declares `mockValueProp` as something of its own gets the report and no edit.
  if (parts.length !== 3 || state === 'taken') {
    return undefined;
  }

  const replacement = `${HELPER}(${parts.join(', ')})`;

  return {
    desc: `Record the undo: ${replacement}`,
    fix: (fixer: EsFixer): EsFix[] => {
      const edits = [fixer.replaceText(node, replacement)];

      return state === 'free' ? [...edits, importNamed(fixer, node, HELPER, PACKAGE)] : edits;
    },
  };
}

const ESCAPE =
  'The name is an ordinary string argument here, so nothing checks it: not the compiler, not a template gate, not a strict ' +
  "`tsc` pass. That is what makes this the second door out of `no-private-member-access` — `component['x']` at least keeps " +
  'the member where a type-aware rule can resolve it, and this does not.';

const SURFACE =
  'Drive the member through the public API that uses it and assert the effect. On a **component**, the rendered template is ' +
  'the other public surface, and it is the one `protected` members exist for: `renderShallow(Cmp)` and read the DOM rather ' +
  'than the field. A property the environment’s own type does not declare — `window`, `globalThis` — is what the idiom is ' +
  'for and is never reported here. A private member with no observable effect at all is the one case this leaves: there ' +
  "`component['member']` keeps the key where the compiler checks it, under a `no-private-member-access` disable that says why.";

/** `Reflect.get(component, 'privateField')` — the bracket escape, spelled so no checker can see it. */
export const noReflectMemberAccess = defineRule({
  anchor: '-a-service-without-di',
  description: 'Do not reach a member through Reflect.get / Reflect.set; the string key is checked by nothing',
  hasSuggestions: true,
  messages: {
    reflectGet: `This reads \`{{key}}\` off a subject the test already holds. ${ESCAPE} So the spec pins a member the class never promised anybody, and it pins it by a name a rename cannot reach: the refactor stays green in production and the spec keeps reading a property that is no longer there, answering \`undefined\` to whatever asserts on it. ${SURFACE}`,
    reflectSet: `This writes \`{{key}}\` onto a subject the test already holds, and it does not write the member — \`Reflect.set\` installs an **own** property over the prototype. ${ESCAPE} Rename the field in production and this line keeps compiling, keeps running, and now writes a **dead** property nothing reads, while every assertion under it goes on passing: the test outlives the thing it was written to check. ${SURFACE} Where the value has to be forced onto a real object, \`mockValueProp(obj, '{{key}}', value)\` writes it and registers the undo with \`restoreMockedProps()\`.`,
    reflectSetOnFixture: `This writes \`{{key}}\` onto an object literal this spec built — a fixture, where the key could have been written in the literal and checked there. ${ESCAPE} Put it in the literal. Where the value is deliberately outside the declared type — an unknown enum member fed in to reach the fallback branch — cast the **value** (\`{ {{key}}: value as Model['{{key}}'] }\`), which keeps the key under the compiler and says out loud which value is impossible.`,
    reflectSetOnDouble: `\`{{key}}\` is being patched onto a double this library built, behind the library’s back: no journal entry and no restore, so the patch is live for every later test of this file and — under \`isolate: false\` — for every later file of the worker. \`mockValueProp({{target}}, '{{key}}', value)\` performs the same write and registers the undo with \`restoreMockedProps()\`, which \`setupAutoSpy()\` runs in a hook, so it happens whatever the assertions did. A member the double should answer from the start belongs in the seed it was built with — \`provideAutoSpy(X, { returns: { … } })\`, \`provideAutoSpyForToken(TOKEN, { … })\` — rather than in a write afterwards.`,
  },
  create: (context) => ({
    CallExpression: (node: EsCallExpression): void => {
      const [target, keyNode] = node.arguments;
      const key = literalKey(keyNode);

      if (!isMemberCall(node, REFLECT, ACCESSORS) || !target || key === undefined || !isLocalSubject(context, target)) {
        return;
      }

      const writes = isMemberExpression(node.callee) && isIdentifier(node.callee.property) && node.callee.property.name === 'set';

      if (writes && isDouble(context, target)) {
        const data = { key, target: context.sourceCode.getText(target) };
        const suggestion = restoreSuggestion(context, node);
        const report = { node, messageId: 'reflectSetOnDouble', data };

        context.report(suggestion ? { ...report, suggest: [suggestion] } : report);

        return;
      }

      const messageId = writes ? (isFixtureLiteral(context, target) ? 'reflectSetOnFixture' : 'reflectSet') : 'reflectGet';

      context.report({ node, messageId, data: { key } });
    },
  }),
});
