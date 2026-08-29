/**
 * Which repair an assertion inside `subscribe` needs, and where its assertions actually are.
 *
 * The rule reports one shape and three different edits, and reading them as one was what five
 * migration batches spent their time on: 110 of 111 places were a mechanical inversion in one file
 * and 36 of 119 in another, with the rest needing a subscription that stands *before* the thing
 * that makes the stream emit. Deciding which is which is syntactic, and this is where that is done.
 */
import type { EsSubscribeCall } from './await-emission';
import { isSubscribeCall } from './await-emission';
import { findBinding, initializerOf } from './bindings';
import {
  type EsCallExpression,
  type EsIdentifier,
  type EsNode,
  type RuleContext,
  countInSubtree,
  isBlockStatement,
  isCallExpression,
  isExpressionStatement,
  isFunctionNode,
  isIdentifier,
  propertyName,
} from './rule-types';

/** The `subscribe(…)` an assertion sits inside. The selector matched a descendant of one, so there is always one above. */
export function enclosingSubscribe(node: EsNode): EsSubscribeCall {
  let current = node.parent;

  while (!isSubscribeCall(current)) {
    current = current.parent;
  }

  return current;
}

/**
 * Which repair an assertion inside `subscribe` needs.
 *
 * The three are not variations on one message. Five migration batches read the same sentence for
 * all of them and split the work by hand every time, and the proportions differ per file rather
 * than per suite: 110 of 111 mechanical in one batch, 36 of 119 in another.
 */
export type SubscribeRepair = 'afterTrigger' | 'inErrorHandler' | 'invertible';

/** The names `subscribe`'s observer object gives its three callbacks. */
const OBSERVER_HANDLERS = new Set(['complete', 'error', 'next']);

/**
 * Whether the assertion sits in the failure branch.
 *
 * Positional (`subscribe(next, error)`) or named (`subscribe({ error })`) — both mean the same
 * thing, and neither is repaired by `expectEmission`, which resolves on a *value*. Missing this
 * split sent three assertions in one file and eight in another looking for a helper that could not
 * apply.
 */
function inErrorHandler(node: EsNode, subscribeCall: EsSubscribeCall): boolean {
  const [positionalNext, positionalError] = subscribeCall.arguments;
  const handler = handlerHolding(node, subscribeCall);

  if (positionalError && handler === positionalError) {
    return true;
  }

  return handler !== undefined && handler !== positionalNext && propertyName(handler.parent) === 'error';
}

/** The argument or observer callback the assertion is inside, as a direct child of the `subscribe` call's arguments. */
function handlerHolding(node: EsNode, subscribeCall: EsSubscribeCall): EsNode | undefined {
  let current = node;

  while (current !== subscribeCall) {
    if (subscribeCall.arguments.includes(current) || OBSERVER_HANDLERS.has(propertyName(current.parent) ?? '')) {
      return current;
    }

    current = current.parent;
  }

  return undefined;
}

/**
 * Whether anything runs after the subscription in the same block.
 *
 * This is the signal that tells the two mechanical repairs apart, and it is the shape of the most
 * common Angular spec there is: `httpMock.expectOne(...)` and `req.flush(...)` *are* what makes the
 * stream emit, and there is no request to expect until something has subscribed. Inverting that
 * into `await firstValueFrom(...)` deadlocks — the await never returns, so the trigger never runs.
 */
function triggerFollows(subscribeCall: EsSubscribeCall): boolean {
  const statement = statementOf(subscribeCall);

  if (!statement || !isBlockStatement(statement.parent)) {
    return false;
  }

  return statement.parent.body.indexOf(statement) < statement.parent.body.length - 1;
}

/** The statement a call belongs to, when it is a statement of its own. */
function statementOf(node: EsNode): EsNode | undefined {
  let current = node;

  while (current.type !== 'Program') {
    if (isExpressionStatement(current)) {
      return current;
    }

    current = current.parent;
  }

  return undefined;
}

/** An `expect(…)` call, wherever it stands. */
export function isExpectCall(node: EsNode): boolean {
  return isCallExpression(node) && isIdentifier(node.callee) && node.callee.name === 'expect';
}

/** A call of a plain name, as the selector below guarantees. */
export interface EsNamedCall extends EsCallExpression {
  callee: EsIdentifier;
}

/** The function a name is bound to in this file — declared or assigned, either spelling. */
function localFunction(context: RuleContext, identifier: EsIdentifier): EsNode | undefined {
  const scope = context.sourceCode.getScope(identifier);
  const binding = findBinding(scope, identifier.name);
  const declared = binding?.defs.map((definition) => definition.node).find(isFunctionNode);
  const initializer = initializerOf(scope, identifier);

  return declared ?? (initializer && isFunctionNode(initializer) ? initializer : undefined);
}

/**
 * Assertions a `subscribe` callback reaches through a helper, rather than writing out.
 *
 * `source$.subscribe((data) => assertShape(data))` is the same green-and-empty test as the inline
 * form — if the stream never emits, `assertShape` is never called and nothing is asserted — and the
 * rule used to see nothing at all there, because the `expect`s are one call away. One step through a
 * name bound in the same file covers the shape without asking the type checker anything.
 */
export function helperAssertions(context: RuleContext, call: EsNamedCall, subscribeCall: EsSubscribeCall): number {
  const body = localFunction(context, call.callee);

  // A helper declared *inside* the callback already sits in the subscribe's own subtree, where the
  // selector below has counted its assertions once already.
  if (!body || (body.range[0] >= subscribeCall.range[0] && body.range[1] <= subscribeCall.range[1])) {
    return 0;
  }

  return countInSubtree(body, isExpectCall, true);
}

/** Pick the repair, worst-understood first. */
export function repairFor(node: EsNode, subscribeCall: EsSubscribeCall): SubscribeRepair {
  if (inErrorHandler(node, subscribeCall)) {
    return 'inErrorHandler';
  }

  return triggerFollows(subscribeCall) ? 'afterTrigger' : 'invertible';
}
