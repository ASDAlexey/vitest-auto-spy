---
title: Migrating from @testing-library/angular
description: Replace createMock and provideMock from @testing-library/angular/vitest-utils with vitest-auto-spy and keep render, screen and the queries - the mapping, a before and after spec, and the two defects it fixes.
---

# Migrating from `@testing-library/angular`

This page replaces the mock helpers of `@testing-library/angular/vitest-utils` (`createMock`,
`provideMock` and their `WithValues` versions) with `vitest-auto-spy`. You keep `render`, `screen`
and the queries; only the `providers` change. Move when your mocks miss getters or break on
`toString`, or when you want typed spies. A provider changes like this:

::: code-group

```ts [Before — /vitest-utils]
import { provideMockWithValues } from '@testing-library/angular/vitest-utils';

const load = vi.fn().mockReturnValue(of({ name: 'Ann' }));

await render(ProfileComponent, { providers: [provideMockWithValues(UserService, { load })] });
```

```ts [After — vitest-auto-spy]
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

await render(ProfileComponent, {
  providers: [provideAutoSpy(UserService, { returns: { load: of({ name: 'Ann' }) } })],
});
expect(injectSpy(UserService).load).toHaveBeenCalledOnce();
```

:::

Set answers in the provider, so the component sees them on its first render. `injectSpy(UserService)`
gives you the same spy, typed, to change an answer or check calls later. The same applies to a
hand-written `{ provide: UserService, useValue: { load: vi.fn(() => of(user)) } }`: replace it with
`provideAutoSpy(UserService, { returns: { load: of(user) } })`. `render` and `screen` stay as they
are.

## Install and keep

```bash
npm i -D vitest-auto-spy
```

Remove nothing. `@testing-library/angular` stays for `render`; only the `/vitest-utils` import goes.
The move is about what the mock does, not about fewer packages to install.

## The translation

| `@testing-library/angular/vitest-utils`       | `vitest-auto-spy`                                                  |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `createMock(Service)`                         | [`createSpyFromClass(Service)`](/core/create-spy-from-class)       |
| `createMock<SomeInterface>(…)` — not possible | [`createAutoMock<SomeInterface>()`](/core/auto-mock-by-type)       |
| `createMockWithValues(Service, { a: 1 })`     | `createSpyFromClass(Service, { overrides: { a: 1 } })`             |
| `provideMock(Service)`                        | [`provideAutoSpy(Service)`](/adapters/angular)                     |
| `provideMockWithValues(Service, { a: 1 })`    | `provideAutoSpy(Service, { overrides: { a: 1 } })`                 |
| — no equivalent                               | `provideAutoSpy(Service, { returns: { load: of([]) } })`           |
| — no equivalent                               | [`provideAutoSpyForToken(TOKEN)`](/adapters/angular)               |
| `TestBed.inject(Service)` cast by hand        | [`injectSpy(Service)`](/adapters/angular)                          |
| `Mock<T>`                                     | [`Spy<T>`](/core/spy-typing)                                       |
| `mock.method.mockReturnValue(v)`              | the same, plus `resolveWith` / `nextWith` / `calledWith`           |
| — no equivalent                               | [`gettersToSpyOn` / `settersToSpyOn`](/core/create-spy-from-class) |
| — no equivalent                               | [`strict: true`](/core/strict-mode)                                |

`overrides` and `returns` are different things:

- **`overrides`** sets a member to a fixed value. The member is no longer a spy. This is what
  `createMockWithValues` does with its `values`.
- **`returns`** keeps a method a spy and sets what it answers. `/vitest-utils` has no equivalent.

You can pass both in one call; each applies only to the members it names. Name each member in only
one of them. If a test uses `createMockWithValues` to stub what a method returns, use `returns` instead.

### A provider, before and after

A full spec with a value and a method answer:

```ts
// Before
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { provideMockWithValues } from '@testing-library/angular/vitest-utils';
import { of } from 'rxjs';

it('shows the user name', async () => {
  await render(ProfileComponent, {
    providers: [
      provideMockWithValues(UserService, {
        currentUserId: 7,
        load: vi.fn().mockReturnValue(of({ name: 'Ann' })),
      }),
    ],
  });

  expect(await screen.findByText('Ann')).toBeTruthy();
  expect((TestBed.inject(UserService) as Mock<UserService>).load).toHaveBeenCalledOnce();
});
```

```ts
// After
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

it('shows the user name', async () => {
  await render(ProfileComponent, {
    providers: [
      provideAutoSpy(UserService, {
        overrides: { currentUserId: 7 },
        returns: { load: of({ name: 'Ann' }) },
      }),
    ],
  });

  expect(await screen.findByText('Ann')).toBeTruthy();
  expect(injectSpy(UserService).load).toHaveBeenCalledOnce();
});
```

`render` is unchanged. What changes:

- `load` is set through `returns`, so it stays a typed spy; no `vi.fn()` by hand.
- `injectSpy` needs no cast.
- A method you do not configure returns `undefined`, as `vi.fn()` did. Add
  [`strict: true`](/core/strict-mode) to make such a call fail instead.
