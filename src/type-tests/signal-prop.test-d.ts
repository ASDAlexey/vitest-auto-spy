/**
 * Type-level tests for the two overloads of `mockSignalProp` and `mockResourceProp`: the checked one
 * takes the value type from a public property, and the loose one reaches a signal the public type
 * does not describe — never a public key, whose value check it would otherwise switch off.
 */
import { type ResourceRef, type Signal, type WritableSignal } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { mockResourceProp, mockSignalProp } from '../angular';

declare class DraftComponent {
  readonly title: Signal<string>;
  protected readonly saving: Signal<boolean>;
  protected readonly drafts: ResourceRef<string[]>;
}

declare const component: DraftComponent;

describe('mockSignalProp', () => {
  it('checks the value of a public signal against the property', () => {
    expectTypeOf(mockSignalProp(component, 'title', 'Hi')).toEqualTypeOf<WritableSignal<string>>();

    // @ts-expect-error -- a public signal still takes its own value type
    mockSignalProp(component, 'title', 42);
  });

  it('reaches a protected signal, typed from the value it is given', () => {
    expectTypeOf(mockSignalProp(component, 'saving', true)).toEqualTypeOf<WritableSignal<boolean>>();
  });
});

describe('mockResourceProp', () => {
  it('reaches a protected resource, typed from the value it is given', () => {
    expectTypeOf(mockResourceProp(component, 'drafts', ['a']).set)
      .parameter(0)
      .toEqualTypeOf<string[]>();
  });
});
