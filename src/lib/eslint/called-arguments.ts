/**
 * `expect(spy).toHaveBeenCalled()` where the arguments are what the test is about.
 *
 * ```ts
 * it('emits rowFocused with the host element', () => {
 *   component.onFocus();
 *
 *   expect(component.rowFocused.emit).toHaveBeenCalled(); // ❌ "with the host element" is untested
 * });
 * ```
 *
 * The bare matcher asks one question — did this run at all — and passes on any arguments
 * whatsoever. Where the behaviour under test *is* the arguments, that is a test whose title and
 * whose assertion are about different things: pass the wrong node, the wrong payload, the wrong
 * URL, and it stays green.
 *
 * **Narrow on purpose, because the blunt version already exists.** `vitest/prefer-called-with`
 * reports every bare `toHaveBeenCalled`, which on the suite this was measured against is 1941 sites
 * in 360 files — a number nobody acts on, which is why that rule is not in its plugin's
 * `recommended` and is off there. This one reports only where the **file itself** says the
 * arguments matter, on one of two readings:
 *
 * 1. **The same subject is asserted with `toHaveBeenCalledWith` somewhere else in the file.** The
 *    author has already written down that the arguments of that call are part of the contract; this
 *    site is the one where they did not. A test that asserts both on the same subject is left alone
 *    — there the arguments *are* checked, and the bare line is merely redundant.
 * 2. **The test's title says `with`, and the body asserts nothing else.** Then the whole of what
 *    the test claims is an argument list, and the whole of what it checks is that something ran.
 *    Any assertion that is not another bare `toHaveBeenCalled()` silences this reading, because
 *    that assertion may be where the arguments are checked.
 *
 * **What is deliberately not reported.** `expect(spy).not.toHaveBeenCalled()` — a negative is about
 * the call and not about its arguments, and there are no arguments to name. `toHaveBeenCalledTimes`
 * and the other counting matchers, which assert something the bare one does not. And a subject the
 * rule cannot match by name: identity here is the **source text** of what `expect()` was handed, so
 * `expect(api.load)` and `expect(loadSpy)` are two subjects even where they are one spy. Two names
 * are read through what they hold, because a test declares its own under a generic name: a `spy`
 * holding `vi.spyOn(obj, 'm')` is that member whatever the variable is called, and a `vi.fn()` is
 * nobody but itself, so the `const spy = vi.fn()` of one test is not the `const spy` of the next.
 * That misses findings and invents none, which is the trade this rule is built on.
 */
import { type Matcher, enclosingTestCall, matcherOf } from './absence-assertion';
import { boundValueOf, findBinding } from './bindings';
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsIdentifier,
  type EsNode,
  type EsVariable,
  type RuleContext,
  type RuleModule,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  isRunnerCall,
  isRunnerFnCall,
  rootCall,
} from './rule-types';
import { isExpectCall } from './subscribe-repair';

/** The matcher this rule is about: a call, and nothing said about what it was called with. */
const BARE = 'toHaveBeenCalled';

/** The matchers that do say it — one of these on a subject is the file declaring its arguments matter. */
const WITH_ARGUMENTS = new Set(['toHaveBeenCalledWith']);

/** A title that promises an argument list. `without` is not a match, which is what the word boundary is for. */
const NAMES_ARGUMENTS = /\bwith\b/i;

/** DOM `Event` methods that take no arguments, so there is no argument list to pin. */
const NO_ARGUMENTS = new Set(['preventDefault', 'stopImmediatePropagation', 'stopPropagation']);

/** The argument of a runner call that is its title, as opposed to its body or its options. */
const TITLES = new Set(['Literal', 'TemplateLiteral']);

