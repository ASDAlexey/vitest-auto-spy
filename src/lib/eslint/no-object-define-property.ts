/** `Object.defineProperty(obj, 'x', …)` → `mockReadonlyProp` / `mockValueProp`. */
import { defineRule } from './define-rule';
import { excerptOr } from './message-data';
import { definePropertyData, patchKey, propHelperSuggestion } from './prop-helpers';
import type { EsCallExpression } from './rule-types';

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
