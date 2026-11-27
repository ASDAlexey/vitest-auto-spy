import { expectTypeOf, it } from 'vitest';

import { CartStore } from '../lib/svelte-cart-store.mock';
import { asInstance, createSpyFromClass } from '../svelte';

it('accepts a concrete store prop through asInstance and a public prop directly', () => {
  const store = createSpyFromClass(CartStore);

  expectTypeOf({ store: asInstance(store) }).toEqualTypeOf<{ store: CartStore }>();
  expectTypeOf({ store }).toExtend<{ store: Pick<CartStore, 'checkout' | 'total'> }>();
  expectTypeOf({ store }).not.toExtend<{ store: CartStore }>();
});
