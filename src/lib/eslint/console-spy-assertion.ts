/**
 * A console spy a spec installs and never asserts: a `vitest-auto-spy/console` spy the file only
 * resets or restores, and a hand-made `vi.spyOn(console, …)` silencer. A spy that still calls through
 * is `no-passthrough-console-spy`'s finding, and is left to it.
 *
 * A file that reads the console some other way — `consoleOutput()`, `expect(console.error)`,
 * `vi.mocked(console.warn)` — is not second-guessed: the spy it seems to ignore may be what it reads.
 */
import { findBinding } from './bindings';
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsImportDeclaration,
  type EsNode,
  type EsVariable,
  type EsVariableDeclarator,
  type RuleContext,
  isCallExpression,
  isCallee,
  isFunctionNode,
  isIdentifier,
  isMemberExpression,
  isRunnerCall,
  memberName,
} from './rule-types';

const CONSOLE_ENTRIES = new Set(['vitest-auto-spy/console', 'vitest-auto-spies/console']);
const CONSOLE_SPY = /^console\w+Spy$/;
const INSTALLERS = new Set(['installConsoleSpies', 'useConsoleSpies']);
const READERS = new Set(['consoleOutput', 'consoleLines']);
const SPY_ON = new Set(['spyOn']);

/** What a spy is configured or reset through — every use of it that is not an assertion. */
const UPKEEP = new Set([
  'mockClear',
  'mockReset',
  'mockRestore',
  'mockImplementation',
  'mockImplementationOnce',
  'mockReturnValue',
  'mockReturnValueOnce',
  'mockName',
]);

const IMPLEMENTING = new Set(['mockImplementation', 'mockImplementationOnce', 'mockReturnValue', 'mockReturnValueOnce']);

/** The upkeep call `node` is the receiver of, by member name. */
function upkeepOf(node: EsNode): string | undefined {
  const name = memberName(node.parent);

  return name !== undefined && UPKEEP.has(name) && isCallee(node.parent) ? name : undefined;
}

/**
 * Whether an upkeep call installs an implementation that reads what was logged —
 * `mockImplementation((message) => warnings.push(message))`. The spec asserts on what it kept.
 */
function recordsWhatIsLogged(context: RuleContext, call: EsCallExpression): boolean {
  const [implementation] = call.arguments;

  if (implementation === undefined || !isFunctionNode(implementation)) {
    return false;
  }

  const parameters = new Set(implementation.params.flatMap((parameter) => (isIdentifier(parameter) ? [parameter.name] : [])));

  return context.sourceCode
    .getScope(implementation)
    .variables.some((variable) => parameters.has(variable.name) && variable.references.length > 0);
}

/** {@link isCallee}, typed: the member is what its parent calls. */
function isCalledMember(member: EsNode): member is EsNode & { parent: EsCallExpression } {
  return isCallee(member);
}

/** Whether one of a spy's upkeep reads installs an implementation that records the calls. */
function recordedThrough(context: RuleContext, reads: EsNode[]): boolean {
  return reads.some(
    (read) => IMPLEMENTING.has(String(upkeepOf(read))) && isCalledMember(read.parent) && recordsWhatIsLogged(context, read.parent.parent),
  );
}

/** The read (non-write) mentions of a binding. */
function readsOf(variable: EsVariable): EsNode[] {
  return variable.references.filter((reference) => !reference.writeExpr).map((reference) => reference.identifier);
}

/** The variables that the identifiers among `nodes` name, as seen from `node`'s scope. */
function variablesOf(context: RuleContext, node: EsNode, nodes: unknown[]): EsVariable[] {
  const scope = context.sourceCode.getScope(node);

  return nodes.flatMap((identifier: unknown) => {
    const name: unknown = Reflect.get(Object(identifier), 'type') === 'Identifier' ? Reflect.get(Object(identifier), 'name') : undefined;
    const variable = typeof name === 'string' ? findBinding(scope, name) : undefined;

    return variable ? [variable] : [];
  });
}

/** `consoleErrorSpy` imported from the entry. */
function importedConsoleSpies(context: RuleContext, node: EsImportDeclaration): EsVariable[] {
  if (!CONSOLE_ENTRIES.has(String(node.source.value))) {
    return [];
  }

  const locals = node.specifiers.map((specifier) => Reflect.get(specifier, 'local'));

  return variablesOf(context, node, locals).filter((variable) => CONSOLE_SPY.test(variable.name));
}

/** `const { consoleErrorSpy } = useConsoleSpies()`, under whatever local names. */
function destructuredConsoleSpies(context: RuleContext, node: EsVariableDeclarator): EsVariable[] {
  const properties: unknown = Reflect.get(node.id, 'properties');
  const installs =
    node.init !== null && isCallExpression(node.init) && isIdentifier(node.init.callee) && INSTALLERS.has(node.init.callee.name);

  return installs && Array.isArray(properties)
    ? variablesOf(
        context,
        node,
        properties.map((property: unknown) => Reflect.get(Object(property), 'value')),
      )
    : [];
}

