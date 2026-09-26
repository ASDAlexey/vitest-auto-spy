/** `source$.subscribe(v => expect(v)…)` → `await expectEmission(source$)`. */
import { count as plural } from '../message-text';
import { type EsPromiseExecutor, type EsSubscribeCall, awaitedRewriteFor } from './await-emission';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import type { EsNode, SuggestionDescriptor } from './rule-types';
import { type EsNamedCall, type SubscribeRepair, enclosingSubscribe, helperAssertions, repairFor } from './subscribe-repair';

export const noExpectInSubscribe = defineRule({
  name: 'no-expect-in-subscribe',
  description: 'Assert observables with expectEmission() instead of expect() inside a subscribe callback',
  messages: {
    invertible:
      'If `{{source}}` never emits, this callback never runs and the test passes having checked nothing ({{assertions}} inside). Await the value and assert on it: `expect(await firstValueFrom({{source}}))…`, or `await expectEmission({{source}})`, which names the source when nothing arrives.',
    afterTrigger:
      'The code after this subscription is what makes `{{source}}` emit, so `await firstValueFrom({{source}})` in its place would wait forever. Start the expectation first, run the trigger, then await it: `const emission = expectEmission({{source}});` … `await expect(emission).resolves.toEqual(…)` ({{assertions}} move below the await).',
    inErrorHandler:
      'This assertion sits in the `error` callback of `{{source}}`, so when the stream succeeds it never runs and the test passes anyway ({{assertions}} there). Assert on the rejection instead: `await expect(firstValueFrom({{source}})).rejects.toMatchObject(…)`.',
  },
  hasSuggestions: true,
  create: (context) => {
    // Counted per `subscribe`, reported once. One assertion per report turned 23 places into 44
    // messages in a single file of the suite this came from, which doubles the apparent size of the
    // job at triage time — and every one of those messages named the same rewrite.
    const assertions = new Map<EsSubscribeCall, { count: number; repair: SubscribeRepair }>();
    const rewrites = new Map<EsNode, SuggestionDescriptor>();

    /** Add assertions to the `subscribe` they belong to. The first of them decides the repair: a
     * second one in a different branch of the same `subscribe` is possible, rare, and wants the
     * message that is already there. */
    const record = (node: EsNode, count: number): void => {
      if (count === 0) {
        return;
      }

      const subscribeCall = enclosingSubscribe(node);
      const seen = assertions.get(subscribeCall);

      assertions.set(subscribeCall, { count: (seen?.count ?? 0) + count, repair: seen?.repair ?? repairFor(node, subscribeCall) });
    };

    return {
      // The whole `it(name, () => new Promise((done) => { … }))` frame, matched as a shape so that
      // the rewrite has nothing left to prove about where it is. It is visited before the
      // assertions inside it, and both are collected until the file is over.
      'CallExpression[callee.name=/^(it|test)$/] > ArrowFunctionExpression > NewExpression[callee.name="Promise"] > :matches(ArrowFunctionExpression, FunctionExpression)':
        (node: EsPromiseExecutor): void => {
          const rewrite = awaitedRewriteFor(context, node);

          if (rewrite) {
            rewrites.set(rewrite.subscribeCall, rewrite.suggestion);
          }
        },
      'CallExpression[callee.property.name="subscribe"] CallExpression[callee.name="expect"]': (node: EsNode): void => {
        record(node, 1);
      },
      // Every plain-name call inside a `subscribe`, so that assertions parked in a helper are found
      // too. `expect` and `done` land here as well and resolve to no local function, which costs a
      // scope lookup and nothing else.
      'CallExpression[callee.property.name="subscribe"] CallExpression[callee.type="Identifier"]': (node: EsNamedCall): void => {
        record(node, helperAssertions(context, node, enclosingSubscribe(node)));
      },
      'Program:exit': (): void => {
        assertions.forEach(({ count, repair }, subscribeCall) => {
          const suggestion = rewrites.get(subscribeCall);
          const data = { source: excerpt(context, subscribeCall.callee.object, 40), assertions: plural(count, 'assertion') };
          const report = { node: subscribeCall, messageId: repair, data };

          context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
        });
      },
    };
  },
});