/** One `expect(…)` chain, reduced to what this rule weighs. */
interface Assertion {
  /** A positive `toHaveBeenCalled()` with nothing in it — the only shape reported. */
  bare: boolean;
  /** The same matcher in either polarity: what reading (2) tolerates beside the line it reports. */
  callOnly: boolean;
  /** The whole chain, which is what a report underlines. */
  node: EsNode;
  /** The subject as written, whitespace removed: what a report names. */
  subject: string;
  /** How two assertions are told to be about one spy — the text, or the member a `vi.spyOn` variable holds. */
  key: string;
  /** The variable, when it holds a `vi.fn()`: such a subject is only ever itself. */
  fresh: EsVariable | undefined;
  /** The `it(…)` call this sits in, or `undefined` at describe scope. */
  test?: EsCallExpression | undefined;
  /** Whether the chain names the arguments — which is what makes (1) evidence rather than a guess. */
  withArguments: boolean;
}

/** What the file said about one subject, gathered before anything is reported. */
interface Scan {
  assertions: Assertion[];
}

/** The identifier a subject's text starts from: `spy` in `spy`, `api` in `api.save` and `TestBed.inject(X).m`. */
function rootIdentifier(node: EsNode): EsIdentifier | undefined {
  if (isMemberExpression(node)) {
    return rootIdentifier(node.object);
  }

  if (isCallExpression(node)) {
    return rootIdentifier(node.callee);
  }

  return isIdentifier(node) ? node : undefined;
}

const SPY_ON = new Set(['spyOn']);

function compact(context: RuleContext, node: EsNode): string {
  return context.sourceCode.getText(node).replace(/\s+/g, '');
}

/** Who a subject is: its text, unless the name it starts from holds a spy the file made itself. */
function identityOf(context: RuleContext, argument: EsNode): Pick<Assertion, 'fresh' | 'key' | 'subject'> {
  const subject = compact(context, argument);
  const root = rootIdentifier(argument);
  const scope = root && context.sourceCode.getScope(root);
  const held = root && scope ? boundValueOf(scope, root) : undefined;
  const made = held ? rootCall(held) : undefined;

  if (root && scope && made && isRunnerFnCall(made)) {
    return { subject, key: subject, fresh: findBinding(scope, root.name) };
  }

  if (root && made && isCallExpression(made) && isRunnerCall(made, SPY_ON)) {
    const target = made.arguments.map((part) => compact(context, part)).join(',');

    return { subject, key: `spyOn(${target})${subject.slice(root.name.length)}`, fresh: undefined };
  }

  return { subject, key: subject, fresh: undefined };
}

function sameSubject(one: Assertion, other: Assertion): boolean {
  return one.key === other.key && one.fresh === other.fresh;
}

/** The end of the `expect(…)` chain — past the `.not`, at the call the matcher is. */
function chainEnd(node: EsNode): EsNode {
  return isMemberExpression(node.parent) ? chainEnd(node.parent) : node.parent;
}

/** Whether a chain is nothing but "this ran", in either polarity. */
function isCallOnly(matcher: Matcher): boolean {
  return matcher.name === BARE && matcher.args.length === 0;
}

/**
 * One `expect(…)` read into the shape above; `undefined` for a call with no subject to name.
 *
 * A chain this cannot read to the end — `resolves`, `rejects`, a matcher taken as a value — is kept
 * as an assertion that is not a bare call, which is the quiet direction: it silences reading (2)
 * for its test rather than letting an unread line pass for nothing.
 */
function assertionOf(context: RuleContext, node: EsCallExpression): Assertion | undefined {
  const [argument] = node.arguments;

  if (!argument) {
    return undefined;
  }

  const matcher = matcherOf(node);
  const read = { ...identityOf(context, argument), test: enclosingTestCall(node) };

  if (!matcher) {
    return { ...read, bare: false, callOnly: false, node, withArguments: false };
  }

  const callOnly = isCallOnly(matcher);

  return { ...read, bare: callOnly && !matcher.negated, callOnly, node: chainEnd(node), withArguments: WITH_ARGUMENTS.has(matcher.name) };
}

/** Whether two assertions stand in one test — two that stand in none do not. */
function sameTest(one: Assertion, other: Assertion): boolean {
  return one.test !== undefined && one.test === other.test;
}

/** Whether some *other* test in the file pins the arguments of this subject. */
function pinnedElsewhere(scan: Scan, assertion: Assertion): boolean {
  const pinning = scan.assertions.filter((other) => other.withArguments && sameSubject(assertion, other));

  return pinning.length > 0 && !pinning.some((other) => sameTest(assertion, other));
}

