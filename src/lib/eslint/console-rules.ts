/**
 * Console output a spec leaves behind that no absorbing spy will see, and the import-time install that
 * silences every later file of an `isolate: false` worker.
 */
import { findBinding } from './bindings';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsAssignmentExpression,
  type EsCallExpression,
  type EsFix,
  type EsNode,
  type EsScope,
  type RuleContext,
  isCallExpression,
  isCallee,
  isIdentifier,
  isMemberExpression,
  isRunnerCall,
  memberName,
} from './rule-types';

/** The console methods that write something; `time`, `groupEnd` and `countReset` do not. */
const PRINTING_METHODS = new Set([
  'assert',
  'count',
  'debug',
  'dir',
  'dirxml',
  'error',
  'group',
  'groupCollapsed',
  'info',
  'log',
  'table',
  'timeEnd',
  'timeLog',
  'trace',
  'warn',
]);

/** The calls that give a spy an implementation of its own, so it stops calling through. */
const IMPLEMENTING = new Set(['mockImplementation', 'mockImplementationOnce', 'mockReturnValue', 'mockReturnValueOnce']);

const SPY_ON = new Set(['spyOn']);
const GLOBAL_HOSTS = new Set(['globalThis', 'window']);

/** Whether a name reaches the global: nothing declares it, or only the config's `globals` do. */
function isGlobalName(scope: EsScope, name: string): boolean {
  const binding = findBinding(scope, name);

  return binding === undefined || binding.defs.length === 0;
}

/** `console`, `globalThis.console` or `window.console`, when it is the real global one. */
function isGlobalConsole(context: RuleContext, node: EsNode): boolean {
  if (isIdentifier(node)) {
    return node.name === 'console' && isGlobalName(context.sourceCode.getScope(node), 'console');
  }

  return (
    isMemberExpression(node) &&
    memberName(node) === 'console' &&
    isIdentifier(node.object) &&
    GLOBAL_HOSTS.has(node.object.name) &&
    isGlobalName(context.sourceCode.getScope(node), node.object.name)
  );
}

/** The literal method name a call hands `spyOn`, when it is one. */
function spiedMethod(call: EsCallExpression): unknown {
  const method = call.arguments[1];

  return method?.type === 'Literal' ? Reflect.get(method, 'value') : undefined;
}

/** Whether `node` is the object of a call that gives the spy an implementation — `spy.mockImplementation(…)`. */
function implementedThrough(node: EsNode): boolean {
  const name = memberName(node.parent);

  return name !== undefined && IMPLEMENTING.has(name) && isCallee(node.parent);
}

/**
 * Walk a chain of calls on the spy (`.mockName('x')`, `.mockImplementation(…)`) to the expression
 * that holds its final value; `undefined` once an implementation was given along the way.
 */
function chainEnd(node: EsNode): EsNode | undefined {
  let current = node;

  while (isMemberExpression(current.parent) && current.parent.object === current && isCallee(current.parent)) {
    if (implementedThrough(current)) {
      return undefined;
    }

    current = current.parent.parent;
  }

  return current;
}

type SpyUse = 'escapes' | 'implemented' | 'read';

/** How one mention of the spy's name uses it: configured, merely read, or handed somewhere this cannot follow. */
function useOf(identifier: EsNode): SpyUse {
  const { parent } = identifier;

  if (isMemberExpression(parent) && parent.object === identifier) {
    return implementedThrough(identifier) ? 'implemented' : 'read';
  }

  // `expect(spy)` and `spy(…)` read it; any other call it is handed to may configure it out of sight.
  const read =
    isCallExpression(parent) && (parent.callee === identifier || (isIdentifier(parent.callee) && parent.callee.name === 'expect'));

  return read ? 'read' : 'escapes';
}

/** The name the chain's value lands in, when it lands in exactly a name. */
function boundName(end: EsNode): string | undefined {
  const { parent } = end;

  if (parent.type === 'VariableDeclarator') {
    const id: unknown = Reflect.get(parent, 'id');

    return isNamedNode(id) ? id.name : undefined;
  }

  if (parent.type === 'AssignmentExpression') {
    const left: unknown = Reflect.get(parent, 'left');

    return isNamedNode(left) ? left.name : undefined;
  }

  return undefined;
}

function isNamedNode(value: unknown): value is { name: string } {
  return typeof value === 'object' && value !== null && Reflect.get(value, 'type') === 'Identifier';
}

/** Whether the spy still calls through: nothing gives it an implementation, and it goes nowhere unread. */
function callsThrough(context: RuleContext, call: EsCallExpression): boolean {
  const end = chainEnd(call);

  if (!end) {
    return false;
  }

  if (end.parent.type === 'ExpressionStatement') {
    return true;
  }

  const name = boundName(end);
  const binding = name === undefined ? undefined : findBinding(context.sourceCode.getScope(end), name);

  if (!binding) {
    return false;
  }

  const uses = binding.references.filter((reference) => !reference.writeExpr).map((reference) => useOf(reference.identifier));

  return uses.every((use) => use === 'read');
}

const PASSTHROUGH_MESSAGE =
  'This spy on `console.{{method}}` has no implementation, so it calls through and the line still prints, which ' +
  '`strayConsole` reports as stray output. Give it one: `.mockImplementation(() => undefined)`.';

