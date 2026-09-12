/**
 * `it('should create', () => expect(pipe).toBeTruthy())`, beside tests that already build the same
 * subject.
 *
 * The test is usually generated — by `ng generate`, by a template, by the file above it — and it is
 * the one line of a spec that can never fail on its own: every sibling in the block runs the same
 * `beforeEach`, so a subject that came back nullish takes them down first, and with a message that
 * names what it was doing. What this one leaves behind is a green line in the report standing in for
 * behaviour nobody checked.
 *
 * Alone in its block it is not reported: a file whose only test is this one at least proves the
 * subject can be constructed, and a rule that empties a spec file has stopped being a lint rule.
 */
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsFixer,
  type EsFunction,
  type EsNode,
  type FixFunction,
  type RuleContext,
  enclosingFunction,
  isBlockStatement,
  isCallExpression,
  isExpressionStatement,
  isFunctionNode,
  isIdentifier,
  isMemberExpression,
  memberName,
} from './rule-types';

/** The runners that declare a test. `describe` is not one: what it declares is the block. */
const TESTS = new Set(['fit', 'it', 'test', 'xit', 'xtest']);

/** Spellings that declare a test the runner never executes, so it proves nothing for its siblings. */
const SKIPPED_TESTS = new Set(['xit', 'xtest']);

/** The members that do the same to a test written with the modern name — `it.skip`, `it.todo`. */
const SKIPPED_MEMBERS = new Set(['skip', 'todo']);

/** Matchers answered by the mere existence of the value. */
const EXISTS = new Set(['toBeDefined', 'toBeInstanceOf', 'toBeTruthy']);

/** The same question through a `.not` — "not nullish" is "exists" said the other way round. */
const MISSING = new Set(['toBeFalsy', 'toBeNull', 'toBeUndefined']);

/** The name a callee chain is rooted in, with the members along it — `it` and `['each']` for `it.each([…])(…)`. */
function calleeChain(node: EsCallExpression): { members: string[]; root: string } | undefined {
  const members: string[] = [];
  let current: EsNode = node.callee;

  for (;;) {
    if (isIdentifier(current)) {
      return { members, root: current.name };
    }

    if (isMemberExpression(current)) {
      const name = memberName(current);

      if (name === undefined) {
        return undefined;
      }

      members.unshift(name);
      current = current.object;
      continue;
    }

    // `it.each([…])(…)`: the callee is itself a call, and the chain continues through *its* callee.
    if (!isCallExpression(current)) {
      return undefined;
    }

    current = current.callee;
  }
}

/** The node types a test title is written as — what separates `it.each([…])(…)` from the `it.each([…])` inside it. */
const TITLES = new Set(['Literal', 'TemplateLiteral']);

/** Whether the call declares a test, and whether the runner will run it. */
function testCall(node: EsCallExpression): { skipped: boolean } | undefined {
  const chain = calleeChain(node);
  const [title] = node.arguments;

  if (!chain || !TESTS.has(chain.root) || !title || !TITLES.has(title.type)) {
    return undefined;
  }

  return { skipped: SKIPPED_TESTS.has(chain.root) || chain.members.some((member) => SKIPPED_MEMBERS.has(member)) };
}

/** The value an assertion asks to exist, or `undefined` for an assertion that asks anything else. */
function existenceSubject(expression: EsNode): EsNode | undefined {
  if (!isCallExpression(expression) || !isMemberExpression(expression.callee)) {
    return undefined;
  }

  const matcher = memberName(expression.callee);
  let target: EsNode = expression.callee.object;
  let negated = false;

  while (isMemberExpression(target) && memberName(target) === 'not') {
    negated = !negated;
    target = target.object;
  }

  if (!matcher || !isCallExpression(target) || !isIdentifier(target.callee) || target.callee.name !== 'expect') {
    return undefined;
  }

  const [subject] = target.arguments;

  return subject && (negated ? MISSING.has(matcher) : EXISTS.has(matcher)) ? subject : undefined;
}

