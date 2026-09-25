/**
 * A bare `await import('./thing')` in a test body, where `settleDynamicImport()` is what lets the
 * code under test catch up.
 *
 * Production code that lazy-loads on an interaction — `await import('./exit-from-app.component')`
 * in a click handler — hands the spec no promise to hold on to. So the spec loads the same
 * specifier itself, which works as far as it goes: the module registry is shared, the second
 * `import()` resolves against the instance the first one is already loading, and awaiting it does
 * wait for the module. What it does **not** wait for is the handler's own continuation — the lines
 * *after* its `await`, which are the ones that open the dialog, set the signal or navigate. Those
 * are queued behind the loader's microtask, and the assertion runs a turn too early. The test is
 * green only while that continuation is short enough to have drained by accident, and it turns red
 * on the day somebody adds a line to it — a flake with no bad line in it.
 *
 * `settleDynamicImport(load, turns = 1)` is the same `await` plus `flushEventLoop(turns)`, which is
 * the turn the continuation needs. The tell that a suite has already met this is a hand-rolled half
 * of it: an `await Promise.resolve()` written under the import (a `flushEventLoop(1)` spelled out),
 * or a local `const flushLazyImport = async () => { await import('…'); }` — both were found in the
 * consumer this rule was measured on, four lines apart in one file.
 *
 * **Syntax only.** `import(…)` is its own node and `await` is its parent; nothing here asks what
 * the specifier resolves to, the way `no-sync-testbed-await` decides on a member name alone.
 *
 * **Where it stays silent, and why each one is silence rather than a report.** The report is made
 * only where the innermost function around the `import()` is the runner's own callback — an `it` /
 * `test` body or a `beforeEach` / `beforeAll` / `afterEach` / `afterAll` hook, in their `.only`,
 * `.skip` and `.each` spellings too. One test settles every exemption at once, because each of the
 * shapes where the helper is the wrong advice puts a **function of its own** between the callback
 * and the import: a `vi.mock` / `vi.doMock` factory, a lazy route's `loadComponent` /
 * `loadChildren`, a callback the spec hands to production code, and `settleDynamicImport`'s own
 * `() => import(…)`. A module-scope `import()` has no enclosing callback at all.
 *
 * The one thing that costs a real finding is the same reading: a spec-local
 * `const load = async () => { await import('./thing'); }` is **not** reported, because a named
 * function whose body awaits an import is written identically whether the spec calls it itself or
 * hands it to the code under test as a loader — and for the second one `settleDynamicImport` would
 * be wrong advice. Nothing in the file settles which it is, so the rule declines rather than
 * guesses.
 *
 * **Nor is a namespace taken before the callback does anything.** `const ns = await import('./x')`
 * — or `ns = await import(…)` — as the **first** statement of a test or a hook is the spec fetching
 * a module to read it: a barrel's exports, the handle on a `vi.mock`ed package a `beforeEach`
 * spies on. Nothing in that callback has run yet whose continuation could be pending, and the
 * repair is a static `import * as ns`, not a turn of the event loop.
 */
import { PACKAGE, bindingState, importNamed } from './bindings';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsFix,
  type EsFixer,
  type EsNode,
  type RuleContext,
  type RuleModule,
  type SuggestionDescriptor,
  enclosingFunction,
  isAssignmentExpression,
  isBlockStatement,
  isCallExpression,
  isExpressionStatement,
  isIdentifier,
  isMemberExpression,
  isVariableDeclarator,
  memberName,
} from './rule-types';

/** The helper the report names, and the name a suggestion writes. */
const HELPER = 'settleDynamicImport';

/** The callbacks the runner itself invokes — the only place the spec's own flow runs an import. */
const RUNNER_CALLBACKS = new Set(['afterAll', 'afterEach', 'beforeAll', 'beforeEach', 'it', 'test']);

/** How the spec consumes the module: the two spellings, reported apart because they fail differently. */
type Consumption = 'await' | 'then';

/**
 * The runner behind a callee, through the modifiers a test name can carry.
 *
 * `it.only(…)`, `test.skip(…)` and `it.each([…])(…)` are all the runner's callback, and a rule that
 * read the callee as a plain identifier would report the bare form and miss every marked one — the
 * marked ones being where a flaky lazy-load test ends up.
 *
 * Exported because `no-vacuous-absence-assertion` asks the same question of the same spellings, and
 * a second copy of this walk would be a second place for a new modifier to be forgotten.
 */
