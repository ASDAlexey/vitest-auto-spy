/**
 * `prefer-set-inputs` — `fixture.componentRef.setInput(…)`, where `setInputs` is the same line checked.
 *
 * Angular answers `componentRef.setInput('naem', value)` with an `NG0303` on the console and leaves
 * the component untouched. Nothing fails there: the assertion several lines down reads the state the
 * *previous* value produced, and the spec is then debugged at the assertion rather than at the line
 * that did nothing. `setInputs(fixture, { name: value })` resolves every key against the compiled
 * definition before it writes the first one, so an undeclared name throws and names the inputs the
 * component really has, and an alias resolves from either of its two spellings. It types the value
 * as well: over an Angular suite of 1771 spec files, rewriting the 650 calls it can rewrite turns 72
 * fixtures that had drifted from the model they claim to be into compile errors, in 21 files — a
 * `{}` for a `CardButtonExtra`, a partial literal still written in the previous shape of an
 * interface, an `imageUrl` for a model whose field is `imgUrl`.
 *
 * **A run of calls is reported, not a call**, because that is the shape of the repair: one
 * `setInputs` carrying every input the run sets, and the `detectChanges()` underneath it gone —
 * `setInputs` ends in `stable(fixture)`, which flushes effects and awaits the fixture, i.e. strictly
 * more than the one change-detection pass it replaces.
 *
 * **A run ends where the same input is set twice**, and that is not a detail. Two adjacent writes of
 * one input are how a spec says "and now it changes": `setInput('url', first)` then
 * `setInput('url', second)`, asserting the second. Merged into one literal they are a duplicate key
 * — `TS1117`, and had it compiled it would have been a test that no longer tests the update. Both
 * halves of that shape exist in the suite this was measured on.
 *
 * **Where it stays silent.** A computed name (`setInput(key, value)`), because no rewrite can name a
 * key it cannot read. A receiver this file cannot read as a `ComponentFixture`: the shape
 * `<name>.componentRef` is most of that evidence — a bare `ComponentRef`, which is what
 * `ViewContainerRef.createComponent()` hands back and where `setInputs` does not apply, has no
 * `componentRef` of its own — and the name, or the single value the file gives it, is the rest. And
 * a call whose result goes anywhere: only a statement of its own is a call whose whole effect this
 * rule can account for.
 *
 * **The edit is offered, never applied**, and that is the one decision here taken from a measurement
 * rather than from the syntax. Accepting all 451 of them on the suite above leaves every file parsing
 * and 101 of the 122 rewritten files type-checking — and turned **57 of those 101 from green to red**,
 * every one on `NG0101: ApplicationRef.tick is called recursively`. That half was a defect in
 * `stable()`, not in the rewrite, and it is fixed: the tick runs inside the `NgZone`, and the same 451
 * edits now leave **20** of the 101 red. What is left is the honest half, and it is why the edit stays
 * a suggestion.
 *
 * `setInputs` **renders** where `componentRef.setInput` only writes — it ends in `stable()`, which
 * flushes effects and awaits the fixture. 13 of those 20 files never drove change detection at all:
 * they set an input and read a computed off the instance, and the render they now get reports the
 * required input nobody set (`NG0950`), the provider nobody registered (`NG0201`), the pipe the
 * testing module never declared (`NG0302`) or a strict double's unconfigured method. The other 7 are
 * the same thing one step in: a run the rule ends early — at a repeated input — renders between the
 * two halves of what the spec meant as one setup. None of that is visible in the syntax, so the rule
 * offers the edit one call at a time, next to the test that says whether it held.
 *
 * **Where it reports without even the suggestion.** `setInputs` is awaited, so the edit has to make
 * the enclosing callback `async`, and that is only this rule's decision inside a callback the runner
 * owns. In a helper the spec declares, the same `async` changes a signature whose callers are not in
 * view — one that does not await it would keep running past the point it used to finish at, and
 * nothing reports that. Those keep the report alone: 53 of the 504 findings on the measured suite.
 */
