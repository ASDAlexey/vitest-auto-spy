/** `it('x', (done) => …)` → `async` + an awaited assertion. */
import { findBinding } from './bindings';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsFunction,
  type EsIdentifier,
  type EsMemberExpression,
  type EsNode,
  type RuleContext,
  isCallee,
  isIdentifier,
  isMemberExpression,
  memberName,
} from './rule-types';

/**
 * Whether `node` is the first parameter of a test callback this rule has already reported.
 *
 * Resolved through the scope manager rather than matched by name: `done` is what the parameter is
 * called in nine files out of ten and in none of the tenth, and a `fail` method on anything else —
 * a matcher bag, a domain object, an `AbortController` wrapper — is somebody's API.
 */
function isTestCallbackParameter(context: RuleContext, node: EsNode, callbacks: ReadonlySet<EsNode>): boolean {
  if (!isIdentifier(node)) {
    return false;
  }

  const binding = findBinding(context.sourceCode.getScope(node), node.name);

  return Boolean(binding?.defs.some((definition) => definition.type === 'Parameter' && callbacks.has(definition.node)));
}

/**
 * Whether every mention of the parameter reads it the way a `TestContext` is read.
 *
 * Vitest passes the context as the first argument whether or not it is destructured, and
 * `it('x', (ctx) => ctx.skip())` is its own documentation's example — so a name is only a `done`
 * carried over from Jest where it is *called* (`done()`), handed to something that will call it
 * (`.subscribe(done)`, `setTimeout(done)`) or never used at all. A member read is the context being
 * used: `ctx.task`, `ctx.expect`, `ctx.onTestFinished`. Except `fail`, which the context has no
 * member for — that one is jasmine's failure channel and this rule's second message.
 */
function readsTheTestContext(context: RuleContext, callback: EsFunction, parameter: EsIdentifier): boolean {
  // The callback's own scope, not the chain above it: the parameter is declared right here, and a
  // name the scope manager does not know at all is a name nothing in the body mentions.
  const scope = context.sourceCode.getScope(callback);
  const references = scope.variables.flatMap((variable) => (variable.name === parameter.name ? variable.references : []));

  return (
    references.length > 0 &&
    references.every(({ identifier }) => {
      const member = identifier.parent;

      return isMemberExpression(member) && member.object === identifier && memberName(member) !== 'fail';
    })
  );
}

export const noDoneCallback = defineRule({
  name: 'no-done-callback',
  description: 'Vitest has no done callback — the first parameter of a test or hook is its TestContext',
  messages: {
    noDoneCallback:
      'Vitest passes a `TestContext` as `{{name}}`, not a `done` callback: calling it throws inside a promise nobody awaits, and the test passes having run almost none of its body. Make the callback `async` and await the result, e.g. `await firstValueFrom(source$)` or `await expectEmission(source$)`.',
    doneFail:
      '`{{call}}` throws `{{name}}.fail is not a function`, because Vitest’s `TestContext` has no `fail`, and it throws inside a callback nobody awaits, so the run stays green on the path meant to fail it. Assert on the failure with `await expect(promise).rejects…`, or write `expect.fail(message)` for a line that must not run.',
  },
  create: (context) => {
    // The functions whose first parameter has already been reported. `done.fail(…)` is only this
    // rule's business when `done` is one of those parameters — a `fail` method on anything else is
    // somebody's API — and the parameter is visited before the body, so the set is complete by then.
    const callbacks = new Set<EsNode>();

    return {
      'CallExpression[callee.name=/^(it|test|beforeAll|beforeEach|afterAll|afterEach)$/] > :matches(ArrowFunctionExpression, FunctionExpression)':
        (node: EsFunction): void => {
          // An identifier parameter, not a destructuring pattern: a `test.extend` fixture has to be
          // destructured, so a plain name here is either a `done` carried over from Jest or the
          // `TestContext` taken whole — and what the body does with it is what tells the two apart.
          const [parameter] = node.params;

          if (!parameter || !isIdentifier(parameter) || readsTheTestContext(context, node, parameter)) {
            return;
          }

          callbacks.add(node);
          context.report({ node: parameter, messageId: 'noDoneCallback', data: { name: parameter.name } });
        },
      'MemberExpression[property.name="fail"]': (node: EsMemberExpression): void => {
        if (isCallee(node) && isTestCallbackParameter(context, node.object, callbacks)) {
          context.report({
            node: node.parent,
            messageId: 'doneFail',
            data: { call: excerpt(context, node.parent), name: excerpt(context, node.object) },
          });
        }
      },
    };
  },
});
