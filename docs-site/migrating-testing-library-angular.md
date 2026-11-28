---
title: Migrating from @testing-library/angular
description: Replace mocks from @testing-library/angular/vitest-utils with typed spies from vitest-auto-spy. Keep render, screen, and your DOM queries.
---

# Migrating from `@testing-library/angular`

Replace mocks from `@testing-library/angular/vitest-utils` with typed spies from `vitest-auto-spy`.
Use this when a mock skips getters or replaces `toString`. Keep `render`, `screen`, and your DOM
queries. In an existing test, swap the provider and check calls with `injectSpy`:

::: code-group

```ts [Before — /vitest-utils]
import { render } from '@testing-library/angular';
import { provideMockWithValues } from '@testing-library/angular/vitest-utils';
import { of } from 'rxjs';
import { vi } from 'vitest';

const load = vi.fn().mockReturnValue(of({ name: 'Ann' }));

await render(ProfileComponent, { providers: [provideMockWithValues(UserService, { load })] });
```

```ts [After — vitest-auto-spy]
import { render } from '@testing-library/angular';
import { of } from 'rxjs';
import { expect } from 'vitest';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

await render(ProfileComponent, {
  providers: [provideAutoSpy(UserService, { returns: { load: of({ name: 'Ann' }) } })],
});
expect(injectSpy(UserService).load).toHaveBeenCalledOnce();
```

:::

Set the return value in `returns` so it is ready for the first render. `injectSpy(UserService)`
gives you the same typed spy to change the return value or check calls after rendering. If you
wrote a provider by hand, such as `{ provide: UserService, useValue: { load: vi.fn(() => of(user)) } }`,
replace it with `provideAutoSpy(UserService, { returns: { load: of(user) } })`.

## Install and keep

```bash
npm i -D vitest-auto-spy
```

Keep `@testing-library/angular` for `render`. Remove only the `/vitest-utils` imports in the tests
you migrate.

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

- **`overrides`** replaces a property or method with a value, like `values` in `createMockWithValues`.
  If the member was a spy, this replaces the spy itself.
- **`returns`** sets what a method returns and keeps it a spy. `/vitest-utils` has no such option.

You can pass both options in one call. Put each member in only one of them. If you used
`createMockWithValues` to set a method's return value, use `returns` instead.

### A provider, before and after

In this test, `currentUserId` is a plain field, and `load` is a method whose calls you want to check.

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

Keep `render` and the DOM assertion as they are. `returns` keeps `load` a typed spy without a manual
`vi.fn()`, and `injectSpy` gives you that spy without a cast.

- An unconfigured method returns `undefined`, just like `vi.fn()`. Add
  [`strict: true`](/core/strict-mode) to make the call throw instead.
