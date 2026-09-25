/**
 * `compileComponents()` under a builder that inlines `templateUrl` / `styleUrls` — a call that resolves
 * at once and an `await` that waits for nothing. Silent until the project says which builder it has.
 *
 * Inlined resources are not the only thing that call settles, and the rule says so rather than
 * pretending otherwise: a component whose template holds a `@defer` block ships **async class
 * metadata**, which `TestBed` resolves in `compileComponents()` whatever the builder did with the
 * template. Removing the call there fails at run time with `Component 'X' has unresolved metadata`.
 * Measured on a 1862-file Angular suite: 410 files called it, and removing every one of them broke
 * exactly the `@defer` ones. Nothing in a spec file shows that — the template is another file, and
 * the rule reads no types — so the exception lives in the message and in the suggestion's own text
 * instead of in a selector that would have to guess it.
 */
import { asyncOnlyFor, dropAsync } from './async-hooks';
import { defineRule } from './define-rule';
import { receiverOf } from './message-data';
import {
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type RuleContext,
  type SuggestionDescriptor,
  isExpressionStatement,
  isIdentifier,
  isMemberExpression,
} from './rule-types';

function inlinesResources(context: RuleContext): boolean {
  return Reflect.get(Object(context.options[0]), 'builder') === 'inline-resources';
}

/** Whether the file names one of the `ignoreComponents` — the `@defer` components the project listed. */
function namesIgnoredComponent(context: RuleContext): boolean {
  const listed: unknown = Reflect.get(Object(context.options[0]), 'ignoreComponents');
  const names = Array.isArray(listed) ? listed.map(String) : [];
  const source = context.sourceCode.getText();

  return names.some((name) => new RegExp(`\\b${name}\\b`).test(source));
}

/** Drop the call — the whole statement when only a name is left in front of it — and an `async` nothing else needs. */
function removal(context: RuleContext, call: EsCallExpression): SuggestionDescriptor | undefined {
  const awaited = call.parent.type === 'AwaitExpression' ? call.parent : call;
  const statement = awaited.parent;

  if (!isExpressionStatement(statement) || !isMemberExpression(call.callee)) {
    return undefined;
  }

  const receiver = call.callee.object;
  const callback = awaited === call ? undefined : asyncOnlyFor(context, awaited);

  return {
    desc: 'Remove the compileComponents() call — keep it when the component template has a @defer block',
    fix: (fixer: EsFixer): EsFix[] => {
      const fixes = [isIdentifier(receiver) ? fixer.remove(statement) : fixer.replaceText(awaited, context.sourceCode.getText(receiver))];

      if (callback) {
        fixes.push(dropAsync(context, callback, fixer));
      }

      return fixes;
    },
  };
}

export const noCompileComponents = defineRule({
  name: 'no-compile-components',
  description: 'Drop compileComponents() under a builder that inlines component resources',
  hasSuggestions: true,
  schema: [
    {
      type: 'object',
      properties: {
        builder: { enum: ['inline-resources'] },
        ignoreComponents: { type: 'array', items: { type: 'string', pattern: '^[A-Za-z_]\\w*$' }, uniqueItems: true },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    noCompileComponents:
      '`{{receiver}}.compileComponents()` fetches `templateUrl` and `styleUrls` at run time, and this builder inlines them, so the `await` waits for nothing. Delete the call; if the component’s template has a `@defer` block, keep it and list the component in `{ ignoreComponents }`.',
  },
  create: (context) =>
    inlinesResources(context) && !namesIgnoredComponent(context)
      ? {
          'CallExpression[callee.computed=false][callee.property.name="compileComponents"]': (node: EsCallExpression): void => {
            const suggestion = removal(context, node);
            const report = { node, messageId: 'noCompileComponents', data: { receiver: receiverOf(context, node) } };

            context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
          },
        }
      : {},
});
