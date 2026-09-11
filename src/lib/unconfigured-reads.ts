/**
 * The read side of strict mode: a spied getter nobody configured answers `undefined`, and an
 * observable property nobody fed never emits. Neither throws where it happens — a double that lands
 * in a failure diff is read by the formatter, and a throw there would break the very message it
 * belongs to — so reads are noted while a test runs and judged by `setupAutoSpy` after it.
 */
import { DOCS_LINKS, withDocs } from './docs-links';
import { defaultStrict } from './function-spy';
import { type GuardReaction, reactToFindings } from './guard-reaction';
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
}

interface ReadLedger {
  reported: boolean;
  handler: UnstubbedReadHandler | undefined;
  open: boolean;
  readonly entries: Map<object, ReadEntry>;
}

// On `globalThis` for the same reason as the strict default: `/setup` and the factory bundles each carry this module.
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyUnconfiguredReads__: ReadLedger | undefined;
}

let sharedLedger: ReadLedger | undefined;

function ledger(): ReadLedger {
  return (sharedLedger ??= globalThis.__vitestAutoSpyUnconfiguredReads__ ??=
    {
      reported: false,
      handler: undefined,
      open: false,
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

    return;
  }

  current.entries.set(token, { guard, member, kind, stillUnconfigured, count: 1 });
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
    return support.createPropSpy();
  }

  const listener: UnfedSubscriptionListener = (stillUnfed) => {
    noteRead(listener, guard, member, 'observable', stillUnfed);
  };

  return support.createPropSpy(listener);
}

/** Start counting: called before the first hook of every test. */
export function openReadWindow(): void {
  const current = ledger();

  current.entries.clear();
  current.open = true;
}

function times(count: number): string {
  return count === 1 ? '1 time' : `${count} times`;
}

function describeRead({ guard, member, kind, count }: ReadEntry): string {
  const target = guard.className === undefined ? member : `${guard.className}.${member}`;

  return kind === 'getter'
    ? `[vitest-auto-spy] ${target} was read ${times(count)} and nothing configured it, and strict mode is on.`
    : `[vitest-auto-spy] ${target} was subscribed to ${times(count)} and nothing fed it, and strict mode is on.`;
}

const UNCONFIGURED_READS_ADVICE =
  'The getter answered undefined and the stream never emitted, so the code under test ran on without the value it depended ' +
  "on. Configure the getter — accessorSpies.getters.<name>.mockReturnValue(…), overrides: { <name>: … } or mockReadonlyProp(double, '<name>', …) — " +
  'feed the stream — nextWith(…), returnSubject(), complete() — or seed a real one through overrides. When undefined is the answer ' +
  "meant, say so: mockReturnValue(undefined). Or drop 'strict' from this double.";

/**
 * Stop counting and judge what the test read: a double's handler takes its own findings, the rest are
 * reported. Exported for the spec, since a real finding under `'throw'` fails the test doing the asserting.
 */
export function reportUnconfiguredReads(reaction: GuardReaction): void {
  const current = ledger();
  const found = [...current.entries.values()].filter((entry) => entry.stillUnconfigured?.() ?? true);
  const lines: string[] = [];

  current.entries.clear();
  current.open = false;

  for (const entry of found) {
    const { guard, member, kind, count } = entry;

    if (guard.handle) {
      guard.handle({ className: guard.className, member, kind, count });
    } else {
      lines.push(describeRead(entry));
    }
  }

  if (reaction !== 'off' && lines.length > 0) {
    reactToFindings([withDocs(`${lines.join('\n')}\n${UNCONFIGURED_READS_ADVICE}`, DOCS_LINKS.unconfiguredReads)], reaction);
  }
}
