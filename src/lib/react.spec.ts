/**
 * The React recipe, proven runnable on Vitest. There is no React-specific code
 * to test (the `vitest-auto-spy/react` entry is the core + the default Vitest
 * adapter), so this spec demonstrates the *pattern* the entry documents: spy a
 * class-based service/store — the kind you'd pass into a Context provider or
 * inject into a hook — and drive its return values.
 *
 * No `react` / `@testing-library/react` imports: the recipe is dependency-free,
 * and the React glue (provider/render) is illustrative, not under test.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSpyFromClass } from './create-spy-from-class';
import { registerMockAdapter } from './mock-adapter';
import type { Spy } from './types';
import { vitestMockAdapter } from './vitest-adapter';

// The `vitest-auto-spy/react` entry registers this on import; do it directly so
// the spec stays isolated from any public entry (matching the other adapter specs).
registerMockAdapter(vitestMockAdapter);

/** A class-based store you'd put behind a React Context provider. */
class CartStore {
  getItemCount(): number {
    return 0;
  }

  addItem(_sku: string, _qty: number): void {
    // real implementation irrelevant — the spy replaces it
  }

  checkout(_token: string): Promise<{ orderId: string }> {
    return Promise.resolve({ orderId: '' });
  }
}

/** A class-based service you'd inject into a custom hook. */
class PricingService {
  format(amount: number): string {
    return String(amount);
  }
}

describe('React (Testing Library) recipe — spy the class, not the component', () => {
  it('auto-spies every method as a mock fn, ready to pass into a Context provider', () => {
    const cart: Spy<CartStore> = createSpyFromClass(CartStore);

    // Every prototype method is a vi.fn() — the spy object is what you'd render with:
    // <CartContext.Provider value={cart}>{ui}</CartContext.Provider>
    expect(vi.isMockFunction(cart.getItemCount)).toBe(true);
    expect(vi.isMockFunction(cart.addItem)).toBe(true);
    expect(vi.isMockFunction(cart.checkout)).toBe(true);

    // Methods are inert until configured (no real CartStore logic runs).
    expect(cart.getItemCount()).toBeUndefined();
  });

  it('drives a return value with mockReturnValue — what the component will read', () => {
    const cart: Spy<CartStore> = createSpyFromClass(CartStore);

    cart.getItemCount.mockReturnValue(3);

    expect(cart.getItemCount()).toBe(3);
  });

  it('configures per-argument return values with calledWith', () => {
    const pricing: Spy<PricingService> = createSpyFromClass(PricingService);

    pricing.format.calledWith(1999).mockReturnValue('$19.99');

    expect(pricing.format(1999)).toBe('$19.99');
    // Unconfigured args fall through to the default (undefined).
    expect(pricing.format(5)).toBeUndefined();
  });

  it('controls async methods (e.g. an injected hook dependency) with resolveWith', async () => {
    const cart: Spy<CartStore> = createSpyFromClass(CartStore);

    cart.checkout.resolveWith({ orderId: 'ord_42' });

    await expect(cart.checkout('tok_abc')).resolves.toEqual({ orderId: 'ord_42' });
  });

  it('records calls for assertion — verify the component invoked the dependency', () => {
    const cart: Spy<CartStore> = createSpyFromClass(CartStore);

    // Simulate the component-under-test calling the injected store.
    cart.addItem('SKU-1', 2);

    expect(cart.addItem).toHaveBeenCalledTimes(1);
    expect(cart.addItem).toHaveBeenCalledWith('SKU-1', 2);
  });
});
