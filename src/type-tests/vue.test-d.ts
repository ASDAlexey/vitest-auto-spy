import { expectTypeOf, it } from 'vitest';
import type { InjectionKey } from 'vue';

import { type Spy, createSpyFromClass, provideAutoSpy } from '../vue';

class Users {
  name(): string {
    return 'Ada';
  }
}

class Cart {
  total(): number {
    return 0;
  }
}

declare const userKey: InjectionKey<Users>;
declare const cartKey: InjectionKey<Cart>;
declare const selected: 'backup' | 'users';

it('narrows a union token but reads a literal token directly', () => {
  expectTypeOf(provideAutoSpy('users', Users).users).toEqualTypeOf<Spy<Users>>();

  const provide = provideAutoSpy(selected, Users);

  // @ts-expect-error -- only the selected key is present.
  provide.users.name();

  if ('users' in provide) {
    expectTypeOf(provide.users).toEqualTypeOf<Spy<Users>>();
  } else {
    expectTypeOf(provide.backup).toEqualTypeOf<Spy<Users>>();
  }
});

it('keeps typed spies when combining Vue injection keys', () => {
  const providedUsers = provideAutoSpy(userKey, Users);
  expectTypeOf(providedUsers[userKey]).toEqualTypeOf<Spy<Users> | undefined>();

  const users = createSpyFromClass(Users);
  const cart = createSpyFromClass(Cart);
  const provide = { [userKey]: users, [cartKey]: cart };

  users.name.mockReturnValue('Ada');
  cart.total.mockReturnValue(42);
  expectTypeOf(provide).toExtend<Record<symbol, Spy<Cart> | Spy<Users>>>();
});
