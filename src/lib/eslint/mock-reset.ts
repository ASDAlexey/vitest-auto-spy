/**
 * A reset the runner already performs, written again inside a hook.
 *
 * ```ts
 * beforeEach(() => {
 *   vi.clearAllMocks(); // ❌ `clearMocks: true` — the runner cleared them a moment ago
 *   TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] });
 * });
 * ```
 *
 * Vitest resets mocks in `onBeforeTryTask`, which runs **before** every test's `beforeEach` chain
 * and never after a test: `restoreMocks` calls `vi.restoreAllMocks()`, `mockReset` calls
 * `vi.resetAllMocks()`, `clearMocks` calls `vi.clearAllMocks()`. A `beforeEach` that opens with
 * one of those is doing again what the runner has just done — and it is not free: it reads as the
 * line that keeps the suite honest, so nobody deletes it, and the next author copies it into their
 * hook too.
 *
 * **Which hooks, and why only two.** After a file's last test nothing resets until the file is over:
 * Vitest calls `vi.restoreAllMocks()` once more at the file boundary, after every `afterAll`. So in
 * between — the `afterEach` hooks of enclosing `describe`s and every `afterAll`, the setup file's
 * included — a spy on `window`, `document` or a prototype is still installed, and a restore or a
 * reset in `afterEach` / `afterAll` is what takes it off. Those are never reported. A **clear** in
 * `afterEach` is, as its hook's last statement: the recorded calls it forgets are forgotten again
 * before the next test starts, and nothing reads them in between. `beforeAll` runs before the
 * runner's first reset, so a reset there protects the hook's own body and repeats nothing.
 *
 * **In a `beforeEach`, only where nothing ran first.** The runner's reset precedes the whole
 * `beforeEach` chain, so a `beforeEach` of an enclosing `describe`, or an earlier one beside it,
 * has run by the time this hook does — and a reset here undoes the spy or the calls it set up, which
 * is often the point. The same goes for the statements above the call in its own hook. So a reset
 * is reported only as the first statement of a `beforeEach` that no other `beforeEach` in the file
 * precedes.
 *
 * **The rule is silent unless it knows the configuration, and that is the design rather than a
 * gap.** On the call alone it would be wrong in every project that leaves those options off, where
 * the hook is the only reset there is. So the options come first —
 * `{ clearMocks, restoreMocks, mockReset }` — and the search of `runner-config.ts` is the fallback.
 * With neither, nothing is reported at all. A config found that leaves `clearMocks` out counts it on
 * where the installed Vitest is 5 or later, whose default it is.
 *
 * **The flag has to match the call, not the family.** The three options are not three grades of one
 * thing. `clearMocks` forgets the calls, `mockReset` also drops the implementation, `restoreMocks`
 * puts the original member back — over populations that differ too: `vi.restoreAllMocks()` walks
 * the spies `vi.spyOn` installed and leaves a plain `vi.fn()` untouched. So `vi.clearAllMocks()` in
 * a hook is **not** redundant under `restoreMocks: true` alone, and `vi.restoreAllMocks()` is not
 * redundant under `clearMocks: true` alone. The two subsumptions the rule does use are the provable
 * ones: `vi.resetAllMocks()` resets every registered mock, which includes clearing it; and
 * `vi.restoreAllMocks()` covers a per-mock `mockClear` / `mockReset` / `mockRestore` when the file
 * shows the receiver is a `vi.spyOn` spy, which is the population it reaches.
 *
 * **Why a fix is rarer than a report.** `--fix` is offered only where the file holds no other
 * `beforeEach` and no `beforeAll` at all; everything else is a suggestion. When the deletion would
 * empty the hook, the hook goes with it, and a statement alone on its line takes the line with it.
 *
 * **A reset in the middle of a test body is never reported**, and that is the line this rule does
 * not cross: there the call separates one arrangement from the next inside one test, and no runner
 * option does that. The report is made only where the innermost function around the call is the
 * hook's own callback, so a reset inside an `onTestFinished(…)` the hook registers, or inside a
 * helper the hook calls, is outside the rule by construction.
 */
import { boundValueOf } from './bindings';
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import {
  type EsBlockStatement,
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsFunction,
  type EsNode,
  type ReportDescriptor,
  type RuleContext,
  type RuleModule,
  enclosingFunction,
  isBlockStatement,
  isCallExpression,
  isExpressionStatement,
  isIdentifier,
  isMemberExpression,
  isRunnerCall,
  memberName,
} from './rule-types';
import { type RunnerResets, runnerResets } from './runner-config';

/** What a reset call does, and therefore which runner option has to be on for it to be dead. */
type ResetKind = 'clear' | 'reset' | 'restore';

/** The hooks a reset is reported in: the runner resets before each test, and after none. */
const HOOKS = new Set(['afterEach', 'beforeEach']);

/** The two whose bodies run before a test, and therefore the two that can seed what a reset wipes. */
const BEFORE_HOOKS = new Set(['beforeAll', 'beforeEach']);