import { isHookCallback } from './async-hooks';
import { PACKAGE, bindingState, boundValueOf, findBinding, importNamed } from './bindings';
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsIdentifier,
  type EsNode,
  type RuleContext,
  type RuleModule,
  enclosingFunction,
  isCallExpression,
  isExpressionStatement,
  isIdentifier,
  isMemberExpression,
  memberName,
} from './rule-types';

/** The entry point the helper ships from — `setInputs` is Angular-only, like everything it touches. */
const ANGULAR = `${PACKAGE}/angular`;

const HELPER = 'setInputs';

/** What the suggestion says it will do, in the one line an editor shows it on. */
const EDIT = 'Set the inputs through setInputs() — an awaited call, so the callback becomes async';

/** A key a literal can carry bare; anything else is quoted, which every string can be. */
const PLAIN_KEY = /^[$A-Z_a-z][\w$]*$/u;

/** A fixture named as one — 771 of the 777 calls measured on a 1771-file suite spell it this way. */
const FIXTURE_NAME = /fixture/iu;

/** The calls that hand back a `ComponentFixture`, for a name that says nothing on its own. */
const FIXTURE_SOURCES = new Set(['createComponent', 'render', 'renderShallow']);

/** One `setInput` call, read far enough to be rewritten. */
interface InputCall {
  /** The statement it is, which is the unit the fix replaces. */
  statement: EsNode;
  receiver: EsIdentifier;
  key: string;
  value: EsNode;
}

/** A run of them on one fixture — `first` and `last` named, so no index has to be re-checked. */
interface Run {
  calls: InputCall[];
  first: InputCall;
  last: InputCall;
}

/** `fixture` in `fixture.componentRef`. */
function ownerOf(node: EsNode): EsIdentifier | undefined {
  return isMemberExpression(node) && memberName(node) === 'componentRef' && isIdentifier(node.object) ? node.object : undefined;
}

/**
 * The fixture behind `fixture.componentRef`, or behind a name the file binds to it once. The fixture
 * has to be the same binding where the call is, since the edit names it there.
 */
function componentRefOwner(context: RuleContext, node: EsNode): EsIdentifier | undefined {
  const direct = ownerOf(node);

  if (direct || !isIdentifier(node)) {
    return direct;
  }

  const scope = context.sourceCode.getScope(node);
  const bound = boundValueOf(scope, node);
  const owner = bound && ownerOf(bound);

  return owner && findBinding(scope, owner.name) === findBinding(context.sourceCode.getScope(owner), owner.name) ? owner : undefined;
}

/** Whether a node is `<name>.componentRef.setInput('input', value)`, directly or through a `componentRef` binding. */
function readInputCall(context: RuleContext, node: EsNode): InputCall | undefined {
  if (!isCallExpression(node) || !isMemberExpression(node.callee) || memberName(node.callee) !== 'setInput') {
    return undefined;
  }

  const receiver = componentRefOwner(context, node.callee.object);

  if (!receiver) {
    return undefined;
  }

  const name = node.arguments[0];
  const value = node.arguments[1];
  const key: unknown = name?.type === 'Literal' ? Reflect.get(name, 'value') : undefined;

  if (typeof key !== 'string' || value === undefined || !isExpressionStatement(node.parent)) {
    return undefined;
  }

  return { statement: node.parent, receiver, key, value };
}

/** The call a statement is, when it is one of these. */
function inputCallOf(context: RuleContext, statement: EsNode | undefined): InputCall | undefined {
  return statement && isExpressionStatement(statement) ? readInputCall(context, statement.expression) : undefined;
}

/**
 * Whether the receiver is a `ComponentFixture`, which is what `setInputs` takes and a `ComponentRef`
 * is not.
 *
 * The shape carries most of it — `x.componentRef` is a property a fixture has and a `ComponentRef`
 * does not — and the name, or the single value the file gives it, carries the rest. So a page object
 * that happens to hold a `componentRef` is left alone rather than half-covered.
 */
