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
 *
 * **A member of an imported binding** — `environment.production = true` — leaks the same way: the
 * module is cached for the worker, so any value written into it is reported, not only a double. The
 * fix is `mockValueProp(environment, 'production', true)`, offered where a per-test hook or the test
 * itself runs the statement; in `beforeAll` or a `describe` body the sweep after the first test would
 * take the patch off, so there the report comes without one.
 */
import { PACKAGE, bindingState, findBinding, importNamed } from './bindings';
import { defineRule } from './define-rule';
import { globalMemberName, isDouble, isObserverGlobal, memberKey, withoutCasts } from './observer-stub';
import {
  type EsAssignmentExpression,
  type EsFix,
  type EsNode,
  type FixFunction,
  type RuleContext,
  type RuleModule,
  buildsRunnerFn,
  hasAncestor,
  isCallExpression,
  isExpressionStatement,
  isIdentifier,
  isMemberExpression,
  isObjectExpression,
} from './rule-types';

/** The channels `blockNetwork()` closes or `stubConstructor` is documented for — the network half of the globals. */
const NETWORK_GLOBALS = new Set(['EventSource', 'WebSocket', 'XMLHttpRequest', 'fetch']);

/** The two storages `stubWebStorage()` installs. */
const WEB_STORAGES = new Set(['localStorage', 'sessionStorage']);

/** The global `stubWorker()` from `/dom-stubs` replaces. */
const WORKER_GLOBALS = new Set(['Worker']);

/** Hooks whose callback runs whether or not the test's assertions passed. */
const TEARDOWN_HOOKS = new Set(['afterAll', 'afterEach', 'onTestFinished']);

/** Calls whose callback runs once per test, where a `mockValueProp` patch is swept at the right moment. */
const PER_TEST = new Set(['beforeEach', 'it', 'test']);

/** Whether a node sits inside the callback of a teardown hook. */
function insideTeardown(node: EsNode): boolean {
  return hasAncestor(
    node,
    (candidate) => isCallExpression(candidate) && isIdentifier(candidate.callee) && TEARDOWN_HOOKS.has(candidate.callee.name),
  );
}

/** `it` for `it(…)`, `it.only(…)` and `it.each(table)(…)` alike. */
function calleeRoot(node: EsNode): string | undefined {
  let current = node;

  while (isMemberExpression(current) || isCallExpression(current)) {
    current = isMemberExpression(current) ? current.object : current.callee;
  }

  return isIdentifier(current) ? current.name : undefined;
}

/** Whether the nearest runner call around a node is a test or a `beforeEach`, rather than `beforeAll`, `describe` or nothing. */
function insidePerTest(node: EsNode): boolean {
  let current = node.parent;

  while (current.type !== 'Program') {
    const name = isCallExpression(current) ? calleeRoot(current.callee) : undefined;

    if (name !== undefined && (PER_TEST.has(name) || name === 'describe' || name === 'beforeAll')) {
      return PER_TEST.has(name);
    }

    current = current.parent;
  }

  return false;
}

/** The message a double on this global gets, when nothing in the file restores it. */
function messageFor(name: string): string {
  if (NETWORK_GLOBALS.has(name)) {
    return 'networkGlobal';
  }

  if (WORKER_GLOBALS.has(name)) {
    return 'workerGlobal';
  }

  return WEB_STORAGES.has(name) ? 'webStorage' : 'handAssignedGlobal';
}

/** The undo-recording install for a global: a capitalised name is a constructor the code calls with `new`. */
function globalFix(name: string): string {
  return /^[A-Z]/.test(name) ? `stubConstructor(globalThis, '${name}', …)` : `mockValueProp(globalThis, '${name}', vi.fn(…))`;
}

/** Every global the file writes a double into, and every place it puts one back. */
interface GlobalWrites {
  doubles: Map<string, EsNode[]>;
  restores: Map<string, EsNode[]>;
  /** Writes into a member of an imported binding, keyed by `object.key`. */
  imported: Map<string, ImportedWrite[]>;
}

/** One `environment.production = true`, with what the fix needs to spell it through `mockValueProp`. */
interface ImportedWrite {
  node: EsAssignmentExpression;
  object: string;
  key: string;
  /** The key as the fix writes it: the author's own literal for `env['x']`, quoted for `env.x`. */
  keyText: string;
}

function record(map: Map<string, EsNode[]>, name: string, node: EsNode): void {
  map.set(name, [...(map.get(name) ?? []), node]);
}

/** A double as `prefer-observer-stub` reads one, or an object of spies standing in for a storage or a `navigator`-like global. */
function isGlobalDouble(context: RuleContext, value: EsNode): boolean {
  return isDouble(context, value) || (isObjectExpression(withoutCasts(value)) && buildsRunnerFn(context, value, true));
}

/** The identifier a member chain starts from: `environment` for `environment.api.url`. */
function rootIdentifier(node: EsNode): EsNode {
  let current = withoutCasts(node);

  while (isMemberExpression(current)) {
    current = withoutCasts(current.object);
  }

  return current;
}

/**
 * Whether the object written into belongs to an import — a named or default one. A namespace object
 * itself is sealed, so a write straight into it throws before it can leak.
 */
