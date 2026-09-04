---
title: Migrating from @testing-library/angular
description: The half of @testing-library/angular that overlaps this package is its /vitest-utils entry — createMock and provideMock, 52 lines of it. What they map onto, the two defects you can reproduce in a REPL, and the parts you keep.
---

# Migrating from `@testing-library/angular`

This is the one migration page here that tells you to keep the library you came from.

[`@testing-library/angular`](https://github.com/testing-library/angular-testing-library) is a
rendering tool — `render`, `screen`, the query set, the user-centred discipline behind them. None of
that has a twin here and none of it should move. What overlaps is a single secondary entry point,
`@testing-library/angular/vitest-utils`, whose four exports do the same job as
[`createSpyFromClass`](/core/create-spy-from-class) and
[`provideAutoSpy`](/adapters/angular). That entry is 52 lines long, it is eager, it ignores
accessors, and it mocks `hasOwnProperty`. Those 52 lines are what this page is about.

::: info How this was checked
`npm pack @testing-library/angular@19.4.2` and reading the extracted
`fesm2022/testing-library-angular-vitest-utils.mjs` and its `.d.ts`; `npm view … time` for publish
dates; the `exports` map of 19.1.1 and 19.2.0 side by side for the `./zoneless` entry; and the
`createMock` output below produced by importing the published module and printing what came back,
rather than reading the code and predicting it. Verified **2026-09-04** against 19.4.2, published
2026-08-07.
:::

## The whole of `/vitest-utils`

It is short enough to quote in full, which is unusual for a competitor and is the reason every claim
on this page is easy to check:

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

`createMockWithValues` calls it and assigns the given values over the top. `provideMock` wraps it in
`{ provide: type, useValue: … }`. `provideMockWithValues` does both. That is the entire entry point.
The `@testing-library/angular/jest-utils` entry is the same file with `jest.fn()` in place of
`vi.fn()` — byte-for-byte otherwise.

An eager prototype walk producing a bag of mocks is exactly what `createSpyFromClass` does, which is
why these two are competitors and not complements.

## Install and keep

```bash
npm i -D vitest-auto-spy
```

Nothing is removed. `@testing-library/angular` stays for `render`; only the `/vitest-utils` import
goes away, and if the suite never imported it there is nothing to migrate at all. The package's
`dependencies` are `tslib` alone and its peers are `@angular/*` plus `@testing-library/dom`, so
dropping the subpath import saves you no install — this move is about what the double does, not
about dependency weight.

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

Two rows deserve their names spelled out. `createMockWithValues`' `values` are assigned over the
finished mock, replacing whatever was there — that is `overrides`, the seed that is stored verbatim
and is **not** a spy afterwards. The thing it has no word for is `returns`, which configures what a
method still-being-a-spy answers. If a suite reaches for `createMockWithValues` to stub a return
value, `returns` is the row it wanted.

### A provider, before and after

```ts
// Before
import { provideMockWithValues } from '@testing-library/angular/vitest-utils';

await render(CartComponent, {
  providers: [provideMockWithValues(PricingService, { currency: 'EUR' })],
});

const pricing = TestBed.inject(PricingService) as Mock<PricingService>;
pricing.total.mockReturnValue(150);
```

```ts
// After
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

await render(CartComponent, {
  providers: [provideAutoSpy(PricingService, { overrides: { currency: 'EUR' }, returns: { total: 150 } })],
});

const pricing = injectSpy(PricingService);
```

`render` is untouched — this is a providers-array edit and nothing more. What changes is that the
double is seeded in the provider rather than in a line below it, that `injectSpy` needs no cast, and
that `injectSpy`
[reports a token you forgot to provide](/adapters/angular#injectspy-says-when-it-got-the-real-thing)
instead of handing back the real service under a spy type.

## The two defects, and how to reproduce them

Both are in the twenty lines quoted above, and both were reproduced on 2026-09-04 by importing the
published 19.4.2 module and printing the result. Run it yourself; the output below is what came back,
with only the first line wrapped to fit.

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

Thirteen own keys for a class with three methods.

**No accessor handling.** The walk assigns a mock only when `typeof descriptor?.value === 'function'`
(line 14). A getter's descriptor carries `get`, not `value`, so `isLoggedIn` and the `token` setter
are skipped in silence. The double is missing them and — see the typing section below — the compiler
still says they are there. The failure surfaces as `undefined` at the site that reads
`session.isLoggedIn`, one or more frames away from the double that lost it.

`createSpyFromClass` names them explicitly, or discovers them:

```ts
const session = createSpyFromClass(AdminSession, { gettersToSpyOn: ['isLoggedIn'] });
// or { autoSpyAccessors: true } to take every accessor on the prototype chain

session.accessorSpies.getters.isLoggedIn.mockReturnValue(false);
```

The property keeps reading and writing normally; `accessorSpies` is the separate bag the assertions
live in. See [Accessor spies](/core/create-spy-from-class#accessor-spies--accessorspies).

**No `Object.prototype` guard.** `mockFunctions(Object.getPrototypeOf(proto))` (line 18) recurses
until the prototype is `null`, and `Object.prototype` is the last stop before it — so
`hasOwnProperty`, `toString`, `valueOf`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`
and the four `__define*`/`__lookup*` accessors are all replaced with `vi.fn()`s on the double. Ten of
the thirteen keys above are that.

This is not cosmetic. A mocked `toString` returns `undefined`, so the double stringifies to
`undefined` in every error message, snapshot and log line that touches it. A mocked `hasOwnProperty`
returns `undefined`, so any code — yours, or a library's — that guards with
`obj.hasOwnProperty(key)` takes the false branch against a double that does have the key. And
`vi.clearAllMocks()` between tests is now also clearing ten mocks per double that nobody asked for.

`createSpyFromClass` stops one prototype earlier by construction: `walkOwnPrototypes`
(`src/lib/create-spy-from-class.ts:81`) visits a prototype only while it still has a parent, so
`Object.prototype`'s own members are never collected in the first place. The double above has three
keys.

## `Mock<T>` says every member is callable

```ts
// types/testing-library-angular-vitest-utils.d.ts:4
type Mock<T> = T & {
  [K in keyof T]: T[K] & Mock$1;
};
```

Every member of `T` is intersected with Vitest's `Mock`, including the ones the runtime factory
never assigned — data properties, getters, anything whose descriptor has no function `value`. So the
type promises `session.isLoggedIn.mockReturnValue(false)` compiles, and it does compile, and it
throws at runtime on `undefined`. The two defects compound: the accessor is missing, and the type is
the reason you do not find out until the test runs.

[`Spy<T>`](/core/spy-typing) maps each member by what it actually is — a method becomes a spy with
the helpers its return type earns, a data property stays a data property, and an accessor is
reachable through `accessorSpies` rather than being typed as callable and not existing.

## Eager, with no way out

`createMock` builds every method up front; there is no option, because there are no options. That is
a real cost on a wide Angular service, and it is [measured](/core/performance): on a 40-method class
where the spec calls three methods, building the double lazily costs **6.04 µs** against **11.50 µs**
eager. Lazy is the default here, `{ lazySpies: false }` opts out, and `'proxy'` is the third rung for
very wide classes.

The other half of that is memory rather than time, and it is the half that decides a large suite —
what an untouched double _retains_, not what it costs to build. See
[Performance](/core/performance).

## What has no twin here, and should not

- **`render`, `screen`, the queries, `fireEvent`, `rerender`, `navigate`.** This package spies
  classes; it does not render components as a user sees them. Keep them.
  [`renderShallow`](/adapters/angular#shallow-component-rendering) is not a replacement — it is a
  shallow `TestBed` helper for a different question, "what does this component do", where
  `@testing-library/angular` answers "what does the user see".
- **`@testing-library/dom` and `@testing-library/user-event`.** Untouched.
- **`aliasedInput`, `configure`, `getConfig`, `componentInputs` / `on` bindings.** Rendering
  configuration; nothing here competes with it.
- **The `jest-utils` entry.** There is no Jest entry point here today — the core is runner-agnostic
  behind an internal `MockAdapter` with Vitest, `bun:test` and `node:test` adapters shipped, but
  `registerMockAdapter` is not exported from any public entry, so a Jest project has no supported way
  to plug one in. If the suite is Jest and staying Jest, `@testing-library/angular/jest-utils` keeps
  its two defects and this move is not available to you.

## Zoneless — where it is ahead of the field

`@testing-library/angular` is the only third-party library on the [comparison](/comparison) page with
a zoneless story, and it is a real one: a `./zoneless` entry point, absent from the `exports` map of
19.1.1 and present in 19.2.0, published **2026-03-17**. Both maps were read from the published
tarballs.

It is worth knowing what that entry actually is before planning around it. `render` there is a
reduced version of the main one — its result is `{ fixture, container, debug }` plus the bound
queries, and its options are `queries`, `configureTestBed`, `imports`, `providers`, `bindings`,
`importOverrides`, `wrapper`, `wrapperProperties`, `skipDetectChanges` and `waitForStableOnRender`.
Gone from the zoneless entry, relative to the main one, are `rerender`, `detectChanges`, `navigate`,
`autoDetectChanges`, `routes`, `componentProperties` and the `fireEvent` wrapper that re-runs change
detection after every event. A zoneless spec written against it drives change detection itself.

Nothing in this package's spy path touches `NgZone` either, so the two coexist without a decision:
[`provideZonelessChangeDetection` apps](/adapters/angular#zoneless-waiting) are the default here, and
`fakeAsync` — which still needs zone.js — is behind
[`vitest-auto-spy/zone`](/utilities/zone). Zoneless is not a reason to keep `/vitest-utils`.

## What you gain

- **Accessors exist.** `gettersToSpyOn`, `settersToSpyOn`, `autoSpyAccessors`, and an
  `accessorSpies` bag to assert on — against a factory that skips them and a type that claims
  otherwise.
- **`Object.prototype` stays off the double.** No mocked `toString`, no mocked `hasOwnProperty`,
  three keys instead of thirteen.
- **A type that matches the object.** [`Spy<T>`](/core/spy-typing) per member, rather than
  `T[K] & Mock` across the board.
- **Return-type-aware helpers** — `resolveWith` / `rejectWith` on a `Promise` method, `nextWith` /
  `throwWith` on an `Observable` one, `calledWith(…)` for per-argument dispatch, `mustBeCalledWith`
  to fail on a mismatch instead of answering it.
- **[`strict: true`](/core/strict-mode)**, so a method nobody configured fails at the call rather
  than returning `undefined` into somebody else's assertion.
- **Type-only mocking.** [`createAutoMock<T>()`](/core/auto-mock-by-type) for an interface or an
  injection token, which a factory reading `type.prototype` structurally cannot do.
- **Lazy by default**, with `lazySpies: false` and `'proxy'` as the two other rungs.
- **[`injectSpy` that reports a missing provider](/adapters/angular#injectspy-says-when-it-got-the-real-thing)**
  rather than typing the real service as a double.
- **The same API off Angular** — [`bun:test`](/runtimes/bun), [`node:test`](/runtimes/node), NestJS,
  React, Vue, Svelte, and Angular's `TestBed` [under `bun test`](/runtimes/bun-angular).
- **[Nineteen lint rules](/utilities/eslint-plugin)** versioned with the API they recommend.

## Versions this was written against

`@testing-library/angular` **19.4.2**, published **2026-08-07** — `latest` on 2026-09-04. The
`./zoneless` entry arrived in **19.2.0**, published **2026-03-17**. Everything above was read out of
those published tarballs, and the `createMock` output was produced by running the published module,
not by predicting it.

## See also

- [Comparison → Angular](/comparison#angular) — this library next to ng-mocks and Spectator, with
  the field's last-release dates.
- [Angular adapter](/adapters/angular) — `provideAutoSpy`, `injectSpy`, zoneless waiting, resources.
- [`createSpyFromClass`](/core/create-spy-from-class) and
  [`createAutoMock`](/core/auto-mock-by-type) — the two factories the table above points at.
- [Migrating from @ngneat/spectator](/migrating-spectator) — if the suite carries that too.
