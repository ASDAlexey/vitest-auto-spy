/**
 * The jasmine globals a migrated spec still carries, and what each one is under Vitest.
 *
 * None of them survive the move. `jasmine`, `spyOn`, `fail` and `pending` are globals jasmine's own
 * runner installs; nothing installs them here, so a spec that kept one dies with a `ReferenceError`
 * — loudly, and on the first run. One of them is worse than that, and it is the reason this rule
 * exists rather than a note in a migration guide: **jasmine's `spyOn` stubs the method it replaces,
 * Vitest's `vi.spyOn` calls through**. The rename compiles, the spec runs, and the code under test
 * now really talks to its collaborator — which is how a suite ends up making network calls, or
 * passing while asserting on a value the real implementation happened to return.
 *
 * The mapping is data rather than prose, because a message that names the replacement is the whole
 * of the repair; every entry below is a rename with no judgement left in it.
 */
import { findBinding } from './bindings';
import { type EsIdentifier, type EsMemberExpression, type RuleContext, memberName } from './rule-types';

/** One report: which message, and the values it quotes. */
export interface GlobalReport {
  messageId: string;
  data: Record<string, string>;
}

/** `jasmine.<member>` → the Vitest spelling of the same thing. */
const JASMINE_MEMBERS = new Map([
  ['createSpy', 'vi.fn() — or createFunctionSpy<T>(), which comes typed'],
  ['any', 'expect.any(Ctor)'],
  ['anything', 'expect.anything()'],
  ['objectContaining', 'expect.objectContaining({ … })'],
  ['arrayContaining', 'expect.arrayContaining([…])'],
  ['stringMatching', 'expect.stringMatching(/…/)'],
  ['stringContaining', "expect.stringContaining('…')"],
  ['addMatchers', 'expect.extend({ … })'],
  ['addCustomEqualityTester', 'expect.addEqualityTesters([tester])'],
  ['DEFAULT_TIMEOUT_INTERVAL', '`testTimeout` and `hookTimeout` in the Vitest config, or the third argument of the test'],
]);

/** The globals a jasmine spec calls by their bare name, `spyOn` excepted — that one has its own message. */
const BARE_GLOBALS = new Map([
  ['spyOnProperty', "vi.spyOn(obj, 'prop', 'get'), or mockReadonlyProp(obj, 'prop', value) when the point is the value and not the call"],
  ['spyOnAllFunctions', 'createSpyFromClass(Class) / createAutoMock<T>(), which read the class rather than the instance'],
  ['fail', 'expect.fail(message)'],
  ['pending', 'ctx.skip() on the test context — it(name, (ctx) => …) — or it.skip'],
]);

/** The bare globals this rule reports, as the selector that finds them. */
export const BARE_GLOBAL_SELECTOR = 'CallExpression > Identifier.callee[name=/^(fail|pending|spyOn|spyOnAllFunctions|spyOnProperty)$/]';

/** What to report for a `jasmine.<member>` read, or nothing when the name is not one of jasmine's. */
export function jasmineMemberReport(context: RuleContext, node: EsMemberExpression): GlobalReport | undefined {
  const member = memberName(node);

  // A `jasmine` the file declares itself is not the runner's — the same courtesy every other rule
  // here extends to a name that turns out to be somebody else's.
  if (member === undefined || findBinding(context.sourceCode.getScope(node), 'jasmine')) {
    return undefined;
  }

  if (member === 'createSpyObj') {
    return { messageId: 'jasmineCreateSpyObj', data: {} };
  }

  if (member === 'clock') {
    return { messageId: 'jasmineClock', data: {} };
  }

  const replacement = JASMINE_MEMBERS.get(member);

  return replacement === undefined ? undefined : { messageId: 'jasmineNamespace', data: { api: `jasmine.${member}`, replacement } };
}

/** What to report for a bare `spyOn(…)` / `fail(…)` / … call. */
export function bareGlobalReport(context: RuleContext, node: EsIdentifier): GlobalReport | undefined {
  const replacement = BARE_GLOBALS.get(node.name);

  // `import { spyOn } from 'bun:test'` is a different function with the same name, and it is the
  // right one on that runtime.
  if (findBinding(context.sourceCode.getScope(node), node.name)) {
    return undefined;
  }

  return replacement === undefined
    ? { messageId: 'jasmineSpyOn', data: {} }
    : { messageId: 'jasmineGlobal', data: { api: `${node.name}(…)`, replacement } };
}
