import { ElementRef, type WritableSignal, signal, viewChild, viewChildren } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { type ElementRefPropStub, mockElementRefProp } from '../angular-doubles';

class Queries {
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  readonly required = viewChild.required<ElementRef<HTMLInputElement>>('required');
  readonly multiple = viewChildren<ElementRef<HTMLButtonElement>>('multiple');
  readonly count = signal(0);
  readonly absent = signal(undefined);
  readonly text = 'text';
}

declare const component: Queries;

describe('mockElementRefProp', () => {
  it('infers an optional native element and keeps the optional query handle', () => {
    const trigger = mockElementRefProp(component, 'trigger');
    expectTypeOf(trigger).toEqualTypeOf<ElementRefPropStub<HTMLButtonElement>>();
    expectTypeOf(trigger.element).toEqualTypeOf<HTMLButtonElement>();
    expectTypeOf(trigger.ref).toEqualTypeOf<ElementRef<HTMLButtonElement>>();
    expectTypeOf(trigger.query).toEqualTypeOf<WritableSignal<ElementRef<HTMLButtonElement> | undefined>>();
    trigger.query.set(undefined);
    // @ts-expect-error -- input references cannot drive a button query
    trigger.query.set(new ElementRef(document.createElement('input')));
  });

  it('preserves required query values', () => {
    const input = mockElementRefProp(component, 'required', { overrides: { value: 'draft' } });
    expectTypeOf(input.element).toEqualTypeOf<HTMLInputElement>();
    expectTypeOf(input.query).toEqualTypeOf<WritableSignal<ElementRef<HTMLInputElement>>>();
    // @ts-expect-error -- required queries cannot be absent
    input.query.set(undefined);
  });

  it('checks options against the query rather than widening its element type', () => {
    mockElementRefProp(component, 'trigger', { elementClass: HTMLButtonElement, overrides: { disabled: true } });
    // @ts-expect-error -- options cannot turn a button query into an input query
    mockElementRefProp(component, 'trigger', { elementClass: HTMLInputElement });
    // @ts-expect-error -- a button has no input valueAsNumber property
    mockElementRefProp(component, 'trigger', { overrides: { valueAsNumber: 1 } });
  });

  it('rejects other signal values, plural queries, ordinary properties and absent keys', () => {
    // @ts-expect-error -- plural query values are arrays
    mockElementRefProp(component, 'multiple');
    // @ts-expect-error -- number signals are not element references
    mockElementRefProp(component, 'count');
    // @ts-expect-error -- undefined alone does not describe an element query
    mockElementRefProp(component, 'absent');
    // @ts-expect-error -- non-signal properties are not queries
    mockElementRefProp(component, 'text');
    // @ts-expect-error -- the property must exist
    mockElementRefProp(component, 'missing');
  });
});
