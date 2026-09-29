import { InjectionToken } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { provideAutoSpyForToken } from '../angular';
import { type Spy, createAutoMock, createSpyFromClass, createSpyFromInstance, registerAutoSpyDefaults } from '../auto-spy';

class CartStore {
  readonly count = 0;

  add(_id: number): void {
    /* real implementation */
  }

  total(): number {
    return 0;
  }
}

describe('returnsUndefined', () => {
  it('names methods of the doubled type on every factory', () => {
    expectTypeOf(createSpyFromClass(CartStore, { strict: true, returnsUndefined: ['add', 'total'] })).toEqualTypeOf<Spy<CartStore>>();
    createSpyFromInstance(new CartStore(), { returnsUndefined: ['add'] });
    createAutoMock<CartStore>(undefined, { returnsUndefined: ['add'] });
    registerAutoSpyDefaults(CartStore, { returnsUndefined: ['add'] });
    provideAutoSpyForToken(new InjectionToken<CartStore>('CART'), undefined, { returnsUndefined: ['add'] });
  });

  it('rejects a member that is not a method', () => {
    // @ts-expect-error -- `count` is data
    createSpyFromClass(CartStore, { returnsUndefined: ['count'] });
    // @ts-expect-error -- `count` is data
    createAutoMock<CartStore>(undefined, { returnsUndefined: ['count'] });
  });
});
