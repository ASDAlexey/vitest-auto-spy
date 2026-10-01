/**
 * `expect(service.open()).toBe(asInstance(ref))` — the type bridge in the one slot that never asks
 * for it.
 *
 * `asInstance` exists for positions typed against the real class: a `useValue`, a factory parameter,
 * a field. `toBe` / `toEqual` / `toStrictEqual` take their argument as a free type parameter, so the
 * unwrap changes nothing the compiler sees — it only keeps an import alive and reads as if the types
 * needed it.
 */
import { EQUALITY_MATCHERS, matcherOf } from './absence-assertion';
import { dropNamedImport, findBinding } from './bindings';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsIdentifier,
  type EsNode,
  type EsVariable,
  type RuleContext,
  isCallExpression,
  isIdentifier,
} from './rule-types';

/** The bridge this rule unwraps. An aliased import is out of reach, as `prefer-as-spy`'s `Spy` is. */
const AS_INSTANCE = 'asInstance';

/** The binding behind the wrapper's name, when it arrived through an import. */
function importedAsInstance(context: RuleContext, callee: EsIdentifier): EsVariable | undefined {
  const binding = findBinding(context.sourceCode.getScope(callee), callee.name);

  return binding?.defs.some((definition) => definition.type === 'ImportBinding') ? binding : undefined;
}

/** The edits that drop one wrapper and, when that was the import's last use, the import too. */
function unwrap(context: RuleContext, fixer: EsFixer, wrapper: EsCallExpression, value: EsNode, binding: EsVariable): EsFix[] {
  const edits = [fixer.replaceText(wrapper, context.sourceCode.getText(value))];
  const orphaned = binding.references.length === 1 ? dropNamedImport(context.sourceCode, fixer, binding) : undefined;

  if (orphaned) {
    edits.push(orphaned);
  }

  return edits;
}

export const noRedundantAsInstance = defineRule({
  name: 'no-redundant-as-instance',
  description: 'Pass the value itself to a comparing matcher; asInstance() bridges slots typed as the real class',
  fixable: true,
  messages: {
    noRedundantAsInstance:
      '`asInstance({{value}})` buys nothing under `.{{matcher}}()`: the matcher takes its argument as a free type parameter, so the value compiles as it is. Pass `{{value}}` directly.',
  },
  create: (context) => ({
    'CallExpression[callee.name="expect"]': (node: EsCallExpression): void => {
      const matcher = matcherOf(node);

      if (!matcher || !EQUALITY_MATCHERS.has(matcher.name)) {
        return;
      }

      for (const argument of matcher.args) {
        if (!isCallExpression(argument) || !isIdentifier(argument.callee) || argument.callee.name !== AS_INSTANCE) {
          continue;
        }

        const [value, ...extra] = argument.arguments;

        if (value === undefined || extra.length > 0) {
          continue;
        }

        const binding = importedAsInstance(context, argument.callee);

        if (binding) {
          context.report({
            node: argument,
            messageId: 'noRedundantAsInstance',
            data: { matcher: matcher.name, value: excerpt(context, value, 40) },
            fix: (fixer: EsFixer): EsFix[] => unwrap(context, fixer, argument, value, binding),
          });
        }
      }
    },
  }),
});
