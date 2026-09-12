/**
 * Type-level tests for `trackRecomputations` / `trackEffectRuns`.
 *
 * Both take the handle rather than what it returns, and that is the mistake the types exist to
 * catch: `trackRecomputations(component.total())` reads as natural English and passes a number.
 */
import type { EffectRef, Signal, WritableSignal } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { type RunCounter, trackEffectRuns, trackRecomputations } from '../angular';

declare const total: Signal<number>;
declare const price: WritableSignal<number>;
declare const watch: EffectRef;

describe('trackRecomputations', () => {
  it('takes any signal handle, whatever it carries', () => {
    expectTypeOf(trackRecomputations).toBeCallableWith(total);
    expectTypeOf(trackRecomputations).toBeCallableWith(price);
  });

  it('refuses the value the signal returns', () => {
    // @ts-expect-error -- a number is not a signal; the runtime message says the same.
    trackRecomputations(total());
  });

  it('refuses a plain getter that is not a signal', () => {
    // @ts-expect-error -- `Signal<T>` is branded, so an arbitrary zero-argument function is not one.
    trackRecomputations(() => 1);
  });
});

describe('trackEffectRuns', () => {
  it('takes the EffectRef', () => {
    expectTypeOf(trackEffectRuns).toBeCallableWith(watch);
  });

  it('refuses a signal', () => {
    // @ts-expect-error -- an `EffectRef` is not a signal, and the two counters are not interchangeable.
    trackEffectRuns(total);
  });
});

describe('RunCounter', () => {
  it('reads the count and hands back an undo that returns nothing', () => {
    const runs: RunCounter = trackEffectRuns(watch);

    expectTypeOf(runs.count).toEqualTypeOf<number>();
    expectTypeOf(runs.stop).toEqualTypeOf<() => void>();
  });

  it('keeps the count read-only', () => {
    const runs = trackRecomputations(total);

    // @ts-expect-error -- the counter is an observation, not a place to write to.
    runs.count = 3;
  });
});
