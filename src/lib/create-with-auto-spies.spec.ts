/**
 * `createWithAutoSpies` builds a class through real Angular DI while answering every unprovided
 * token with a spy. These specs cover the three ways a dependency can arrive (constructor
 * parameter, `inject()` field, `InjectionToken`), the two ways a class can be built (with and
 * without Angular's generated factory), and the rule that explicit providers win.
 */
import { Injectable, InjectionToken, inject } from '@angular/core';
import { describe, expect, it } from 'vitest';

import '../angular';
import { createWithAutoSpies } from './create-with-auto-spies';

const CONFIG = new InjectionToken<{ apiUrl: string }>('CONFIG');
const MISSING = new InjectionToken<string>('MISSING');
const UNUSED = new InjectionToken<string>('UNUSED');

@Injectable()
class PricingService {
  total(items: number): number {
    return items * 10;
  }
}

@Injectable()
class TaxService {
  rate(): number {
    return 0.2;
  }
}

@Injectable()
class CartService {
  readonly #pricing = inject(PricingService);
  readonly config = inject(CONFIG);
  readonly optional = inject(MISSING, { optional: true });

  constructor(readonly tax: TaxService) {}

  checkout(items: number): number {
    return this.#pricing.total(items) * (1 + this.tax.rate());
  }
}

@Injectable()
class ShippingService {
  cost(): number {
    return 5;
  }
}

/** No Angular decorator, so no `ɵfac`: the helper falls back to plain construction. */
class PlainCollaborator {
  readonly pricing = inject(PricingService);
}

describe('createWithAutoSpies', () => {
  it('spies constructor parameters and `inject()` fields alike', () => {
    const { instance, spies } = createWithAutoSpies(CartService);

    spies.get(PricingService).total.mockReturnValue(100);
    spies.get(TaxService).rate.mockReturnValue(0.5);

    expect(instance.checkout(3)).toBe(150);
    expect(spies.get(PricingService).total).toHaveBeenCalledWith(3);
  });

  it('mocks an InjectionToken by type, and leaves an optional missing token null', () => {
    const { instance } = createWithAutoSpies(CartService);

    expect(instance.config).toBeDefined();
    expect(instance.optional).toBeNull();
  });

  it('lets explicit providers win over the auto-spies', () => {
    const realTax = new TaxService();
    const { instance, spies } = createWithAutoSpies(CartService, {
      providers: [{ provide: TaxService, useValue: realTax }],
    });

    spies.get(PricingService).total.mockReturnValue(10);

    expect(instance.checkout(1)).toBeCloseTo(12);
    expect(spies.get(TaxService)).toBe(realTax);
    expect(spies.autoSpiedTokens()).not.toContain(TaxService);
    expect(spies.autoSpiedTokens()).toContain(PricingService);
  });

  it('builds a class that has no Angular factory', () => {
    const { instance, spies } = createWithAutoSpies(PlainCollaborator);

    expect(instance.pricing).toBe(spies.get(PricingService));
  });

  it('exposes the injector it built, so a spec can resolve anything else the same way', () => {
    const { injector, spies } = createWithAutoSpies(CartService);

    expect(injector.get(PricingService)).toBe(spies.get(PricingService));
  });
});

describe('createWithAutoSpies: a token the instance never asked for', () => {
  it('refuses it by name instead of minting a spy nobody uses', () => {
    // The quiet failure this replaces: `injector.get` answers *anything*, so stubbing the wrong
    // token — a base class, a service the class stopped injecting — succeeded, and the assertion
    // then failed on the real collaborator several frames into the code under test.
    const { spies } = createWithAutoSpies(CartService);

    expect(() => spies.get(ShippingService)).toThrow(/spies\.get\(ShippingService\d*\): the instance never asked for that token/);
  });

  it('lists what was auto-spied, and names an InjectionToken by its description', () => {
    const { spies } = createWithAutoSpies(CartService);

    expect(() => spies.get(UNUSED)).toThrow(
      /spies\.get\(InjectionToken UNUSED\)[\s\S]*Auto-spied tokens: TaxService\d*, PricingService\d*, InjectionToken CONFIG/,
    );
  });

  it('still refuses a token the instance only asked for optionally, since it was answered with null', () => {
    // `inject(MISSING, { optional: true })` never reaches the auto-spy branch, so there is no double
    // for it — and a spec configuring one would be configuring nothing.
    const { spies } = createWithAutoSpies(CartService);

    expect(() => spies.get(MISSING)).toThrow(/the instance never asked for that token/);
  });

  it('says `(none)` rather than an empty list when nothing was auto-spied at all', () => {
    class NoDependencies {}

    const { spies } = createWithAutoSpies(NoDependencies);

    expect(() => spies.get(PricingService)).toThrow(/Auto-spied tokens: \(none\)/);
  });
});
