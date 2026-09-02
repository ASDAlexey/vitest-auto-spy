/**
 * `createNestUnit` reads the metadata Nest's decorators leave on a class. Vitest compiles through
 * esbuild, which emits no `design:paramtypes`, so these specs write the metadata by hand with
 * `Reflect.defineMetadata` — byte for byte what tsc emits and what `@Inject` / `@Optional` record —
 * instead of depending on `@nestjs/common` here. The e2e check against a tsc-compiled project lives
 * outside the repository.
 */
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { registerMockAdapter } from './mock-adapter';
import { createNestUnit } from './nest-unit';
import { provideAutoSpy } from './nestjs';
import { vitestMockAdapter } from './vitest-adapter';

// The helper builds spies through the adapter registry; the `vitest-auto-spy/nestjs` entry registers
// one, the lib module itself never does.
registerMockAdapter(vitestMockAdapter);

/** What `emitDecoratorMetadata` writes for a constructor. */
function paramtypes(Class: object, types: unknown[]): void {
  Reflect.defineMetadata('design:paramtypes', types, Class);
}

/** What `@Inject(token)` on a constructor parameter records. */
function inject(Class: object, index: number, token: unknown): void {
  const existing: unknown = Reflect.getMetadata('self:paramtypes', Class);

  Reflect.defineMetadata('self:paramtypes', [...(Array.isArray(existing) ? existing : []), { index, param: token }], Class);
}

/** What `@Optional()` on a constructor parameter records. */
function optional(Class: object, index: number): void {
  const existing: unknown = Reflect.getMetadata('optional:paramtypes', Class);

  Reflect.defineMetadata('optional:paramtypes', [...(Array.isArray(existing) ? existing : []), index], Class);
}

/** What `@Inject(token)` on a property records. */
function injectProperty(Class: object, key: PropertyKey, type: unknown): void {
  const existing: unknown = Reflect.getMetadata('self:properties_metadata', Class);

  Reflect.defineMetadata('self:properties_metadata', [...(Array.isArray(existing) ? existing : []), { key, type }], Class);
}

/** What `@Optional()` on a property records. */
function optionalProperty(Class: object, key: PropertyKey): void {
  Reflect.defineMetadata('optional:properties_metadata', [key], Class);
}

interface AppConfig {
  currency: string;
}

const CONFIG = 'CONFIG';
const FLAGS = Symbol('FLAGS');

class PricingService {
  total(items: number): number {
    return items * 10;
  }
}

class TaxService {
  rate(): number {
    return 0.2;
  }
}

class Logger {
  log(message: string): void {
    void message;
  }
}

class CartService {
  constructor(
    readonly pricing: PricingService,
    readonly tax: TaxService,
    readonly config: AppConfig,
  ) {}

  checkout(items: number): number {
    return this.pricing.total(items) * (1 + this.tax.rate());
  }
}
paramtypes(CartService, [PricingService, TaxService, Object]);
inject(CartService, 2, CONFIG);

class CheckoutFacade {
  constructor(
    readonly cart: CartService,
    readonly pricing: PricingService,
  ) {}
}
paramtypes(CheckoutFacade, [CartService, PricingService]);

abstract class PaymentGateway {
  abstract charge(amount: number): number;
}

class StripeGateway extends PaymentGateway {
  constructor(readonly logger: Logger) {
    super();
  }

  charge(amount: number): number {
    this.logger.log(`charging ${amount}`);

    return amount;
  }
}
paramtypes(StripeGateway, [Logger]);

class BillingService {
  constructor(readonly gateway: PaymentGateway) {}
}
paramtypes(BillingService, [PaymentGateway]);

class NoDependencies {
  ready(): boolean {
    return true;
  }
}

