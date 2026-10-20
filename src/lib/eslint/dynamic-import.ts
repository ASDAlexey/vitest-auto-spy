/**
 * A bare `await import('./thing')` in a test body, where `settleDynamicImport()` is what lets the
 * code under test catch up.
 *
 * Production code that lazy-loads on an interaction — `await import('./exit-from-app.component')`
 * in a click handler — hands the spec no promise to hold on to. So the spec loads the same
 * specifier itself, which works as far as it goes: the module registry is shared, the second
 * `import()` resolves against the instance the first one is already loading, and awaiting it does
 * wait for the module. It does not guarantee that the handler's own continuation — the lines
 * *after* its `await`, which open the dialog, set the signal or navigate — has finished too.
 * Further asynchronous work in that continuation can leave the assertion reading state too early.
 *
 * `settleDynamicImport(load, turns = 1)` is the same `await` plus `flushEventLoop(turns)`.
 * A hand-written `await Promise.resolve()` under the import yields to microtasks only; it is not
 * an event-loop turn and does not replace the helper's flush.
 *
 * **Syntax only.** `import(…)` is its own node and `await` is its parent; nothing here asks what
 * the specifier resolves to, the way `no-sync-testbed-await` decides on a member name alone.
 *
 * **Where it stays silent, and why each one is silence rather than a report.** The report is made
 * only where the innermost function around the `import()` is the runner's own callback — an `it` /
 * `test` body or a `beforeEach` / `beforeAll` / `afterEach` / `afterAll` hook, in their `.only`,
 * `.skip` and `.each` spellings too. Several exemptions follow from that boundary: each of the
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
 * spies on. Nothing in that callback has run yet whose continuation could be pending. A static
 * import is an option only when module evaluation order can stay the same. The same holds right after
 * `vi.resetModules()` / `vi.doMock(…)` / `vi.doUnmock(…)`: the import loads a copy nothing else holds.
 * Before-hooks also fetch provider classes after preparing fixture values. A bound import used in
 * that hook's `TestBed.configureTestingModule({ providers: […] })` stays silent while preceding
 * statements only prepare fixtures; calls on the system under test and injector calls end that
 * exemption. Neither path proves what another hook or another module may already have started.
 */
import { PACKAGE, bindingState, findBinding, importNamed, importSpecifierOf } from './bindings';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsFix,
  type EsFixer,
  type EsNode,
  type RuleContext,
  type RuleModule,
  type SuggestionDescriptor,
  anyInSubtree,
  enclosingFunction,
  isAssignmentExpression,
  isBlockStatement,
  isCallExpression,
  isExpressionStatement,
  isIdentifier,
  isMemberExpression,
  isRunnerCall,
  isVariableDeclarator,
  memberName,
  propertyName,
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