/** `vi.spyOn(console, 'error')` with no implementation → the output still prints. */
export const noPassthroughConsoleSpy = defineRule({
  name: 'no-passthrough-console-spy',
  description: 'Give a spy on a console method an implementation — without one it calls through and the output still prints',
  hasSuggestions: true,
  messages: { noPassthroughConsoleSpy: PASSTHROUGH_MESSAGE },
  create: (context) => ({
    CallExpression: (node: EsCallExpression): void => {
      const method = spiedMethod(node);
      const host = node.arguments[0];

      if (
        !isRunnerCall(node, SPY_ON) ||
        host === undefined ||
        !isGlobalConsole(context, host) ||
        typeof method !== 'string' ||
        !PRINTING_METHODS.has(method) ||
        !callsThrough(context, node)
      ) {
        return;
      }

      context.report({
        node,
        messageId: 'noPassthroughConsoleSpy',
        data: { method },
        suggest: [
          {
            desc: 'Give the spy an implementation that prints nothing',
            fix: (fixer): EsFix => fixer.insertTextBeforeRange([node.range[1], node.range[1]], '.mockImplementation(() => undefined)'),
          },
        ],
      });
    },
  }),
});

/** A direct `console.x(…)` or `console.x = …` in a spec. */
export const noConsoleInSpec = defineRule({
  name: 'no-console-in-spec',
  description: 'Do not call or replace a console method directly in a spec',
  messages: {
    consoleCall:
      '`{{call}}(…)` is the spec writing to the console itself, which `strayConsole` reports as stray output. Delete it if it ' +
      'is left over from debugging; to check what the code under test logs, assert on `consoleErrorSpy` from `vitest-auto-spy/console`.',
    consoleAssignment:
      'This replaces `{{target}}` by assignment and nothing puts it back, so under `isolate: false` every later file in the ' +
      'worker inherits the replacement. Spy on it instead with `vi.spyOn(console, …).mockImplementation(…)`, which Vitest restores.',
  },
  create: (context) => ({
    CallExpression: (node: EsCallExpression): void => {
      const method = memberName(node.callee);

      if (
        method !== undefined &&
        PRINTING_METHODS.has(method) &&
        isMemberExpression(node.callee) &&
        isGlobalConsole(context, node.callee.object)
      ) {
        context.report({ node, messageId: 'consoleCall', data: { call: excerpt(context, node.callee) } });
      }
    },
    AssignmentExpression: (node: EsAssignmentExpression): void => {
      const { left } = node;

      if (isMemberExpression(left) && isGlobalConsole(context, left.object)) {
        context.report({ node, messageId: 'consoleAssignment', data: { target: excerpt(context, left) } });
      }
    },
  }),
});

const CONSOLE_ENTRIES = new Set(['vitest-auto-spy/console', 'vitest-auto-spies/console']);
const CONSOLE_SPY_EXPORT = /^console\w+Spy$/;

/** Whether an import takes the entry for its install: bare, a namespace, or one of the spy constants. */
function leansOnImportInstall(node: EsNode): boolean {
  const source: unknown = Reflect.get(Object(Reflect.get(node, 'source')), 'value');
  const specifiers: unknown = Reflect.get(node, 'specifiers');

  if (typeof source !== 'string' || !CONSOLE_ENTRIES.has(source) || !Array.isArray(specifiers)) {
    return false;
  }

  return (
    specifiers.length === 0 ||
    specifiers.some((specifier: unknown) => {
      const imported: unknown = Reflect.get(Object(Reflect.get(Object(specifier), 'imported')), 'name');

      return (
        Reflect.get(Object(specifier), 'type') === 'ImportNamespaceSpecifier' ||
        (typeof imported === 'string' && CONSOLE_SPY_EXPORT.test(imported))
      );
    })
  );
}

/** `installConsoleSpies` in `installConsoleSpies()`, `entry.installConsoleSpies()` and `beforeAll(installConsoleSpies)`. */
function nameOf(node: EsNode): string | undefined {
  return isMemberExpression(node) ? memberName(node) : isIdentifier(node) ? node.name : undefined;
}

/** `import { consoleErrorSpy } from 'vitest-auto-spy/console'` in a file that never calls `installConsoleSpies()`. */
export const noImportTimeConsoleSpies = defineRule({
  name: 'no-import-time-console-spies',
  description: 'Install the console spies where the file needs them — the import installs them once per worker',
  messages: {
    noImportTimeConsoleSpies:
      '`{{source}}` is imported for its install side effect, which runs once per worker, so under `isolate: false` it ' +
      'silences every later file too. Install the spies here: `beforeEach(() => installConsoleSpies())` with ' +
      '`afterEach(() => restoreConsole())`.',
  },
  create: (context) => {
    const imports: EsNode[] = [];
    let installs = false;

    return {
      ImportDeclaration: (node: EsNode): void => {
        if (leansOnImportInstall(node)) {
          imports.push(node);
        }
      },
      CallExpression: (node: EsCallExpression): void => {
        installs ||= [node.callee, ...node.arguments].some((part) => nameOf(part) === 'installConsoleSpies');
      },
      'Program:exit': (): void => {
        if (!installs) {
          imports.forEach((node) =>
            context.report({
              node,
              messageId: 'noImportTimeConsoleSpies',
              data: { source: String(Reflect.get(Object(Reflect.get(node, 'source')), 'value')) },
            }),
          );
        }
      },
    };
  },
});
