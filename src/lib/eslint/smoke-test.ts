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

/** The builders whose one argument is a DI token rather than input, so the call still only names the subject. */
const SUBJECT_BUILDERS = new Set(['get', 'inject']);

/** Whether any call hides inside the expression — a member chain that ends in one is not a plain reference. */
function containsCall(node: EsNode): boolean {
  let current: EsNode = node;

  while (isMemberExpression(current)) {
    if (isCallExpression(current.object)) {
      return true;
    }
    current = current.object;
  }

  return isCallExpression(current);
}

/**
 * Whether the subject is a **reference to the thing under test** rather than a value the test went
 * and computed. The matcher cannot decide this, and that is the whole difficulty: \`toBeTruthy\` reads
 * the same in \`expect(component)\` and in \`expect(fixture.nativeElement.querySelector('expand-card'))\`
 * — the first names a subject a sibling test would have failed on first, the second asserts that a
 * child rendered, which nothing else in the file checks. Reporting the second is not a false
 * positive about style; it deletes the only coverage of a behaviour.
 *
 * So a reference is an identifier, or a member chain with no call in it (\`fixture.componentInstance\`).
 * A call counts only where it *builds* the subject and takes nothing to do it:
 * \`expect(createService())\`, and \`TestBed.inject(Token)\` / \`TestBed.get(Token)\`, whose argument is a
 * token rather than input. Everything else — a call with a value in it, a method or signal read on
 * the subject, a DOM query, an expression over a collection — is behaviour, and is left alone. A
 * builder with `toBeInstanceOf` is left alone too: that pairs two names and asserts they resolve to
 * each other, which is wiring rather than existence.
 *
 * Measured on an Angular suite of 1771 spec files: it takes the rule from 581 findings to 548, and
 * every one of the 33 it drops is a real assertion — \`expect(isChildProfile(FAMILY_ROLE.CHILD))\`,
 * \`expect(consoleTransport(true))\`, \`expect(component.periodsOffset()).not.toBeNull()\`,
 * \`expect(createService().resolve(type))\` under an \`it.each\` over seven content types,
 * \`expect(samples.every((x) => x >= 0 && x <= 100))\`.
 */
function namesSubject(subject: EsNode, matcher: string): boolean {
  if (isIdentifier(subject)) {
    return true;
  }

  if (isMemberExpression(subject)) {
    return !containsCall(subject);
  }

  if (!isCallExpression(subject)) {
    return false;
  }

  // A builder plus `toBeInstanceOf` is not "it exists", it is "this name resolves to that class" —
  // two different names, and often nothing else in the file connects them. The one that showed this
  // was the only test that `provideBetaTesters()` wires its token to the service behind it; its
  // sibling exercised the behaviour and would have passed against any other implementation.
  if (matcher === 'toBeInstanceOf') {
    return false;
  }

  // createService()
  if (isIdentifier(subject.callee)) {
    return subject.arguments.length === 0;
  }

  // TestBed.inject(Token) — one token, and nothing called to produce it.
  const [token, ...rest] = subject.arguments;

  return (
    isMemberExpression(subject.callee) &&
    SUBJECT_BUILDERS.has(memberName(subject.callee) ?? '') &&
    !containsCall(subject.callee.object) &&
    rest.length === 0 &&
    token !== undefined &&
    (isIdentifier(token) || (isMemberExpression(token) && !containsCall(token)))
  );
}

/**
 * The reference a running sibling has to share for this rule's claim to hold, which is the claim its
 * message makes out loud: "N other tests under the same setup already run against it".
 *
 * For a name or a path it is the **whole** path, not the name it starts with. A barrel spec showed
 * why: `expect(publicApi.FocusModule).toBeDefined()` beside
 * `expect(publicApi.smartPlayerSettings).toBeDefined()` shares the root `publicApi` and nothing else
 * — the sibling would not have failed first, because it never touches `FocusModule`, and removing
 * the test removed the only check that the symbol is exported at all.
 *
 * For a builder call the root identifier is the reference: `createService()` in one test and
 * `createService().transform(…)` in another do build the same subject.
 */
