/**
 * The Vue / Pinia recipe, proven runnable on Vitest. The headline use case is
 * spying a class-based Pinia store's actions; the same pattern covers a
 * class-based service injected via `provide`/`inject`.
 *
 * No `vue` / `pinia` / `@vue/test-utils` imports: the recipe is dependency-free,
 * and the Vue glue (`mount`, `global.provide`, `defineStore`) is illustrative,
 * not under test. The `provideAutoSpy` helper *is* under test here.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSpyFromClass } from './create-spy-from-class';
import { registerMockAdapter } from './mock-adapter';
import type { Spy } from './types';
import { vitestMockAdapter } from './vitest-adapter';
import { provideAutoSpy } from './vue';

// The `vitest-auto-spy/vue` entry registers this on import; do it directly so
// the spec stays isolated from any public entry (matching the other adapter specs).
registerMockAdapter(vitestMockAdapter);

/** A class-based Pinia store — its methods are the store's actions/getters. */
class CartStore {
  itemCount(): number {
    return 0;
  }

  addItem(_sku: string, _qty: number): void {
    // real implementation irrelevant — the spy replaces it
  }

  checkout(_token: string): Promise<{ orderId: string }> {
    return Promise.resolve({ orderId: '' });
  }
}

/** A class-based service you'd hand to a component via `provide`/`global.provide`. */
class UserService {
  getName(id: number): string {
    return String(id);
  }
}

const USER_SERVICE_KEY = Symbol('UserService');

describe('Vue / Pinia recipe — spy the store/service, not the component', () => {
  it('auto-spies every Pinia store action as a mock fn', () => {
    const store: Spy<CartStore> = createSpyFromClass(CartStore);

    expect(vi.isMockFunction(store.itemCount)).toBe(true);
    expect(vi.isMockFunction(store.addItem)).toBe(true);
    expect(vi.isMockFunction(store.checkout)).toBe(true);

    // Actions are inert until configured (no real store logic runs).
    expect(store.itemCount()).toBeUndefined();
  });

  it('drives a getter-style action with mockReturnValue and calledWith', () => {
    const store: Spy<CartStore> = createSpyFromClass(CartStore);

    store.itemCount.mockReturnValue(3);
    expect(store.itemCount()).toBe(3);

    const user: Spy<UserService> = createSpyFromClass(UserService);
    user.getName.calledWith(1).mockReturnValue('Fake Name');
    expect(user.getName(1)).toBe('Fake Name');
    expect(user.getName(99)).toBeUndefined();
  });

  it('controls an async store action with resolveWith', async () => {
    const store: Spy<CartStore> = createSpyFromClass(CartStore);

    store.checkout.resolveWith({ orderId: 'ord_42' });

    await expect(store.checkout('tok_abc')).resolves.toEqual({ orderId: 'ord_42' });
  });

  it('records action calls for assertion', () => {
    const store: Spy<CartStore> = createSpyFromClass(CartStore);

    store.addItem('SKU-1', 2);

    expect(store.addItem).toHaveBeenCalledTimes(1);
    expect(store.addItem).toHaveBeenCalledWith('SKU-1', 2);
  });

  it('provideAutoSpy builds a global.provide entry keyed by the injection token', () => {
    const provide = provideAutoSpy(USER_SERVICE_KEY, UserService);

    // The value at the token is a fully-typed Spy<UserService>, ready for
    // mount(Cmp, { global: { provide } }).
    expect(vi.isMockFunction(provide[USER_SERVICE_KEY].getName)).toBe(true);

    provide[USER_SERVICE_KEY].getName.mockReturnValue('Fake Name');
    expect(provide[USER_SERVICE_KEY].getName(1)).toBe('Fake Name');
  });

  it('provideAutoSpy forwards the spy configuration (string token)', () => {
    const provide = provideAutoSpy('cart', CartStore, ['itemCount']);

    expect(vi.isMockFunction(provide.cart.itemCount)).toBe(true);
    // addItem was not in the methodsToSpyOn list, so it is not spied.
    expect(provide.cart.addItem).toBeUndefined();
  });
});
