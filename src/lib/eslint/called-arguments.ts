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
 * `expect(api.load)` and `expect(loadSpy)` are two subjects even where they are one spy. That
 * misses findings and invents none, which is the trade this rule is built on.
 */
import { type Matcher, enclosingTestCall, matcherOf } from './absence-assertion';
import { defineRule } from './define-rule';
import { type EsCallExpression, type EsNode, type RuleContext, type RuleModule, isMemberExpression } from './rule-types';
import { isExpectCall } from './subscribe-repair';

/** The matcher this rule is about: a call, and nothing said about what it was called with. */
const BARE = 'toHaveBeenCalled';

/** The matchers that do say it — one of these on a subject is the file declaring its arguments matter. */
const WITH_ARGUMENTS = new Set(['toHaveBeenCalledWith']);

/** A title that promises an argument list. `without` is not a match, which is what the word boundary is for. */
const NAMES_ARGUMENTS = /\bwith\b/i;

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
  /** The subject as written, whitespace removed: how two assertions are told to be about one spy. */
  subject: string;
  /** The `it(…)` call this sits in, or `undefined` at describe scope. */
  test?: EsCallExpression | undefined;
  /** Whether the chain names the arguments — which is what makes (1) evidence rather than a guess. */
  withArguments: boolean;
}

/** What the file said about one subject, gathered before anything is reported. */
interface Scan {
  assertions: Assertion[];
  /** The subjects some assertion in the file names arguments for. */
  declared: Set<string>;
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
  const read = { subject: context.sourceCode.getText(argument).replace(/\s+/g, ''), test: enclosingTestCall(node) };

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
  return (
    scan.declared.has(assertion.subject) &&
    !scan.assertions.some((other) => other.withArguments && other.subject === assertion.subject && sameTest(assertion, other))
  );
}

/** The title of a test, as it is written; the empty string for one named by a variable. */
function titleOf(context: RuleContext, test: EsCallExpression): string {
  const title = test.arguments.find((argument) => TITLES.has(argument.type));

  return title === undefined ? '' : context.sourceCode.getText(title);
}

/** Whether the test around this assertion promises arguments and checks nothing but bare calls. */
function titlePromisesArguments(context: RuleContext, scan: Scan, assertion: Assertion): boolean {
  const { test } = assertion;

  if (!test || !NAMES_ARGUMENTS.test(titleOf(context, test))) {
    return false;
  }

  return scan.assertions.every((other) => other.test !== test || other.callOnly);
}

const REPAIR =
  'Name them: `expect(spy).toHaveBeenCalledWith(…)`, or `expect(spy).toHaveBeenCalledExactlyOnceWith(…)` where once is part of ' +
  'the claim; `expect.objectContaining({ … })` and `expect.any(Type)` cover the part of an argument the test does not decide, ' +
  'and a double this package built takes `mustBeCalledWith(…)` at the point it is configured, which fails at the call rather ' +
  'than after it. Where the call really is all that matters, the title is what should say so — this rule reads it.';

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
    const scan: Scan = { assertions: [], declared: new Set() };

    return {
      CallExpression: (node: EsCallExpression): void => {
        const assertion = isExpectCall(node) ? assertionOf(context, node) : undefined;

        if (assertion) {
          scan.assertions.push(assertion);

          if (assertion.withArguments) {
            scan.declared.add(assertion.subject);
          }
        }
      },
      'Program:exit': (): void => {
        scan.assertions
          .filter((assertion) => assertion.bare)
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