/** Where a `vi.spyOn(console, …)` chain lands, whether an implementation was given along it, and whether that one records the calls. */
function chainOf(context: RuleContext, call: EsNode): { end: EsNode; implemented: boolean; recorded: boolean } {
  let end = call;
  let implemented = false;
  let recorded = false;

  while (isMemberExpression(end.parent) && end.parent.object === end && isCalledMember(end.parent)) {
    const implementing = IMPLEMENTING.has(String(memberName(end.parent)));

    implemented ||= implementing;
    recorded ||= implementing && recordsWhatIsLogged(context, end.parent.parent);
    end = end.parent.parent;
  }

  return { end, implemented, recorded };
}

/** The name the spy lands in: `const spy = …` or `spy = …`. */
function boundVariable(context: RuleContext, end: EsNode): EsVariable | undefined {
  const { parent } = end;
  const target: unknown =
    parent.type === 'VariableDeclarator'
      ? Reflect.get(parent, 'id')
      : parent.type === 'AssignmentExpression'
        ? Reflect.get(parent, 'left')
        : undefined;
  const name: unknown = Reflect.get(Object(target), 'type') === 'Identifier' ? Reflect.get(Object(target), 'name') : undefined;

  return typeof name === 'string' ? findBinding(context.sourceCode.getScope(end), name) : undefined;
}

/** Whether a `vi.spyOn(console, …)` is a silencer nobody asserts: given an implementation, held nowhere a test reads it. */
function isUnassertedSilencer(context: RuleContext, call: EsCallExpression): boolean {
  const { end, implemented, recorded } = chainOf(context, call);

  if (recorded) {
    return false;
  }

  if (end.parent.type === 'ExpressionStatement') {
    return implemented;
  }

  const variable = boundVariable(context, end);
  const reads = variable ? readsOf(variable) : undefined;

  return (
    reads !== undefined &&
    reads.every((read) => upkeepOf(read) !== undefined) &&
    !recordedThrough(context, reads) &&
    (implemented || reads.some((read) => IMPLEMENTING.has(String(upkeepOf(read)))))
  );
}

function isConsole(node: EsNode | undefined): boolean {
  return node !== undefined && isIdentifier(node) && node.name === 'console';
}

export const noUnassertedConsoleSpy = defineRule({
  name: 'no-unasserted-console-spy',
  description: 'Assert on a console spy the spec installs, or let useConsoleSpies() do the silencing',
  messages: {
    libraryConsoleSpy:
      '`{{name}}` is only ever reset or configured in this file and never asserted, so whatever the code logs there is swallowed unread. Assert on it — `expect({{name}}).not.toHaveBeenCalled()` at the least — or delete these lines: `useConsoleSpies()` already clears and restores it around every test.',
    spyOnConsole:
      'This spy on `console.{{method}}` is never asserted, so all it does is silence the channel — the job `useConsoleSpies()` from `vitest-auto-spy/console` does for every channel, restored after each test. Use it, or assert on this spy.',
  },
  create: (context) => {
    const libraries: EsVariable[] = [];
    const silencers: { node: EsCallExpression; method: string }[] = [];
    let readsConsole = false;

    return {
      ImportDeclaration: (node: EsImportDeclaration): void => {
        libraries.push(...importedConsoleSpies(context, node));
      },
      VariableDeclarator: (node: EsVariableDeclarator): void => {
        libraries.push(...destructuredConsoleSpies(context, node));
      },
      CallExpression: (node: EsCallExpression): void => {
        const [host, method] = node.arguments;
        const name: unknown = method?.type === 'Literal' ? Reflect.get(method, 'value') : undefined;

        readsConsole ||= isIdentifier(node.callee) && READERS.has(node.callee.name);

        if (isRunnerCall(node, SPY_ON) && isConsole(host) && typeof name === 'string') {
          silencers.push({ node, method: name });
        }
      },
      'MemberExpression[object.name="console"]': (node: EsNode): void => {
        readsConsole ||= !isCallee(node) && !(node.parent.type === 'AssignmentExpression' && Reflect.get(node.parent, 'left') === node);
      },
      'Program:exit': (): void => {
        if (readsConsole) {
          return;
        }

        libraries.forEach((variable) => {
          const reads = readsOf(variable);
          const [first] = reads;

          if (first && reads.every((read) => upkeepOf(read) !== undefined) && !recordedThrough(context, reads)) {
            context.report({ node: first, messageId: 'libraryConsoleSpy', data: { name: variable.name } });
          }
        });

        silencers
          .filter(({ node }) => isUnassertedSilencer(context, node))
          .forEach(({ node, method }) => context.report({ node, messageId: 'spyOnConsole', data: { method } }));
      },
    };
  },
});
