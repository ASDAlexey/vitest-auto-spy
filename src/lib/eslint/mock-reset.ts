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
 * and after the previous test's `afterEach` chain: `restoreMocks` calls `vi.restoreAllMocks()`,
 * `mockReset` calls `vi.resetAllMocks()`, `clearMocks` calls `vi.clearAllMocks()`. A hook that
 * repeats one of those is doing again what the runner has just done — and it is not free: it reads
 * as the line that keeps the suite honest, so nobody deletes it, and the next author copies it into
 * their hook too.
 *
 * **The rule is silent unless it knows the configuration, and that is the design rather than a
 * gap.** On the call alone it would be wrong in every project that leaves those options off, where
 * the hook is the only reset there is. So the options come first —
 * `{ clearMocks, restoreMocks, mockReset }` — and the search of `runner-config.ts` is the fallback.
 * With neither, nothing is reported at all.
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
 * **Why a fix is rarer than a report.** Between the runner's reset and a statement inside a hook,
 * other code may have run: the statements above it in the same hook, and every `beforeEach` of
 * every enclosing `describe`, which the hook cannot see. Whatever those touched, the reset wipes;
 * delete it and a seed survives into the test, which is a change of behaviour rather than a
 * cleanup. So `--fix` is offered only where nothing can have run in between — the first statement
 * of a `beforeEach`, in a file that holds no other `beforeEach` and no `beforeAll`. Everything else
 * is a suggestion. When the deletion would empty the hook, the hook goes with it.
 *
 * **A reset in the middle of a test body is never reported**, and that is the line this rule does
 * not cross: there the call separates one arrangement from the next inside one test, and no runner
 * option does that. The report is made only where the innermost function around the call is the
 * hook's own callback, so a reset inside an `onTestFinished(…)` the hook registers, or inside a
 * helper the hook calls, is outside the rule by construction.
 */
import { boundValueOf } from './bindings';
import { defineRule } from './define-rule';
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

/** The hooks a reset is reported in. */
const HOOKS = new Set(['afterAll', 'afterEach', 'beforeAll', 'beforeEach']);

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

/** Where the call sits in its hook, which is what decides between an edit and a suggestion. */
interface Placement {
  /** Nothing else in this hook ran before the call. */
  first: boolean;
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
    return fn.body === node ? { first: true } : undefined;
  }

  const block: EsBlockStatement = fn.body;
  const index = block.body.findIndex((statement) => isExpressionStatement(statement) && statement.expression === node);

  if (index < 0) {
    return undefined;
  }

  return block.body.length === 1 ? { first: true } : { first: index === 0, statement: block.body[index] };
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

/** Delete the reset, or the hook when the reset is all it holds. */
function removal(target: EsNode): (fixer: EsFixer) => EsFix[] {
  return (fixer: EsFixer): EsFix[] => [fixer.remove(target)];
}

const REPAIR =
  'Delete the line: the runner performs this reset itself, in `onBeforeTryTask`, before every test’s `beforeEach` chain and ' +
  'after the previous test’s `afterEach` chain, so the registry the next test starts on is the same with or without it. What ' +
  'is *not* the same is whatever ran in between — the statements above this one in the hook, and every `beforeEach` of every ' +
  'enclosing `describe` — because this call wipes that as well, which is why the deletion is an edit only where the file ' +
  'shows nothing could have run in between, and a suggestion everywhere else. A reset in the middle of a test body is a ' +
  'different thing and is never reported: there it separates one arrangement from the next inside one test.';

/** Build the report, with an edit where the deletion is provably a no-op and a suggestion otherwise. */
function describeReport(finding: Finding, dead: boolean): ReportDescriptor {
  const { fn, hook, node, placement, reset } = finding;
  const target = placement.statement ?? hookStatement(fn);
  const data = { flag: FLAG[reset.kind], hook };
  const report = { data, messageId: dead ? 'deadReset' : 'repeatedReset', node };

  if (target === undefined) {
    return report;
  }

  const desc = placement.statement ? 'Delete this reset' : `Delete this reset, and the ${hook} it is the whole of`;

  return dead ? { ...report, fix: removal(target) } : { ...report, suggest: [{ desc, fix: removal(target) }] };
}

/** `vi.clearAllMocks()` in a `beforeEach` under `clearMocks: true` → a line with nothing to do. */
export const noRedundantMockReset: RuleModule = defineRule({
  anchor: '-a-double-more-than-one-spec-uses',
  description: 'Do not repeat in a hook the mock reset the runner is configured to perform between tests',
  fixable: true,
  hasSuggestions: true,
  schema: [
    {
      type: 'object',
      properties: { clearMocks: { type: 'boolean' }, mockReset: { type: 'boolean' }, restoreMocks: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  messages: {
    deadReset:
      '`{{flag}}: true` is on, so the runner ran this very reset immediately before this {{hook}}, and this file holds nothing ' +
      `that could have run since — the line has nothing left to do. ${REPAIR}`,
    repeatedReset:
      '`{{flag}}: true` is on, so the runner performs this reset between tests and the next test starts on the same registry ' +
      `whether or not this line is here. ${REPAIR}`,
  },
  create: (context) => {
    const findings: Finding[] = [];
    let beforeHooks = 0;

    return {
      CallExpression: (node: EsCallExpression): void => {
        if (isIdentifier(node.callee) && BEFORE_HOOKS.has(node.callee.name)) {
          beforeHooks += 1;
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
          if (flags && covered(context, flags, finding.reset)) {
            const dead = finding.hook === 'beforeEach' && finding.placement.first && beforeHooks === 1;

            context.report(describeReport(finding, dead));
          }
        });
      },
    };
  },
});