- If you forget to provide a token, `injectSpy` prints a console warning instead of silently returning
  the real service typed as a mock. [Diagnostics](/adapters/angular#injectspy-says-when-it-got-the-real-thing)
  can turn the warning into a failure.

## What has no twin here, and should not

- **`render`, `screen`, the queries, `fireEvent`, `rerender`, `navigate`.** This package makes spies
  from classes. It does not render components as a user sees them, so keep these.
  [`renderShallow`](/adapters/angular#shallow-component-rendering) is not a replacement. It answers
  "what does this component do"; `@testing-library/angular` answers "what does the user see".
- **`@testing-library/dom` and `@testing-library/user-event`.** Unchanged.
- **`aliasedInput`, `configure`, `getConfig`, `componentInputs` / `on` bindings.** This is rendering
  configuration; nothing here replaces it.
- **The `jest-utils` entry.** There is no Jest entry point here. The package supports Vitest,
  `bun:test` and `node:test`, and offers no public way to plug in another runner. If your tests stay
  on Jest, keep `@testing-library/angular/jest-utils`; this move is not available to you.

## Zoneless — where it is ahead of the field

`@testing-library/angular` is the only third-party library on the [comparison](/comparison) page
with zoneless support. Its `./zoneless` entry point first appeared in 19.2.0, published
**2026-03-17** (it is absent from the `exports` map of 19.1.1).

`render` in that entry is a reduced version of the main one:

- It returns `{ fixture, container, debug }` plus the bound queries.
- Its options are `queries`, `configureTestBed`, `imports`, `providers`, `bindings`,
  `importOverrides`, `wrapper`, `wrapperProperties`, `skipDetectChanges` and `waitForStableOnRender`.
- It drops `rerender`, `detectChanges`, `navigate`, `autoDetectChanges`, `routes`,
  `componentProperties`, and the `fireEvent` wrapper that re-runs change detection after each event.
  A zoneless spec written against it runs change detection itself.

The two packages work together either way. The spies never touch `NgZone`, and this library's Angular helpers are written for
[`provideZonelessChangeDetection` apps](/adapters/angular#zoneless-waiting) first.
`fakeAsync`, which still needs zone.js, is in [`vitest-auto-spy/zone`](/utilities/zone). Zoneless is
not a reason to keep `/vitest-utils`.

## What you gain

- **Accessors work.** `gettersToSpyOn`, `settersToSpyOn`, `autoSpyAccessors`, and an
  `accessorSpies` object to assert on. `createMock` skips accessors, and its type claims they exist.
- **`Object.prototype` stays off the spy.** No mocked `toString`, no mocked `hasOwnProperty`: three
  keys instead of thirteen in [the example below](#the-two-defects-and-how-to-reproduce-them).
- **A type that matches the object.** [`Spy<T>`](/core/spy-typing) types each member by what it is,
  rather than `T[K] & Mock` for every member.
- **Helpers picked from the return type.** `resolveWith` / `rejectWith` on a `Promise` method,
  `nextWith` / `throwWith` on an `Observable` one, `calledWith(…)` to answer per argument,
  `mustBeCalledWith` to fail on unexpected arguments.
- **[`strict: true`](/core/strict-mode)**, so a method nobody configured throws at the call instead
  of returning `undefined` into another assertion.
- **Mocks from a type alone.** [`createAutoMock<T>()`](/core/auto-mock-by-type) works for an
  interface or an injection token. A factory that reads `type.prototype` cannot do this.
- **Lazy by default.** A method's spy is built when the test first reads it; `lazySpies: false`
  builds them all up front.
- **[`injectSpy` that reports a missing provider](/adapters/angular#injectspy-says-when-it-got-the-real-thing)**
  instead of typing the real service as a mock.
- **The same API outside Angular:** [`bun:test`](/runtimes/bun), [`node:test`](/runtimes/node),
  NestJS, React, Vue, Svelte, and Angular's `TestBed` [under `bun test`](/runtimes/bun-angular).
- **[Lint rules](/utilities/eslint-plugin)** that ship with the same version as the API they
  recommend.

## The whole of `/vitest-utils`

The entry is 52 lines long. This is its core:

```js
// @testing-library/angular 19.4.2, fesm2022/testing-library-angular-vitest-utils.mjs
function createMock(type) {
  const mock = {};
  function mockFunctions(proto) {
    if (!proto) {
      return;
    }
    for (const prop of Object.getOwnPropertyNames(proto)) {
      if (prop === 'constructor') {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
      if (typeof descriptor?.value === 'function') {
        mock[prop] = vi.fn();
      }
    }
    mockFunctions(Object.getPrototypeOf(proto));
  }
  mockFunctions(type.prototype);
  return mock;
}
```

The other three exports build on it:

- `createMockWithValues` calls `createMock` and assigns the given values on top.
- `provideMock` wraps it in `{ provide: type, useValue: … }`.
- `provideMockWithValues` does both.

`@testing-library/angular/jest-utils` is the same file with `jest.fn()` in place of `vi.fn()`.

`createMock` walks the class prototype and puts a mock on each method. `createSpyFromClass` does the
same job, so the two replace each other.

## The two defects, and how to reproduce them

Both are in the code above. Both were reproduced on 2026-09-04 by importing the published 19.4.2
module and printing the result. You can run it yourself; the output below is what came back, with
the first line wrapped to fit.

```ts
import { createMock } from '@testing-library/angular/vitest-utils';

class Session {
  #loggedIn = true;
  get isLoggedIn() {
    return this.#loggedIn;
  }
  set token(v: string) {}
  login() {}
  logout() {}
}
class AdminSession extends Session {
  promote() {}
}

const m = createMock(AdminSession);

console.log('own keys:', Object.keys(m).sort().join(', '));
console.log('isLoggedIn on mock:', m.isLoggedIn);
console.log('hasOwnProperty is a mock:', m.hasOwnProperty?.mock !== undefined);
console.log('toString is a mock:', m.toString?.mock !== undefined);
console.log('String(mock):', String(m));
```

```console
own keys: __defineGetter__, __defineSetter__, __lookupGetter__, __lookupSetter__, hasOwnProperty,
          isPrototypeOf, login, logout, promote, propertyIsEnumerable, toLocaleString, toString,
          valueOf
isLoggedIn on mock: undefined
hasOwnProperty is a mock: true
toString is a mock: true
String(mock): undefined
```

The class has three methods; the mock has thirteen own keys.

**Getters and setters are skipped.** The walk adds a mock only when
`typeof descriptor?.value === 'function'`. A getter's descriptor has `get`, not `value`, so
`isLoggedIn` and the `token` setter are silently left out. The type still says they exist (see the
next section). The failure shows up as `undefined` wherever the code reads `session.isLoggedIn`, away
from the mock that lost it.

`createSpyFromClass` spies on them when you name them, or finds them all:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const session = createSpyFromClass(AdminSession, { gettersToSpyOn: ['isLoggedIn'] });
// or { autoSpyAccessors: true } to spy on every getter and setter of the class and its parents

session.accessorSpies.getters.isLoggedIn.mockReturnValue(false);
```

The property still reads and writes normally; the spies for assertions live in `accessorSpies`. See
[Accessor spies](/core/create-spy-from-class#accessor-spies-—-accessorspies).

**`Object.prototype` is mocked too.** The walk recurses until the prototype is `null`, and
`Object.prototype` is the last stop before that. So `hasOwnProperty`, `toString`, `valueOf`,
`isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString` and the four `__define*` / `__lookup*`
methods all become `vi.fn()` on the mock. They are ten of the thirteen keys above.

This breaks real code:

- A mocked `toString` returns `undefined`, so the mock prints as `undefined` in every error message,
  snapshot and log line.
- A mocked `hasOwnProperty` returns `undefined`. Any code that checks `obj.hasOwnProperty(key)`,
  yours or a library's, takes the false branch, even when the key is there.
- `vi.clearAllMocks()` between tests also clears ten extra mocks per object.

`createSpyFromClass` never spies on members of `Object.prototype`. The spy for the class above has
three keys.

## `Mock<T>` says every member is callable

```ts
// types/testing-library-angular-vitest-utils.d.ts:4
type Mock<T> = T & {
  [K in keyof T]: T[K] & Mock$1;
};
```

Every member of `T` is typed as a Vitest `Mock`, including the ones `createMock` never created:
fields, getters, anything that is not a method. So `session.isLoggedIn.mockReturnValue(false)`
compiles, then throws at runtime on `undefined`. The two defects add up: the getter is missing, and
the type hides that until the test runs.

[`Spy<T>`](/core/spy-typing) types each member by what it is. A method becomes a spy with the helpers
its return type allows. A field stays a field. A getter or setter is reached through `accessorSpies`.

## Eager, with no way out

`createMock` builds a mock for every method up front, and it has no options to change that. On a
wide Angular service this costs time and memory. Here spies are lazy by default: a method's spy is
built when the test first reads it. `{ lazySpies: false }` turns that off. The numbers, for build
time and for the memory an untouched spy keeps, are on [Performance](/core/performance).

## Versions this was written against

`@testing-library/angular` **19.4.2**, published **2026-08-07**, `latest` on 2026-09-04. The
`./zoneless` entry arrived in **19.2.0**, published **2026-03-17**.

How this was checked:

- `npm pack @testing-library/angular@19.4.2`, then reading the extracted
  `fesm2022/testing-library-angular-vitest-utils.mjs` and its `.d.ts`;
- `npm view … time` for publish dates;
- the `exports` maps of 19.1.1 and 19.2.0 side by side, for the `./zoneless` entry;
- the `createMock` output above, produced by importing the published module and printing the result,
  not by predicting it from the code.

## See also

- [Comparison → Angular](/comparison#angular): this library next to ng-mocks and Spectator, with
  last-release dates.
- [Angular adapter](/adapters/angular): `provideAutoSpy`, `injectSpy`, zoneless waiting, resources.
- [`createSpyFromClass`](/core/create-spy-from-class) and
  [`createAutoMock`](/core/auto-mock-by-type): the two factories the table above points to.
- [Migrating from @ngneat/spectator](/migrating-spectator), if your tests use that too.
