/**
 * Svelte recipe: there is no Svelte-specific helper to test, so this proves the
 * recipe itself — a plain class-based store/service (the shape a Svelte
 * component would import and call) becomes a fully-typed auto-spy. No `svelte`
 * or `@testing-library/svelte` import: the core is framework-agnostic.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSpyFromClass } from '../svelte';
import type { Spy } from './types';

/** A class-based store of the kind a Svelte component would consume via props/context. */
class CartStore {
  private items: string[] = [];

  add(item: string): void {
    this.items.push(item);
  }

  total(): number {
    return this.items.length;
  }

  priceOf(item: string): number {
    return item.length;
  }

  async checkout(): Promise<string> {
    return 'ok';
  }
}

describe('svelte recipe', () => {
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
