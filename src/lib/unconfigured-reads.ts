/**
 * The read side of strict mode: a spied getter nobody configured answers `undefined`, and an
 * observable property nobody fed never emits. Neither throws where it happens — a double that lands
 * in a failure diff is read by the formatter, and a throw there would break the very message it
 * belongs to — so reads are noted while a test runs and judged by `setupAutoSpy` after it.
 */
import * as DOCS_LINKS from './docs-links';
import { defaultStrict } from './function-spy';
import { type GuardReaction, reactToFindings } from './guard-reaction';
import { withDocs } from './message-link';
import { count, taskName } from './message-text';
import { type UnfedSubscriptionListener, requireObservableSupport } from './observable-support';
import type { UnstubbedRead, UnstubbedReadHandler } from './types';

/** Where one double's unconfigured reads go: its class name for the report, and the handler that takes them instead, if any. */
export interface ReadGuard {
  readonly className: string | undefined;
  readonly handle: UnstubbedReadHandler | undefined;
}

interface ReadEntry {
  readonly guard: ReadGuard;
  readonly member: string;
  readonly kind: UnstubbedRead['kind'];
  readonly stillUnconfigured: (() => boolean) | undefined;
  count: number;
  /** Every window open at any of its reads: the tests that may have made them. */
  suspects: readonly object[];
}

interface ReadLedger {
  reported: boolean;
  handler: UnstubbedReadHandler | undefined;
  open: boolean;
  // Replaced rather than mutated, so an entry can keep the array it was read under at no cost.
  windows: readonly object[];
  readonly entries: Map<object, ReadEntry>;
}

// On `globalThis` for the same reason as the strict default: `/setup` and the factory bundles each carry this module.
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyUnconfiguredReads__: ReadLedger | undefined;
}

/** The window of a caller that hands no test context: it stands alone and resets the ledger. */
const UNNAMED_WINDOW: object = {};

let sharedLedger: ReadLedger | undefined;

function ledger(): ReadLedger {
  return (sharedLedger ??= globalThis.__vitestAutoSpyUnconfiguredReads__ ??=
    {
      reported: false,
      handler: undefined,
      open: false,
      windows: [],
      entries: new Map(),
    });
}

/** Install (or, with `false` and `undefined`, remove) the suite-wide half: whether strict doubles are reported, and the global handler. */
export function setUnconfiguredReadsDefault(reported: boolean, handler: UnstubbedReadHandler | undefined): void {
  const current = ledger();

  current.reported = reported;
  current.handler = handler;
}

/**
 * The guard a double hands to its tracked members, or nothing when none of its reads would go anywhere.
 *
 * The same precedence as the call guard: the double's own handler, its explicit `strict: false`, the
 * global handler, then `strict` — which only reports while `setupAutoSpy` asked for the report.
 */
export function resolveReadGuard(
  className: string | undefined,
  config: { strict?: boolean | undefined; onUnstubbedRead?: UnstubbedReadHandler | undefined },
): ReadGuard | undefined {
  const { reported, handler } = ledger();
  const handle = config.onUnstubbedRead ?? (config.strict === false ? undefined : handler);

  if (handle) {
    return { className, handle };
  }

  return reported && (config.strict ?? defaultStrict()) ? { className, handle: undefined } : undefined;
}

function noteRead(
  token: object,
  guard: ReadGuard,
  member: string,
  kind: UnstubbedRead['kind'],
  stillUnconfigured: (() => boolean) | undefined,
): void {
  const current = ledger();

  if (!current.open) {
    return;
  }

  const entry = current.entries.get(token);

  if (entry) {
    entry.count += 1;

    if (entry.suspects !== current.windows) {
      entry.suspects = [...new Set([...entry.suspects, ...current.windows])];
    }

    return;
  }

  current.entries.set(token, { guard, member, kind, stillUnconfigured, count: 1, suspects: current.windows });
}

/**
 * The scaffold getter of a tracked member. The host mock reaches it only when nothing replaced its
 * implementation, so reaching it is what "nothing configured this getter" means.
 */
export function unconfiguredGetter(guard: ReadGuard, member: string): () => undefined {
  const getter = function unconfiguredGetter(): undefined {
    noteRead(getter, guard, member, 'getter', undefined);

    return undefined;
  };

  return getter;
}

/**
 * An observable property spy that notes a subscription nothing had fed yet. Judged at the end of the
 * test rather than at the subscription, because a stream fed later still delivers to it.
 */
export function createTrackedPropSpy(member: string, guard: ReadGuard | undefined): object {
  const support = requireObservableSupport();

  if (!guard) {
    return support.createPropSpy(undefined, member);
  }

  const listener: UnfedSubscriptionListener = (stillUnfed) => {
    noteRead(listener, guard, member, 'observable', stillUnfed);
  };

  return support.createPropSpy(listener, guard.className === undefined ? member : `${guard.className}.${member}`);
}