export function runnerBehind(callee: EsNode): string | undefined {
  if (isIdentifier(callee)) {
    return RUNNER_CALLBACKS.has(callee.name) ? callee.name : undefined;
  }

  if (isMemberExpression(callee)) {
    return runnerBehind(callee.object);
  }

  return isCallExpression(callee) ? runnerBehind(callee.callee) : undefined;
}

/** Whether `node` is evaluated by the spec's own flow, rather than by something the spec handed a callback to. */
function insideRunnerCallback(node: EsNode): boolean {
  const callback = enclosingFunction(node);

  if (!callback) {
    return false;
  }

  const call = callback.parent;

  return isCallExpression(call) && call.arguments.includes(callback) && runnerBehind(call.callee) !== undefined;
}

/**
 * How the spec waits for the module, when it waits at all.
 *
 * `import(…)` with nothing on it is a fire-and-forget the rule has no business rewriting — a
 * preload, a route fixture — so only the two consumed forms are read.
 */
function consumptionOf(node: EsNode): Consumption | undefined {
  const { parent } = node;

  if (parent.type === 'AwaitExpression') {
    return 'await';
  }

  const chained = isMemberExpression(parent) && parent.object === node && memberName(parent) === 'then';

  return chained && isCallExpression(parent.parent) && parent.parent.callee === parent ? 'then' : undefined;
}

/** The statement an awaited value is bound by — `const ns = await …` or `ns = await …` — if that is what holds it. */
function bindingStatement(awaited: EsNode): EsNode | undefined {
  const holder = awaited.parent;

  if (isVariableDeclarator(holder) && holder.init === awaited) {
    return holder.parent;
  }

  return isAssignmentExpression(holder) && isExpressionStatement(holder.parent) ? holder.parent : undefined;
}

/** A namespace bound as the first thing a test or a hook does: read, not waited on. */
function takesTheNamespaceFirst(node: EsNode): boolean {
  const statement = bindingStatement(node.parent);
  const callback = enclosingFunction(node);

  return statement !== undefined && callback !== undefined && isBlockStatement(callback.body) && callback.body.body[0] === statement;
}

/** `import(x)` → `settleDynamicImport(() => import(x))`, importing the helper when the name is free. */
function wrap(context: RuleContext, node: EsNode): SuggestionDescriptor | undefined {
  const state = bindingState(context.sourceCode.getScope(node), HELPER);

  // A file that declares `settleDynamicImport` as something of its own gets the report and no edit:
  // the rewrite would compile against the wrong name.
  if (state === 'taken') {
    return undefined;
  }

  return {
    desc: `Load it with ${HELPER}(), which takes the event-loop turn the continuation needs`,
    fix: (fixer: EsFixer): EsFix[] => {
      const fixes = [fixer.replaceText(node, `${HELPER}(() => ${context.sourceCode.getText(node)})`)];

      if (state === 'free') {
        fixes.push(importNamed(fixer, node, HELPER, PACKAGE));
      }

      return fixes;
    },
  };
}

const REPAIR = `Write \`await ${HELPER}(() => {{load}})\`, which also flushes that turn, and assert after it.`;

/** `await import('./thing')` in a test body → `await settleDynamicImport(() => import('./thing'))`. */
export const preferSettleDynamicImport: RuleModule = defineRule({
  name: 'prefer-settle-dynamic-import',
  description: 'Load a module the code under test lazy-loads with settleDynamicImport(), not a bare await import()',
  hasSuggestions: true,
  messages: {
    awaitedDynamicImport: `\`await {{load}}\` waits for the module, not for the code under test that was loading it: its continuation after its own \`await\` has not run yet, so the assertions below read the state one turn early. ${REPAIR}`,
    thenedDynamicImport: `\`{{load}}.then(…)\` waits for the module, not for the code under test that was loading it, and its callback runs later still, after the test ends if nothing awaits it. ${REPAIR}`,
  },
  create: (context) => ({
    ImportExpression: (node: EsNode): void => {
      const consumption = consumptionOf(node);

      if (consumption === undefined || !insideRunnerCallback(node) || (consumption === 'await' && takesTheNamespaceFirst(node))) {
        return;
      }

      const messageId = consumption === 'await' ? 'awaitedDynamicImport' : 'thenedDynamicImport';
      const suggestion = wrap(context, node);
      const report = { node, messageId, data: { load: excerpt(context, node) } };

      context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
    },
  }),
});
