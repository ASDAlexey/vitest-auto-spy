import { describe, expect, it, vi } from 'vitest';

import { asSpy, createSpyFromClass } from '../svelte';
import { CartStore, cartStore as singleton } from './svelte-cart-store.mock';
import type { Spy } from './types';

vi.mock(import('./svelte-cart-store.mock'), async (importOriginal) => {
  const original = await importOriginal();
  const { asInstance, createSpyFromClass } = await import('../svelte');

  return { ...original, cartStore: asInstance(createSpyFromClass(original.CartStore)) };
});

describe('svelte recipe', () => {
  it('checks out through the mocked module singleton on click', () => {
    const store = asSpy(singleton);
    const button = document.createElement('button');

    button.addEventListener('click', () => void singleton.checkout());
    store.checkout.resolveWith('paid');
    button.click();

    expect(store.checkout).toHaveBeenCalledTimes(1);
  });

  it('createSpyFromClass turns every store method into a mock fn', () => {
    const cartStore: Spy<CartStore> = createSpyFromClass(CartStore);

    expect(vi.isMockFunction(cartStore.add)).toBe(true);
    expect(vi.isMockFunction(cartStore.total)).toBe(true);
    expect(vi.isMockFunction(cartStore.checkout)).toBe(true);
  });

  it('return-control helpers drive what the component sees', async () => {
    const cartStore: Spy<CartStore> = createSpyFromClass(CartStore);

    cartStore.total.mockReturnValue(3);
    expect(cartStore.total()).toBe(3);

    cartStore.priceOf.calledWith('apple').mockReturnValue(7);
    expect(cartStore.priceOf('apple')).toBe(7);

    cartStore.checkout.resolveWith('paid');
    await expect(cartStore.checkout()).resolves.toBe('paid');

    cartStore.add('apple');
    expect(cartStore.add).toHaveBeenCalledWith('apple');
  });
});
