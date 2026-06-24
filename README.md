<div align="center">

# vitest-auto-spy

**Automatic, fully-typed test spies from a class — powered by Vitest's `vi.fn()`.**

A drop-in replacement for [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies):
same API, but spying only on **Vitest** instead of Jest.

[![npm version](https://img.shields.io/npm/v/vitest-auto-spy?color=cb3837&logo=npm)](https://www.npmjs.com/package/vitest-auto-spy)
[![npm downloads](https://img.shields.io/npm/dm/vitest-auto-spy?color=cb3837&logo=npm)](https://www.npmjs.com/package/vitest-auto-spy)
[![CI](https://github.com/ASDAlexey/vitest-auto-spy/actions/workflows/ci.yml/badge.svg)](https://github.com/ASDAlexey/vitest-auto-spy/actions/workflows/ci.yml)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/vitest-auto-spy?label=minzip)](https://bundlephobia.com/package/vitest-auto-spy)
[![types](https://img.shields.io/npm/types/vitest-auto-spy?logo=typescript&logoColor=white)](https://www.npmjs.com/package/vitest-auto-spy)
[![coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/ASDAlexey/vitest-auto-spy/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vitest-auto-spy?color=blue)](./LICENSE)

📦 [**npm**](https://www.npmjs.com/package/vitest-auto-spy) · 🐙 [**GitHub**](https://github.com/ASDAlexey/vitest-auto-spy) · 🔖 [**Changelog**](./CHANGELOG.md)

</div>

---

- 🧪 Reads a class and generates a typed `vi.fn()` spy for **every** method
- 🎯 Return-type-aware helpers — sync, `Promise`, and `Observable` all get the right API
- 🔀 `calledWith` / `mustBeCalledWith` argument dispatch
- 📡 First-class RxJS `Observable` spying (`nextWith`, `nextWithValues`, `throwWith`, …)
- ⚙️ Getter / setter spies via `accessorSpies`
- 🅰️ Angular helpers (`provideAutoSpy`, `injectSpy`) — works with **both zoneless and zone.js**
- 🟢 100% test coverage, **zero runtime dependencies** (in-tree arg serializer, no `javascript-stringify`)

## Table of contents

- [Install](#install)
- [Why](#why)
- [Migrating from jest-auto-spies](#migrating-from-jest-auto-spies)
- [Configuration](#configuration)
- [Synchronous methods](#synchronous-methods)
- [Promise-returning methods](#promise-returning-methods)
- [Observable methods & properties](#observable-returning-methods--observable-properties)
- [Getters & setters](#getters--setters)
- [Angular helpers](#angular-helpers)
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

The library ships a framework-agnostic core and two opt-in layers, so a plain Node / Bun /
React / Vue project pulls **neither rxjs nor Angular into its runtime bundle**:

| Import | Provides | Pulls in |
| --- | --- | --- |
| `vitest-auto-spy` | `createSpyFromClass`, `createFunctionSpy`, sync + promise + accessor spies, `errorHandler`, types | `vitest` |
| `vitest-auto-spy/rxjs` | observable spies (`nextWith`, `nextWithValues`, `observablePropsToSpyOn`, …) + `createObservableWithValues` | `rxjs` |
| `vitest-auto-spy/angular` | `provideAutoSpy`, `injectSpy`, `mockReadonlyProp*`, `mockAccessorsProp` | `@angular/core` |

```ts
import { createSpyFromClass } from 'vitest-auto-spy';
import 'vitest-auto-spy/rxjs'; // once (e.g. in your test setup) — enables observable spies
import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/angular';
```

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

## Angular helpers

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

### Signal / readonly property mocking (bonus)

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
| `provideAutoSpy(Class, methodsOrConfig?)` | Angular `{ provide, useValue }` shorthand |
| `injectSpy(token)` | `TestBed.inject` typed as `Spy<T>` |
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
