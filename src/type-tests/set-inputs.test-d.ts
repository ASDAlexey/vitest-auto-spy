/**
 * Type-level tests for `setInputs`.
 *
 * The runtime half checks the names against the compiled definition, and a spec can pin that. What
 * it cannot pin is the claim this signature makes before the test runs: the keys are the
 * component's own, a signal input takes its **value** rather than the signal, and a field of the
 * wrong type is a compile error rather than a value Angular quietly refuses. All three go silently
 * the moment the parameter widens to a record, and every spec keeps passing.
 */
import { type InputSignal, type InputSignalWithTransform, type ModelSignal, type WritableSignal } from '@angular/core';
import { type ComponentFixture } from '@angular/core/testing';
import { describe, expectTypeOf, it } from 'vitest';

import { setInputs } from '../angular';

declare class CounterComponent {
  readonly step: InputSignal<number>;
  readonly label: InputSignal<string>;
  readonly total: ModelSignal<number>;
  readonly runs: WritableSignal<number>;
  /** What `input(false, { transform: booleanAttribute })` declares. */
  readonly compact: InputSignalWithTransform<boolean, unknown>;
  /** A transform of its own: the spec passes what the transform takes, not what it returns. */
  readonly due: InputSignalWithTransform<Date, number | string>;
}

declare const fixture: ComponentFixture<CounterComponent>;

describe('setInputs', () => {
  it('resolves to nothing, so a spec awaits it for the settling rather than a value', () => {
    expectTypeOf(setInputs(fixture, { step: 1 })).toEqualTypeOf<Promise<void>>();
  });

  it('takes a signal input and a model() by their value type', () => {
    void setInputs(fixture, { step: 2, label: 'busy', total: 7 });
  });

  it('rejects a name the component does not declare', () => {
    // @ts-expect-error — `steps` is not a member of the component
    void setInputs(fixture, { steps: 2 });
  });

  it('rejects the value of the wrong type under a name that does exist', () => {
    // @ts-expect-error — `step` is a number input
    void setInputs(fixture, { step: 'two' });
  });

  it('rejects the signal where the value belongs', () => {
    // @ts-expect-error — an input takes the value, never the signal
    void setInputs(fixture, { step: fixture.componentInstance.step });
  });

  it('takes a transform input by what the transform accepts', () => {
    // booleanAttribute takes unknown, so every one of these is a value Angular would transform
    void setInputs(fixture, { compact: false });
    void setInputs(fixture, { compact: '' });
    void setInputs(fixture, { due: '2026-09-12' });
    void setInputs(fixture, { due: 1_757_000_000_000 });
  });

  it('rejects the transform output where its input belongs', () => {
    // @ts-expect-error — the input takes what the transform takes, and a Date is what it returns
    void setInputs(fixture, { due: new Date() });
  });

  it('takes the stable options, and only those', () => {
    void setInputs(fixture, { step: 2 }, { timeout: 50, label: 'the counter fixture' });

    // @ts-expect-error — `detectChanges` belongs to renderShallow, not to the wait
    void setInputs(fixture, { step: 2 }, { detectChanges: false });
  });
});