describe('createNestUnit: solitary', () => {
  it('spies every constructor parameter, class and string token alike', () => {
    const { unit, spies } = createNestUnit(CartService);

    spies.get(PricingService).total.mockReturnValue(100);
    spies.get(TaxService).rate.mockReturnValue(0.5);

    expect(unit).toBeInstanceOf(CartService);
    expect(unit.checkout(3)).toBe(150);
    expect(spies.get(PricingService).total).toHaveBeenCalledWith(3);
    expect(unit.config).toBe(spies.get(CONFIG));
    expect(spies.autoSpiedTokens()).toEqual([PricingService, TaxService, CONFIG]);
    expect(spies.exposedTokens()).toEqual([]);
  });

  it('builds a class without metadata when it takes no parameters', () => {
    const { unit, spies } = createNestUnit(NoDependencies);

    expect(unit.ready()).toBe(true);
    expect(spies.autoSpiedTokens()).toEqual([]);
  });

  it('resolves a token recorded without `design:paramtypes`, which is what `@Inject` leaves under esbuild', () => {
    class EsbuildService {
      constructor(readonly pricing: PricingService) {}
    }
    inject(EsbuildService, 0, PricingService);

    const { unit, spies } = createNestUnit(EsbuildService);

    expect(unit.pricing).toBe(spies.get(PricingService));
  });

  it('unwraps `forwardRef(() => X)` under `@Inject`', () => {
    class LateBound {
      constructor(readonly pricing: PricingService) {}
    }
    paramtypes(LateBound, [undefined]);
    inject(LateBound, 0, { forwardRef: () => PricingService });

    const { unit, spies } = createNestUnit(LateBound);

    expect(unit.pricing).toBe(spies.get(PricingService));
  });

  it('answers a symbol token with a type mock', () => {
    class FlagService {
      constructor(readonly flags: { isOn(name: string): boolean }) {}
    }
    paramtypes(FlagService, [Object]);
    inject(FlagService, 0, FLAGS);

    const { unit, spies } = createNestUnit(FlagService);

    spies.get<{ isOn(name: string): boolean }>(FLAGS).isOn.mockReturnValue(true);

    expect(unit.flags.isOn('beta')).toBe(true);
  });

  it('hands `undefined` to an `@Optional()` parameter that has no injectable token', () => {
    class ReportService {
      constructor(
        readonly logger?: Logger,
        readonly config?: AppConfig,
      ) {}
    }
    paramtypes(ReportService, [Logger, Object]);
    optional(ReportService, 1);

    const { unit, spies } = createNestUnit(ReportService);

    expect(unit.logger).toBe(spies.get(Logger));
    expect(unit.config).toBeUndefined();
  });
});

describe('createNestUnit: property injection', () => {
  it('assigns the resolved token after construction', () => {
    class MailService {
      logger!: Logger;
    }
    injectProperty(MailService, 'logger', Logger);

    const { unit, spies } = createNestUnit(MailService);

    expect(unit.logger).toBe(spies.get(Logger));
  });

  it('leaves an `@Optional()` property undefined when its token is not injectable', () => {
    class AuditService {
      logger!: Logger;
      config?: AppConfig;
    }
    injectProperty(AuditService, 'logger', Logger);
    injectProperty(AuditService, 'config', Object);
    optionalProperty(AuditService, 'config');

    const { unit, spies } = createNestUnit(AuditService);

    expect(unit.logger).toBe(spies.get(Logger));
    expect(unit.config).toBeUndefined();
  });
});

describe('createNestUnit: sociable', () => {
  it('builds an exposed class for real and shares its dependencies with the unit', () => {
    const { unit, spies } = createNestUnit(CheckoutFacade, { expose: [CartService] });

    expect(unit.cart).toBeInstanceOf(CartService);
    expect(unit.cart.pricing).toBe(unit.pricing);
    expect(unit.cart.pricing).toBe(spies.get(PricingService));
    expect(spies.exposedTokens()).toEqual([CartService]);
    expect(spies.autoSpiedTokens()).toEqual([PricingService, TaxService, CONFIG]);
  });

  it('lets `providers` win over `expose`', () => {
    const cart = { checkout: vi.fn() };
    const { unit, spies } = createNestUnit(CheckoutFacade, {
      expose: [CartService],
      providers: [{ provide: CartService, useValue: cart }],
    });

    expect(unit.cart).toBe(cart);
    expect(spies.exposedTokens()).toEqual([]);
  });

  it('refuses a cycle among the classes built for real, naming the path', () => {
    class Left {
      constructor(readonly right: object) {}
    }
    class Right {
      constructor(readonly left: Left) {}
    }
    paramtypes(Left, [Right]);
    paramtypes(Right, [Left]);

    expect(() => createNestUnit(Left, { expose: [Right] })).toThrow(
      /Left -> Right -> Left is a cycle[\s\S]*does not resolve `forwardRef` cycles/,
    );
  });
});