function taskOf(context: unknown): object | undefined {
  const task: unknown = Reflect.get(Object(context), 'task');

  return typeof task === 'object' && task !== null ? task : undefined;
}

function runsConcurrently(task: object): boolean {
  return Reflect.get(task, 'concurrent') === true;
}

// The runner stamps `result.duration` after a test's last hook: a window still open then lost its report step.
function finished(task: object): boolean {
  return typeof Reflect.get(Object(Reflect.get(task, 'result')), 'duration') === 'number';
}

function setWindows(current: ReadLedger, windows: readonly object[]): void {
  current.windows = windows;
  current.open = windows.length > 0;
}

/**
 * Start counting: called before the first hook of every test, with that hook's context.
 *
 * A read is noted from the double's own getter, inside the code under test, where nothing says which
 * `test.concurrent` made it — so a concurrent test's window stays open beside the others in flight,
 * and a read made while several are open names them all. A test that is not concurrent, or a caller
 * that hands no context, cannot overlap anything and starts from an empty ledger.
 */
export function openReadWindow(context?: unknown): void {
  const current = ledger();
  const task = taskOf(context);

  if (task === undefined || !runsConcurrently(task)) {
    current.entries.clear();
    setWindows(current, [task ?? UNNAMED_WINDOW]);

    return;
  }

  const live = current.windows.filter((window) => window !== task && runsConcurrently(window) && !finished(window));

  // What only a stale window, or this test's own earlier attempt, read has no report step left to reach it.
  for (const [token, entry] of current.entries) {
    if (!entry.suspects.some((window) => live.includes(window))) {
      current.entries.delete(token);
    }
  }

  setWindows(current, [...live, task]);
}

function describeAdvice(target: string, member: string, kind: UnstubbedRead['kind'], reads: number): string {
  return kind === 'getter'
    ? `[vitest-auto-spy] ${target} was read ${count(reads, 'time')} on a strict double and nothing configured it, so the code under test got undefined.\n` +
        `Configure it in the test: accessorSpies.getters.${member}.mockReturnValue(…), or mockReturnValue(undefined) when undefined is the answer meant.`
    : `[vitest-auto-spy] ${target} was subscribed to ${count(reads, 'time')} on a strict double and never emitted.\n` +
        `Feed it in the test: ${member}.nextWith(…), or seed overrides: { ${member}: new Subject() } and drive that Subject; ` +
        `overrides: { ${member}: NEVER } when this test never fires it.`;
}

function describeSuspects(suspects: readonly object[]): string {
  if (suspects.length < 2) {
    return '';
  }

  const names = suspects.map((task) => `"${taskName(task)}"`).join(', ');

  return (
    `\nIt happened while ${suspects.length} concurrent tests were in flight (${names}), and a read does not say which test made it; ` +
    'it is reported once, as the last of them finishes.'
  );
}

function describeRead({ guard, member, kind, count: reads, suspects }: ReadEntry): string {
  const target = guard.className === undefined ? member : `${guard.className}.${member}`;

  return describeAdvice(target, member, kind, reads) + describeSuspects(suspects);
}

/** Close the test's window and hand back the reads no window still open may claim. */
function closeReadWindow(current: ReadLedger, task: object | undefined): ReadEntry[] {
  const windows = task === undefined ? [] : current.windows.filter((window) => window !== task);

  setWindows(current, windows);

  if (windows.length === 0) {
    const all = [...current.entries.values()];

    current.entries.clear();

    return all;
  }

  const settled: ReadEntry[] = [];

  for (const [token, entry] of current.entries) {
    if (!entry.suspects.some((window) => windows.includes(window))) {
      settled.push(entry);
      current.entries.delete(token);
    }
  }

  return settled;
}

/**
 * Stop counting and judge what the test read: a double's handler takes its own findings, the rest are
 * reported. Exported for the spec, since a real finding under `'throw'` fails the test doing the asserting.
 *
 * A read made while other concurrent tests were in flight waits for the last of them: judged sooner, a
 * stream one of them feeds later would be a false finding, and judged by each it would fail them all.
 */
export function reportUnconfiguredReads(reaction: GuardReaction, context?: unknown): void {
  const found = closeReadWindow(ledger(), taskOf(context)).filter((entry) => entry.stillUnconfigured?.() ?? true);
  const lines: string[] = [];

  for (const entry of found) {
    const { guard, member, kind } = entry;

    if (guard.handle) {
      guard.handle({ className: guard.className, member, kind, count: entry.count });
    } else {
      lines.push(describeRead(entry));
    }
  }

  if (reaction !== 'off' && lines.length > 0) {
    reactToFindings([withDocs(lines.join('\n'), DOCS_LINKS.unconfiguredReads)], reaction);
  }
}
