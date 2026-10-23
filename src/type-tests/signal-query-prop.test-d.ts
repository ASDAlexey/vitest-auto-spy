import { ElementRef, type WritableSignal, viewChild, viewChildren } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { mockSignalProp } from '../angular';
import { createElementStub } from '../dom-stubs';

class ChildPanel {
  close(): void {}
}

class QueryComponent {
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  readonly requiredTrigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  readonly panel = viewChild(ChildPanel);
  readonly panels = viewChildren(ChildPanel);
}

declare const component: QueryComponent;

describe('mockSignalProp with query signals', () => {
  it('keeps an optional element query optional when seeded with an element', () => {
    const stub = createElementStub<HTMLButtonElement>();
    const handle = mockSignalProp(component, 'trigger', new ElementRef(stub.element));

    expectTypeOf(handle).toEqualTypeOf<WritableSignal<ElementRef<HTMLButtonElement> | undefined>>();
    handle.set(undefined);

    // @ts-expect-error -- the native element must match the queried element
    handle.set(new ElementRef(document.createElement('input')));
  });

  it('allows an absent optional query and rejects absence for a required query', () => {
    expectTypeOf(mockSignalProp(component, 'trigger', undefined)).toEqualTypeOf<
      WritableSignal<ElementRef<HTMLButtonElement> | undefined>
    >();

    const element = createElementStub<HTMLButtonElement>().element;

    expectTypeOf(mockSignalProp(component, 'requiredTrigger', new ElementRef(element))).toEqualTypeOf<
      WritableSignal<ElementRef<HTMLButtonElement>>
    >();

    // @ts-expect-error -- required queries cannot be missing
    mockSignalProp(component, 'requiredTrigger', undefined);
  });

  it('accepts component queries and readonly collections with their own value types', () => {
    expectTypeOf(mockSignalProp(component, 'panel', new ChildPanel())).toEqualTypeOf<WritableSignal<ChildPanel | undefined>>();
    expectTypeOf(mockSignalProp(component, 'panels', [new ChildPanel()])).toEqualTypeOf<WritableSignal<readonly ChildPanel[]>>();

    // @ts-expect-error -- a component query takes its component type
    mockSignalProp(component, 'panel', {});
    // @ts-expect-error -- a plural query takes a collection
    mockSignalProp(component, 'panels', new ChildPanel());
  });
});
