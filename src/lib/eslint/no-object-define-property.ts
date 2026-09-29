/** `Object.defineProperty(obj, 'x', …)` → `mockReadonlyProp` / `mockValueProp`. */
import { boundValueOf, findBinding } from './bindings';
import { defineRule } from './define-rule';
import { excerptOr } from './message-data';
import { definePropertyData, patchKey, propHelperSuggestion } from './prop-helpers';
import {
  type EsCallExpression,
  type EsNode,
  type RuleContext,
  isCallExpression,
  isCast,
  isIdentifier,
  isMemberCall,
  isMemberExpression,
  isRunnerFnCall,
  memberName,
} from './rule-types';

const FRESH_VALUES = new Set([
  'ArrayExpression',
  'ArrowFunctionExpression',
  'ClassExpression',
  'FunctionExpression',
  'NewExpression',
  'ObjectExpression',
]);

const OBJECT = new Set(['Object']);

/** `Object.assign` hands back its first argument, so it is as fresh as that. */
const ASSIGN = new Set(['assign']);

/** `a = b; b = a` would otherwise walk forever. */
const MAX_HOPS = 8;

/** eslint-scope's definition types for `class X {}` / `function x() {}`; a parameter's definition also points at the function. */
const LOCAL_DECLARATIONS = new Set(['ClassName', 'FunctionName']);

/** Whether the patched object was built by this file (a literal, `new`, a local class or `vi.fn()`), so no other file ever sees it. */
function isBuiltHere(context: RuleContext, target: EsNode | undefined, hops = 0): boolean {
  let node = target;

  while (node && isCast(node)) {
    node = node.expression;
  }

  if (!node || hops > MAX_HOPS) {
    return false;
  }

  if (isMemberExpression(node) && memberName(node) === 'prototype') {
    return isBuiltHere(context, node.object, hops + 1);
  }

  if (FRESH_VALUES.has(node.type) || isRunnerFnCall(node)) {
    return true;
  }

  if (isCallExpression(node) && isMemberCall(node, OBJECT, ASSIGN)) {
    return isBuiltHere(context, node.arguments[0], hops + 1);
  }

  if (!isIdentifier(node)) {
    return false;
  }

  const scope = context.sourceCode.getScope(node);

  if (findBinding(scope, node.name)?.defs.some((definition) => LOCAL_DECLARATIONS.has(definition.type))) {
    return true;
  }

  return isBuiltHere(context, boundValueOf(scope, node), hops + 1);
}

export const noObjectDefineProperty = defineRule({
  name: 'no-object-define-property',
  description: 'Patch properties with mockReadonlyProp / mockValueProp, which record the undo',
  hasSuggestions: true,
  messages: {
    noObjectDefineProperty:
      '`{{property}}` is patched with `Object.{{method}}`, which nothing undoes: `configurable` defaults to `false`, so the property stays sealed for the rest of the worker. Use `{{fix}}`, which restores it after the test.',
    manualRestore:
      '`{{property}}` is patched and restored by hand in the same block, so the first failing assertion between the two skips the restore and the patch leaks into every later test. Use `{{fix}}`, whose undo runs in a hook whatever the assertions did.',
  },
  create: (context) => {
    // Grouped and reported at the end, because "is there a hand-written restore below" is only
    // answerable once the block has been walked. Keyed by the block and by what is being patched,
    // so a `beforeEach` patch paired with an `afterEach` restore — which is correct, and runs in a
    // hook whatever the assertions did — is not mistaken for one.
    const patches = new Map<string, EsCallExpression[]>();

    return {
      'CallExpression[callee.object.name="Object"][callee.property.name="defineProperty"]': (node: EsCallExpression): void => {
        if (isBuiltHere(context, node.arguments[0])) {
          return;
        }

        const key = patchKey(context, node);
        const seen = patches.get(key) ?? [];

        seen.push(node);
        patches.set(key, seen);
      },
      'Program:exit': (): void => {
        patches.forEach((nodes) => {
          const messageId = nodes.length > 1 ? 'manualRestore' : 'noObjectDefineProperty';

          nodes.forEach((node) => {
            const suggestion = propHelperSuggestion(context, node);
            const report = { node, messageId, data: { ...definePropertyData(context, node), method: 'defineProperty' } };

            context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
          });
        });
      },
      // `defineProperties` takes a map of descriptors, so its replacement is one `mockValueProp` per
      // entry — several statements where there was one, which is not a per-node edit.
      'CallExpression[callee.object.name="Object"][callee.property.name="defineProperties"]': (node: EsCallExpression): void => {
        if (isBuiltHere(context, node.arguments[0])) {
          return;
        }

        const object = excerptOr(context, node.arguments[0], 'obj', 40);

        context.report({
          node,
          messageId: 'noObjectDefineProperty',
          data: { property: object, method: 'defineProperties', fix: `mockValueProp(${object}, key, value)` },
        });
      },
    };
  },
});
