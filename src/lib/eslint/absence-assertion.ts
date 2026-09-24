/**
 * A test whose every assertion is satisfied by nothing having happened.
 *
 * ```ts
 * it('yields an empty list when no sub-genre resolved to an address', () => {
 *   let chips: GenreChip[] = [];
 *
 *   load$(quickLinks).subscribe((result) => (chips = result));
 *
 *   expect(chips).toEqual([]);
 *   expect(catalog.getSectionById).not.toHaveBeenCalled();
 * });
 * ```
 *
 * `chips` is written by one thing — the `subscribe` callback — and both assertions hold on the value
 * its *declaration* left there. So the test passes whether the stream produced an empty list or
 * never produced anything at all, and those are not the same claim: the first is the behaviour the
 * title names, the second is a stream that is broken.
 *
 * **Proved by mutation, twice, on a 2 030-file consumer.** Replacing the production source with one
 * that never emits left this test green while three of its siblings in the same file failed; the
 * same swap in a promo-banner service failed four tests and left two — both of this shape — green.
 * Two tests further down that same file capture into `let chips: … | null = null` and assert
 * `toEqual([])`, which *does* fail on silence: the author knew the idiom and did not apply it
 * everywhere, which is what a linter is for.
 *
 * **What has to be true for a report**, all of it read off the file:
 *
 * 1. Some assertion's subject is a variable declared inside this test whose every write is inside a
 *    `subscribe` callback of this test — or a `vi.fn()` the test hands straight to `subscribe` and
 *    never calls itself.
 * 2. That assertion holds on what the declaration put there: the matcher repeats the initialiser
 *    (`let x = []` … `expect(x).toEqual([])`), or it is an absence matcher the held value satisfies
 *    (`toBeUndefined` on a `let` with no initialiser, `toBeNull` on one initialised `null`,
 *    `toBeFalsy` on any falsy literal, `not.toHaveBeenCalled` / `toHaveBeenCalledTimes(0)` on a spy).
 * 3. **Nothing else in the test is a positive assertion.** One assertion that fails on silence is
 *    what makes the rest of them meaningful, so a single positive sibling silences the rule.
 *
 * That third condition is what keeps the rule off the shape the same suite writes 58 times: assert
 * the absence, trigger the source, assert the value. It also costs the rule a real finding — a test
 * with a `let result: void | undefined` capture beside three `toHaveBeenCalledWith` assertions is
 * vacuous in its last line and reported nowhere — and that is the trade rather than an oversight:
 * the alternative is reporting a line inside a test that does check something, where the repair is a
 * judgement rather than an edit.
 *
 * **Syntax and scope, never types.** A value taken through `firstValueFrom`, `expectEmission` or a
 * plain `await` is not a capture — nothing wrote it from a callback — so those tests are outside the
 * rule by construction rather than through an exception list. This library's own stream assertions
 * that fail on a silent source — `expectEmission`, `expectEmissions`, `expectCompletion`,
 * `expectError` — count as the positive sibling of condition 3 wherever they are called. An assertion this rule cannot read in
 * full (`resolves` / `rejects`, a matcher reached some other way) counts as positive, which can only
 * make it quieter, and a test that asserts through a helper of its own is left alone entirely.
 */
import { type EsSubscribeCall, isSubscribeCall } from './await-emission';
import { findBinding } from './bindings';
import { defineRule } from './define-rule';
import { runnerBehind } from './dynamic-import';
import {
  type EsAssignmentExpression,
  type EsCallExpression,
  type EsIdentifier,
  type EsLiteral,
  type EsNode,
  type EsVariable,
  type EsVariableDeclarator,
  type RuleContext,
  anyInSubtree,
  enclosingFunction,
  findProperty,
  isCallExpression,
  isCallee,
  isIdentifier,
  isMemberExpression,
  isObjectExpression,
  isRunnerFnCall,
  isVariableDeclarator,
  memberName,
  propertyValue,
} from './rule-types';
import { isExpectCall, localFunction } from './subscribe-repair';

/** The runner callbacks that declare a test. A hook has no assertions of its own to weigh. */
const TESTS = new Set(['it', 'test']);

