---
title: NestJS
description: provideAutoSpy and injectSpy(moduleRef, token) for Test.createTestingModule, and createNestUnit — the unit built from its own DI metadata with every collaborator spied — with no @nestjs dependency.
---

# NestJS

The `vitest-auto-spy/nestjs` entry ships a `{ provide, useValue }` provider tailored for
`Test.createTestingModule({ providers: [...] })`, plus a typed `injectSpy` that pulls a spy out of
the resulting `TestingModule`.

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';

const moduleRef = await Test.createTestingModule({
  providers: [provideAutoSpy(MyService), provideAutoSpy(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] })],
}).compile();

const myService = injectSpy(moduleRef, MyService);
```

Dependency-free by design: `@nestjs/common` / `@nestjs/testing` are optional peers, so the entry
describes the module reference with a minimal structural type instead of importing them.

::: warning `injectSpy` takes two arguments here
Angular's `injectSpy(token)` reads from the global `TestBed`. NestJS has no global module, so the
NestJS variant is **`injectSpy(moduleRef, token)`** — the module reference comes first.
:::

## A full spec

```ts
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy } from 'vitest-auto-spy';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';

import { AuthService } from './auth.service';
import { UserService } from './user.service';

describe('AuthService', () => {
  let moduleRef: TestingModule;
  let auth: AuthService;
  let users: Spy<UserService>;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [AuthService, provideAutoSpy(UserService)],
    }).compile();

    auth = moduleRef.get(AuthService);
    users = injectSpy(moduleRef, UserService);
  });

  it('signs in a known user', async () => {
    users.findByEmail.calledWith('ada@example.com').resolveWith({ id: 1, name: 'Ada' });

    await expect(auth.signIn('ada@example.com')).resolves.toMatchObject({ id: 1 });
    expect(users.findByEmail).toHaveBeenCalledWith('ada@example.com');
  });

  it('rejects an unknown one', async () => {
    users.findByEmail.resolveWith(null);

    await expect(auth.signIn('nobody@example.com')).rejects.toThrow('Unknown user');
  });
});
```

`AuthService` itself is provided **for real** — it is the class under test. Everything it injects is
provided as an auto-spy.

## Abstract classes and interface tokens

Nest often injects against an abstract class or a string/symbol token. `provideAutoSpy` needs a
constructor to read methods from, so give it the concrete class and re-point the token:

```ts
// abstract class as the token, concrete class as the shape
providers: [{ provide: PaymentGateway, useValue: provideAutoSpy(StripeGateway).useValue }];

// a string/symbol token
providers: [{ provide: 'PAYMENT_GATEWAY', useValue: provideAutoSpy(StripeGateway).useValue }];
```

Then read it back the way Nest resolves it:

```ts
const gateway = injectSpy(moduleRef, PaymentGateway);
```

When there is no class at all — a pure interface — use
[`createAutoMock<PaymentGateway>()`](/core/auto-mock-by-type) as the `useValue` instead; it builds
the same spy surface from the type.

## Why there is no `@nestjs` dependency

`@nestjs/common` and `@nestjs/testing` stay **your** dev dependencies. The entry describes the module
reference with a minimal structural type (`NestModuleRef` — anything with a `get(token)`), so
nothing from Nest reaches this package's runtime bundle, and `injectSpy` also works against a hand-
rolled fake in a unit test.

## Building the unit from its metadata

`createNestUnit(Target, options?)` builds the class under test from the metadata Nest's own
decorators emit, and answers every dependency nothing provided with a spy. It is
[`createWithAutoSpies`](/adapters/angular#building-a-class-with-auto-spied-dependencies) over
`design:paramtypes`, `@Inject`, `@Optional()` and property injection instead of Angular's generated
factory — and the solitary / sociable model of `@suites/unit`, without the Proxy that answers a
typo. A constructor change no longer rewrites the spec, because the provider list is derived rather
than typed.

```ts
import { createNestUnit } from 'vitest-auto-spy/nestjs';

import { CartService } from './cart.service';
import { PricingService } from './pricing.service';
import { TaxService } from './tax.service';

const { unit, spies } = createNestUnit(CartService);

spies.get(PricingService).total.mockReturnValue(100);
spies.get(TaxService).rate.mockReturnValue(0.5);

