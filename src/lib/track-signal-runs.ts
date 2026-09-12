/**
 * Counting how often a `computed()` recomputes and how often an `effect()` runs.
 *
 * "The template read `total()` six times and the computation ran once" and "changing the filter did
 * not re-run the sync effect" are the two assertions a memoisation-heavy component most wants, and
 * neither is observable from the outside: a `computed()` returns the same value whether it was
 * cached or recomputed. The usual workaround is a counter inside the computation — production code
 * edited to make a test possible, and left there.
 *
 * Angular hangs its reactive node off both handles under the `ɵSIGNAL` symbol, the same node
 * `runEffect` reaches for. A computed's node keeps the `computation` it was built with; an effect's
 * keeps the `fn` closure built around the user callback. Wrapping one of those with a counter is
 * the whole implementation — it observes the real node, so anything that makes Angular recompute is
 * counted, and nothing the spec does to the signal graph is changed by the counting.
 *
 * The wrap goes through {@link mockValueProp}, which means `restoreMockedProps()` — and therefore
 * `setupAutoSpy()` after every test — takes it off even when a spec never reaches `stop()`.
 */
import type { EffectRef, Signal } from '@angular/core';

import { DOCS_LINKS, withDocs } from './docs-links';
import { mockValueProp } from './prop-mock';
import { readReactiveNode } from './run-effect';

/** A running count of recomputations or effect runs, and the undo for the wrap that keeps it. */
export interface RunCounter {
  /** How many times the computation or the effect body has run since tracking started. */
  readonly count: number;
  /** Put the node's own member back. Calling it more than once is a no-op. */
  stop(): void;
}

const NOT_A_SIGNAL = withDocs(
  'trackRecomputations(): the argument carries no reactive node, so it is not a signal. Pass the computed() itself — ' +
    'trackRecomputations(component.total), not trackRecomputations(component.total()), which passes the value it last returned.',
  DOCS_LINKS.angular,
);

const NOT_A_COMPUTED = withDocs(
  'trackRecomputations(): this signal keeps no computation, so there is nothing to count. A signal() created with a ' +
    'value holds it rather than computing it — track the computed() that reads it, or count the effect that reacts to ' +
    'it with trackEffectRuns(). If it really is a computed(), this Angular version keeps the computation elsewhere.',
  DOCS_LINKS.angular,
);

const NOT_AN_EFFECT = withDocs(
  'trackEffectRuns(): the argument carries no reactive node, so it is not an EffectRef returned by effect(). Pass what ' +
    'effect() returned rather than the callback it was given; a field that is still undefined means the effect has not ' +
    'been created yet.',
  DOCS_LINKS.angular,
);

const UNKNOWN_EFFECT_BODY = withDocs(
  'trackEffectRuns(): this Angular version keeps the effect body somewhere this helper does not know about, so there is ' +
    'nothing to count. Count what the effect produces instead — have it write a signal, and assert that value.',
  DOCS_LINKS.angular,
);

/** One member of a reactive node, if the node still keeps it as a function. */
type NodeMember = (...args: unknown[]) => unknown;

/** Read the member this helper wraps — the one place the node's shape is assumed. */
function readMember(node: object, member: string): NodeMember | undefined {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Angular publishes no type for the reactive node; the `typeof` check below is what makes the read safe.
  const holder = node as Partial<Record<string, NodeMember>>;
  const value = holder[member];

  return typeof value === 'function' ? value : undefined;
}

/** Wrap one member of a reactive node with a counter, and hand back the reading plus the undo. */
function countCalls(node: object, member: string, original: NodeMember): RunCounter {
  let count = 0;

  const restore = mockValueProp(node, member, function (this: unknown, ...args: unknown[]): unknown {
    count += 1;

    return original.apply(this, args);
  });

  return {
    get count(): number {
      return count;
    },
    stop: restore,
  };
}

/**
 * Count how many times a `computed()` recomputes.
 *
 * Counts the computation, not the reads: a `computed()` read ten times without an input changing
 * recomputes once. A `linkedSignal()` is counted the same way — it computes from its source.
 *
 * @param source The `computed()` itself, not a call to it.
 *
 * @throws When the argument is not a signal, or is a signal with nothing to compute — each with a
 *   message naming the handle to pass instead.
 *
 * @example
 * ```ts
 * const runs = trackRecomputations(component.total);
 *
 * component.filter.set('open');
 * await stable(fixture);
 *
 * expect(runs.count).toBe(1);
 * ```
 */
export function trackRecomputations(source: Signal<unknown>): RunCounter {
  const node = readReactiveNode(source);

  if (!node) {
    throw new Error(NOT_A_SIGNAL);
  }

  const computation = readMember(node, 'computation');

  if (!computation) {
    throw new Error(NOT_A_COMPUTED);
  }

  return countCalls(node, 'computation', computation);
}

/**
 * Count how many times an `effect()` body runs.
 *
 * Every run counts, whoever asked for it: a scheduler flush, a `stable(fixture)`, a `runEffect()`
 * of the same effect.
 *
 * @param effectRef The value `effect()` returned.
 *
 * @throws When the argument is not an `EffectRef`, or when the installed Angular version keeps the
 *   effect body somewhere else — each with a message saying what to do instead.
 *
 * @example
 * ```ts
 * const runs = trackEffectRuns(component.sync);
 *
 * component.unrelatedFilter.set('open');
 * await stable(fixture);
 *
 * expect(runs.count).toBe(0);
 * ```
 */
export function trackEffectRuns(effectRef: EffectRef): RunCounter {
  const node = readReactiveNode(effectRef);

  if (!node) {
    throw new Error(NOT_AN_EFFECT);
  }

  const body = readMember(node, 'fn');

  if (!body) {
    throw new Error(UNKNOWN_EFFECT_BODY);
  }

  return countCalls(node, 'fn', body);
}