/** The runner callback evaluating `node`, rather than a callback handed to application code. */
function enclosingRunner(node: EsNode): string | undefined {
  const callback = enclosingFunction(node);

  if (!callback) {
    return undefined;
  }

  const call = callback.parent;

  return isCallExpression(call) && call.arguments.includes(callback) ? runnerBehind(call.callee) : undefined;
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

/** Calls that swap the module registry, after which the next `import()` loads a copy nothing else holds. */
const REGISTRY_RESETS = new Set(['doMock', 'doUnmock', 'resetModules']);

/** Whether a statement is `vi.resetModules()` / `vi.doMock(…)` / `vi.doUnmock(…)`. */
function resetsRegistry(statement: EsNode): boolean {
  return isExpressionStatement(statement) && isRunnerCall(statement.expression, REGISTRY_RESETS);
}

/**
 * A namespace bound as the first thing a test or a hook does, or right after the spec swapped the
 * module registry: a fresh copy nothing else is loading, so it is read, not waited on. Namespaces
 * bound one after another (`bound`, filled in source order) count as one read.
 */
function takesTheNamespaceFirst(node: EsNode, bound: Set<EsNode>): boolean {
  const statement = bindingStatement(node.parent);
  const callback = enclosingFunction(node);

  if (statement === undefined || callback === undefined || !isBlockStatement(statement.parent)) {
    return false;
  }

  bound.add(statement);

  const siblings = statement.parent.body;
  const before = siblings
    .slice(0, siblings.indexOf(statement))
    .reverse()
    .find((sibling) => !bound.has(sibling));

  return before === undefined ? statement.parent === callback.body : resetsRegistry(before);
}

/** Whether a reference supplies a provider in a direct testing-module configuration. */
function providerReference(context: RuleContext, reference: EsNode, callback: EsNode): boolean {
  if (enclosingFunction(reference) !== callback) {
    return false;
  }

  let current = reference;

  while (current !== callback) {
    if (propertyName(current) === 'providers') {
      const configuration = current.parent;
      const call = configuration.parent;

      if (!isCallExpression(call) || !call.arguments.includes(configuration)) {
        return false;
      }

      if (!isMemberExpression(call.callee) || memberName(call.callee) !== 'configureTestingModule' || !isIdentifier(call.callee.object)) {
        return false;
      }

      const receiver = call.callee.object;
      const binding = findBinding(context.sourceCode.getScope(receiver), receiver.name);
      const specifier = binding && importSpecifierOf(binding);

      return specifier
        ? isIdentifier(specifier.imported) &&
            specifier.imported.name === 'TestBed' &&
            specifier.parent.source.value === '@angular/core/testing'
        : binding === undefined && receiver.name === 'TestBed';
    }

    current = current.parent;
  }

  return false;
}

/** A bound value whose later reads include a provider in this callback (destructuring aliases included). */
function suppliesProvider(context: RuleContext, awaited: EsNode, callback: EsNode): boolean {
  const holder = awaited.parent;
  const pattern = isVariableDeclarator(holder) ? holder.id : isAssignmentExpression(holder) ? holder.left : undefined;

  return (
    pattern !== undefined &&
    anyInSubtree(
      context,
      pattern,
      (candidate) => {
        if (!isIdentifier(candidate)) {
          return false;
        }

        const binding = findBinding(context.sourceCode.getScope(candidate), candidate.name);

        const writes = binding?.references.filter((reference) => reference.writeExpr) ?? [];

        return (
          writes.length === 1 &&
          writes[0]?.writeExpr === awaited &&
          binding?.references.some(
            (reference) => reference.identifier.range[0] > awaited.range[1] && providerReference(context, reference.identifier, callback),
          ) === true
        );
      },
      false,
    )
  );
}

/**
 * A fixture factory is preparation only when its result is bound and later supplies a provider.
 * Member calls and unbound calls remain barriers: either can already start the system under test.
 */
function preparesProvider(context: RuleContext, call: EsNode, callback: EsNode): boolean {
  if (!isCallExpression(call) || !isIdentifier(call.callee)) {
    return false;
  }

  const binding = findBinding(context.sourceCode.getScope(call), call.callee.name);

  return binding?.defs.some((definition) => definition.type === 'ImportBinding') === true && suppliesProvider(context, call, callback);
}

/**
 * A hook may build fixture values before loading its provider classes. Follow the bound provider
 * references rather than treating every import after the hook's first statement as a lazy-load wait.
 * Only straight-line setup before any other call qualifies; local setup functions keep the existing
 * function-boundary exemption, and test bodies retain their stricter first-statement heuristic.
 */
function loadsProviderForSetup(context: RuleContext, node: EsNode, runner: string): boolean {
  const callback = enclosingFunction(node);
  const statement = bindingStatement(node.parent);

  if (!callback || statement?.parent !== callback.body || !isBlockStatement(callback.body)) {
    return false;
  }

  if ((runner !== 'beforeAll' && runner !== 'beforeEach') || !suppliesProvider(context, node.parent, callback)) {
    return false;
  }

  return callback.body.body
    .slice(0, callback.body.body.indexOf(statement))
    .every(
      (before) =>
        (before.type === 'VariableDeclaration' || isExpressionStatement(before)) &&
        !anyInSubtree(
          context,
          before,
          (candidate) =>
            (isAssignmentExpression(candidate) && !isIdentifier(candidate.left)) ||
            (candidate.type === 'UnaryExpression' && Reflect.get(candidate, 'operator') === 'delete') ||
            ((isCallExpression(candidate) ||
              candidate.type === 'NewExpression' ||
              candidate.type === 'AwaitExpression' ||
              candidate.type === 'UpdateExpression') &&
              !preparesProvider(context, candidate, callback) &&
              !(
                candidate.type === 'AwaitExpression' &&
                suppliesProvider(context, candidate, callback) &&
                anyInSubtree(context, candidate, (child) => child.type === 'ImportExpression' && child.parent === candidate, false)
              ) &&
              !isRunnerCall(candidate, REGISTRY_RESETS)),
          false,
        ),
    );
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
    awaitedDynamicImport: `\`await {{load}}\` waits for the module, not for the code under test that was loading it: its continuation after its own \`await\` may still be pending, so the assertions below may read state too early. ${REPAIR}`,
    thenedDynamicImport: `\`{{load}}.then(…)\` waits for the module, not for the code under test that was loading it, and its callback runs later still, after the test ends if nothing awaits it. ${REPAIR}`,
  },
  create: (context) => {
    const bound = new Set<EsNode>();

    return {
      ImportExpression: (node: EsNode): void => {
        const consumption = consumptionOf(node);
        const runner = enclosingRunner(node);

        if (
          consumption === undefined ||
          runner === undefined ||
          (consumption === 'await' && (takesTheNamespaceFirst(node, bound) || loadsProviderForSetup(context, node, runner)))
        ) {
          return;
        }

        const messageId = consumption === 'await' ? 'awaitedDynamicImport' : 'thenedDynamicImport';
        const suggestion = wrap(context, node);
        const report = { node, messageId, data: { load: excerpt(context, node) } };

        context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
      },
    };
  },
});
