/**
 * A spec that sleeps on the wall clock: `new Promise((r) => setTimeout(r, N))`, or `setTimeout(N)`
 * from `node:timers/promises`. A zero or missing delay is a macrotask flush rather than a wait, and
 * is left alone.
 */
import { PACKAGE, bindingState, findBinding, importNamed } from './bindings';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsNode,
  type RuleContext,
  type SuggestionDescriptor,
  anyInSubtree,
  isCallExpression,
  isFunctionNode,
  isIdentifier,
  isMemberExpression,
  memberName,
} from './rule-types';

const TIMER_HOSTS = new Set(['globalThis', 'window', 'self']);
const PROMISE_TIMERS = new Set(['timers/promises', 'node:timers/promises']);

/** A delay that actually waits: present, and not the literal `0` of a macrotask flush. */
function isRealDelay(delay: EsNode | undefined): delay is EsNode {
  return delay !== undefined && !(delay.type === 'Literal' && Reflect.get(delay, 'value') === 0);
}

/** `setTimeout(…)`, `window.setTimeout(…)` or `globalThis.setTimeout(…)`. */
function isSetTimeout(node: EsNode): node is EsCallExpression {
  if (!isCallExpression(node)) {
    return false;
  }

  const { callee } = node;

  return isIdentifier(callee)
    ? callee.name === 'setTimeout'
    : memberName(callee) === 'setTimeout' &&
        isMemberExpression(callee) &&
        isIdentifier(callee.object) &&
        TIMER_HOSTS.has(callee.object.name);
}

/** Whether `node` mentions the executor's `resolve`. */
function mentions(context: RuleContext, node: EsNode, name: string): boolean {
  return anyInSubtree(context, node, (candidate) => isIdentifier(candidate) && candidate.name === name, true);
}

/** The delay of the `setTimeout` inside a promise executor that settles the promise after a real wait. */
function sleepingDelay(context: RuleContext, promise: EsCallExpression): EsNode | undefined {
  const [executor] = promise.arguments;

  if (!executor || !isFunctionNode(executor)) {
    return undefined;
  }

  const [resolve] = executor.params;

  if (!resolve || !isIdentifier(resolve)) {
    return undefined;
  }

  let timer: EsCallExpression | undefined;

  anyInSubtree(
    context,
    executor.body,
    (node) => {
      if (isSetTimeout(node) && node.arguments[0] !== undefined && mentions(context, node.arguments[0], resolve.name)) {
        timer = node;
      }

      return timer !== undefined;
    },
    false,
  );

  const delay = timer?.arguments[1];

  return isRealDelay(delay) ? delay : undefined;
}

/** A call of `setTimeout` imported from `node:timers/promises`, under whatever local name. */
function isPromiseTimer(context: RuleContext, node: EsCallExpression): boolean {
  const definition = findBinding(context.sourceCode.getScope(node), String(Reflect.get(node.callee, 'name')))?.defs[0];
  const specifier = definition?.type === 'ImportBinding' ? definition.node : undefined;
  const imported: unknown = Reflect.get(Object(Reflect.get(Object(specifier), 'imported')), 'name');
  const source: unknown = Reflect.get(Object(Reflect.get(Object(specifier?.parent), 'source')), 'value');

  return imported === 'setTimeout' && PROMISE_TIMERS.has(String(source));
}

const FLUSH = 'flushEventLoop';

const MESSAGE =
  '`{{call}}` waits `{{delay}}` ms of real time, which every run of this test pays and a loaded CI machine can outlast. Drive the clock instead: `setupFakeTimers()` in the describe and `await advanceTimers({{delay}})` in the test (`vitest-auto-spy/setup`) — or wait for the thing itself: `await vi.waitFor(…)`, `await fixture.whenStable()`. When the wait only lets mocked promises settle, `await flushEventLoop()` takes one real turn instead.';

/**
 * `await sleep` → `await flushEventLoop()`, offered only where the sleep is awaited on the spot.
 *
 * A suggestion, not a fix: one event-loop turn drains every resolved promise chain, which is what a
 * spec sleeping past a mocked `invoke()` or `fetch()` waits for, but it fires no timer the code set.
 */
function flushInstead(context: RuleContext, node: EsNode): SuggestionDescriptor[] {
  const state = bindingState(context.sourceCode.getScope(node), FLUSH);

  if (node.parent.type !== 'AwaitExpression' || state === 'taken') {
    return [];
  }

  return [
    {
      desc: `Take one real event-loop turn with ${FLUSH}(), which settles promise chains but fires no timer`,
      fix: (fixer: EsFixer): EsFix[] =>
        state === 'free'
          ? [fixer.replaceText(node, `${FLUSH}()`), importNamed(fixer, node, FLUSH, PACKAGE)]
          : [fixer.replaceText(node, `${FLUSH}()`)],
    },
  ];
}

function report(context: RuleContext, node: EsNode, delay: EsNode): void {
  context.report({
    node,
    messageId: 'noRealWaitInTest',
    data: { call: excerpt(context, node), delay: context.sourceCode.getText(delay) },
    suggest: flushInstead(context, node),
  });
}

export const noRealWaitInTest = defineRule({
  name: 'no-real-wait-in-test',
  description: 'Do not sleep on the real clock in a spec — drive fake timers or wait for the outcome',
  hasSuggestions: true,
  messages: { noRealWaitInTest: MESSAGE },
  create: (context) => ({
    'NewExpression[callee.name="Promise"]': (node: EsCallExpression): void => {
      const delay = sleepingDelay(context, node);

      if (delay) {
        report(context, node, delay);
      }
    },
    'CallExpression[callee.type="Identifier"]': (node: EsCallExpression): void => {
      const [delay] = node.arguments;

      if (isRealDelay(delay) && isPromiseTimer(context, node)) {
        report(context, node, delay);
      }
    },
  }),
});
