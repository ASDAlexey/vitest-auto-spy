---
title: NestJS
description: Replace a service's dependencies with typed spies in Test.createTestingModule, or build the service with createNestUnit and no testing module at all.
---

# NestJS

`vitest-auto-spy/nestjs` replaces the dependencies of a Nest service with typed spies. You use it
when you test one provider and want everything it injects to be a fake you control. A spy is a
stand-in function that records its calls and returns what you tell it to.

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

`AuthService` is listed as is, so Nest builds the real class under test. `UserService` is listed
through `provideAutoSpy`, so the service gets a spy instead.

Under Vitest, compile with `unplugin-swc` and decorator metadata on: Vite's default transform
(esbuild) does not emit the metadata Nest needs. Details in
[The metadata comes from your compiler](#the-metadata-comes-from-your-compiler).

How to set an answer on a spy method:

- `resolveWith(value)` — for a method that returns a `Promise`; the call resolves to `value`.
- `mockReturnValue(value)` — for a method that returns a plain value.
- `calledWith(args)` before either one — the answer applies only to calls with those arguments.

All answer helpers are listed in [Control helpers](/core/control-helpers).

::: warning `injectSpy` takes two arguments here
The Angular `injectSpy(token)` reads from a global `TestBed`. Nest has no global module, so the
Nest version is **`injectSpy(moduleRef, token)`**: the module reference comes first.
:::

**Common mistake:** you list the class itself (`providers: [UserService]`) and call `injectSpy` on
it. You get the real service with a spy type, and the first answer you set on it fails with
`TypeError: users.findByEmail.resolveWith is not a function`. List it through
`provideAutoSpy(UserService)`.

If you do not want a testing module at all, [`createNestUnit`](#building-the-unit-from-its-metadata)
builds the service and all its spies in one synchronous call.

## What the entry exports

| Export                                           | What it does                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `provideAutoSpy(Class, config?)`                 | returns `{ provide: Class, useValue: spy }` for `providers`           |
| `injectSpy(moduleRef, token)`                    | reads a provider from the compiled module, typed as `Spy<T>`          |
| `createNestUnit(Target, options?)`               | builds `Target` from its DI metadata, with a spy for every dependency |
| [`trackInjections`](/utilities/track-injections) | records which providers a unit actually asked for                     |

The second argument of `provideAutoSpy` takes the same options as
[`createSpyFromClass`](/core/create-spy-from-class), for example
`provideAutoSpy(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] })`.

## Abstract classes and interface tokens

Nest often injects by an abstract class or by a string or symbol token. `provideAutoSpy` needs a
real class to read the methods from. Give it the concrete class and point your token at the spy:

```ts
// abstract class as the token, concrete class as the shape
providers: [{ provide: PaymentGateway, useValue: provideAutoSpy(StripeGateway).useValue }];

// a string or symbol token
providers: [{ provide: 'PAYMENT_GATEWAY', useValue: provideAutoSpy(StripeGateway).useValue }];
```

Read it back by the same token Nest uses:

```ts
const gateway = injectSpy(moduleRef, PaymentGateway);
```

If there is no class at all, only an interface, use
[`createAutoMock<PaymentGateway>()`](/core/auto-mock-by-type) as the `useValue`. It builds the same
spy from the type.

## Any runner

On Vitest you need no runner entry: `vitest-auto-spy/nestjs` alone is enough.

On other runners, also import the entry for your runner (`vitest-auto-spy/node`,
`vitest-auto-spy/bun` or `vitest-auto-spy/rstest`), and the Nest helpers create that runner's mocks.
`vitest-auto-spy/nestjs` does not import `vitest`, so it works there. Its type declarations do not name
`vitest` either, so a Bun or `node:test` project type-checks it with `skipLibCheck: false` and no
Vitest installed. You may import the runner entry before or after `vitest-auto-spy/nestjs`.

**Common mistake:** on Vitest, a spec set that imports only `vitest-auto-spy/nestjs` gets spies
without Vitest's `mockThrow`. Add `import type {} from 'vitest-auto-spy';` to any file; see
[Compatibility](/core/compatibility#vitest-2-1).

`createNestUnit` is also exported from `vitest-auto-spy/node` and `vitest-auto-spy/bun`, so a Nest
suite on `node --test` or `bun test` needs a single import:

```ts
import 'reflect-metadata';

import { createNestUnit } from 'vitest-auto-spy/node';
```

The Nest versions of `provideAutoSpy` and `injectSpy` exist only in `/nestjs`. Import them from
there on any runner.

## Building the unit from its metadata

`createNestUnit(Target, options?)` builds the class under test without `Test.createTestingModule`.
It reads the metadata Nest decorators already write, creates the class with `new`, and gives every
dependency a spy. When the constructor changes, the spec does not, because nobody types the
provider list by hand.

```ts
import { expect, it } from 'vitest';
import { createNestUnit } from 'vitest-auto-spy/nestjs';

import { CartService } from './cart.service';
import { PricingService } from './pricing.service';
import { TaxService } from './tax.service';

it('adds tax to the total', () => {
  const { unit, spies } = createNestUnit(CartService);

  spies.get(PricingService).total.mockReturnValue(100);
  spies.get(TaxService).rate.mockReturnValue(0.5);

  expect(unit.checkout(3)).toBe(150);
  expect(spies.autoSpiedTokens()).toEqual([PricingService, TaxService]);
});

it('saves the order through the repository', async () => {
  const { unit, spies } = createNestUnit(OrderService);

  spies.get(OrderRepository).save.resolveWith({ id: 7 }); // save() returns a Promise

  await expect(unit.place({ total: 30 })).resolves.toEqual({ id: 7 });
  expect(spies.get(OrderRepository).save).toHaveBeenCalledWith({ total: 30 });
});
```

There is no `compile()`: `createNestUnit` itself is synchronous. `spies.get(X)` returns the same
spy object the unit received, so you set answers and check calls on it exactly as with `injectSpy`.
`createNestUnit` needs `import 'reflect-metadata'` loaded before your classes (see
[the metadata note](#the-metadata-comes-from-your-compiler) below).

| Option      | Type                 | Default | Meaning                                           |
| ----------- | -------------------- | ------- | ------------------------------------------------- |
| `expose`    | `NestUnitClass[]`    | `[]`    | classes built for real instead of spied           |
| `providers` | `NestUnitProvider[]` | `[]`    | your own values; win over spies and over `expose` |

| `spies` method      | Returns                                                       |
| ------------------- | ------------------------------------------------------------- |
| `get(token)`        | the spy (or the provided value) the unit received for `token` |
| `autoSpiedTokens()` | the tokens that got a spy                                     |
| `exposedTokens()`   | the `expose` classes the unit actually built                  |

How the graph behaves:

- Each token gets one instance, like Nest's default singleton scope. If two classes share a
  dependency, they share one spy.
- A class spy has only the methods of the real class. A misspelled method is `undefined`, not a
  fresh spy, so the test fails at the typo: `spies.get(PricingService).totl // typo → undefined`.
- A string or symbol token has no class to read, so it gets an
  [`createAutoMock()`](/core/auto-mock-by-type) spy built from the type.
- `spies.get(token)` throws for a token the unit never asked for, and lists the tokens it did
  spy. Otherwise you would configure a spy the unit never uses, and the test would check nothing.

This is the Nest counterpart of the Angular
[`createWithAutoSpies`](/adapters/angular#building-a-class-with-auto-spied-dependencies).

### Sociable — `expose`

`expose` builds a dependency for real, while its own dependencies still get spies. It is short for
`{ provide: X, useClass: X }`.

```ts
const { unit, spies } = createNestUnit(CheckoutFacade, { expose: [CartService] });

// CartService is real; the spies it received are the ones below.
spies.get(PricingService).total.mockReturnValue(10);
spies.get(TaxService).rate.mockReturnValue(0.2);

expect(unit.run(1)).toBe(12);
expect(spies.exposedTokens()).toEqual([CartService]);
```

**Common mistake:** `spies.get(CartService)` throws here, because the unit got a real instance, not
a spy. Read the spies of its dependencies instead, or remove it from `expose`. If a class in `expose`
is missing from `exposedTokens()`, nothing in the graph asked for it.

### Tokens with no class — `providers`

`providers` supplies values yourself. It accepts three shapes: `useValue`, `useClass` and
`useFactory`. The output of `provideAutoSpy(X, config)` is a `useValue` provider, so it fits too.

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

- `useClass` is built like an exposed class: real class, spied dependencies.
- `useFactory` takes no arguments. It runs once, when the token is first needed. An `inject` list is
  not supported.

**Common mistake:** you leave a config token such as `@Inject('CONFIG')` unprovided. It gets a spy
built from the type, so `config.currency` is a spy function, not a string. Provide config values in
`providers`.

### Optional and property dependencies

- `@Optional()` changes nothing for a normal dependency: it still gets its spy.
- `@Optional()` matters only for a parameter whose token cannot be injected at all (see
  [the errors below](#what-it-refuses-and-what-the-message-says)). That parameter gets `undefined`
  instead of an error.
- Property injection (`@Inject(Logger) logger!: Logger`) follows the same rules. The property is set
  after the constructor runs.

### The metadata comes from your compiler

Nest reads constructor parameter types from `design:paramtypes`. Your compiler writes that metadata
when `emitDecoratorMetadata: true` is on. Both ways on this page need it, `Test.createTestingModule`
and `createNestUnit` alike.

One rule for your test setup:

- **Vitest:** compile through `unplugin-swc` with decorator metadata on, as the NestJS docs
  recommend. Vite's default transform (esbuild) does not write the metadata.
- **tsc or SWC** (`jsc.transform.decoratorMetadata: true`), for example `node --test` on tsc output:
  nothing extra, both write it.
- **`reflect-metadata`** must load before your classes. Nest's testing package loads it for
  `Test.createTestingModule`. For `createNestUnit`, add `import 'reflect-metadata'` at the top of the
  spec or of a setup file. `reflect-metadata` is your own dev dependency; this package does not
  install it.

If you cannot turn the flag on, put `@Inject(X)` on every constructor parameter. The decorator
records the token itself, and `createNestUnit` reads it. `@Inject()` without a token does not help,
because it relies on the missing metadata.

### What it refuses, and what the message says

Every error names the fix and ends with a link to this page.

- **A parameter with no injectable token.** Interfaces, unions and primitives compile to `Object`,
  `String`, `Number` and so on, and Nest cannot inject those either. The message names the class and
  the parameter index. Fix it with `@Inject(TOKEN)` plus a `providers` entry, or mark it
  `@Optional()`. A parameter compiled as `undefined` usually means a circular import: use
  `@Inject(forwardRef(() => X))`. A property is reported the same way, by name.
- **A class with constructor parameters and no metadata.** The message names the class and the
  three things it needs: `@Injectable()`, the compiler flag, and `reflect-metadata` loaded first. A
  class with no parameters needs no metadata.
- **A cycle among the classes built for real**, shown as `A -> B -> A`. This helper does not resolve
  `forwardRef` cycles. Expose one side less, or provide it as a value.
- **`spies.get` of a token the unit never asked for.** The message lists the tokens that got spies.
- **`spies.get` of an exposed class.** That class is real, not a spy.

## Dependencies

`@nestjs/common` and `@nestjs/testing` stay your own dev dependencies. The entry never imports them.
`injectSpy` needs only an object with a `get(token)` method (the `NestModuleRef` type), so it also
works with a hand-written fake module.
