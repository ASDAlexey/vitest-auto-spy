/** `spy.method.calledWith(1);` as a statement of its own → a stub nobody configured, asserting nothing. */
import { defineRule } from './define-rule';
import { argumentList, excerpt, receiverOf } from './message-data';
import { type EsCallExpression, type EsNode, type RuleContext, isCallExpression, isIdentifier, isMemberExpression } from './rule-types';

/**
 * Whether a member chain is rooted at `expect(...)` — i.e. it is chai's assertion, not this
 * library's stub.
 *
 * The two spell `calledWith` identically, and Vitest 4.1 made the collision common rather than
 * theoretical by adding `expect(fn).to.have.been.calledWith(x)` for suites arriving from sinon.
 * Reading the *root* of the chain is what separates them: an assertion always begins at a call to
 * `expect`, a stub always begins at a spy.
 */
function rootsAtExpect(node: EsNode): boolean {
  let current: EsNode = node;

  for (;;) {
    if (isMemberExpression(current)) {
      current = current.object;
    } else if (isCallExpression(current)) {
      current = current.callee;
    } else {
      return isIdentifier(current) && current.name === 'expect';
    }
  }
}

/** What a bare `calledWith` report quotes: the call, the method it stubs and its arguments. */
function calledWithData(context: RuleContext, node: EsCallExpression): Record<string, string> {
  const method = receiverOf(context, node);

  return { call: excerpt(context, node), method, args: argumentList(context, node) };
}

export const noBareCalledWith = defineRule({
  name: 'no-bare-called-with',
  description: 'Continue a calledWith / mustBeCalledWith chain — on its own it configures nothing and asserts nothing',
  messages: {
    noBareCalledWith:
      '`{{call}}` is a stub, not an assertion: on its own it makes the method answer `undefined` for these arguments and checks nothing. Continue the chain with `.mockReturnValue(v)` / `.resolveWith(v)`, or assert with `expect({{method}}).toHaveBeenCalledWith({{args}})`.',
    noBareMustBeCalledWith:
      '`{{call}}` on its own rejects every call, the matching one included, because nothing was configured for these arguments. Continue the chain with `.mockReturnValue(v)` / `.resolveWith(v)`, or assert with `expect({{method}}).toHaveBeenCalledWith({{args}})`.',
  },
  // One selector per chain rather than one alternation and a branch: the two say different things,
  // and reading the name back off a node the selector already matched is a check that cannot fail.
  create: (context) => ({
    'ExpressionStatement > CallExpression[callee.property.name="calledWith"]': (node: EsCallExpression): void => {
      // The chai assertion shares the name and is a bare statement by design — see `rootsAtExpect`.
      if (!rootsAtExpect(node)) {
        context.report({ node, messageId: 'noBareCalledWith', data: calledWithData(context, node) });
      }
    },
    // No `rootsAtExpect` guard here, and that is not an oversight: chai's bundle has `calledWith`
    // and nothing named `mustBeCalledWith`, so there is no assertion of this name to mistake a stub
    // for. A guard would be a branch no input can take.
    'ExpressionStatement > CallExpression[callee.property.name="mustBeCalledWith"]': (node: EsCallExpression): void => {
      context.report({ node, messageId: 'noBareMustBeCalledWith', data: calledWithData(context, node) });
    },
  }),
});
