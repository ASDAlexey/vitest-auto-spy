import { InjectionToken } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { createWindowSpies, provideWindowDouble } from '../angular-doubles';
import type { FunctionSpy } from '../index';

describe('createWindowSpies', () => {
  it('infers only named spies with the platform call signatures', () => {
    const spies = createWindowSpies({ location: ['reload'], parent: ['postMessage'] });
    expectTypeOf(spies.location.reload).toEqualTypeOf<FunctionSpy<Location['reload']>>();
    expectTypeOf(spies.parent.postMessage).toEqualTypeOf<FunctionSpy<Window['postMessage']>>();
    expectTypeOf(createWindowSpies(['close']).close).toEqualTypeOf<FunctionSpy<Window['close']>>();
    provideWindowDouble(new InjectionToken<Window>('window'), spies);
    spies.parent.postMessage({ type: 'close' }, '*');
    spies.location.reload.mockReturnValue(undefined);
    // @ts-expect-error — no unnamed spy is implied
    spies.location.assign;
    // @ts-expect-error — reload has no parameters
    spies.location.reload('now');
    // @ts-expect-error — preserves void return type
    spies.location.reload.mockReturnValue(1);
  });

  it('rejects misspellings, data properties and nonvoid methods', () => {
    // @ts-expect-error — unknown nested member
    createWindowSpies({ locatio: ['reload'] });
    // @ts-expect-error — unknown method
    createWindowSpies({ location: ['reloadd'] });
    // @ts-expect-error — hostname is data
    createWindowSpies({ location: ['hostname'] });
    // @ts-expect-error — confirm returns boolean
    createWindowSpies(['confirm']);
    // @ts-expect-error — a method is selected by its name, not traversed
    createWindowSpies({ close: [] });
  });
});