function isFixture(context: RuleContext, receiver: EsIdentifier): boolean {
  if (FIXTURE_NAME.test(receiver.name)) {
    return true;
  }

  const bound = boundValueOf(context.sourceCode.getScope(receiver), receiver);

  return bound !== undefined && buildsFixture(bound);
}

/** Whether a value is a fixture as it was created — `TestBed.createComponent(X)`, `renderShallow(X).fixture`. */
function buildsFixture(node: EsNode): boolean {
  const call = isMemberExpression(node) ? node.object : node;

  if (!isCallExpression(call)) {
    return false;
  }

  const called = isIdentifier(call.callee) ? call.callee.name : memberName(call.callee);

  return called !== undefined && FIXTURE_SOURCES.has(called);
}

/** The statements around one of them — the list it sits in, or the statement alone under a branch. */
function siblings(statement: EsNode): EsNode[] {
  const body: unknown = Reflect.get(statement.parent, 'body');

  return Array.isArray(body) ? body : [statement];
}

/** Whether nothing but whitespace separates two statements, so joining them drops no comment. */
function adjacent(context: RuleContext, before: EsNode, after: EsNode): boolean {
  return context.sourceCode.getText().slice(before.range[1], after.range[0]).trim() === '';
}

/**
 * The run starting at `statements[index]`: every statement below it that sets a *different* input on
 * the same fixture.
 *
 * It stops at the first statement that is anything else, at a comment between two of them — a
 * comment above the third `setInput` is about that input, and merging the calls would leave it
 * hanging over a line that no longer exists — and at an input the run has already set, which is a
 * spec changing a value rather than naming another one.
 */
function runFrom(context: RuleContext, first: InputCall, statements: EsNode[], index: number): Run {
  const calls = [first];
  const keys = new Set([first.key]);
  let last = first;

  for (let at = index + 1; at < statements.length; at += 1) {
    const next = inputCallOf(context, statements[at]);

    if (!next) {
      break;
    }

    if (next.receiver.name !== first.receiver.name || keys.has(next.key) || !adjacent(context, last.statement, next.statement)) {
      break;
    }

    calls.push(next);
    keys.add(next.key);
    last = next;
  }

  return { calls, first, last };
}

/**
 * Every run in one list of statements, keyed by the statement each one starts.
 *
 * Read forwards in one pass rather than asked of each call on its own: whether a call starts a run
 * depends on where the run above it ended, and reading backwards from each call has to re-derive
 * that — the shape that first let the call between two stopped runs go unreported.
 */
function runsIn(context: RuleContext, statements: EsNode[]): Map<EsNode, Run> {
  const runs = new Map<EsNode, Run>();

  for (let index = 0; index < statements.length; index += 1) {
    const call = inputCallOf(context, statements[index]);

    if (call && isFixture(context, call.receiver)) {
      const run = runFrom(context, call, statements, index);

      runs.set(call.statement, run);
      index += run.calls.length - 1;
    }
  }

  return runs;
}

/** Whether a statement is `fixture.detectChanges()` on the same fixture — a pass `stable()` already runs. */
function isDetectChanges(statement: EsNode | undefined, receiver: EsIdentifier): boolean {
  if (!statement || !isExpressionStatement(statement) || !isCallExpression(statement.expression)) {
    return false;
  }

  const { callee } = statement.expression;
  const object = isMemberExpression(callee) ? callee.object : callee;

  return (
    memberName(callee) === 'detectChanges' &&
    statement.expression.arguments.length === 0 &&
    isIdentifier(object) &&
    object.name === receiver.name
  );
}

/**
 * The `detectChanges()` directly under a run, when there is one to drop.
 *
 * An argument keeps it: `detectChanges(false)` is a pass that skips the check-no-changes assertion,
 * which is not the pass `stable()` runs.
 */
