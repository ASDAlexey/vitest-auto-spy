/**
 * A promise chain that asserts and that nothing awaits.
 *
 * `compileComponents().then(() => expect(…))` as a statement of its own runs its callback after the
 * test that wrote it has finished, so the assertion cannot fail it — and under zone.js the rejection
 * it raises is drained into `console.error` rather than reported, leaving a green test and a line of
 * stderr. Deciding it is a walk *up* the chain rather than a selector, for the reason
 * {@link isFloatingChain} gives.
 */
import { type EsNode, isCallExpression, isIdentifier, isMemberExpression } from './rule-types';

/** The promise methods whose callback is deferred: nothing inside it runs during the synchronous test body. */
const PROMISE_CALLBACK_METHODS = new Set(['catch', 'finally', 'then']);

/** Whether `fn` is the callback handed to `.then()` / `.catch()` / `.finally()`, rather than to anything else. */
export function isPromiseCallback(fn: EsNode): boolean {
  const call = fn.parent;

  if (!isCallExpression(call) || !isMemberExpression(call.callee)) {
    return false;
  }

  // A computed method name (`p[settle](…)`) is not knowably a promise callback, so it is left alone.
  return isIdentifier(call.callee.property) && PROMISE_CALLBACK_METHODS.has(call.callee.property.name);
}

/** Whether the chain grows past `node`: `p.then(a)` is the object of `.catch`, which is the callee of `.catch(b)`. */
function continuesChain(node: EsNode): boolean {
  return isMemberExpression(node.parent) || (isCallExpression(node.parent) && node.parent.callee === node);
}

/**
 * Whether the chain `call` belongs to is a bare expression statement — nobody awaits, returns, stores
 * or passes on the promise.
 *
 * The walk to the top of the chain is the whole point: in `p.then(a).catch(b)` the parent of
 * `p.then(a)` is a member expression, so only the *last* call in the chain has a parent that says
 * whether anything ever consumes the promise. Reading the immediate parent would clear the first
 * callback of every chain that has a second one.
 */
export function isFloatingChain(call: EsNode): boolean {
  let current = call;

  while (continuesChain(current)) {
    current = current.parent;
  }

  return current.parent.type === 'ExpressionStatement';
}