/** The matchers a spy nobody called satisfies, written with a `.not`. */
const NEVER_CALLED = new Set(['toHaveBeenCalled', 'toHaveBeenCalledWith']);

/** The negated spellings of "this value is `undefined`". */
const UNDEFINED_MATCHERS = new Set(['toBeDefined', 'toBeUndefined']);

/** The matchers that compare the subject with a value written out beside them. */
const EQUALITY = new Set(['toBe', 'toEqual', 'toStrictEqual']);

/** Initialisers a `toBeFalsy()` holds on, as source text — which is how an initialiser is read here. */
const FALSY = new Set(['0', "''", '""', '``', 'NaN', 'false', 'null', 'undefined']);

/** Initialisers a `toHaveLength(0)` holds on. */
const EMPTY = new Set(['[]', "''", '""', '``']);

/** A name the test declared and only a `subscribe` callback writes, with the value its declaration left in it. */
interface Capture {
  /** The source text of the declaration's initialiser; `'undefined'` for a `let` that has none. */
  held: string;
  /** A `vi.fn()` handed to `subscribe`, which the two messages read differently from a written value. */
  spy: boolean;
}

/**
 * A matcher call, read back from the `expect()` it hangs off.
 *
 * Exported with {@link matcherOf} because `no-unasserted-argument` asks the same question of the
 * same chain — the name, whether a `.not` is in front of it, and what it was given.
 */
export interface Matcher {
  args: EsNode[];
  name: string;
  negated: boolean;
}

/** Everything about one test the report needs, gathered by the visitors as the file is walked. */
interface TestScan {
  assertions: EsCallExpression[];
  helperCalls: EsIdentifier[];
  subscribes: EsSubscribeCall[];
  writes: EsIdentifier[];
}

/** What one assertion is worth to the test around it. */
interface Weight {
  /** The capture the assertion rests on, when silence is what satisfies it. */
  carrier?: Capture | undefined;
  /** The subject as it is written, for the message. */
  name: string;
  /** Whether a source that never emits could fail this assertion. */
  positive: boolean;
}

/** The `it(…)` / `test(…)` call a function is the body of, through one wrapper such as `fakeAsync(…)`. */
function testCallOf(fn: EsNode): EsCallExpression | undefined {
  const call = fn.parent;

  if (!isCallExpression(call) || !call.arguments.includes(fn)) {
    return undefined;
  }

  if (TESTS.has(runnerBehind(call.callee) ?? '')) {
    return call;
  }

  const outer = call.parent;

  return isCallExpression(outer) && outer.arguments.includes(call) && TESTS.has(runnerBehind(outer.callee) ?? '') ? outer : undefined;
}

/** Whether a function is the body of an `it` / `test`, through one wrapper such as `fakeAsync(…)`. */
function isTestBody(fn: EsNode): boolean {
  return testCallOf(fn) !== undefined;
}

/**
 * The test whose body runs `node`, or `undefined` for anything outside one.
 *
 * Exported because `no-self-called-spy` groups by the same unit and reads the same spellings — one
 * walk means a modifier such as `it.each` cannot be recognised by one rule and forgotten by the other.
 */
export function enclosingTest(node: EsNode): EsNode | undefined {
  for (let fn = enclosingFunction(node); fn; fn = enclosingFunction(fn.parent)) {
    if (isTestBody(fn)) {
      return fn;
    }
  }

  return undefined;
}

/**
 * The `it(…)` call whose body contains a node.
 *
 * Exported because `no-unasserted-argument` weighs a test by what its **title** promises, and the
 * title is an argument of this call — the same two walks, asked for the call rather than for the
 * function or for a yes or no.
 */
export function enclosingTestCall(node: EsNode): EsCallExpression | undefined {
  const fn = enclosingTest(node);

  return fn && testCallOf(fn);
}

