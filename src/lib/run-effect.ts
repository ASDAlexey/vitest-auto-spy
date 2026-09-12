/**
 * Running one `effect()` body on demand.
 *
 * The instinct is to neutralise `effect()` by replacing `@angular/core`, so the callback becomes
 * something the spec holds and can call. Under the Angular unit-test builder that is a sharper edge
 * than it looks. The mock itself is possible, but the factory people reach for is not: the builder
 * sets `'object-rest-spread': false` unconditionally, so `{ ...actual, effect: … }` downlevels to a
 * bundle-scope `__spreadValues` helper that the hoisted factory reaches before it is initialised —
 * the run dies with `Cannot access '__vi_import_N__' before initialization`, or with
 * `__spreadValues is not a function` where code splitting is off, rather than with anything about
 * mocking. `Object.assign({}, actual, { effect: … })` compiles to something that works, at the price
 * of replacing the whole module for the file.
 *
 * So leave the effect real and address the effect itself. Angular hangs its reactive node off the
 * `EffectRef` under the `ɵSIGNAL` symbol, and the node keeps the closure it built around the user
 * callback plus the `cleanup()` that drains whatever the last run registered with `onCleanup`.
 * Angular's own runner calls the two in that order (`runEffect` in `@angular/core`'s effect chunk),
 * and so does this helper: the previous run's cleanup, then the body. What it deliberately does not
 * do is bump the node's version or clear its `dirty` flag, so a later flush still behaves normally.
 *
 * This helper used to call `fn()` alone. The cleanup never ran, which made an `onCleanup` callback
 * untestable through it and left one more closure on the node per call — all of them firing at once
 * when the component was destroyed, which a non-idempotent cleanup (`counter--`, `queue.pop()`, an
 * `unsubscribe` on a shared subject) notices.
 *
 * The pair runs inside `untracked()`, so a `computed()` or an effect that happens to be executing
 * at the call site does not adopt this effect's signal reads as its own inputs. Angular goes further
 * and makes the effect node itself the active consumer, refreshing its producer list — which is the
 * half this helper must not do, having promised not to touch the effect's own dirtiness.
 *
 * Compare with `flushEffects()`, which asks the scheduler to run *everything* that is currently
 * dirty. Reach for {@link runEffect} when a spec needs one specific effect to run right now,
 * typically because its trigger has been replaced with a static signal and it will never be dirty.
 */
import { type EffectRef, untracked, ɵSIGNAL } from '@angular/core';

import { DOCS_LINKS, withDocs } from './docs-links';

/** The two members of Angular's reactive node this helper needs, in the order its own runner calls them. */
interface RunnableEffectNode {
  cleanup: () => void;
  fn: () => void;
}

/**
 * Read the reactive node off a candidate `EffectRef` or signal, without asserting anything about it.
 *
 * The parameter is `unknown` on purpose: an `EffectRef`-typed field that was never assigned is a
 * realistic argument, and `Cannot read properties of undefined` explains nothing about the mistake.
 *
 * Shared with `track-signal-runs.ts`, which reads the same node off a different handle.
 */
export function readReactiveNode(candidate: unknown): object | undefined {
  // A signal is a function carrying the same symbol, which is why this accepts both.
  if ((typeof candidate !== 'object' && typeof candidate !== 'function') || candidate === null) {
    return undefined;
  }

  const holder: Partial<Record<symbol, unknown>> = candidate;
  const node = holder[ɵSIGNAL];

  return typeof node === 'object' && node !== null ? node : undefined;
}

/** Whether the node still keeps the effect body and its cleanup where this helper expects them. */
function isRunnable(node: object): node is RunnableEffectNode {
  return 'fn' in node && typeof node.fn === 'function' && 'cleanup' in node && typeof node.cleanup === 'function';
}

/**
 * Whether the node is gone from the collection Angular registered it in — a root effect's scheduler
 * queue, a view effect's set on the `LView`. A shape this does not recognise counts as still there.
 */
function isDetached(node: object): boolean {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the reactive node is read structurally: Angular publishes no type for it, and every member below is checked before it is used.
  const { scheduler, view } = node as { scheduler?: { queues?: Map<unknown, Set<unknown>> }; view?: unknown[] };

  if (scheduler?.queues instanceof Map) {
    return ![...scheduler.queues.values()].some((queue) => queue.has(node));
  }

  if (Array.isArray(view)) {
    return !view.some((slot) => slot instanceof Set && slot.has(node));
  }

  return false;
}

/**
 * Whether the effect has already been torn down.
 *
 * `destroy()` leaves `fn` and `cleanup` in place, so this reads the two traces it does leave and
 * insists on both. Either alone would misfire: a destroyed view drops the whole effect set, which
 * is indistinguishable from a version that keeps it elsewhere, and `consumerDestroy()` writes the
 * node's own `consumers` slot — which only a destroy does today, but which a node built by spread
 * rather than `Object.create` would carry from birth. Together they are wrong only if both change.
 */
function isDestroyed(node: object): boolean {
  return isDetached(node) && Object.hasOwn(node, 'consumers');
}

const NOT_AN_EFFECT_REF = withDocs(
  'runEffect(): the argument carries no reactive node, so it is not an EffectRef returned by effect(). ' +
    'Pass the value effect() returned — not the callback, and not a signal. A field that is still ' +
    'undefined usually means the effect is created in a lifecycle hook that has not run yet.',
  DOCS_LINKS.angular,
);

const UNKNOWN_EFFECT_SHAPE = withDocs(
  'runEffect(): this Angular version stores the effect body somewhere this helper does not know about. ' +
    'Assert what the effect produces instead — set the signals it reads, await stable(fixture), and check the result.',
  DOCS_LINKS.angular,
);

const DESTROYED_EFFECT = withDocs(
  'runEffect(): this effect has been destroyed — its view was torn down, or effectRef.destroy() was called — so Angular ' +
    'would never run it again. Move the call above fixture.destroy(), or assert what the teardown left behind instead: ' +
    'destroy() has already run the cleanup the effect registered with onCleanup.',
  DOCS_LINKS.angular,
);

/**
 * Run the body of one effect immediately, cleanup first.
 *
 * @param effectRef The value `effect()` returned.
 *
 * @throws When the argument is not an `EffectRef`, when the effect has already been destroyed, or
 *   when the installed Angular version keeps the effect body somewhere else — each with a message
 *   saying what to do instead.
 *
 * @example
 * ```ts
 * mockReadonlyProp(component, 'state', signal(State.Selected));
 *
 * runEffect(component.highlightEffect);
 *
 * expect(component.icon()).toBe('starFilled');
 * ```
 */
export function runEffect(effectRef: EffectRef): void {
  const node = readReactiveNode(effectRef);

  if (!node) {
    throw new Error(NOT_AN_EFFECT_REF);
  }

  if (!isRunnable(node)) {
    throw new Error(UNKNOWN_EFFECT_SHAPE);
  }

  if (isDestroyed(node)) {
    throw new Error(DESTROYED_EFFECT);
  }

  untracked(() => {
    node.cleanup();
    node.fn();
  });
}
