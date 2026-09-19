/**
 * A double written straight into a global — `global.fetch = vi.fn(…)` — with nothing that puts the
 * real one back.
 *
 * It is the first thing a tutorial shows for `fetch`, and it is the one mock in a spec that no
 * cleanup the runner offers can reach: `restoreAllMocks` knows about spies, `unstubAllGlobals`
 * knows about `vi.stubGlobal`, and a bare assignment is neither. The fake then outlives the test
 * that installed it — for the rest of the file, and under `isolate: false` for every later file the
 * worker picks up, where a component nobody edited starts receiving a canned response.
 *
 * **What keeps the rule silent** is a restore that runs whatever the assertions did: the same
 * global assigned back, or deleted, inside `afterEach`, `afterAll` or `onTestFinished`. That spelling
 * is correct, so it is not reported. A restore written as the last line of the `it` is reported
 * with a message of its own, because it runs only when every assertion above it passed.
 *
 * **What is left to other rules.** The three observer globals are `prefer-observer-stub`'s, which
 * names a dedicated stub for each; `Object.defineProperty(globalThis, …)` is
 * `no-object-define-property`'s. A value that is not a double — a polyfill being installed, or the
 * saved original being assigned back — is never reported: the discrimination is the same one
 * `prefer-observer-stub` makes, read through {@link isDouble}.
 */
import { defineRule } from './define-rule';
import { globalMemberName, isDouble, isObserverGlobal, withoutCasts } from './observer-stub';
import {
  type EsAssignmentExpression,
  type EsNode,
  type RuleContext,
  type RuleModule,
  buildsRunnerFn,
  hasAncestor,
  isCallExpression,
  isIdentifier,
  isObjectExpression,
} from './rule-types';

/** The channels `blockNetwork()` closes or `stubConstructor` is documented for — the network half of the globals. */
const NETWORK_GLOBALS = new Set(['EventSource', 'WebSocket', 'XMLHttpRequest', 'fetch']);

/** The two storages `stubWebStorage()` installs. */
const WEB_STORAGES = new Set(['localStorage', 'sessionStorage']);

/** Hooks whose callback runs whether or not the test's assertions passed. */
const TEARDOWN_HOOKS = new Set(['afterAll', 'afterEach', 'onTestFinished']);

/** Whether a node sits inside the callback of a teardown hook. */
function insideTeardown(node: EsNode): boolean {
  return hasAncestor(
    node,
    (candidate) => isCallExpression(candidate) && isIdentifier(candidate.callee) && TEARDOWN_HOOKS.has(candidate.callee.name),
  );
}

/** The message a double on this global gets, when nothing in the file restores it. */
function messageFor(name: string): string {
  if (NETWORK_GLOBALS.has(name)) {
    return 'networkGlobal';
  }

  return WEB_STORAGES.has(name) ? 'webStorage' : 'handAssignedGlobal';
}

/** Every global the file writes a double into, and every place it puts one back. */
interface GlobalWrites {
  doubles: Map<string, EsNode[]>;
  restores: Map<string, EsNode[]>;
}

function record(map: Map<string, EsNode[]>, name: string, node: EsNode): void {
  map.set(name, [...(map.get(name) ?? []), node]);
}

/** A double as `prefer-observer-stub` reads one, or an object of spies standing in for a storage or a `navigator`-like global. */
function isGlobalDouble(context: RuleContext, value: EsNode): boolean {
  return isDouble(context, value) || (isObjectExpression(withoutCasts(value)) && buildsRunnerFn(context, value, true));
}

function readAssignment(context: RuleContext, node: EsAssignmentExpression, writes: GlobalWrites): void {
  const name = globalMemberName(node.left);

  if (name === undefined || isObserverGlobal(name)) {
    return;
  }

  record(isGlobalDouble(context, node.right) ? writes.doubles : writes.restores, name, node);
}

/** `global.fetch = vi.fn(…)` and every other double assigned to a global with no teardown behind it. */
export const noHandAssignedGlobal: RuleModule = defineRule({
  anchor: '-fetch-and-other-globals',
  description:
    'Install a global double through mockValueProp / vi.stubGlobal / blockNetwork, which restore it, instead of assigning it by hand',
  messages: {
    networkGlobal:
      "`{{name}}` is replaced by assignment, and nothing puts the real one back: `vi.restoreAllMocks()` restores spies and `vi.unstubAllGlobals()` restores `vi.stubGlobal`, and a bare assignment is neither — the fake answers every later test of the file and, under `isolate: false`, every later file of the worker. Install it with `mockValueProp(globalThis, '{{name}}', vi.fn(…))`, which records the original and registers the undo with `restoreMockedProps()` (run after every test by `setupAutoSpy()`), or with `vi.stubGlobal('{{name}}', …)` plus `unstubGlobals: true` in the Vitest config. When the spec only needs the code to stay off the network, `blockNetwork()` from `vitest-auto-spy/setup` (or `setupAutoSpy({ blockNetwork: true })`) closes `fetch`, `XMLHttpRequest` and `sendBeacon` for every test; a `WebSocket` or `EventSource` the code builds with `new` is `stubConstructor(globalThis, '{{name}}', …)`.",
    webStorage:
      "`{{name}}` is replaced by assignment, and nothing puts the real one back — the fake storage, and whatever the test wrote into it, leaks into every later test of the file and, under `isolate: false`, every later file of the worker. `stubWebStorage('{{name}}')` from `vitest-auto-spy/dom-stubs` installs an in-memory storage whose methods are spies and whose undo `restoreMockedProps()` runs after every test.",
    handAssignedGlobal:
      "`{{name}}` is replaced by assignment, and nothing puts the real one back: `vi.restoreAllMocks()` restores spies and `vi.unstubAllGlobals()` restores `vi.stubGlobal`, and a bare assignment is neither — the double stays installed for every later test of the file and, under `isolate: false`, every later file of the worker. Install it with `mockValueProp(globalThis, '{{name}}', value)`, which records the original descriptor and registers the undo with `restoreMockedProps()` (run after every test by `setupAutoSpy()`), or with `vi.stubGlobal('{{name}}', value)` plus `unstubGlobals: true` in the Vitest config. A value the code calls with `new` is `stubConstructor(globalThis, '{{name}}', …)`.",
    restoreInTest:
      "`{{name}}` is replaced by assignment and put back by hand outside a teardown hook, so the restore runs only if every assertion before it passes: the first red one skips it, and the double answers every later test of the file — and, under `isolate: false`, every later file of the worker. `mockValueProp(globalThis, '{{name}}', value)` registers the undo with `restoreMockedProps()`, which runs in a hook whatever the assertions did; if the assignment stays, move the restore into `afterEach`.",
  },
  create: (context) => {
    // Collected first and decided at the end: the restore that silences a report can sit anywhere
    // in the file, above or below the assignment it answers.
    const writes: GlobalWrites = { doubles: new Map(), restores: new Map() };

    return {
      AssignmentExpression: (node: EsAssignmentExpression): void => {
        readAssignment(context, node, writes);
      },
      'UnaryExpression[operator="delete"]': (node: EsNode & { argument: EsNode }): void => {
        const name = globalMemberName(node.argument);

        if (name !== undefined) {
          record(writes.restores, name, node);
        }
      },
      'Program:exit': (): void => {
        writes.doubles.forEach((nodes, name) => {
          const restores = writes.restores.get(name) ?? [];

          if (restores.some(insideTeardown)) {
            return;
          }

          const messageId = restores.length > 0 ? 'restoreInTest' : messageFor(name);

          nodes.forEach((node) => context.report({ node, messageId, data: { name } }));
        });
      },
    };
  },
});