/** The matcher an `expect(…)` is asserted with, or `undefined` for a chain this rule cannot read in full. */
export function matcherOf(expectCall: EsNode): Matcher | undefined {
  let current: EsNode = expectCall;
  let negated = false;

  for (;;) {
    const member = current.parent;
    const name = isMemberExpression(member) ? memberName(member) : undefined;

    if (name === undefined) {
      return undefined;
    }

    if (name === 'not') {
      negated = !negated;
      current = member;
      continue;
    }

    // `expect(p).resolves.toBe(1)` stops here: the member's parent is another member rather than the
    // call, so the chain is handed back unread and counts as an assertion that can fail.
    const call = member.parent;

    return isCallExpression(call) && call.callee === member ? { args: call.arguments, name, negated } : undefined;
  }
}

/** Whether the sole argument of a matcher is the literal `0`. */
function countsZero(args: EsNode[]): boolean {
  const [first, ...rest] = args;

  if (first === undefined || rest.length > 0 || first.type !== 'Literal') {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `type === 'Literal'` is ESTree's own discriminant for the node this interface mirrors.
  return (first as EsLiteral).value === 0;
}

/** Whether a spy nobody called satisfies this matcher — the one reading that holds whatever the subject is. */
function satisfiedByNoCall(matcher: Matcher): boolean {
  return matcher.negated ? NEVER_CALLED.has(matcher.name) : matcher.name === 'toHaveBeenCalledTimes' && countsZero(matcher.args);
}

/** Source text with its whitespace taken out, so `[]` and `[ ]` are the same initialiser. */
function tight(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * Whether the matcher holds on the value the declaration left in the variable.
 *
 * Deliberately literal rather than by matcher family: `toBeNull()` on a `let` with no initialiser is
 * **not** satisfied by silence — `undefined` is not `null`, and that assertion does fail — so what
 * the declaration holds has to be read before the matcher means anything.
 */
function satisfiedByHeldValue(context: RuleContext, held: string, matcher: Matcher): boolean {
  const [argument] = matcher.args;

  if (matcher.negated) {
    return UNDEFINED_MATCHERS.has(matcher.name) ? held === 'undefined' : matcher.name === 'toBeTruthy' && FALSY.has(held);
  }

  if (EQUALITY.has(matcher.name)) {
    return matcher.args.length === 1 && argument !== undefined && tight(context.sourceCode.getText(argument)) === tight(held);
  }

  if (matcher.name === 'toHaveLength') {
    return countsZero(matcher.args) && EMPTY.has(held);
  }

  const holds: Record<string, boolean> = { toBeFalsy: FALSY.has(held), toBeNull: held === 'null', toBeUndefined: held === 'undefined' };

  return holds[matcher.name] === true;
}

/** What declares a name, when a plain `const` / `let` of this file is what declares it. */
interface Declaration {
  declarator: EsVariableDeclarator;
  variable: EsVariable;
}

/** The declaration of a name visible from `node` — `undefined` for a global, a parameter or an import. */
function declarationOf(context: RuleContext, node: EsIdentifier): Declaration | undefined {
  const variable = findBinding(context.sourceCode.getScope(node), node.name);

  if (!variable) {
    return undefined;
  }

  const declarator = variable.defs.map((definition) => definition.node).find(isVariableDeclarator);

  return declarator ? { declarator, variable } : undefined;
}

/** Whether `node` sits inside something one of these `subscribe` calls was handed. */
function handedToSubscribe(node: EsNode, subscribes: EsSubscribeCall[]): boolean {
  return subscribes.some((call) =>
    call.arguments.some((argument) => argument.range[0] <= node.range[0] && node.range[1] <= argument.range[1]),
  );
}

/** Whether a node is inside the test's own body — a `let` the `describe` above declared is not a capture. */
function inside(node: EsNode, body: EsNode): boolean {
  return body.range[0] <= node.range[0] && node.range[1] <= body.range[1];
}

/** The value a declaration leaves behind, as source text; a `let` with no initialiser holds `undefined`. */
function heldValue(context: RuleContext, declarator: EsVariableDeclarator): string {
  return declarator.init ? context.sourceCode.getText(declarator.init) : 'undefined';
}

/** A name written only from inside a `subscribe` callback of this test — the carrier the rule reads. */
function valueCapture(context: RuleContext, node: EsIdentifier, scan: TestScan, body: EsNode): Capture | undefined {
  const found = declarationOf(context, node);

  if (!found || !inside(found.declarator, body)) {
    return undefined;
  }

  // Every write, not merely this one: a capture the test also assigns to itself no longer holds what
  // its declaration put there, and the whole reading below is about that value.
  const elsewhere = found.variable.references.filter((reference) => reference.writeExpr && reference.writeExpr !== found.declarator.init);

  return elsewhere.every(({ identifier }) => handedToSubscribe(identifier, scan.subscribes))
    ? { held: heldValue(context, found.declarator), spy: false }
    : undefined;
}

/** A `vi.fn()` the test hands to `subscribe` and never calls itself. */
function spyCapture(context: RuleContext, node: EsIdentifier, body: EsNode): Capture | undefined {
  const found = declarationOf(context, node);
  const init = found?.declarator.init;

  if (!found || !init || !inside(found.declarator, body) || !isRunnerFnCall(init)) {
    return undefined;
  }

  // A spec that calls the spy itself has put calls on it that no stream produced, and
  // `not.toHaveBeenCalled()` there is then a claim about the test rather than about the source.
  return found.variable.references.some((reference) => isCallee(reference.identifier)) ? undefined : { held: 'undefined', spy: true };
}

/** The `next` handler of a `subscribe` call, whichever of the two ways it was handed over. */
function observersOf(call: EsSubscribeCall): EsNode[] {
  return call.arguments.flatMap((argument) => {
    if (!isObjectExpression(argument)) {
      return [argument];
    }

    const next = findProperty(argument, 'next');

    return next ? [propertyValue(next)] : [];
  });
}

/** Every name this test captures out of a `subscribe`, with what its declaration left in it. */
function capturesOf(context: RuleContext, scan: TestScan, body: EsNode): Map<string, Capture> {
  const captures = new Map<string, Capture>();
  const add = (node: EsIdentifier, capture: Capture | undefined): void => {
    if (capture) {
      captures.set(node.name, capture);
    }
  };

  scan.writes
    .filter((write) => handedToSubscribe(write, scan.subscribes))
    .forEach((write) => add(write, valueCapture(context, write, scan, body)));

  scan.subscribes
    .flatMap(observersOf)
    .filter(isIdentifier)
    .forEach((handler) => add(handler, spyCapture(context, handler, body)));

  return captures;
}

/** This library's assertions that time out on a source that never emits or completes. */
const FAILS_ON_SILENCE = new Set(['expectCompletion', 'expectEmission', 'expectEmissions', 'expectError']);

/** Whether the test reaches assertions through a helper of its own, which this rule cannot weigh. */
function assertsThroughAHelper(context: RuleContext, scan: TestScan): boolean {
  return scan.helperCalls.some((callee) => {
    if (FAILS_ON_SILENCE.has(callee.name)) {
      return true;
    }

    const helper = localFunction(context, callee);

    return helper !== undefined && anyInSubtree(context, helper, isExpectCall, true);
  });
}

/** What one assertion is worth: the capture it rests on, and whether a silent source could fail it. */
function weigh(context: RuleContext, expectCall: EsCallExpression, captures: Map<string, Capture>): Weight {
  const [subject] = expectCall.arguments;
  const name = subject && isIdentifier(subject) ? subject.name : '';
  const carrier = captures.get(name);
  const matcher = matcherOf(expectCall);

  if (!matcher) {
    return { name, positive: true };
  }

  // A call that never happened is the one absence every subject agrees on, so
  // `expect(collaborator.load).not.toHaveBeenCalled()` is not what makes a test mean something —
  // and it is half of the shape this rule was measured on.
  if (satisfiedByNoCall(matcher)) {
    return { carrier, name, positive: false };
  }

  if (carrier && satisfiedByHeldValue(context, carrier.held, matcher)) {
    return { carrier, name, positive: false };
  }

  return { name, positive: true };
}

/** What the report needs: the assertion to point at, the capture behind it and the name it is written as. */
interface Carrier {
  capture: Capture;
  name: string;
  node: EsCallExpression;
}

/** The first assertion a silent source already satisfies, in a test where nothing else can fail. */
function vacuousCarrier(context: RuleContext, scan: TestScan, body: EsNode): Carrier | undefined {
  const captures = capturesOf(context, scan, body);

  if (captures.size === 0 || assertsThroughAHelper(context, scan)) {
    return undefined;
  }

  const weighed = scan.assertions.map((node) => ({ node, weight: weigh(context, node, captures) }));

  if (weighed.some(({ weight }) => weight.positive)) {
    return undefined;
  }

  const found = weighed.find(({ weight }) => weight.carrier !== undefined);
  const capture = found?.weight.carrier;

  return found && capture ? { capture, name: found.weight.name, node: found.node } : undefined;
}

const REPAIR =
  'Say which of the two you mean. `await expectNoEmission(source$)` from `vitest-auto-spy` asserts the silence itself and fails — ' +
  'naming the source — the moment something does arrive, which is the assertion a test means when its title says the stream stays ' +
  'quiet. `expect(await expectEmission(source$)).toEqual(…)` asserts the value and fails when nothing arrives, which is the one to ' +
  'write when the empty result *is* the emission. Either way the source stops being something the test can be silent about. Where ' +
  'the absence is genuinely a step — nothing yet, then the trigger, then the value — keep it and assert the value afterwards: that ' +
  'later assertion is what this rule looks for and did not find.';

/** A test every assertion of which holds when the stream under it never emits. */
export const noVacuousAbsenceAssertion = defineRule({
  anchor: '-an-observable',
  description: 'Do not let a whole test rest on assertions that a stream which never emits already satisfies',
  messages: {
    vacuousCapture:
      '`{{name}}` is written by nothing but the `subscribe` callback in this test, and every assertion here holds on the value its ' +
      'declaration left in it (`{{held}}`) — so the test passes unchanged against a source that never emits at all. That is not the ' +
      'behaviour the title claims: "the result is empty" and "there is no result" are different outcomes, and nothing in this test ' +
      'tells them apart. Proved by mutation on the suite this rule came from — the production stream was replaced with one that ' +
      `never emits, and this shape stayed green while its siblings failed. ${REPAIR}`,
    vacuousSubscribedSpy:
      '`{{name}}` is a `vi.fn()` handed to `subscribe` and called by nothing else, so "it was not called" is already true before the ' +
      'subscription exists — and every other assertion in this test holds on silence too. The test therefore passes against a source ' +
      'that never emits, which is the one outcome it ought to be telling apart from the one it claims. ' +
      `${REPAIR}`,
  },
  create: (context) => {
    const tests = new Map<EsNode, TestScan>();
    const scanOf = (node: EsNode): TestScan | undefined => {
      const body = enclosingTest(node);

      if (!body) {
        return undefined;
      }

      const scan = tests.get(body) ?? { assertions: [], helperCalls: [], subscribes: [], writes: [] };

      tests.set(body, scan);

      return scan;
    };

    return {
      AssignmentExpression: (node: EsAssignmentExpression): void => {
        if (isIdentifier(node.left)) {
          scanOf(node)?.writes.push(node.left);
        }
      },
      CallExpression: (node: EsCallExpression): void => {
        const scan = scanOf(node);

        if (!scan) {
          return;
        }

        if (isSubscribeCall(node)) {
          scan.subscribes.push(node);
        } else if (isExpectCall(node)) {
          scan.assertions.push(node);
        } else if (isIdentifier(node.callee)) {
          scan.helperCalls.push(node.callee);
        }

        // `results.push(value)` is the other way a callback fills a capture, and the array it fills
        // is what the assertion then compares with the `[]` it was declared as.
        if (isMemberExpression(node.callee) && memberName(node.callee) === 'push' && isIdentifier(node.callee.object)) {
          scan.writes.push(node.callee.object);
        }
      },
      'Program:exit': (): void => {
        tests.forEach((scan, body) => {
          const carrier = vacuousCarrier(context, scan, body);

          if (carrier) {
            const data = { held: carrier.capture.held, name: carrier.name };

            context.report({ data, messageId: carrier.capture.spy ? 'vacuousSubscribedSpy' : 'vacuousCapture', node: carrier.node });
          }
        });
      },
    };
  },
});