function subjectReference(subject: EsNode, context: RuleContext): string | undefined {
  if (isIdentifier(subject) || isMemberExpression(subject)) {
    return context.sourceCode.getText(subject);
  }

  let current: EsNode = subject;

  while (isCallExpression(current) || isMemberExpression(current)) {
    current = isCallExpression(current) ? current.callee : current.object;
  }

  return isIdentifier(current) ? current.name : undefined;
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

  if (!subject || !(negated ? MISSING.has(matcher) : EXISTS.has(matcher))) {
    return undefined;
  }

  return namesSubject(subject, matcher) ? subject : undefined;
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

/**
 * Index a name against every enclosing test callback `wanted` names, so a name used inside a nested
 * arrow still counts for the test containing it.
 *
 * Only those callbacks, and only once the file is over: the index is read by
 * {@link reportBlock} alone, which needs it for the running tests of a block that has a smoke test
 * to weigh — and the overwhelming majority of spec files have none. Building a string per identifier
 * and per member path of every file, times the nesting depth, was the plugin's single biggest cost
 * over this repository's own specs at 44 % of its time, all of it for an index nothing read.
 */
function recordName(names: Map<EsNode, Set<string>>, node: EsNode, context: RuleContext, wanted: ReadonlySet<EsNode>): void {
  // Indexed by source text rather than by name, because a bare name and the paths built on it are
  // both references a smoke test can be weighed against — the visitor passes both kinds in.
  let text: string | undefined;

  for (let scope = enclosingFunction(node); scope; scope = enclosingFunction(scope.parent)) {
    if (!wanted.has(scope)) {
      continue;
    }

    text ??= context.sourceCode.getText(node);

    const seen = names.get(scope) ?? new Set<string>();

    seen.add(text);
    names.set(scope, seen);
  }
}

/** The callbacks whose names decide a report: the running tests of every block with a smoke test in it. */
function weighedAgainst(blocks: Map<EsNode | undefined, Block>): Set<EsNode> {
  const wanted = new Set<EsNode>();

  blocks.forEach((block) => {
    if (block.below > 0 && block.smoke.length > 0) {
      block.running.forEach((callback) => wanted.add(callback));
    }
  });

  return wanted;
}

/** One block's tests: the ones that only assert existence, and how many of the rest actually run. */
interface Block {
  below: number;
  proving: number;
  /** The callbacks of the tests that actually run, so the names they reference can be gathered. */
  running: EsFunction[];
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
        above.running.push(...block.running);
      }

      if (current === undefined) {
        return;
      }

      current = enclosingFunction(current.parent);
    }
  });
}

/** Report one block's smoke tests — the ones a running sibling in it actually reaches the same way. */
function reportBlock(context: RuleContext, block: Block, names: Map<EsNode, Set<string>>): void {
  if (block.below === 0) {
    return;
  }

  const referenced = new Set(block.running.flatMap((callback) => [...(names.get(callback) ?? [])]));

  block.smoke.forEach(({ node, subject }) => {
    const reference = subjectReference(subject, context);

    // The message says "N other tests under the same setup already run against it". Where no running
    // test reaches the subject the same way, that is simply untrue, and the test is the only thing
    // checking whatever it holds. Both halves of this came off a 1771-file suite: the tween spec's
    // only proof that the stream completes reads `expect(completed).toBeTruthy()` while its siblings
    // read the array of timestamps, and a barrel spec's `expect(publicApi.FocusModule)` shares only
    // the word `publicApi` with the sibling that checks a different export.
    if (reference !== undefined && !referenced.has(reference)) {
      return;
    }

    const data = {
      siblings:
        block.below === 1
          ? 'another test under the same setup already runs against it'
          : `${block.below} other tests under the same setup already run against it`,
      subject: context.sourceCode.getText(subject),
    };
    // The suggestion is offered only where the test is a statement of its own: anywhere else — handed
    // to something, awaited — removing it leaves the expression around it holding nothing.
    const statement = node.parent;
    const report = { data, messageId: 'noRedundantSmokeTest', node };

    context.report(
      isExpressionStatement(statement) ? { ...report, suggest: [{ desc: 'Remove this test', fix: removal(context, statement) }] } : report,
    );
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
    /** Every name a function encloses, including through the arrows nested in it. */
    const names = new Map<EsNode, Set<string>>();
    /** The nodes those names are read off, kept as nodes until it is known which of them matter. */
    const mentions: EsNode[] = [];

    return {
      Identifier: (node: EsNode): void => {
        mentions.push(node);
      },
      MemberExpression: (node: EsNode): void => {
        mentions.push(node);
      },
      CallExpression: (node: EsCallExpression): void => {
        const test = testCall(node);

        if (!test) {
          return;
        }

        const scope = enclosingFunction(node);
        const block = blocks.get(scope) ?? { below: 0, proving: 0, running: [], smoke: [] };
        const callback = node.arguments.find(isFunctionNode);
        const subject = callback && existenceOnly(callback);

        if (subject) {
          block.smoke.push({ node, subject });
        } else if (!test.skipped) {
          block.proving += 1;

          if (callback) {
            block.running.push(callback);
          }
        }

        blocks.set(scope, block);
      },
      'Program:exit': (): void => {
        countNested(blocks);

        const wanted = weighedAgainst(blocks);

        if (wanted.size > 0) {
          mentions.forEach((node) => recordName(names, node, context, wanted));
        }

        blocks.forEach((block) => reportBlock(context, block, names));
      },
    };
  },
});