function isImportedObject(context: RuleContext, object: EsNode): boolean {
  const root = rootIdentifier(object);
  const binding = isIdentifier(root) ? findBinding(context.sourceCode.getScope(root), root.name) : undefined;
  const definition = binding?.defs.find((candidate) => candidate.type === 'ImportBinding');

  return definition !== undefined && (definition.node.type !== 'ImportNamespaceSpecifier' || withoutCasts(object) !== root);
}

function readImportedWrite(context: RuleContext, node: EsAssignmentExpression, writes: GlobalWrites): void {
  const { left } = node;
  const key = isMemberExpression(left) ? memberKey(left) : undefined;

  if (!isMemberExpression(left) || key === undefined || !isImportedObject(context, left.object)) {
    return;
  }

  const object = context.sourceCode.getText(withoutCasts(left.object));
  const target = `${object}.${key}`;

  const keyText = left.computed ? context.sourceCode.getText(left.property) : `'${key}'`;

  writes.imported.set(target, [...(writes.imported.get(target) ?? []), { node, object, key, keyText }]);
}

/** `environment.production = true` → `mockValueProp(environment, 'production', true)`, when the statement is the whole of it. */
function importedWriteFix(context: RuleContext, write: ImportedWrite): FixFunction | undefined {
  const { node } = write;
  const state = bindingState(context.sourceCode.getScope(node), 'mockValueProp');

  if (!isExpressionStatement(node.parent) || !insidePerTest(node) || state === 'taken' || node.right.type === 'SequenceExpression') {
    return undefined;
  }

  const replacement = `mockValueProp(${write.object}, ${write.keyText}, ${context.sourceCode.getText(node.right)})`;

  return (fixer): EsFix[] => [
    fixer.replaceText(node, replacement),
    ...(state === 'free' ? [importNamed(fixer, node, 'mockValueProp', PACKAGE)] : []),
  ];
}

function reportImportedWrites(context: RuleContext, writes: ImportedWrite[]): void {
  if (writes.some((write) => insideTeardown(write.node))) {
    return;
  }

  writes.forEach((write) => {
    const fix = importedWriteFix(context, write);

    context.report({
      node: write.node,
      messageId: 'importedMember',
      data: { object: write.object, name: write.key },
      ...(fix ? { fix } : {}),
    });
  });
}

function readAssignment(context: RuleContext, node: EsAssignmentExpression, writes: GlobalWrites): void {
  if (node.operator === '=') {
    readImportedWrite(context, node, writes);
  }

  const name = globalMemberName(node.left);

  if (name === undefined || isObserverGlobal(name)) {
    return;
  }

  record(isGlobalDouble(context, node.right) ? writes.doubles : writes.restores, name, node);
}

/** `global.fetch = vi.fn(…)` and every other double assigned to a global with no teardown behind it. */
export const noHandAssignedGlobal: RuleModule = defineRule({
  name: 'no-hand-assigned-global',
  fixable: true,
  description:
    'Install a global double through mockValueProp / vi.stubGlobal / blockNetwork, which restore it, instead of assigning it by hand',
  messages: {
    networkGlobal:
      '`{{name}}` is replaced by assignment and nothing puts the real one back, so under `isolate: false` the fake answers every later test in the worker. Install it with `{{fix}}`, which restores the original after the test.',
    webStorage:
      "`{{name}}` is replaced by assignment and nothing puts the real one back, so the fake storage, and whatever the test wrote into it, leaks into every later test. Use `stubWebStorage('{{name}}')` from `vitest-auto-spy/dom-stubs`, which is restored after every test.",
    workerGlobal:
      '`{{name}}` is replaced by assignment and nothing puts the real one back, so under `isolate: false` every later test in the worker constructs the double. Use `stubWorker({ respond })` from `vitest-auto-spy/dom-stubs`, which is restored after every test.',
    handAssignedGlobal:
      '`{{name}}` is replaced by assignment and nothing puts the real one back, so under `isolate: false` the double stays installed for every later test in the worker. Install it with `{{fix}}`, which restores the original after the test.',
    importedMember:
      "`{{object}}.{{name}}` is written into an imported module, which stays cached for the worker, so the value answers later tests that never set it. Use `mockValueProp({{object}}, '{{name}}', value)`, which restores it after the test.",
    restoreInTest:
      "`{{name}}` is replaced and put back by hand outside a teardown hook, so the first failing assertion before the restore leaves the double installed for every later test. Use `mockValueProp(globalThis, '{{name}}', value)`, whose undo runs in a hook, or move the restore into `afterEach`.",
  },
  create: (context) => {
    // Collected first and decided at the end: the restore that silences a report can sit anywhere
    // in the file, above or below the assignment it answers.
    const writes: GlobalWrites = { doubles: new Map(), restores: new Map(), imported: new Map() };

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
        writes.imported.forEach((imported) => reportImportedWrites(context, imported));
        writes.doubles.forEach((nodes, name) => {
          const restores = writes.restores.get(name) ?? [];

          if (restores.some(insideTeardown)) {
            return;
          }

          const messageId = restores.length > 0 ? 'restoreInTest' : messageFor(name);

          nodes.forEach((node) => context.report({ node, messageId, data: { name, fix: globalFix(name) } }));
        });
      },
    };
  },
});
