/** `p.then(() => expect(…))` as a statement of its own → `expect(await p)`. */
import { defineRule } from './define-rule';
import { isFloatingChain, isPromiseCallback } from './floating-assertion';
import { excerpt } from './message-data';
import { type EsNode, enclosingFunction } from './rule-types';

export const noFloatingAssertion = defineRule({
  name: 'no-floating-assertion',
  description: 'Await or return a promise chain that asserts, instead of leaving the .then() callback floating',
  messages: {
    noFloatingAssertion:
      'Nothing awaits `{{chain}}`, so the test ends before its callback runs and this assertion never executes. Await the chain (or `return` it) and assert on the settled value: `expect(await promise)…`.',
  },
  create: (context) => ({
    'CallExpression[callee.name="expect"]': (node: EsNode): void => {
      // Only the *immediately* enclosing function counts. One nested callback deeper the advice stops
      // being true: awaiting the chain revives an `expect` sitting directly in the `.then()` callback,
      // but not one parked in a `subscribe` or a `setTimeout` inside it — and which of those a
      // callback is cannot be read off the syntax. Reporting only what awaiting actually fixes keeps
      // the message honest, and leaves the deferred-callback shapes to `no-expect-in-subscribe`.
      const callback = enclosingFunction(node);

      if (!callback || !isPromiseCallback(callback) || !isFloatingChain(callback.parent)) {
        return;
      }

      context.report({ node, messageId: 'noFloatingAssertion', data: { chain: excerpt(context, callback.parent, 50) } });
    },
  }),
});