function trailingDetectChanges(context: RuleContext, run: Run): EsNode | undefined {
  const body = siblings(run.last.statement);
  const next = body[body.indexOf(run.last.statement) + 1];

  return next && isDetectChanges(next, run.first.receiver) && adjacent(context, run.last.statement, next) ? next : undefined;
}

/** `{ name: value, other: value }` — every key as the call spelled it, quoted when it has to be. */
function inputsLiteral(context: RuleContext, run: Run): string {
  const entries = run.calls.map(({ key, value }) => {
    const name = PLAIN_KEY.test(key) ? key : `'${key}'`;

    return `${name}: ${context.sourceCode.getText(value)}`;
  });

  return `{ ${entries.join(', ')} }`;
}

/**
 * Replace the whole run with one `await setInputs(…)`, and import the helper if the file lacks it.
 *
 * Offered, never applied: see the note at the top of this file for the 57 files that says it with a
 * number.
 */
function rewrite(context: RuleContext, run: Run, callback: EsNode): (fixer: EsFixer) => EsFix[] {
  return (fixer: EsFixer): EsFix[] => {
    const end = (trailingDetectChanges(context, run) ?? run.last.statement).range[1];
    const call = `await ${HELPER}(${run.first.receiver.name}, ${inputsLiteral(context, run)});`;
    const fixes = [fixer.replaceTextRange([run.first.statement.range[0], end], call)];

    if (Reflect.get(callback, 'async') !== true) {
      fixes.push(fixer.insertTextBeforeRange([callback.range[0], callback.range[0]], 'async '));
    }

    if (bindingState(context.sourceCode.getScope(run.first.statement), HELPER) === 'free') {
      fixes.push(importNamed(fixer, run.first.statement, HELPER, ANGULAR));
    }

    return fixes;
  };
}

export const preferSetInputs: RuleModule = defineRule({
  anchor: '-a-components-children',
  description: 'Move a rendered component’s inputs with setInputs(), which resolves every name before it writes one',
  hasSuggestions: true,
  messages: {
    preferSetInputs:
      '`componentRef.setInput` answers a name the component does not declare with an `NG0303` on the console and **no change at all**, so a typo, an input renamed under the spec, or an alias written as its class-field name all end the same way: green `setInput` calls, and an assertion that fails several lines later on state nothing moved. `setInputs(fixture, { name: value })` from `vitest-auto-spy/angular` resolves every key against the compiled definition before it writes the first one — a rejected call leaves the component exactly as it was and names the inputs it really has — and it types the value, which is what turns a fixture that has drifted from its model into a compile error instead of a passing test. It ends in `stable(fixture)`, so the `fixture.detectChanges()` underneath goes with the call: that flushes effects and awaits the fixture, where one `detectChanges()` pass does neither. A suite that cannot await in its hooks keeps the call in the test: `const render = async () => { …; await setInputs(fixture, { … }); }`, awaited first thing in each `it`.',
  },
  create: (context) => {
    // Runs are read per statement list, once, and every call of one answers from the same reading.
    const lists = new Map<EsNode, Map<EsNode, Run>>();

    return {
      CallExpression: (node: EsCallExpression): void => {
        const call = readInputCall(context, node);

        if (!call || !isFixture(context, call.receiver)) {
          return;
        }

        const list = lists.get(call.statement.parent) ?? runsIn(context, siblings(call.statement));

        lists.set(call.statement.parent, list);

        // A call the run above it already carries is reported through that run, not again here.
        const run = list.get(call.statement);

        if (!run) {
          return;
        }

        const callback = enclosingFunction(node);
        // A file that declares its own `setInputs` is not this one's, whatever it is called, so the
        // report stays and the edit does not.
        const rewritable =
          callback && isHookCallback(callback) && bindingState(context.sourceCode.getScope(node), HELPER) !== 'taken'
            ? callback
            : undefined;
        const report = { node, messageId: 'preferSetInputs' };

        context.report(rewritable ? { ...report, suggest: [{ desc: EDIT, fix: rewrite(context, run, rewritable) }] } : report);
      },
    };
  },
});