- If `injectSpy` gets the real service instead of a spy, it warns in the console. This can happen
  when you forget a provider for the token.
  [Diagnostics](/adapters/angular#injectspy-says-when-it-got-the-real-thing) can turn the warning
  into a test failure.

## What has no twin here, and should not

- **`render`, `screen`, queries, `fireEvent`, `rerender`, and `navigate`.** Keep them to test what the
  user sees. [`renderShallow`](/adapters/angular#shallow-component-rendering) tests a component's
  behavior without rendering its children. It does not replace `render` from `@testing-library/angular`.
- **`@testing-library/dom` and `@testing-library/user-event`.** Keep both as they are.
- **`aliasedInput`, `configure`, `getConfig`, and `componentInputs` / `on` bindings.** Keep these
  rendering options.
- **`jest-utils`.** If your tests stay on Jest, keep `@testing-library/angular/jest-utils`.
  `vitest-auto-spy` supports Vitest, `bun:test`, and `node:test`, with no public API for adding a
  runner.

## Zoneless — where it is ahead of the field

You can replace your mocks in tests that run without zone.js. Spies do not use `NgZone`, and the
Angular helpers are designed first for [apps using `provideZonelessChangeDetection`](/adapters/angular#zoneless-waiting).
For `fakeAsync`, keep zone.js and load the patch from [`vitest-auto-spy/zone`](/utilities/zone).

`@testing-library/angular` is the only third-party library on the [comparison](/comparison) page
that supports this setup. It added `./zoneless` in 19.2.0 (**2026-03-17**). Version 19.1.1 does not
list that entry in `exports`.

`render` from `./zoneless` has fewer features than the main `render`:

- It returns `{ fixture, container, debug }` and queries bound to the container.
- It accepts `queries`, `configureTestBed`, `imports`, `providers`, `bindings`, `importOverrides`,
  `wrapper`, `wrapperProperties`, `skipDetectChanges`, and `waitForStableOnRender`.
- It leaves out `rerender`, `detectChanges`, `navigate`, `autoDetectChanges`, `routes`,
  `componentProperties`, and the `fireEvent` wrapper that runs change detection after each event.
  Run change detection yourself in tests using this entry.

## What you gain

- **Spies for getters and setters.** Select them with `gettersToSpyOn`, `settersToSpyOn`, or
  `autoSpyAccessors`. Check calls through `accessorSpies`. `createMock` skips getters and setters
  even though its type says they are there.
- **Ordinary `toString` and `hasOwnProperty`.** The spy leaves `Object.prototype` methods alone. It
  has three own keys instead of thirteen in [the example below](#the-two-defects-and-how-to-reproduce-them).
- **Types that match the object.** [`Spy<T>`](/core/spy-typing) distinguishes methods from properties.
  `Mock<T>` adds `& Mock` to the type of every member.
- **Helpers for method results.** Use `resolveWith` and `rejectWith` for a `Promise`, or `nextWith`
  and `throwWith` for an `Observable`. Use `calledWith(…)` to set a result for specific arguments.
  Use `mustBeCalledWith` to fail on unexpected arguments.
- **Errors at the call site.** With [`strict: true`](/core/strict-mode), an unconfigured method
  throws instead of returning `undefined`.
- **Mocks without a class.** [`createAutoMock<T>()`](/core/auto-mock-by-type) builds a mock from an
  interface or an injection token's type. `createMock` needs a class because it reads `type.prototype`.
- **Spies on demand.** By default, the library creates a method spy when you first access it.
  `lazySpies: false` creates them all up front.
- **Warnings for missing providers.**
  [`injectSpy`](/adapters/angular#injectspy-says-when-it-got-the-real-thing) warns if it gets the real
  service instead of a spy.
- **The same API outside Angular.** Use it with [`bun:test`](/runtimes/bun), [`node:test`](/runtimes/node),
  NestJS, React, Vue, and Svelte. You can also use Angular's `TestBed` [under `bun test`](/runtimes/bun-angular).
- **[Lint rules](/utilities/eslint-plugin).** They ship with the same version as the API they recommend.

## The whole of `/vitest-utils`

The `/vitest-utils` module has 52 lines. This is the function that builds the mock:

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

`createSpyFromClass` replaces `createMock`: both build method mocks from the class prototype.
The other three helpers call `createMock`:

- `createMockWithValues` creates the mock and replaces the named members with the values you pass.
- `provideMock` puts the mock in a `{ provide: type, useValue: … }` provider.
- `provideMockWithValues` does both.

`@testing-library/angular/jest-utils` uses the same code with `jest.fn()` instead of `vi.fn()`.

## The two defects, and how to reproduce them

This example reproduces both defects in the published 19.4.2 module. The output is from
2026-09-04, with the first line wrapped for readability.

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

The class has three methods, including inherited ones. The mock has thirteen own keys.

**Getters and setters are missing.** `createMock` mocks a property only if `descriptor.value` is a
function. Getters and setters have `get` or `set` instead of `value`. The mock has neither the
`isLoggedIn` getter nor the `token` setter, even though its type says otherwise. Code that reads
`session.isLoggedIn` gets `undefined` far from where you created the mock.

With `createSpyFromClass`, name the getters and setters you need or spy on all of them:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const session = createSpyFromClass(AdminSession, { gettersToSpyOn: ['isLoggedIn'] });
// or { autoSpyAccessors: true } to spy on every getter and setter of the class and its parents

session.accessorSpies.getters.isLoggedIn.mockReturnValue(false);
```

Read and write the properties as usual. Use `accessorSpies` for assertions. See
[Accessor spies](/core/create-spy-from-class#accessor-spies-—-accessorspies).

**The mock also replaces `Object.prototype` methods.** `createMock` walks the prototype chain
until it reaches `null`, so it includes `Object.prototype`. Its ten methods become `vi.fn()` spies.
Their names appear in the output above alongside `login`, `logout`, and `promote`.

- A mocked `toString` makes the object print as `undefined` in error messages, snapshots, and logs.
- A mocked `hasOwnProperty` returns `undefined` even for a key that exists. A check like
  `obj.hasOwnProperty(key)` fails in your code or in a library.
- `vi.clearAllMocks()` clears ten extra mocks per object between tests.

`createSpyFromClass` skips `Object.prototype` methods. The spy in this example has three keys.

## `Mock<T>` says every member is callable

```ts
// types/testing-library-angular-vitest-utils.d.ts:4
type Mock<T> = T & {
  [K in keyof T]: T[K] & Mock$1;
};
```

`Mock<T>` adds Vitest's `Mock` type even to fields and getters that the mock lacks.
So `session.isLoggedIn.mockReturnValue(false)` compiles, then throws at runtime because
`session.isLoggedIn` is `undefined`.

With [`Spy<T>`](/core/spy-typing), a field stays a field. A method gets helpers for its return type.
Use `accessorSpies` to work with getter and setter spies.

## Eager, with no way out

`createMock` always builds every method mock up front. On a service with many methods, that takes
more time and memory even if your test uses only one. By default, `vitest-auto-spy` creates a method
spy when you first access it. To build all of them up front, pass `{ lazySpies: false }`. See
[Performance](/core/performance) for build times and memory use before any methods are accessed.

## Versions this was written against

`@testing-library/angular` **19.4.2** came out on **2026-08-07** and carried the `latest` tag on
2026-09-04. The `./zoneless` entry first appeared in **19.2.0** (**2026-03-17**).

How we checked:

- Ran `npm pack @testing-library/angular@19.4.2` and read
  `fesm2022/testing-library-angular-vitest-utils.mjs` and its `.d.ts` from the tarball.
- Checked publication dates with `npm view … time`.
- Compared `exports` in 19.1.1 and 19.2.0 to see when `./zoneless` appeared.
- Imported the published module and printed the `createMock` output shown above.

## See also

- [Comparison → Angular](/comparison#angular): ng-mocks, Spectator, and their latest release dates.
- [Angular adapter](/adapters/angular): `provideAutoSpy`, `injectSpy`, waiting in zoneless tests, and resources.
- [`createSpyFromClass`](/core/create-spy-from-class) and
  [`createAutoMock`](/core/auto-mock-by-type): build a spy from a class or a mock from a type.
- [Migrating from @ngneat/spectator](/migrating-spectator), if your tests use it too.