/** The title of a test, as it is written; the empty string for one named by a variable. */
function titleOf(context: RuleContext, test: EsCallExpression): string {
  const title = test.arguments.find((argument) => TITLES.has(argument.type));

  return title === undefined ? '' : context.sourceCode.getText(title);
}

/** `dismiss with action` for `ref.dismissWithAction`: a subject's own name, spelled the way a title spells it. */
function spelledName(subject: string): RegExp | undefined {
  const words = /\w+$/.exec(subject)?.[0].split(/(?=[A-Z])/) ?? [];

  return words.some((word) => NAMES_ARGUMENTS.test(word)) ? new RegExp(`\\b${words.join('[\\s_-]+')}\\b`, 'gi') : undefined;
}

function takesNoArguments(subject: string): boolean {
  return NO_ARGUMENTS.has(/\w+$/.exec(subject)?.[0] ?? '');
}

/** Whether the test around this assertion promises arguments and checks nothing but bare calls. */
function titlePromisesArguments(context: RuleContext, scan: Scan, assertion: Assertion): boolean {
  const { test } = assertion;

  if (!test) {
    return false;
  }

  const inTest = scan.assertions.filter((other) => other.test === test);
  const title = inTest.reduce(
    (text, other) => {
      const name = spelledName(other.subject);

      return name === undefined ? text : text.replace(name, '');
    },
    titleOf(context, test),
  );

  return NAMES_ARGUMENTS.test(title) && inTest.every((other) => other.callOnly);
}

const REPAIR =
  'Name them: `expect(spy).toHaveBeenCalledWith(…)`, or `expect(spy).toHaveBeenCalledExactlyOnceWith(…)` where once is part of ' +
  'the claim; `expect.objectContaining({ … })` and `expect.any(Type)` cover the part of an argument the test does not decide, ' +
  'and a double this package built takes `mustBeCalledWith(…)` at the point it is configured, which fails at the call rather ' +
  'than after it. For a method that takes no arguments, pin the count instead: `toHaveBeenCalledOnce()` or ' +
  '`toHaveBeenCalledTimes(n)`. Where the call really is all that matters, the title is what should say so — this rule reads it.';

/** `expect(spy).toHaveBeenCalled()` in a test whose subject is the argument list. */
export const noUnassertedArgument: RuleModule = defineRule({
  anchor: '-argument-matching',
  description: 'Assert the arguments where the file shows they are the point, not only that the call happened',
  messages: {
    assertedElsewhere:
      'This checks that `{{subject}}` ran and accepts any arguments at all, while another test in this file pins the same ' +
      'subject with `toHaveBeenCalledWith(…)` — so the file already says the arguments of this call are part of the contract, ' +
      `and this is the test that does not read them. ${REPAIR}`,
    titleNamesArguments:
      'The title of this test names what the call is made *with*, and this is the only kind of assertion in its body: the ' +
      'test therefore passes on any arguments whatsoever, including the ones the title was written to rule out. Two tests ' +
      `whose titles differ only in that phrase have identical bodies as soon as this is all either of them asserts. ${REPAIR}`,
  },
  create: (context) => {
    const scan: Scan = { assertions: [] };

    return {
      CallExpression: (node: EsCallExpression): void => {
        const assertion = isExpectCall(node) ? assertionOf(context, node) : undefined;

        if (assertion) {
          scan.assertions.push(assertion);
        }
      },
      'Program:exit': (): void => {
        scan.assertions
          .filter((assertion) => assertion.bare && !takesNoArguments(assertion.subject))
          .forEach((assertion) => {
            const data = { subject: assertion.subject };

            if (pinnedElsewhere(scan, assertion)) {
              context.report({ data, messageId: 'assertedElsewhere', node: assertion.node });
            } else if (titlePromisesArguments(context, scan, assertion)) {
              context.report({ data, messageId: 'titleNamesArguments', node: assertion.node });
            }
          });
      },
    };
  },
});
