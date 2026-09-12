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

/** Drop the call — the whole statement when only a name is left in front of it — and an `async` nothing else needs. */
function removal(context: RuleContext, call: EsCallExpression): SuggestionDescriptor | undefined {
  const awaited = call.parent.type === 'AwaitExpression' ? call.parent : call;
  const statement = awaited.parent;

  if (!isExpressionStatement(statement) || !isMemberExpression(call.callee)) {
    return undefined;
  }

  const receiver = call.callee.object;
  const callback = awaited === call ? undefined : asyncOnlyFor(awaited);

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
  anchor: '-a-components-children',
  description: 'Drop compileComponents() under a builder that inlines component resources',
  hasSuggestions: true,
  schema: [{ type: 'object', properties: { builder: { enum: ['inline-resources'] } }, additionalProperties: false }],
  messages: {
    noCompileComponents:
      '`compileComponents()` is usually redundant here. It exists to fetch the `templateUrl` / `styleUrls` of a component at run ' +
      'time, and this project says its builder inlines them (`{ builder: "inline-resources" }`), so that promise is already ' +
      'settled and the `await` in front of it waits for nothing. Delete the call, and the `async` of a hook that awaits nothing ' +
      'else. One exception this rule cannot see, because the template is another file: a component whose template holds a ' +
      '`@defer` block ships async class metadata, which `compileComponents()` resolves whatever the builder did — drop the call ' +
      'there and the test dies on "has unresolved metadata. Please call `await TestBed.compileComponents()`". Keep those, each ' +
      'behind its own `// eslint-disable-next-line vitest-auto-spy/no-compile-components -- @defer: async class metadata`. ' +
      'Under a setup that loads resources at run time — a JIT compile reading `templateUrl` with no build step inlining it — the ' +
      'call is load-bearing everywhere, which is why this rule reports nothing until the option says otherwise.',
  },
  create: (context) =>
    inlinesResources(context)
      ? {
          'CallExpression[callee.computed=false][callee.property.name="compileComponents"]': (node: EsCallExpression): void => {
            const suggestion = removal(context, node);
            const report = { node, messageId: 'noCompileComponents' };

            context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
          },
        }
      : {},
});