expect(unit.checkout(3)).toBe(150);
expect(spies.autoSpiedTokens()).toEqual([PricingService, TaxService]);
```

No `Test.createTestingModule`, no `compile()`, no `await`: the graph is built synchronously with
`new`, one instance per token — Nest's default singleton scope — so a dependency two classes share
is one spy. A class spy is read off the real prototype, so `spies.get(PricingService).totl` is
`undefined` rather than a fresh function; a string or symbol token has no prototype and is answered
with [`createAutoMock()`](/core/auto-mock-by-type).

`spies.get(token)` refuses a token the unit never asked for — a base class, a service a refactor
removed — and lists what was auto-spied, instead of minting a spy the unit will never see. This is
the same guard the Angular helper has, for the same reason: the wrong stub should fail at the stub.

### Sociable — `expose`

`expose` builds a collaborator for real, its own dependencies resolved through the same graph. It is
sugar for `{ provide: X, useClass: X }`, and it is `@suites/unit`'s `sociable().expose()`:

```ts
const { unit, spies } = createNestUnit(CheckoutFacade, { expose: [CartService] });

// The spy CartService received is the spy the facade received.
spies.get(PricingService).total.mockReturnValue(10);
spies.get(TaxService).rate.mockReturnValue(0.2);

expect(unit.run(1)).toBe(12);
expect(spies.exposedTokens()).toEqual([CartService]);
```

`spies.get(CartService)` throws here: the unit got a real instance, not a spy. Read the spies of its
own collaborators instead, or drop it from `expose`. `exposedTokens()` lists the exposed classes the
graph actually built, so an entry nothing asked for is visible as absent.

### Tokens with no class — `providers`

`providers` wins over the auto-spies and over `expose`. It takes the three shapes Nest accepts
without an `inject` list, and `provideAutoSpy(X, config)` output is the first of them:

```ts
import { createNestUnit, provideAutoSpy } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService, {
  providers: [
    provideAutoSpy(TaxService, { onlyMethodsToSpyOn: ['rate'] }),
    { provide: 'CONFIG', useValue: { currency: 'EUR' } },
    { provide: PaymentGateway, useClass: StripeGateway },
    { provide: FLAGS, useFactory: () => ({ beta: true }) },
  ],
});

expect(spies.get('CONFIG')).toEqual({ currency: 'EUR' }); // a provided value comes back as is
```

A `@Inject('CONFIG')` token nothing provides is answered with a type mock, which is right for a
service behind an interface and wrong for a config literal — `config.currency` would be a function
spy. Provide those. `useClass` is built like an exposed class, its dependencies spied; `useFactory`
takes no arguments and runs once, when the token is first asked for.

`@Optional()` changes one thing: a parameter or property whose token cannot be injected at all —
see below — receives `undefined` instead of an error. An optional dependency with an injectable token
still gets its spy, because in this graph every token is available.

Property injection (`@Inject(Logger) logger!: Logger`) is assigned after construction, with the
same rules.

::: warning The metadata comes from the compiler, not from this package
`design:paramtypes` is written by `emitDecoratorMetadata: true`. **tsc** and **SWC**
(`jsc.transform.decoratorMetadata: true`) honour the flag; **esbuild**, and therefore Vite's
default transform, do not — which is why the NestJS docs' Vitest recipe compiles through
`unplugin-swc`. A Nest application already has this configured, because it would not boot
otherwise, and `reflect-metadata` — Nest's own requirement — has to be loaded before the classes
are. This package reads `Reflect.getMetadata` structurally and adds no dependency.

Without the flag, `@Inject(X)` on every parameter still works: the decorator records the token
itself, in `self:paramtypes`, and `createNestUnit` reads that first. A bare `@Inject()` does not —
it reads the very metadata that is missing.
:::

### What it refuses, and what the message says

Every message names the fix and ends with a link to this page.

- **A parameter with no injectable token.** An interface, a union or a primitive is emitted as
  `Object`, `String`, `Number`, … and Nest cannot inject that either. The error names the class and
  the parameter index and gives both fixes — `@Inject(TOKEN)` plus a `providers` entry, or
  `@Optional()`. A parameter emitted as `undefined` is called out as the mark of a circular import,
  which `@Inject(forwardRef(() => X))` resolves; `forwardRef` under `@Inject` is unwrapped. A
  property is reported the same way, by name.
- **A class with parameters and no metadata.** Names the class, the three things the metadata needs
  (`@Injectable()`, the compiler flag, `reflect-metadata` loaded first) and which compilers emit it.
  A class with no parameters needs no metadata and is simply constructed.
- **A cycle among the classes built for real.** `A -> B -> A`, with the note that this helper does
  not resolve `forwardRef` cycles: expose one side less, or provide it.
- **`spies.get` of a token never asked for**, listing the auto-spied tokens; and **of an exposed
  class**, which is real, not a spy.
