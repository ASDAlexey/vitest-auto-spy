import { describe, expectTypeOf, it } from 'vitest';

import { createDomEvent, createInputEvent } from '../dom-stubs';

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
});
