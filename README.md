<div align="center">

# vitest-auto-spy

**Auto-generate fully-typed test spies from a class — across any Vitest-compatible runtime and framework.**

The only auto-spy library that reads a **class** and gives a **fully-typed** spy of every method
with **return-type-aware** helpers (`resolveWith` / `nextWith` / `calledWith`) — on **Vitest**,
**Bun** and **node:test**, with recipes for NestJS, React, Vue/Pinia, Svelte and Angular. A drop-in
replacement for [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies) — same API.

[![npm version](https://img.shields.io/npm/v/vitest-auto-spy?color=cb3837&logo=npm)](https://www.npmjs.com/package/vitest-auto-spy)
[![npm downloads](https://img.shields.io/npm/dm/vitest-auto-spy?color=cb3837&logo=npm)](https://www.npmjs.com/package/vitest-auto-spy)
[![CI](https://github.com/ASDAlexey/vitest-auto-spy/actions/workflows/ci.yml/badge.svg)](https://github.com/ASDAlexey/vitest-auto-spy/actions/workflows/ci.yml)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/vitest-auto-spy?label=minzip)](https://bundlephobia.com/package/vitest-auto-spy)
[![types](https://img.shields.io/npm/types/vitest-auto-spy?logo=typescript&logoColor=white)](https://www.npmjs.com/package/vitest-auto-spy)
[![coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/ASDAlexey/vitest-auto-spy/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vitest-auto-spy?color=blue)](./LICENSE)

[![Vitest](https://img.shields.io/badge/Vitest-✓-6E9F18?logo=vitest&logoColor=white)](#runtimes)
[![Bun](https://img.shields.io/badge/Bun-✓-14151A?logo=bun&logoColor=white)](#runtimes)
[![node:test](https://img.shields.io/badge/node%3Atest-✓-339933?logo=node.js&logoColor=white)](#runtimes)
[![runtime deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)](#install)

📦 [**npm**](https://www.npmjs.com/package/vitest-auto-spy) · 🐙 [**GitHub**](https://github.com/ASDAlexey/vitest-auto-spy) · 🔖 [**Changelog**](./CHANGELOG.md)

</div>

---

- 🧪 Reads a class and generates a typed spy for **every** method — no hand-written `vi.fn()` lists
- 🧬 Or mock from a **type/interface** alone — `createAutoMock<T>()`, no class required
- 🌐 Runs on **Vitest, Bun and `node:test`** behind one `MockAdapter` — identical API on each
- 🧩 Framework recipes: **NestJS, React, Vue/Pinia, Svelte, Angular**
- 🎯 Return-type-aware helpers — sync, `Promise`, and `Observable` all get the right API
- 🔀 `calledWith` / `mustBeCalledWith` argument dispatch
- 📡 First-class RxJS `Observable` spying (`nextWith`, `nextWithValues`, `throwWith`, …)
- ⚙️ Getter / setter spies via `accessorSpies`
- 🟢 100% test coverage, **zero runtime dependencies** (in-tree arg serializer, no `javascript-stringify`)

## Table of contents

- [Install](#install)
- [Why](#why)
- [Comparison](#comparison)
- [Migrating from jest-auto-spies](#migrating-from-jest-auto-spies)
- [Configuration](#configuration)
- [Auto-mock by type (no class needed)](#auto-mock-by-type-no-class-needed)
- [Synchronous methods](#synchronous-methods)
- [Promise-returning methods](#promise-returning-methods)
- [Observable methods & properties](#observable-returning-methods--observable-properties)
- [Getters & setters](#getters--setters)
- [Framework adapters](#framework-adapters)
  - [NestJS](#nestjs)
  - [React (Testing Library)](#react-testing-library)
  - [Vue / Pinia](#vue--pinia)
  - [Svelte](#svelte)
  - [Angular](#angular)
- [API reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)

## Install

```bash
npm i -D vitest-auto-spy
```

Peer dependencies are all **optional** and provided by your project: `vitest` (required),
plus `rxjs` and `@angular/core` only if you use the matching entry point. The package itself
has **zero runtime dependencies**.

### Entry points

The library ships a framework-agnostic core plus runtime and framework layers, so a plain
Node / Bun / React / Vue project pulls **neither rxjs nor Angular into its runtime bundle**:

| Import | Provides | Pulls in |
| --- | --- | --- |
| `vitest-auto-spy` | `createSpyFromClass`, `createFunctionSpy`, sync + promise + accessor spies, `errorHandler`, types | `vitest` |
| `vitest-auto-spy/bun` | the same core, driven by Bun's `bun:test` mocks | `bun:test` |
| `vitest-auto-spy/node` | the same core, driven by `node:test`'s `mock.fn()` | `node:test` |
| `vitest-auto-spy/rxjs` | observable spies (`nextWith`, `nextWithValues`, `observablePropsToSpyOn`, …) + `createObservableWithValues` | `rxjs` |
| `vitest-auto-spy/angular` | `provideAutoSpy`, `injectSpy`, `mockReadonlyProp*`, `mockAccessorsProp` | `@angular/core` |
| `vitest-auto-spy/nestjs` | `provideAutoSpy`, `injectSpy` for `Test.createTestingModule` | — (your `@nestjs/*`) |
| `vitest-auto-spy/react` | the core, with a natural import for React Testing Library suites | — (your `react`) |
| `vitest-auto-spy/vue` | `provideAutoSpy` for `global.provide` + Pinia store spying | — (your `vue`/`pinia`) |
| `vitest-auto-spy/svelte` | the core, with a natural import for Svelte suites | — (your `svelte`) |

> The framework subpaths import **nothing** from their framework — the helpers are structural, so
> `@nestjs/*`, `react`, `vue`/`pinia` and `svelte` stay your own (already-present) dev dependencies and
> never reach this package's runtime bundle.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';
import 'vitest-auto-spy/rxjs'; // once (e.g. in your test setup) — enables observable spies
import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/angular';
```

#### Runtimes

The core is runner-agnostic behind a `MockAdapter`: pick the entry that matches your test
runner — the public API (`createSpyFromClass`, `calledWith`, `resolveWith`, `nextWith`, …) is
identical across all three.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';      // Vitest (default, zero-config)
import { createSpyFromClass } from 'vitest-auto-spy/bun';  // Bun — bun:test
import { createSpyFromClass } from 'vitest-auto-spy/node'; // node:test
```

> Only the auto-spy helpers are normalised across runtimes; **native** mock methods stay the
> runner's own — `mockReturnValue` on Vitest/Bun, `spy.method.mock.mockImplementation` on
> `node:test`. Each entry registers its adapter on import, so import the one matching your runner.

> Using an observable spy (`observablePropsToSpyOn`, `nextWith`, …) without importing
> `vitest-auto-spy/rxjs` throws a clear hint telling you to add that import.
>
> The decoupling is at the **runtime** level. The core's _type_ surface (`Spy<T>`) still
> references rxjs types, so keep `rxjs` available for type-checking (it's normally already a
> devDependency); none of it reaches your runtime bundle.
>
> The same inversion-of-control applies to the **test runner**: the core no longer imports
> `vitest` directly — `vi.fn()` / `vi.spyOn()` sit behind a `MockAdapter` that the
> `vitest-auto-spy` entry registers by default, so it stays zero-config. This is the groundwork
> for running the exact same core on other Vitest-compatible runners.

## Why

Manually mocking a service is tedious and brittle:

```ts
// 😫  the old way
const userService = {
  getUser: vi.fn(),
  getUserList: vi.fn(),
  // ...one line per method, kept in sync by hand
};
```

`createSpyFromClass` reads the class and generates a typed spy for **every** method:

```ts
// 😎  the auto-spy way
let userService: Spy<UserService>;

beforeEach(() => {
  userService = createSpyFromClass(UserService);
});
```

`Spy<UserService>` exposes each method as a `vi.fn()` **plus** the right helpers based on
the method's return type (sync / `Promise` / `Observable`).

## Comparison

| Library | Reads a class? | Return-type-aware helpers? | Runtimes | We win on |
| --- | :---: | :---: | --- | --- |
| **vitest-auto-spy** | ✅ | ✅ | Vitest · Bun · node:test | — |
| [jest-auto-spies](https://www.npmjs.com/package/jest-auto-spies) | ✅ | ✅ | Jest only | Vitest/Bun/Node successor, **same API** — direct migration path |
| [vitest-mock-extended](https://www.npmjs.com/package/vitest-mock-extended) | ❌ (Proxy) | ❌ | Vitest | Return-type ergonomics **and** reading a real class (we also ship a Proxy mode: [`createAutoMock`](#auto-mock-by-type-no-class-needed)) |
| [@golevelup/ts-vitest](https://www.npmjs.com/package/@golevelup/ts-vitest) | partial | ❌ | Vitest | Typed `Promise`/`Observable` helpers + explicit class→spy + `mustBeCalledWith` |
| [sinon](https://www.npmjs.com/package/sinon) | ❌ (manual) | ❌ | Any | Auto-generated + fully typed vs. manual + loosely typed |

**The pitch:** the only auto-spy library that reads a **class** and gives a **fully-typed** spy of
every method with **return-type-aware** control helpers (`resolveWith` / `nextWith` / `calledWith`) —
across any Vitest-compatible runtime and framework.

## Migrating from jest-auto-spies

The public API is intentionally identical. In most projects the migration is a
**find-and-replace of the import**:

```diff
- import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
+ import { createSpyFromClass } from 'vitest-auto-spy';
+ import { provideAutoSpy } from 'vitest-auto-spy/angular';
+ import 'vitest-auto-spy/rxjs'; // once, if you use observable spies
```

The only API-shape change from `jest-auto-spies` is that the Angular helpers and the
observable layer live behind the `/angular` and `/rxjs` subpaths (see [Entry points](#entry-points)).

| jest-auto-spies | vitest-auto-spy | Status |
| --- | --- | --- |
| `createSpyFromClass` | `createSpyFromClass` | ✅ identical |
| `provideAutoSpy` | `provideAutoSpy` | ✅ identical |
| `calledWith` / `mustBeCalledWith` | same | ✅ identical |
| `resolveWith` / `rejectWith` / `resolveWithPerCall` | same | ✅ identical |
| `nextWith` / `nextOneTimeWith` / `nextWithValues` / `nextWithPerCall` | same | ✅ identical |
| `throwWith` / `complete` / `returnSubject` | same | ✅ identical |
| `accessorSpies.getters/setters` | same | ✅ identical |
| `createObservableWithValues` | same | ✅ identical |
| underlying mock | `jest.fn()` → `vi.fn()` | 🔁 swapped |

Just make sure your tests run under Vitest, and (for Angular) that `TestBed` is set up.

## Configuration

```ts
// 1. all methods (default)
createSpyFromClass(MyService);

// 2. only these methods
createSpyFromClass(MyService, ['getName', 'getAge']);

// 3. full config object
createSpyFromClass(MyService, {
  methodsToSpyOn: ['getName'],
  observablePropsToSpyOn: ['products$'], // Observable *properties*
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
});
```

## Auto-mock by type (no class needed)

`createSpyFromClass` reads a real class's prototype. When you only have a TypeScript **interface or
type** (no runtime class), use `createAutoMock<T>()` — it builds the spy lazily from the type alone,
via a `Proxy`:

```ts
import { createAutoMock } from 'vitest-auto-spy';

interface UserService {
  getName(id: number): string;
  getUser(id: number): Promise<User>;
  apiUrl: string;
}

// Before — needs a concrete class:
// const svc = createSpyFromClass(UserServiceClass);

// After — type only, no class:
const svc = createAutoMock<UserService>();
```

Every accessed method becomes a decorated spy with the **same typed control helpers** as
`createSpyFromClass`, materialized lazily and cached (same reference on re-access):

```ts
svc.getName.calledWith(1).mockReturnValue('Ada');   // sync, arg-matched
svc.getUser.resolveWith({ id: 1, name: 'Ada' });    // promise helper
expect(svc.getName(1)).toBe('Ada');
await expect(svc.getUser(1)).resolves.toEqual({ id: 1, name: 'Ada' });
```

Seed concrete values or implementations with the optional `overrides` argument (seeded keys are
returned as-is, never turned into spies):

```ts
const svc = createAutoMock<UserService>({ apiUrl: 'https://api.test' });
expect(svc.apiUrl).toBe('https://api.test'); // or assign: svc.apiUrl = '...'
```

> Caveat: with only a type at runtime, methods and plain properties are indistinguishable on
> access — an un-seeded property read returns a spy. Seed real property values via `overrides`
> (or assignment) to get them back verbatim.

## Synchronous methods

```ts
// standard vi.fn() API works as-is
myService.getName.mockReturnValue('Fake Name');

// return a value only for specific arguments
myService.getName.calledWith(1).mockReturnValue('Fake Name');
expect(myService.getName(1)).toBe('Fake Name');
expect(myService.getName(2)).toBeUndefined();

// throw if called with the "wrong" arguments
myService.getName.mustBeCalledWith(1).mockReturnValue('Fake Name');
expect(() => myService.getName(2)).toThrow();
```

## Promise-returning methods

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await expect(myService.getProducts()).resolves.toEqual([{ name: 'Product 1' }]);

myService.getProducts.rejectWith('FAKE ERROR');
await expect(myService.getProducts()).rejects.toBe('FAKE ERROR');

// per-call values, and conditional-by-args
myService.getProducts.resolveWithPerCall([{ value: ['a'] }, { value: ['b'] }]);
myService.getProducts.calledWith(1).resolveWith(['one']);
```

## Observable-returning methods & Observable properties

Both spied **methods** that return an `Observable` and spied **properties** of type
`Observable` get the same control surface. Enable them by importing the rxjs layer once:

```ts
import 'vitest-auto-spy/rxjs';
```

```ts
myService.getProducts$.nextWith([{ name: 'Product 1' }]); // emit, stream stays open
myService.getProducts$.nextOneTimeWith([{ name: 'X' }]);  // emit one value, then complete
myService.getProducts$.throwWith('FAKE ERROR');           // error the stream
myService.getProducts$.complete();                        // complete the stream

// emit a precise sequence — values, errors, completion, optional delays
myService.getProducts$.nextWithValues([
  { value: [{ name: 'Product 1' }] },
  { errorValue: 'FAKE ERROR' },
  { complete: true },
]);

// a fresh stream per call
myService.getProducts$.nextWithPerCall([{ value: ['a'] }, { value: ['b'] }]);

// grab the underlying Subject for full manual control
const subject = myService.getProducts$.returnSubject();
subject.next([{ name: 'manual' }]);
```

`calledWith(...)` / `mustBeCalledWith(...)` also chain into the observable helpers:

```ts
myService.getProducts$.calledWith(1).nextWith([{ name: 'Product 1' }]);
```

### Standalone observable builder

```ts
import { createObservableWithValues } from 'vitest-auto-spy/rxjs';

const fake$ = createObservableWithValues([{ value: 1 }, { value: 2 }, { complete: true }]);

// or get the subject too
const { values$, subject } = createObservableWithValues([{ value: 1 }], { returnSubject: true });
```

## Getters & setters

```ts
const spy = createSpyFromClass(MyService, {
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
});

// configure / assert the getter
spy.accessorSpies.getters.userName.mockReturnValue('Fake Name');
expect(spy.userName).toBe('Fake Name');

// assert the setter was called
spy.userName = 'New Name';
expect(spy.accessorSpies.setters.userName).toHaveBeenCalledWith('New Name');
```

## Framework adapters

The core is framework-agnostic — `createSpyFromClass` / `createAutoMock` work in any test. The
subpaths below add a natural import and, where the framework has class DI, a tiny `provide*` helper.
None of them pull the framework into this package; they're recipes over the same core.

### NestJS

Use `provideAutoSpy` to register a fully-mocked service in a `TestingModule`, then `injectSpy` to
pull it back out already typed as `Spy<T>`. `@nestjs/common` / `@nestjs/testing` are your own
(optional) peers — the helper imports neither:

```ts
import { Test, type TestingModule } from '@nestjs/testing';
import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/nestjs';
import { beforeEach, expect, it } from 'vitest';

import { AuthService } from './auth.service';
import { UserService } from './user.service';

let moduleRef: TestingModule;
let userServiceSpy: Spy<UserService>;

beforeEach(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [AuthService, provideAutoSpy(UserService)],
  }).compile();

  userServiceSpy = injectSpy(moduleRef, UserService);
});

it('logs in a known user', () => {
  userServiceSpy.findByEmail.mockReturnValue({ id: 1, name: 'Ada' });

  const auth = moduleRef.get(AuthService);
  expect(auth.login('ada@example.com')).toBeTruthy();
  expect(userServiceSpy.findByEmail).toHaveBeenCalledWith('ada@example.com');
});
```

### React (Testing Library)

React has no DI container, so there's no `provide*` helper — the recipe is: **spy the classes you
own** (services, stores, API clients, hook deps), then pass the spy into a Context provider or hook.
The spy is a plain object of spied functions, so it drops straight into `value={...}`:

```ts
import { render, screen } from '@testing-library/react';
import { createSpyFromClass, type Spy } from 'vitest-auto-spy/react';
import { CartContext, Cart } from './cart';

class CartStore {
  getItemCount(): number { return 0; }
  checkout(token: string): Promise<{ orderId: string }> { /* ... */ }
}

let cart: Spy<CartStore>;

beforeEach(() => {
  cart = createSpyFromClass(CartStore); // every method is now a spy
});

it('shows the item count from the injected store', () => {
  cart.getItemCount.mockReturnValue(3);

  render(
    <CartContext.Provider value={cart}>
      <Cart />
    </CartContext.Provider>,
  );

  expect(screen.getByText('3 items')).toBeInTheDocument();
});

it('drives async deps and asserts the component called them', async () => {
  cart.checkout.resolveWith({ orderId: 'ord_42' });
  // ...trigger checkout in the UI...
  expect(cart.checkout).toHaveBeenCalledWith('tok_abc');
});
```

### Vue / Pinia

`provideAutoSpy(token, Class)` returns a `{ [token]: Spy<T> }` map you can spread into
`@vue/test-utils`' `global.provide`; for a class-based Pinia store, spy it directly:

```ts
import { mount } from '@vue/test-utils';
import { createSpyFromClass, provideAutoSpy } from 'vitest-auto-spy/vue';

// (a) class-based service injected via provide / global.provide
import { UserServiceKey, UserService } from '@/services/user.service';

const provide = provideAutoSpy(UserServiceKey, UserService); // { [UserServiceKey]: Spy<UserService> }
provide[UserServiceKey].getName.mockReturnValue('Fake Name');

const wrapper = mount(UserBadge, { global: { provide } });
expect(provide[UserServiceKey].getName).toHaveBeenCalled();

// (b) class-based Pinia store — every action becomes a spy
import { CartStore } from '@/stores/cart.store';

const store = createSpyFromClass(CartStore);
store.itemCount.mockReturnValue(3);                  // sync action/getter
store.checkout.resolveWith({ orderId: 'ord_42' });   // async action (Promise)
await store.checkout('tok_abc');
expect(store.checkout).toHaveBeenCalledWith('tok_abc');
```

### Svelte

Svelte has no class-based DI, so it's a recipe: keep your logic in plain class-based
services/stores, spy the class, and hand the spy to the component the same way it receives the real
one (props, context, or a mocked module):

```ts
import { render } from '@testing-library/svelte';
import { createSpyFromClass } from 'vitest-auto-spy/svelte';
import Cart from './Cart.svelte';
import { CartStore } from './cart-store';

it('shows the cart total from the store', () => {
  const cartStore = createSpyFromClass(CartStore); // every method is a spy

  cartStore.total.mockReturnValue(42);
  cartStore.priceOf.calledWith('apple').mockReturnValue(7);

  render(Cart, { props: { store: cartStore } });

  expect(cartStore.total).toHaveBeenCalled();
});
```

### Angular

`provideAutoSpy` is the shorthand for providing an auto-spy in a `TestBed`:

```ts
import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [
    provideAutoSpy(MyService),
    // accepts the same second argument as createSpyFromClass
    provideAutoSpy(ApiService, { methodsToSpyOn: ['get', 'post'] }),
  ],
});

let myService: Spy<MyService>;

beforeEach(() => {
  myService = injectSpy(MyService);
});
```

> The spies are change-detection agnostic, so they work in **both zoneless and
> zone.js** Angular projects — nothing here touches `NgZone` or change detection.
> You only need the usual Vitest + Angular wiring:
> [`@analogjs/vite-plugin-angular`](https://www.npmjs.com/package/@analogjs/vite-plugin-angular)
> plus a TestBed setup file (e.g. `@analogjs/vitest-angular`'s `setupTestBed()`).

#### Signal / readonly property mocking (bonus)

```ts
import { mockReadonlyProp, mockReadonlyPropGetter, mockAccessorsProp } from 'vitest-auto-spy/angular';

mockReadonlyProp(service, 'isReady', true);              // static value (incl. signals)
mockReadonlyPropGetter(service, 'label', () => 'A');     // dynamic getter
mockAccessorsProp(service, 'theme');                     // spied get + set
```

## API reference

| Export | Description |
| --- | --- |
| `createSpyFromClass(Class, methodsOrConfig?)` | Build a fully-typed `Spy<T>` from a class |
| `createAutoMock<T>(overrides?)` | Build a `Spy<T>` from a **type/interface** alone (Proxy, no class) |
| `provideAutoSpy(Class, methodsOrConfig?)` | Angular / NestJS `{ provide, useValue }` shorthand |
| `provideAutoSpy(token, Class, methodsOrConfig?)` | Vue `{ [token]: Spy<T> }` for `global.provide` |
| `injectSpy(token)` _(Angular)_ / `injectSpy(moduleRef, token)` _(NestJS)_ | Inject typed as `Spy<T>` |
| `createFunctionSpy(name)` | A single standalone function spy with all helpers |
| `createObservableWithValues(configs, opts?)` | Build an Observable from value configs |
| `mockReadonlyProp` / `mockReadonlyPropGetter` / `mockAccessorsProp` | Mock readonly / accessor / signal props |
| `errorHandler` | The `mustBeCalledWith` argument-mismatch error helper |

**Spied sync method:** `mockReturnValue`, `calledWith(...)`, `mustBeCalledWith(...)`

**Spied Promise method:** `resolveWith`, `rejectWith`, `resolveWithPerCall`

**Spied Observable method / property:** `nextWith`, `nextOneTimeWith`, `nextWithValues`,
`nextWithPerCall`, `throwWith`, `complete`, `returnSubject`

**Config (`ClassSpyConfiguration`):** `methodsToSpyOn`, `observablePropsToSpyOn`,
`gettersToSpyOn`, `settersToSpyOn`

`ValueConfig` (for `nextWithValues`): `{ value, delay? }` | `{ errorValue, delay? }` | `{ complete?, delay? }`.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and the
[Code of Conduct](./CODE_OF_CONDUCT.md). In short:

```bash
npm ci
npm test            # run the suite
npm run test:coverage   # 100% thresholds enforced
npm run build
```

Releases are automated: merging a PR into `master` bumps the version from the
Conventional Commit types and publishes to npm — see
[CONTRIBUTING.md → Releases](./CONTRIBUTING.md#releases).

If this package saved you time, a ⭐ on [GitHub](https://github.com/ASDAlexey/vitest-auto-spy)
helps others find it.

## License

[MIT](./LICENSE) © [Alexey Popov](https://github.com/ASDAlexey)
