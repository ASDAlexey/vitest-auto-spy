/**
 * A test that calls the method itself and then asserts that it was called.
 *
 * ```ts
 * it('relays subscribeClick from children', () => {
 *   const emitSpy = vi.spyOn(component.subscribeClick, 'emit');
 *   component.subscribeClick.emit(payload);          // ❌ the test makes its own assertion true
 *   expect(emitSpy).toHaveBeenCalledWith(payload);
 * });
 * ```
 *
 * Nothing about the component is under test here: the assertion is satisfied by the line above it,
 * which is the test calling `EventEmitter.emit` and proving that `EventEmitter.emit` calls
 * `EventEmitter.emit`. Delete the `(subscribeClick)="…"` binding the title names and the test stays
 * green — it survives the removal of the behaviour it claims to check, which is the one failure it
 * cannot report.
 *
 * **Order is the whole rule.** The same three lines in a different order are ordinary arrangement:
 * a spec that puts the subject into a state, installs the spy *afterwards* and then drives the
 * production path is doing exactly the right thing, and a rule that only matched the three shapes
 * would report it. So a finding needs the spy installed **first**, the direct call **after** it, and
 * a positive call assertion **after that** — three ranges in order, inside one test body. The
 * consumer this was measured on has one file of each: three findings in the first shape, and a
 * `service.updateSectionState(…)` written above its own `vi.spyOn(service, 'updateSectionState')` in the
 * second.
 *
 * **Two more discriminations came out of that measurement**, and both are the spec saying in its own
 * text that the call is not what its assertion reads. A `spy.mockClear()` between the two drops the
 * record the call left, so what the assertion reads afterwards is the production path alone — five
 * findings in one navigation-switch file were exactly that. And a matcher that pins the arguments
 * pins *which* call it means: `expect(component.scale.set).toHaveBeenCalledWith(3)` under an
 * arranging `component.scale.set(2)` cannot be satisfied by that line. The argument check compares
 * source text, so it is conservative in the quiet direction — the same value spelled two ways is a
 * finding this rule lets through rather than a report it has to defend.
 *
 * **What is not reported.**
 *
 * - The call **before** the spy — arrangement, as above.
 * - A **negated** assertion, or `toHaveBeenCalledTimes(0)`. "It was not called" is not made true by
 *   a call, so a test asserting it has already told the two apart.
 * - A call whose record a `mockClear` / `mockReset` / `mockRestore` / `vi.clearAllMocks()` drops
 *   before the assertion reads it.
 * - An assertion whose arguments are not the ones the call passed.
 * - A call to a **different** member than the one spied, which is the ordinary shape of a delegation
 *   test: `component.ngOnInit()` beside `expect(loadSpy).toHaveBeenCalled()` names two members and
 *   is never a finding.
 * - A call from **inside a callback** rather than from the test body itself. A spec that hands a
 *   function to the code under test is not the caller; the production path is, which is what the
 *   assertion is about.
 * - A spy installed in a **hook**. The ordering across a `beforeEach` and a body is decidable, but
 *   what such a spy is there for usually is not: it is shared by every test of the block, and most
 *   of them drive the production path. The rule stays inside one test body and says so.
 *
 * **Syntax and scope only.** The spy, the call and the assertion are matched on the text of the
 * object and the name of the member — `component.subscribeClick` + `emit` — so nothing here asks
 * what anything resolves to.
 */
import { enclosingTest } from './absence-assertion';
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsLiteral,
  type EsNode,
  type RuleContext,
  enclosingFunction,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  isRunnerCall,
  isVariableDeclarator,
  memberName,
} from './rule-types';
import { isExpectCall } from './subscribe-repair';

/** The call that installs the spy, in either runner's spelling. */
const SPY_ON = new Set(['spyOn']);

/** The resets that drop the record a spy has kept — on one spy, and on every spy at once. */
const CLEARS = new Set(['mockClear', 'mockReset', 'mockRestore']);

const CLEARS_ALL = new Set(['clearAllMocks', 'resetAllMocks', 'restoreAllMocks']);

/** The key a whole-suite reset stands for: it drops the record of every spy in the test. */
const EVERY_SPY = '*';

/** The matchers whose arguments pin *which* call is meant, and how many of them do so. */
const ARGUMENT_MATCHERS: Record<string, number> = { toHaveBeenCalledWith: 0, toHaveBeenLastCalledWith: 0, toHaveBeenNthCalledWith: 1 };

/** The matchers that say the call happened — the ones a call by the test itself already satisfies. */
const CALLED = new Set([
  'toHaveBeenCalled',
  'toHaveBeenCalledOnce',
  'toHaveBeenCalledTimes',
  'toHaveBeenCalledWith',
  'toHaveBeenLastCalledWith',
  'toHaveBeenNthCalledWith',
]);

