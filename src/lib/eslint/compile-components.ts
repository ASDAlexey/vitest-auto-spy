/**
 * `compileComponents()` under a builder that inlines `templateUrl` / `styleUrls` — a call that resolves
 * at once and an `await` that waits for nothing. Silent until the project says which builder it has.
 */
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsNode,
  type RuleContext,
  type SuggestionDescriptor,
  countInSubtree,
  enclosingFunction,
  isCallExpression,
  isExpressionStatement,
  isIdentifier,
  isMemberExpression,
} from './rule-types';

const HOOKS = new Set(['afterAll', 'afterEach', 'beforeAll', 'beforeEach', 'it', 'test']);

function inlinesResources(context: RuleContext): boolean {
  return Reflect.get(Object(context.options[0]), 'builder') === 'inline-resources';
}

function isHookCallback(callback: EsNode): boolean {
  const runner = callback.parent;

  return isCallExpression(runner) && isIdentifier(runner.callee) && HOOKS.has(runner.callee.name);
}

/** The hook or test callback whose `async` only existed for this `await`, when there is one. */
function asyncOnlyFor(awaited: EsNode): EsNode | undefined {
  // The innermost function around an `await` is async by construction; only a top-level await has none.
  const callback = enclosingFunction(awaited);

  if (!callback || !isHookCallback(callback)) {
    return undefined;
  }

  const awaitsElse = (node: EsNode): boolean =>
    (node.type === 'AwaitExpression' && node !== awaited) || Reflect.get(node, 'await') === true;

  return countInSubtree(Reflect.get(callback, 'body'), awaitsElse, false) === 0 ? callback : undefined;
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
    desc: 'Remove the compileComponents() call',
    fix: (fixer: EsFixer): EsFix[] => {
      const fixes = [isIdentifier(receiver) ? fixer.remove(statement) : fixer.replaceText(awaited, context.sourceCode.getText(receiver))];

      if (callback) {
        const text = context.sourceCode.getText(callback);

        fixes.push(
          fixer.replaceTextRange([callback.range[0], callback.range[0] + text.length - text.slice('async'.length).trimStart().length], ''),
        );
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
      '`compileComponents()` does nothing here. It exists to fetch the `templateUrl` / `styleUrls` of a component at run time, ' +
      'and this project says its builder inlines them (`{ builder: "inline-resources" }`), so the promise is already settled ' +
      'and the `await` in front of it waits for nothing. Delete the call, and the `async` of a hook that awaits nothing else. ' +
      'Under a setup that loads resources at run time — a JIT compile reading `templateUrl` with no build step inlining it — the ' +
      'call is load-bearing, which is why this rule reports nothing until the option says otherwise.',
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
