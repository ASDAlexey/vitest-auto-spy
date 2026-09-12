/**
 * The `async` a hook carries for one `await`, and the edit that takes it back off.
 *
 * Shared by the two rules that remove an `await`: `no-compile-components` drops the call in front of
 * it, `no-sync-testbed-await` only the keyword. Both then face the same second half. A
 * `beforeEach(async () => …)` whose `async` existed for that one `await` still advertises an
 * asynchronous setup once the `await` is gone, and the runner still takes the promise it returns —
 * so an edit that stops at the `await` leaves the consumer needing
 * `@typescript-eslint/require-await` to finish the job. Measured on an Angular suite of 1862 spec
 * files: removing 448 `compileComponents()` calls left 33 hooks `async` with nothing to wait for.
 *
 * A callback is only touched when the runner owns it — `beforeEach`, `beforeAll`, `afterEach`,
 * `afterAll`, `it`, `test`, written bare. `it.only(…)`, `beforeEach(waitForAsync(async () => …))`
 * and a helper the spec declares keep their `async`: each of those hands the function to something
 * else, and what that something does with a promise is not read off this file.
 */
import {
  type EsFix,
  type EsFixer,
  type EsNode,
  type RuleContext,
  countInSubtree,
  enclosingFunction,
  isCallExpression,
  isIdentifier,
} from './rule-types';

const HOOKS = new Set(['afterAll', 'afterEach', 'beforeAll', 'beforeEach', 'it', 'test']);

function isHookCallback(callback: EsNode): boolean {
  const runner = callback.parent;

  return isCallExpression(runner) && isIdentifier(runner.callee) && HOOKS.has(runner.callee.name);
}

/** The hook or test callback whose `async` only existed for this `await`, when there is one. */
export function asyncOnlyFor(awaited: EsNode): EsNode | undefined {
  // The innermost function around an `await` is async by construction; only a top-level await has none.
  const callback = enclosingFunction(awaited);

  if (!callback || !isHookCallback(callback)) {
    return undefined;
  }

  const awaitsElse = (node: EsNode): boolean =>
    (node.type === 'AwaitExpression' && node !== awaited) || Reflect.get(node, 'await') === true;

  return countInSubtree(Reflect.get(callback, 'body'), awaitsElse, false) === 0 ? callback : undefined;
}

/**
 * Take the `async` off a callback, together with the space after it.
 *
 * By text rather than by token: `async` is not a node of its own, and the callback's own source is
 * the one place its length is known whichever form — arrow or `function` — carries it.
 */
export function dropAsync(context: RuleContext, callback: EsNode, fixer: EsFixer): EsFix {
  const text = context.sourceCode.getText(callback);

  return fixer.replaceTextRange([callback.range[0], callback.range[0] + text.length - text.slice('async'.length).trimStart().length], '');
}