/** `vi.…()` — the whole registry at once, which is also the call the runner makes. */
const WHOLE_REGISTRY = new Map<string, ResetKind>([
  ['clearAllMocks', 'clear'],
  ['resetAllMocks', 'reset'],
  ['restoreAllMocks', 'restore'],
]);

/** `someMock.…()` — one mock, whose kind the file does not always settle. */
const ONE_MOCK = new Map<string, ResetKind>([
  ['mockClear', 'clear'],
  ['mockReset', 'reset'],
  ['mockRestore', 'restore'],
]);

/** The option a message names, per kind. */
const FLAG: Record<ResetKind, string> = { clear: 'clearMocks', reset: 'mockReset', restore: 'restoreMocks' };

/** The member that installs a spy over a real one, whose originals `restoreMocks` puts back. */
const SPY_ON = new Set(['spyOn']);

/** A reset call, read off its callee. */
interface Reset {
  kind: ResetKind;
  /** The receiver of a per-mock call; absent for `vi.clearAllMocks()` and its two siblings. */
  receiver?: EsNode | undefined;
}

/** Where the call sits in its hook, which is what decides whether it can be redundant at all. */
interface Placement {
  /** Nothing else in this hook ran before the call. */
  first: boolean;
  /** Nothing else in this hook runs after the call. */
  last: boolean;
  /** The statement to delete — `undefined` where the reset is all the hook holds and the hook itself goes. */
  statement?: EsNode | undefined;
}

/** One report, held until the whole file has been read. */
interface Finding {
  fn: EsFunction;
  hook: string;
  node: EsCallExpression;
  placement: Placement;
  reset: Reset;
}

/** Which reset a call performs, if it performs one. */
function resetOf(node: EsCallExpression): Reset | undefined {
  const { callee } = node;

  if (!isMemberExpression(callee)) {
    return undefined;
  }

  const name = memberName(callee);

  if (name === undefined) {
    return undefined;
  }

  const whole = WHOLE_REGISTRY.get(name);

  if (whole !== undefined) {
    return isRunnerCall(node, new Set([name])) ? { kind: whole } : undefined;
  }

  const one = ONE_MOCK.get(name);

  return one === undefined ? undefined : { kind: one, receiver: callee.object };
}

/** The hook whose body *is* where this call stands — not a callback the hook handed to something else. */
function enclosingHook(node: EsNode): { fn: EsFunction; name: string } | undefined {
  const fn = enclosingFunction(node);

  if (!fn) {
    return undefined;
  }

  const call = fn.parent;
  const name = isCallExpression(call) && call.arguments[0] === fn && isIdentifier(call.callee) ? call.callee.name : undefined;

  return name !== undefined && HOOKS.has(name) ? { fn, name } : undefined;
}

/** The hook statement to delete when the reset is all the hook holds. */
function hookStatement(fn: EsFunction): EsNode | undefined {
  const call = fn.parent;

  return isExpressionStatement(call.parent) ? call.parent : undefined;
}

/**
 * Where the call stands in the hook's own body.
 *
 * `undefined` for a call that is not a statement of that body at all — one inside an `if`, inside a
 * `try`, or an argument of something else. Those are not a line to delete but a branch to think
 * about, and the rule leaves them alone.
 */
function placementOf(node: EsNode, fn: EsFunction): Placement | undefined {
  if (!isBlockStatement(fn.body)) {
    return fn.body === node ? { first: true, last: true } : undefined;
  }

  const block: EsBlockStatement = fn.body;
  const index = block.body.findIndex((statement) => isExpressionStatement(statement) && statement.expression === node);

  if (index < 0) {
    return undefined;
  }

  const last = index === block.body.length - 1;

  return block.body.length === 1 ? { first: true, last } : { first: index === 0, last, statement: block.body[index] };
}

/** The `vi.spyOn(…)` behind a configured spy — `vi.spyOn(a, 'b').mockReturnValue(1)` is still one. */
function spyRoot(node: EsNode): EsNode {
  return isCallExpression(node) && isMemberExpression(node.callee) && isCallExpression(node.callee.object)
    ? spyRoot(node.callee.object)
    : node;
}

/** Whether the file shows this receiver is a spy `vi.spyOn` installed, whose original `restoreMocks` puts back. */
function installedBySpyOn(context: RuleContext, receiver: EsNode): boolean {
  const value = isIdentifier(receiver) ? boundValueOf(context.sourceCode.getScope(receiver), receiver) : receiver;

  return value !== undefined && isRunnerCall(spyRoot(value), SPY_ON);
}

/** Whether the configured resets already do, to the mocks this call can reach, what this call does. */
function covered(context: RuleContext, flags: RunnerResets, reset: Reset): boolean {
  const restored = flags.restoreMocks && (reset.receiver === undefined || installedBySpyOn(context, reset.receiver));

  if (reset.kind === 'restore') {
    return restored;
  }

  // `restoreMocks` is only ever the answer for a spy: it walks the originals `vi.spyOn` replaced and
  // never sees a plain `vi.fn()`, which is the whole-registry case below refusing it.
  const byRestore = restored && reset.receiver !== undefined;

  return reset.kind === 'reset' ? flags.mockReset || byRestore : flags.clearMocks || flags.mockReset || byRestore;
}

