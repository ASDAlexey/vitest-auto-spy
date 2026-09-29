---
title: Getting started
description: Install vitest-auto-spy and write your first Angular spec with a typed spy of a whole service, on Vitest.
---

# Getting started

`vitest-auto-spy` turns a class into a test stand-in where every method is a typed spy. You use it
when the code you test depends on a service and you do not want to write one `vi.fn()` per method by
hand. This page takes you from install to a passing Angular spec in three steps.

## 1. Install

```bash
npm i -D vitest-auto-spy
```

This page assumes an Angular project that runs Vitest through `ng test` (the
`@angular/build:unit-test` builder). You do not need to change any config. Plain Vitest, Bun and
other setups are on [Installation](./installation#wiring-it-up).

## 2. Write the spec

Say `UserService` loads a user through `ApiService`:

```ts
// user.service.ts
import { Injectable, inject } from '@angular/core';

export interface User {
  id: number;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  async get(url: string): Promise<User> {
    const response = await fetch(url);
    return response.json();
  }
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly api = inject(ApiService);

  load(id: number): Promise<User> {
    return this.api.get(`/users/${id}`);
  }
}
```

The spec replaces `ApiService` with spies and tests the real `UserService`:

```ts
// user.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

import { ApiService, UserService } from './user.service';

describe('UserService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideAutoSpy(ApiService)],
    });
  });

  it('loads the user from the API', async () => {
    const api = injectSpy(ApiService);
    api.get.resolveWith({ id: 1, name: 'Ada' });

    const user = await TestBed.inject(UserService).load(1);

    expect(user.name).toBe('Ada');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/users/1');
  });
});
```

What each line does:

- `provideAutoSpy(ApiService)` registers a stand-in for `ApiService` in `TestBed`. Every method on it
  is a spy, and the real `ApiService` never runs.
- `injectSpy(ApiService)` gets that stand-in from `TestBed`, typed as `Spy<ApiService>`. Call it
  inside a test or `beforeEach`, after `configureTestingModule`.
- `api.get.resolveWith(...)` makes `get` return a `Promise` that resolves with that value. Only
  methods that return a `Promise` have `resolveWith`; methods that return an `Observable` have
  `nextWith` instead.
- `toHaveBeenCalledTimes` and `toHaveBeenCalledWith` are the usual Vitest assertions: every spy
  records its calls.
- `TestBed` builds a new module for every test, so each test starts with fresh spies and no
  recorded calls.

## 3. Run it

```bash
ng test
```

On plain Vitest the same spec runs with `npx vitest`.

## Next steps

- [Angular](/adapters/angular): components, signals and the rest of the `TestBed` helpers.
- [`createSpyFromClass`](./create-spy-from-class): the same spies without `TestBed`, and every option.
- [Control helpers](./control-helpers): `resolveWith`, `nextWith`, `calledWith` and the rest.
- [Auto-mock by type](./auto-mock-by-type): spies from an interface when there is no class.
- [Fixtures without casts](/utilities/fixtures): test data objects with `createMock` and
  `createFixtureFactory`.
- [Installation](./installation): other runners, the setup file and the entry point list.
- [Migrating from jest-auto-spies](/migrating): the API is the same, so migration is mostly a
  change of import.
- [How it works](./how-it-works): why the constructor never runs and how the helpers follow the
  return type.

## Spy, stub or mock

A **spy** records how it was called. A **stub** answers with preset values. A **mock** is told which
calls to expect and fails on the others. A **fake** is a simplified working implementation.

Outside `TestBed`, `createSpyFromClass(ApiService)` builds the same object directly. Both it and
`provideAutoSpy` give you a spy and a stub at once, for every method:

- each call is recorded, so `toHaveBeenCalledWith` works;
- each method answers what you configured (`mockReturnValue`, `resolveWith`, `calledWith(...)`), or
  `undefined` when you configured nothing.

It acts as a mock only when you ask. `mustBeCalledWith(...)` throws on a call with other arguments,
and [strict mode](./strict-mode) throws on a method you did not configure. It is never a fake,
because the real class never runs.

Two related tools: `vi.spyOn(realObject, 'method')` wraps one method of a real object and calls the
real code. `createMock<T>()` builds a plain stub with no spies, for values the code only reads. The
[Glossary](/glossary) has the full list of terms.

## Where it runs

Your Angular spec imports from `vitest-auto-spy/angular`. Outside Angular, the library works the same
on four test runners; import from the entry point for yours:

```ts
import { createSpyFromClass } from 'vitest-auto-spy'; // Vitest
import { createSpyFromClass } from 'vitest-auto-spy/bun'; // Bun (bun:test)
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
import { createSpyFromClass } from 'vitest-auto-spy/rstest'; // Rstest
```

Angular's `TestBed` also runs on Bun: see [Angular on Bun](/runtimes/bun-angular).
