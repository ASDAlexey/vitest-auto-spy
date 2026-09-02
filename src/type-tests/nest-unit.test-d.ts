/**
 * Type-level tests for `createNestUnit`.
 *
 * The runtime suite proves the graph is built; this proves what a caller infers from it — `unit`
 * as the class, `spies.get(Dep)` as `Spy<Dep>`, a string token as `Spy<unknown>` unless narrowed —
 * and that `expose` rejects an abstract class, which `new` could not build either. Nothing here
 * runs, so no metadata is needed.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { Spy } from '../auto-spy';
import { createNestUnit, provideAutoSpy } from '../nestjs';

class Logger {
  log(message: string): void {
    void message;
  }
}

class PricingService {
  total(items: number): number {
    return items * 10;
  }
}

abstract class PaymentGateway {
  abstract charge(amount: number): number;
}

class StripeGateway extends PaymentGateway {
  constructor(readonly logger: Logger) {
    super();
  }

  charge(amount: number): number {
    return amount;
  }
}

class CartService {
  constructor(
    readonly pricing: PricingService,
    readonly gateway: PaymentGateway,
  ) {}

  checkout(items: number): number {
    return this.gateway.charge(this.pricing.total(items));
  }
}

describe('createNestUnit', () => {
  it('hands back the unit as its class and a class token as Spy<Dep>', () => {
    const { unit, spies } = createNestUnit(CartService);

    expectTypeOf(unit).toEqualTypeOf<CartService>();
    expectTypeOf(spies.get(PricingService)).toEqualTypeOf<Spy<PricingService>>();
    expectTypeOf(spies.get(PaymentGateway)).toEqualTypeOf<Spy<PaymentGateway>>();
  });

  it('types a string or symbol token as Spy<unknown> unless the caller narrows it', () => {
    const { spies } = createNestUnit(CartService);

    expectTypeOf(spies.get('CONFIG')).toEqualTypeOf<Spy<unknown>>();
    expectTypeOf(spies.get(Symbol('FLAGS'))).toEqualTypeOf<Spy<unknown>>();
    expectTypeOf(spies.get<Logger>('LOGGER')).toEqualTypeOf<Spy<Logger>>();
  });

  it('accepts provideAutoSpy output and the three provider shapes', () => {
    createNestUnit(CartService, {
      expose: [StripeGateway],
      providers: [
        provideAutoSpy(PricingService, { onlyMethodsToSpyOn: ['total'] }),
        { provide: 'CONFIG', useValue: { currency: 'EUR' } },
        { provide: PaymentGateway, useClass: StripeGateway },
        { provide: 'FLAGS', useFactory: (): { beta: boolean } => ({ beta: true }) },
      ],
    });
  });

  it('rejects an abstract class in `expose`, since nothing could construct it', () => {
    createNestUnit(CartService, {
      // @ts-expect-error -- `PaymentGateway` is abstract; `expose` builds its entries with `new`.
      expose: [PaymentGateway],
    });
  });

  it('rejects an abstract class as the target for the same reason', () => {
    // @ts-expect-error -- the unit is built with `new`, and an abstract class has no constructor to call.
    createNestUnit(PaymentGateway);
  });

  it('rejects a provider that carries none of the three shapes', () => {
    createNestUnit(CartService, {
      // @ts-expect-error -- `{ provide }` alone is not a provider.
      providers: [{ provide: 'CONFIG' }],
    });
  });
});
