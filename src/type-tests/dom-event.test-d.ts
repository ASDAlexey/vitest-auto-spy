import { describe, expectTypeOf, it } from 'vitest';

import { type SpiedDomEvent, createDomEvent, createElementStub, createInputEvent } from '../dom-stubs';

describe('DOM handler events', () => {
  it('keeps ordinary events native and input targets precise', () => {
    expectTypeOf(createDomEvent('pointerdown')).toEqualTypeOf<Event>();
    expectTypeOf(createInputEvent('15').target).toEqualTypeOf<HTMLInputElement>();
    expectTypeOf(createInputEvent('15').target.value).toEqualTypeOf<string>();

    // @ts-expect-error -- target must be an EventTarget or null
    createDomEvent('input', { target: 'input' });
    // @ts-expect-error -- an input value is text
    createInputEvent(15);
    // @ts-expect-error -- element overrides follow HTMLInputElement
    createInputEvent('15', { element: { overrides: { disabled: 'yes' } } });
  });

  it('types the cancelling methods as mocks only under spy: true', () => {
    const event = createDomEvent('keydown', { spy: true });

    expectTypeOf(event).toEqualTypeOf<SpiedDomEvent>();
    expectTypeOf(event).toExtend<Event>();
    expectTypeOf(event.preventDefault.mock.calls).toEqualTypeOf<[][]>();
    expectTypeOf(createDomEvent('keydown', { spy: false })).toEqualTypeOf<Event>();
  });

  it('infers the stub element from elementClass, for a textarea target too', () => {
    const textarea = createElementStub({ elementClass: HTMLTextAreaElement, overrides: { value: 'note' } });

    expectTypeOf(textarea.element).toEqualTypeOf<HTMLTextAreaElement>();
    expectTypeOf(createDomEvent('input', { target: textarea.element })).toEqualTypeOf<Event>();
  });
});