/** The value a test body does nothing but assert the existence of — `undefined` as soon as it does anything else. */
function existenceOnly(callback: EsFunction): EsNode | undefined {
  const body = callback.body;

  // A concise arrow carries the expression itself where a block carries statements.
  if (!isBlockStatement(body)) {
    return existenceSubject(body);
  }

  const subjects = body.body.map((statement) => (isExpressionStatement(statement) ? existenceSubject(statement.expression) : undefined));

  return subjects.length > 0 && subjects.every(Boolean) ? subjects[0] : undefined;
}

/** Delete the whole test, together with the blank line above it. */
function removal(context: RuleContext, statement: EsNode): FixFunction {
  return (fixer: EsFixer) => {
    const text = context.sourceCode.getText();
    let start = statement.range[0];

    while (start > 0 && /\s/.test(text.charAt(start - 1))) {
      start -= 1;
    }

    return fixer.replaceTextRange([start, statement.range[1]], '');
  };
}

/** One block's tests: the ones that only assert existence, and how many of the rest actually run. */
interface Block {
  below: number;
  proving: number;
  smoke: { node: EsCallExpression; subject: EsNode }[];
}

/**
 * Add every block's running tests to the count of each block above it.
 *
 * A test in a nested `describe` runs the outer `beforeEach` before its own, so it answers the
 * question this rule asks — was the subject built — exactly as a sibling does. Counting a block's own
 * tests alone would leave the spec shape this rule exists for unreported: a `should create` at the
 * top of the file, and everything that actually tests the subject one `describe` deeper.
 */
function countNested(blocks: Map<EsNode | undefined, Block>): void {
  blocks.forEach((block, scope) => {
    let current = scope;

    for (;;) {
      const above = blocks.get(current);

      if (above) {
        above.below += block.proving;
      }

      if (current === undefined) {
        return;
      }

      current = enclosingFunction(current.parent);
    }
  });
}

export const noRedundantSmokeTest = defineRule({
  anchor: '-a-promise-a-test-forgets-to-await',
  description: 'Delete a test whose whole body asserts that the subject exists, where the block already has tests that use it',
  hasSuggestions: true,
  messages: {
    noRedundantSmokeTest:
      'The whole of this test is `{{subject}}` existing, and {{siblings}}: they run the same ' +
      '`beforeEach`, so a subject that came back nullish fails them first, and names what it was doing when it did. This one ' +
      'cannot fail on its own and covers nothing — it is a green line in the report standing in for a test. Delete it. If the ' +
      'construction is what the spec is about — a factory that rejects a bad config, a constructor that reads an optional ' +
      'token — assert on that instead: `expect(() => new Subject(null)).toThrow(…)`, or on the value the subject produced.',
  },
  create: (context) => {
    // Keyed by the callback the test sits in — the `describe` body for a nested test, `undefined` at
    // module scope — so a smoke test is only ever weighed against the tests that run its setup: its
    // own block's, and the ones the blocks below it declare.
    const blocks = new Map<EsNode | undefined, Block>();

    return {
      CallExpression: (node: EsCallExpression): void => {
        const test = testCall(node);

        if (!test) {
          return;
        }

        const scope = enclosingFunction(node);
        const block = blocks.get(scope) ?? { below: 0, proving: 0, smoke: [] };
        const callback = node.arguments.find(isFunctionNode);
        const subject = callback && existenceOnly(callback);

        if (subject) {
          block.smoke.push({ node, subject });
        } else if (!test.skipped) {
          block.proving += 1;
        }

        blocks.set(scope, block);
      },
      'Program:exit': (): void => {
        countNested(blocks);

        blocks.forEach((block) => {
          if (block.below === 0) {
            return;
          }

          block.smoke.forEach(({ node, subject }) => {
            const data = {
              siblings:
                block.below === 1
                  ? 'another test under the same setup already runs against it'
                  : `${block.below} other tests under the same setup already run against it`,
              subject: context.sourceCode.getText(subject),
            };
            // The suggestion is offered only where the test is a statement of its own: anywhere else
            // — handed to something, awaited — removing it leaves the expression around it holding
            // nothing.
            const statement = node.parent;
            const report = { data, messageId: 'noRedundantSmokeTest', node };

            context.report(
              isExpressionStatement(statement)
                ? { ...report, suggest: [{ desc: 'Remove this test', fix: removal(context, statement) }] }
                : report,
            );
          });
        });
      },
    };
  },
});