/** Delete the reset, or the hook when the reset is all it holds — with its line, when it is alone on it. */
function removal(context: RuleContext, target: EsNode): (fixer: EsFixer) => EsFix[] {
  const text = context.sourceCode.getText();
  const [start, end] = target.range;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const alone = text.slice(lineStart, start).trim() === '' && text[end] === '\n';

  return (fixer: EsFixer): EsFix[] => [alone ? fixer.replaceTextRange([lineStart, end + 1], '') : fixer.remove(target)];
}

/** Whether a `beforeEach` of this file runs before `hook`: an earlier one beside it, or any of an enclosing scope. */
function precededByAnotherBeforeEach(hook: EsFunction, beforeEaches: EsCallExpression[]): boolean {
  const call = hook.parent;
  const scope = enclosingFunction(call);

  return beforeEaches.some((other) => {
    if (other === call) {
      return false;
    }

    const otherScope = enclosingFunction(other);

    if (otherScope === scope) {
      return other.range[0] < call.range[0];
    }

    return otherScope === undefined || (otherScope.range[0] <= call.range[0] && call.range[1] <= otherScope.range[1]);
  });
}

/** Whether a reset stands where nothing the file wrote can have run since the runner's own reset. */
function standsAlone(finding: Finding, beforeEaches: EsCallExpression[]): boolean {
  if (finding.hook === 'afterEach') {
    return finding.reset.kind === 'clear' && finding.placement.last;
  }

  return finding.placement.first && !precededByAnotherBeforeEach(finding.fn, beforeEaches);
}

/** How the message names the option: as the config wrote it, or as the Vitest 5 default nobody wrote. */
function settingOf(flags: RunnerResets, kind: ResetKind): string {
  return kind === 'clear' && flags.clearByDefault ? '`clearMocks` (on by default from Vitest 5)' : `\`${FLAG[kind]}: true\``;
}

/** Build the report, with an edit where the deletion is provably a no-op and a suggestion otherwise. */
function describeReport(context: RuleContext, flags: RunnerResets, finding: Finding, dead: boolean): ReportDescriptor {
  const { fn, hook, node, placement, reset } = finding;
  const target = placement.statement ?? hookStatement(fn);
  const data = { call: excerpt(context, node), setting: settingOf(flags, reset.kind), hook };
  const report = { data, messageId: dead ? 'deadReset' : 'repeatedReset', node };

  if (target === undefined) {
    return report;
  }

  const desc = placement.statement ? 'Delete this reset' : `Delete this reset, and the ${hook} it is the whole of`;

  return dead ? { ...report, fix: removal(context, target) } : { ...report, suggest: [{ desc, fix: removal(context, target) }] };
}

/** `vi.clearAllMocks()` in a `beforeEach` under `clearMocks: true` → a line with nothing to do. */
export const noRedundantMockReset: RuleModule = defineRule({
  name: 'no-redundant-mock-reset',
  description: 'Do not repeat in a hook the mock reset the runner is configured to perform between tests',
  fixable: true,
  hasSuggestions: true,
  schema: [
    {
      type: 'object',
      properties: {
        clearMocks: { type: 'boolean' },
        configFile: { type: 'string' },
        mockReset: { type: 'boolean' },
        restoreMocks: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    deadReset:
      '`{{call}}` repeats the reset {{setting}} already ran just before this `{{hook}}`, and nothing in this file runs in between, so the line does nothing. Delete it.',
    repeatedReset:
      '`{{call}}` repeats the reset {{setting}} makes the runner perform between tests, so the next test starts on the same state with or without it. Delete it.',
  },
  create: (context) => {
    const findings: Finding[] = [];
    const beforeEaches: EsCallExpression[] = [];
    let beforeHooks = 0;

    return {
      CallExpression: (node: EsCallExpression): void => {
        if (isIdentifier(node.callee) && BEFORE_HOOKS.has(node.callee.name)) {
          beforeHooks += 1;

          if (node.callee.name === 'beforeEach') {
            beforeEaches.push(node);
          }
        }

        const reset = resetOf(node);
        const hook = reset && enclosingHook(node);
        const placement = hook && placementOf(node, hook.fn);

        if (reset && hook && placement) {
          findings.push({ fn: hook.fn, hook: hook.name, node, placement, reset });
        }
      },
      'Program:exit': (): void => {
        const flags = findings.length > 0 ? runnerResets(context) : undefined;

        findings.forEach((finding) => {
          if (flags && covered(context, flags, finding.reset) && standsAlone(finding, beforeEaches)) {
            context.report(describeReport(context, flags, finding, finding.hook === 'beforeEach' && beforeHooks === 1));
          }
        });
      },
    };
  },
});
