/**
 * Running one `effect()` body on demand.
 *
 * The instinct is to neutralise `effect()` by replacing `@angular/core`, so the callback becomes
 * something the spec holds and can call. That is not available under the Angular unit-test builder:
 * specs are bundled, `@angular/core` lands in a chunk several other chunks already depend on, and
 * substituting it re-enters that chunk mid-initialisation — the run dies with
 * `Cannot access '__vi_import_N__' before initialization` rather than with anything about mocking.
 *
 * So leave the effect real and address the effect itself. Angular hangs its reactive node off the
 * `EffectRef` under the `ɵSIGNAL` symbol, and the node keeps the closure it built around the user
 * callback. Invoking that closure runs the body exactly as the scheduler would — current signal
 * values, cleanup registration intact — without waiting for a flush and without marking the effect
 * clean, so a later flush still behaves normally.
 *
 * Compare with `flushEffects()`, which asks the scheduler to run *everything* that is currently
 * dirty. Reach for {@link runEffect} when a spec needs one specific effect to run right now,
 * typically because its trigger has been replaced with a static signal and it will never be dirty.
 */
import { type EffectRef, ɵSIGNAL } from '@angular/core';

import { DOCS_LINKS, withDocs } from './docs-links';

/** The one member of Angular's reactive node this helper needs: the closure built around the user callback. */
interface RunnableEffectNode {
  fn: () => void;
}

/**
 * Read the reactive node off a candidate `EffectRef`, without asserting anything about it.
 *
 * The parameter is `unknown` on purpose: an `EffectRef`-typed field that was never assigned is a
 * realistic argument, and `Cannot read properties of undefined` explains nothing about the mistake.
 */
function readReactiveNode(candidate: unknown): object | undefined {
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }

  const holder: Partial<Record<symbol, unknown>> = candidate;
  const node = holder[ɵSIGNAL];

  return typeof node === 'object' && node !== null ? node : undefined;
}

/** Whether the node still keeps the effect body where this helper expects it. */
function isRunnable(node: object): node is RunnableEffectNode {
  return 'fn' in node && typeof node.fn === 'function';
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

/**
 * Run the body of one effect immediately.
 *
 * @param effectRef The value `effect()` returned.
 *
 * @throws When the argument is not an `EffectRef`, or when the installed Angular version keeps the
 *   effect body somewhere else — both with a message saying what to do instead.
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

  node.fn();
}