/** One `vi.spyOn`, one direct call, one assertion or one reset, keyed by the member they name. */
interface Site {
  /** The arguments as written, whitespace out: what a call passed, or what a matcher demands. */
  args: string[];
  /** `true` where the site constrains no argument — `toHaveBeenCalled()`, a spy, a reset. */
  anyArgs: boolean;
  key: string;
  node: EsNode;
}

/** Everything one test body contributes, gathered as the file is walked. */
interface TestScan {
  aliases: Map<string, string>;
  asserted: Site[];
  called: Site[];
  cleared: Site[];
  installed: Site[];
}

/** Source text with its whitespace taken out, so `{ a: 1 }` and `{a: 1}` are the same argument. */
function argTexts(context: RuleContext, nodes: EsNode[]): string[] {
  return nodes.map((node) => context.sourceCode.getText(node).replace(/\s+/g, ''));
}

/** `<object text>.<member>` — what ties the spy, the call and the assertion together. */
function memberKey(context: RuleContext, object: EsNode, member: string): string {
  return `${context.sourceCode.getText(object)}.${member}`;
}

/** The member a `vi.spyOn(obj, 'name')` installs a spy on. */
function spiedKey(context: RuleContext, node: EsCallExpression): string | undefined {
  const [target, name] = node.arguments;

  if (!isRunnerCall(node, SPY_ON) || !target || name?.type !== 'Literal') {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `type === 'Literal'` is ESTree's own discriminant for the node this interface mirrors.
  const { value } = name as EsLiteral;

  return typeof value === 'string' ? memberKey(context, target, value) : undefined;
}

/** The name a `const spy = vi.spyOn(…)` binds the spy to, so `expect(spy)` can be read back. */
function aliasOf(node: EsCallExpression): string | undefined {
  const declarator = node.parent;

  if (!isVariableDeclarator(declarator) || declarator.init !== node || !isIdentifier(declarator.id)) {
    return undefined;
  }

  return declarator.id.name;
}

/** The member a direct call names — `component.subscribeClick.emit(payload)`. */
function calledKey(context: RuleContext, node: EsCallExpression): string | undefined {
  const member = memberName(node.callee);

  return member !== undefined && isMemberExpression(node.callee) ? memberKey(context, node.callee.object, member) : undefined;
}

/**
 * What the matcher on this `expect()` demands, or `undefined` where it is not a positive call claim.
 *
 * The arguments come back with it, because they are what says *which* call is meant:
 * `expect(component.scale.set).toHaveBeenCalledWith(3)` under a `component.scale.set(2)` the test
 * wrote as arrangement is an assertion that line cannot satisfy, and reporting it would be wrong.
 * Two sites of exactly that shape were the only false positives the measured consumer produced.
 */
function demandOf(context: RuleContext, node: EsCallExpression): Pick<Site, 'anyArgs' | 'args'> | undefined {
  const matcher = node.parent;
  const name = isMemberExpression(matcher) ? memberName(matcher) : undefined;
  // A matcher nothing invokes asserts nothing — `expect(s).toHaveBeenCalled;` is a member read, and
  // a `.not` / `.resolves` in the way is a name this set does not carry, which is where negation goes.
  const invoked = isCallExpression(matcher.parent) && matcher.parent.callee === matcher ? matcher.parent : undefined;

  if (name === undefined || !CALLED.has(name) || !invoked) {
    return undefined;
  }

  const args = invoked.arguments;

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- same discriminant narrowing, for the count of `toHaveBeenCalledTimes(0)`.
  if (args[0]?.type === 'Literal' && (args[0] as EsLiteral).value === 0) {
    return undefined;
  }

  const skipped = ARGUMENT_MATCHERS[name];

  return skipped === undefined ? { anyArgs: true, args: [] } : { anyArgs: false, args: argTexts(context, args.slice(skipped)) };
}

/** The member an `expect(…)` asserts on, read through the alias a `const` may have given the spy. */
function assertedKey(context: RuleContext, node: EsCallExpression, aliases: Map<string, string>): string | undefined {
  const [subject] = node.arguments;

  if (!subject) {
    return undefined;
  }

  if (isIdentifier(subject)) {
    return aliases.get(subject.name);
  }

  const member = memberName(subject);

  return member !== undefined && isMemberExpression(subject) ? memberKey(context, subject.object, member) : undefined;
}

/** The spy a `spy.mockClear()` / `vi.clearAllMocks()` drops the record of. */
function clearedKey(context: RuleContext, node: EsCallExpression, aliases: Map<string, string>): string | undefined {
  if (isRunnerCall(node, CLEARS_ALL)) {
    return EVERY_SPY;
  }

  const member = memberName(node.callee);

  if (member === undefined || !CLEARS.has(member) || !isMemberExpression(node.callee)) {
    return undefined;
  }

  const { object } = node.callee;
  const named = memberName(object);

  if (isIdentifier(object)) {
    return aliases.get(object.name);
  }

  return named !== undefined && isMemberExpression(object) ? memberKey(context, object.object, named) : undefined;
}

/** Whether `node` is written in the body of the test itself, rather than in a callback below it. */
function inTestBody(node: EsNode, body: EsNode): boolean {
  return enclosingFunction(node) === body;
}

/** Whether one site is written above another. */
function before(site: Site, node: EsNode): boolean {
  return site.node.range[1] <= node.range[0];
}

/** Whether this call is what makes the assertion true: same arguments, and no reset in between. */
function satisfies(scan: TestScan, call: Site, assertion: Site): boolean {
  if (!before(call, assertion.node) || (!assertion.anyArgs && String(assertion.args) !== String(call.args))) {
    return false;
  }

  // A `spy.mockClear()` between the two is the spec saying so itself: the record the call left is
  // gone by the time the assertion reads it, and what it reads is the production path alone.
  return !scan.cleared.some(
    (reset) => (reset.key === call.key || reset.key === EVERY_SPY) && before(call, reset.node) && before(reset, assertion.node),
  );
}

/** The calls a spy above them and an assertion below them make vacuous. */
function selfCalls(scan: TestScan): Site[] {
  return scan.called.filter(
    (call) =>
      scan.installed.some((spy) => spy.key === call.key && before(spy, call.node)) &&
      scan.asserted.some((assertion) => assertion.key === call.key && satisfies(scan, call, assertion)),
  );
}

/** The `vi.spyOn(…)` this call is, filed with the name a `const` may have bound it to. */
function recordSpy(context: RuleContext, node: EsCallExpression, scan: TestScan): boolean {
  const key = spiedKey(context, node);

  if (key === undefined) {
    return false;
  }

  const alias = aliasOf(node);

  if (alias !== undefined) {
    scan.aliases.set(alias, key);
  }

  scan.installed.push({ anyArgs: true, args: [], key, node });

  return true;
}

/** Sort one call into the test it belongs to: a spy, an assertion, a reset, or a call of its own. */
function record(context: RuleContext, node: EsCallExpression, scan: TestScan, body: EsNode): void {
  if (recordSpy(context, node, scan)) {
    return;
  }

  if (isExpectCall(node)) {
    const key = assertedKey(context, node, scan.aliases);
    const demand = demandOf(context, node);

    if (key !== undefined && demand) {
      scan.asserted.push({ ...demand, key, node });
    }

    return;
  }

  const cleared = clearedKey(context, node, scan.aliases);

  if (cleared !== undefined) {
    scan.cleared.push({ anyArgs: true, args: [], key: cleared, node });

    return;
  }

  const called = inTestBody(node, body) ? calledKey(context, node) : undefined;

  if (called !== undefined) {
    scan.called.push({ anyArgs: false, args: argTexts(context, node.arguments), key: called, node });
  }
}

/** `component.subscribeClick.emit(x)` beside `expect(emitSpy).toHaveBeenCalledWith(x)`. */
export const noSelfCalledSpy = defineRule({
  name: 'no-self-called-spy',
  description: 'Do not assert a call the test made itself — drive the production path that should make it',
  messages: {
    noSelfCalledSpy:
      'This test calls `{{key}}` itself and then asserts that `{{key}}` was called, so the assertion is satisfied by the test, not by the code under test, and stays green if that code is deleted. Drive the production path instead (dispatch the event, emit on the double, call the public method) and keep the assertion.',
  },
  create: (context) => {
    const tests = new Map<EsNode, TestScan>();
    const scanOf = (node: EsNode): { body: EsNode; scan: TestScan } | undefined => {
      const body = enclosingTest(node);

      if (!body) {
        return undefined;
      }

      const scan = tests.get(body) ?? { aliases: new Map<string, string>(), asserted: [], called: [], cleared: [], installed: [] };

      tests.set(body, scan);

      return { body, scan };
    };

    return {
      CallExpression: (node: EsCallExpression): void => {
        const found = scanOf(node);

        if (found) {
          record(context, node, found.scan, found.body);
        }
      },
      'Program:exit': (): void => {
        tests.forEach((scan) => {
          selfCalls(scan).forEach(({ key, node }) => {
            context.report({ node, messageId: 'noSelfCalledSpy', data: { key } });
          });
        });
      },
    };
  },
});
