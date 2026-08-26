---
title: NestJS
description: provideAutoSpy and injectSpy(moduleRef, token) for Test.createTestingModule, with no @nestjs dependency.
---

# NestJS

The `vitest-auto-spy/nestjs` entry ships a `{ provide, useValue }` provider tailored for
`Test.createTestingModule({ providers: [...] })`, plus a typed `injectSpy` that pulls a spy out of
the resulting `TestingModule`.

```ts
import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/nestjs';

const moduleRef = await Test.createTestingModule({
  providers: [
    provideAutoSpy(MyService),
    provideAutoSpy(ApiService, { methodsToSpyOn: ['get', 'post'] }),
  ],
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