describe('createNestUnit: providers', () => {
  it('uses a `useValue` as the dependency and returns it from `spies.get`', () => {
    const config: AppConfig = { currency: 'EUR' };
    const { unit, spies } = createNestUnit(CartService, { providers: [{ provide: CONFIG, useValue: config }] });

    expect(unit.config).toBe(config);
    expect(spies.get(CONFIG)).toBe(config);
    expect(spies.autoSpiedTokens()).toEqual([PricingService, TaxService]);
  });

  it('calls a `useFactory` once and shares the result across the graph', () => {
    const useFactory = vi.fn(() => new PricingService());
    const { unit } = createNestUnit(CheckoutFacade, { expose: [CartService], providers: [{ provide: PricingService, useFactory }] });

    expect(useFactory).toHaveBeenCalledTimes(1);
    expect(unit.pricing).toBe(unit.cart.pricing);
  });

  it('builds a `useClass` for real with its own dependencies spied', () => {
    const { unit, spies } = createNestUnit(BillingService, { providers: [{ provide: PaymentGateway, useClass: StripeGateway }] });

    expect(unit.gateway).toBeInstanceOf(StripeGateway);
    expect(unit.gateway.charge(5)).toBe(5);
    expect(spies.get(Logger).log).toHaveBeenCalledWith('charging 5');
    expect(spies.get(PaymentGateway)).toBe(unit.gateway);
  });

  it('accepts `provideAutoSpy(X, config)` output', () => {
    const tax = provideAutoSpy(TaxService, { onlyMethodsToSpyOn: ['rate'] });
    const { unit, spies } = createNestUnit(CartService, { providers: [tax] });

    expect(unit.tax).toBe(tax.useValue);
    expect(spies.get(TaxService)).toBe(tax.useValue);
    expect(spies.autoSpiedTokens()).not.toContain(TaxService);
  });

  it('lets a provider supply a token the compiler emitted as `Object`', () => {
    class Legacy {
      constructor(readonly config: AppConfig) {}
    }
    paramtypes(Legacy, [Object]);

    const config: AppConfig = { currency: 'EUR' };
    const { unit } = createNestUnit(Legacy, { providers: [{ provide: Object, useValue: config }] });

    expect(unit.config).toBe(config);
  });
});

describe('createNestUnit: what it refuses', () => {
  it('names a parameter whose type has no runtime class, and the two fixes', () => {
    class Broken {
      constructor(readonly config: AppConfig) {}
    }
    paramtypes(Broken, [Object]);

    expect(() => createNestUnit(Broken)).toThrow(
      /parameter #0 of Broken is typed as `Object`[\s\S]*`@Inject\(TOKEN\)`[\s\S]*`@Optional\(\)`/,
    );
  });

  it('recognises `undefined` as the mark of a circular import', () => {
    class Circular {
      constructor(readonly other: unknown) {}
    }
    paramtypes(Circular, [undefined]);

    expect(() => createNestUnit(Circular)).toThrow(/parameter #0 of Circular is typed as undefined — usually a circular import/);
  });

  it('names a property the same way', () => {
    class BrokenProperty {
      config!: AppConfig;
    }
    injectProperty(BrokenProperty, 'config', Object);

    expect(() => createNestUnit(BrokenProperty)).toThrow(/property `config` of BrokenProperty is typed as `Object`/);
  });

  it('explains missing metadata on a class that declares parameters', () => {
    class Undecorated {
      constructor(readonly pricing: PricingService) {}
    }

    expect(() => createNestUnit(Undecorated)).toThrow(
      /Undecorated declares 1 constructor parameter\(s\) but carries no `design:paramtypes` metadata[\s\S]*esbuild and Vite do not/,
    );
  });

  it('gives the same explanation when `reflect-metadata` is not loaded at all', () => {
    const read = Reflect.getMetadata;

    Reflect.deleteProperty(Reflect, 'getMetadata');

    try {
      expect(createNestUnit(NoDependencies).unit.ready()).toBe(true);
      expect(() => createNestUnit(CartService)).toThrow(/carries no `design:paramtypes` metadata[\s\S]*`reflect-metadata` imported before/);
    } finally {
      Reflect.set(Reflect, 'getMetadata', read);
    }
  });

  it('ends every message with the docs link', () => {
    expect(() => createNestUnit(CartService).spies.get(Logger)).toThrow(
      /\nDocs: https:\/\/asdalexey\.github\.io\/vitest-auto-spy\/adapters\/nestjs$/,
    );
  });
});

describe('createNestUnit: spies.get', () => {
  it('refuses a token the unit never asked for, listing what was auto-spied', () => {
    const { spies } = createNestUnit(CartService);

    expect(() => spies.get(Logger)).toThrow(
      /spies\.get\(Logger\): the unit never asked for that token[\s\S]*Auto-spied tokens: PricingService, TaxService, CONFIG\./,
    );
  });

  it('says `(none)` rather than an empty list when nothing was auto-spied', () => {
    const { spies } = createNestUnit(NoDependencies);

    expect(() => spies.get(Logger)).toThrow(/Auto-spied tokens: \(none\)\./);
  });

  it('refuses an exposed class, since the unit got a real instance of it', () => {
    const { spies } = createNestUnit(CheckoutFacade, { expose: [CartService] });

    expect(() => spies.get(CartService)).toThrow(/spies\.get\(CartService\): CartService is in `expose`, so the unit got a real instance/);
  });

  it('returns a provided value even when the unit did not ask for it, as the Angular helper does', () => {
    const { spies } = createNestUnit(NoDependencies, { providers: [{ provide: 'UNUSED', useValue: 1 }] });

    expect(spies.get('UNUSED')).toBe(1);
  });
});
