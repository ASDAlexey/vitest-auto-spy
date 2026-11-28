---
title: Migrating from @ngneat/spectator
description: Replace Spectator spies and TestBed setup in Angular service and component tests, with before-and-after examples and an Angular 22 workaround.
---

# Migrating from `@ngneat/spectator`

Replace Spectator's spies and `TestBed` setup with `vitest-auto-spy`. Use this guide if Spectator won't
load on Angular 22 or you want to remove its jQuery dependency and Jasmine types.
This service test uses your app's `CartService` and `PricingService`:

::: code-group

```ts [After — vitest-auto-spy]
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

it('totals the cart', () => {
  TestBed.configureTestingModule({ providers: [CartService, provideAutoSpy(PricingService)] });
  injectSpy(PricingService).total.mockReturnValue(120);
  expect(TestBed.inject(CartService).checkout()).toBe(120);
});
```

```ts [Before — @ngneat/spectator]
import { createServiceFactory } from '@ngneat/spectator/vitest';
import { expect, it } from 'vitest';

const createService = createServiceFactory({ service: CartService, mocks: [PricingService] });

it('totals the cart', () => {
  const spectator = createService();
  spectator.inject(PricingService).total.andReturn(120);
  expect(spectator.service.checkout()).toBe(120);
});
```

:::

- Use `provideAutoSpy(X)` instead of `mocks: [X]` or `mockProvider(X)`.
- Use `injectSpy(X)` instead of `spectator.inject(X)`. It returns the same spy within a test.
- `TestBed.inject(CartService)` creates the service. If its constructor calls `total()`, set the answer
  in the provider: `provideAutoSpy(PricingService, { returns: { total: 120 } })`. Otherwise, you can set
  it any time before the test calls the method.

For `spectator.query` and DOM matchers, see [Component specs](#component-specs-—-what-is-and-is-not-covered).

## Install and delete

```bash
npm i -D vitest-auto-spy
npm un @ngneat/spectator
```

Remove these from `devDependencies` only if you no longer need them:

- `@types/jasmine`, if only Spectator needed its types.
- `@angular/platform-browser-dynamic`, if you installed it only as the
  [Angular 22 workaround](#the-angular-22-failure).

Use `vitest-auto-spy/angular` with Angular's `@angular/build:unit-test` builder or with
`@analogjs/vite-plugin-angular` and a `TestBed` setup file. See [the Angular adapter](/adapters/angular).

For `Observable` helpers such as `nextWith` and `throwWith`, add `import 'vitest-auto-spy/rxjs';` to
your test setup file once. See [RxJS](/runtimes/rxjs).

**Vitest fails at startup with `TypeError: cache.has is not a function`:** `@angular/build` 22.2 needs
Analog 2.7.5 or newer. Update both `@analogjs/vite-plugin-angular` and `@analogjs/vitest-angular`.
`npx vitest-auto-spy doctor` reports this as
[`analog-behind-angular-build`](/utilities/cli#analog-behind-angular-build).

## The translation table

| `@ngneat/spectator`                                          | `vitest-auto-spy`                                                                            | Notes                                                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `createServiceFactory({ service: S, … })`                    | `TestBed.configureTestingModule({ providers: [S, …] })`                                      | Angular's own API; there is no factory to create                                                                 |
| `mocks: [Dep]` in any factory                                | `providers: [provideAutoSpy(Dep)]`                                                           | one `provideAutoSpy` per mocked class                                                                            |
| `mockProvider(Dep)`                                          | [`provideAutoSpy(Dep)`](/adapters/angular)                                                   | goes in `providers`, same place                                                                                  |
| `mockProvider(Dep, { taxRate: 0.2 })`                        | `provideAutoSpy(Dep, { overrides: { taxRate: 0.2 } })`                                       | a plain value for a field or getter                                                                              |
| `mockProvider(Dep, { load: () => of(user) })`                | `provideAutoSpy(Dep, { returns: { load: of(user) } })`                                       | the method stays a spy and answers this value                                                                    |
| `spectator.service`                                          | `TestBed.inject(Service)`                                                                    | the real instance under test                                                                                     |
| `spectator.inject(Dep)`                                      | [`injectSpy(Dep)`](/adapters/angular)                                                        | **warns** when the injector returned a real instance                                                             |
| `createSpyObject(Service)`                                   | [`createSpyFromClass(Service)`](/core/create-spy-from-class)                                 | a spy for every method on the class; see [the typing trap](#the-typing-trap)                                     |
| `SpyObject<T>`                                               | [`Spy<T>`](/core/spy-typing)                                                                 | typed from the real class                                                                                        |
| `as SpyObject<T>` cast                                       | [`asSpy(x)`](/core/spy-typing) / `asInstance(spy)`                                           | named conversions instead of a cast                                                                              |
| `spy.method.andReturn(v)`                                    | `spy.method.mockReturnValue(v)`                                                              | plus `calledWith(...)` to answer per argument                                                                    |
| `spy.method.andCallFake(fn)`                                 | `spy.method.mockImplementation(fn)`                                                          |                                                                                                                  |
| _(no equivalent)_                                            | `spy.load.resolveWith(v)` / `.nextWith(v)` / `.failWith(e)`                                  | [helpers](/core/control-helpers): answer for a `Promise` method, for an `Observable` method, make any call throw |
| _(no equivalent)_                                            | `gettersToSpyOn` / `settersToSpyOn` / `autoSpyAccessors`                                     | spies on getters and setters                                                                                     |
| `createComponentFactory({ component: Cmp, shallow: true })`  | [`renderShallow(Cmp, { … })`](/adapters/angular#shallow-component-rendering)                 | blanks the component's template; `keepTemplate: true` keeps it                                                   |
| `detectChanges: false` in the factory                        | `detectChanges: false` on `renderShallow`                                                    | `ngOnInit` waits until you call `fixture.detectChanges()`                                                        |
| `spectator.component`                                        | `component` from `renderShallow`                                                             |                                                                                                                  |
| `spectator.fixture`                                          | `fixture` from `renderShallow`                                                               | a real `ComponentFixture`                                                                                        |
| `spectator.detectChanges()`                                  | `fixture.detectChanges()` / `await stable(fixture)`                                          | use `stable` in a zoneless app; see [Zoneless waiting](/adapters/angular#zoneless-waiting)                       |
| `spectator.setInput({ x: 1 })`                               | `inputs: { x: 1 }` on `renderShallow`, or `fixture.componentRef.setInput`                    | signal inputs take the **value**                                                                                 |
| `SpectatorHost` / `createHostFactory`                        | a host component declared in the spec, created with `TestBed.createComponent(Host)`          | no helper here                                                                                                   |
| `spectator.query(byTestId('x'))`                             | `fixture.debugElement.query(By.css('[data-testid=x]'))`                                      | **not provided here**; Angular's own API, or Testing Library                                                     |
| `spectator.click(el)`, `typeInElement`, `dispatchMouseEvent` | `@testing-library/angular` + `@testing-library/user-event`                                   | **not provided here**                                                                                            |
| `toHaveClass`, `toHaveText`, `toBeVisible`, …                | `@testing-library/jest-dom`                                                                  | **not provided here**                                                                                            |
| `SpectatorHttp` / `createHttpFactory`                        | [`provideHttpTesting()` / `expectRequest()`](/adapters/angular-http)                         | fails a test that leaves a request unanswered                                                                    |
| `SpectatorRouting` / `createRoutingFactory`, `setRouteParam` | [`provideActivatedRoute()` / `injectActivatedRoute().setParams()`](/adapters/angular-router) | Angular's own `ActivatedRoute`; `setParams` replaces the whole set, not one key                                  |
| `flushEffects()`                                             | [`flushEffects()`](/adapters/angular)                                                        | same name, same job                                                                                              |
| `runInInjectionContext(fn)`                                  | `TestBed.runInInjectionContext(fn)`                                                          | Angular's own                                                                                                    |

## A service spec, before and after

The service in this test has two dependencies. One returns an `Observable`.

::: code-group

```ts [Before — @ngneat/spectator]
import { SpectatorService, SpyObject, createServiceFactory, mockProvider } from '@ngneat/spectator/vitest';
import { of } from 'rxjs';

describe('CartService', () => {
  let spectator: SpectatorService<CartService>;
  let api: SpyObject<ApiService>;
  let pricing: SpyObject<PricingService>;

  const createService = createServiceFactory({
    service: CartService,
    providers: [mockProvider(ApiService), mockProvider(PricingService, { taxRate: 0.2 })],
  });

  beforeEach(() => {
    spectator = createService();
    api = spectator.inject(ApiService);
    pricing = spectator.inject(PricingService);
  });

  it('totals the cart', async () => {
    api.loadItems.andReturn(of([{ price: 100 }]));
    pricing.total.andReturn(120);

    expect(await spectator.service.checkout()).toBe(120);
  });
});
```

```ts [After — vitest-auto-spy]
import { TestBed } from '@angular/core/testing';
import type { Spy } from 'vitest-auto-spy';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

describe('CartService', () => {
  let service: CartService;
  let api: Spy<ApiService>;
  let pricing: Spy<PricingService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CartService, provideAutoSpy(ApiService), provideAutoSpy(PricingService, { overrides: { taxRate: 0.2 } })],
    });

    service = TestBed.inject(CartService);
    api = injectSpy(ApiService);
    pricing = injectSpy(PricingService);
  });

  it('totals the cart', async () => {
    api.loadItems.nextWith([{ price: 100 }]);
    pricing.total.mockReturnValue(120);

    expect(await service.checkout()).toBe(120);
  });
});
```

:::

- Use `nextWith(value)` instead of `andReturn(of(value))`.
  [Helpers match the method's return type](/core/control-helpers): `nextWith` and `throwWith` for
  `Observable`, `resolveWith` and `rejectWith` for `Promise`.
- If Angular gives `injectSpy` a real instance, the warning names the token and the missing
  `provideAutoSpy` call.
- `Spy<T>` uses the original class's types, so TypeScript can catch more mistakes. See
  [the typing trap](#the-typing-trap).

### The same spec with no `let` and no `beforeEach`

With Vitest 4.1 or newer, use
[`extendWithAutoSpies`](/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies)
so each test creates only the spies it asks for:

```ts
import { TestBed } from '@angular/core/testing';
import { test as base } from 'vitest';
import { extendWithAutoSpies } from 'vitest-auto-spy/angular';

const test = extendWithAutoSpies(
  base,
  { api: ApiService, pricing: [PricingService, { overrides: { taxRate: 0.2 } }] },
  { providers: [CartService] },
);

test('totals the cart', async ({ api, pricing }) => {
  api.loadItems.nextWith([{ price: 100 }]);
  pricing.total.mockReturnValue(120);

  expect(await TestBed.inject(CartService).checkout()).toBe(120);
});
```

## Component specs — what is and is not covered

Use `renderShallow` to set up the component and `provideAutoSpy` for its dependencies. Handle DOM
queries and events separately:

::: code-group

```ts [Before — @ngneat/spectator]
import { Spectator, createComponentFactory } from '@ngneat/spectator/vitest';
import { of } from 'rxjs';

describe('ProfileComponent', () => {
  let spectator: Spectator<ProfileComponent>;

  const createComponent = createComponentFactory({
    component: ProfileComponent,
    shallow: true,
    mocks: [UserService],
    detectChanges: false,
  });

  it('shows the user name', () => {
    spectator = createComponent();
    spectator.inject(UserService).load.andReturn(of({ name: 'Ann' }));
    spectator.detectChanges();

    expect(spectator.component.name()).toBe('Ann');
  });
});
```

```ts [After — vitest-auto-spy]
import { of } from 'rxjs';
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

describe('ProfileComponent', () => {
  it('shows the user name', () => {
    const { component } = renderShallow(ProfileComponent, {
      providers: [provideAutoSpy(UserService, { returns: { load: of({ name: 'Ann' }) } })],
    });

    expect(component.name()).toBe('Ann');
  });
});
```

:::

Set the spy's answer in the provider so `ngOnInit` sees it on the first change detection run. To
configure the spy after creating the component, pass `detectChanges: false` to `renderShallow`.
Then configure `injectSpy(UserService)` and call `fixture.detectChanges()`.

**Covered: the `TestBed` setup.** [`renderShallow`](/adapters/angular#shallow-component-rendering)
combines `configureTestingModule`, `NO_ERRORS_SCHEMA`, and `overrideComponent`. It clears the
component's `imports` and template so Angular skips the children. Hooks, inputs, signals, and
injected dependencies still work. If you need the template for `viewChild` or content projection,
pass `keepTemplate: true`. Angular still skips the children.

```ts
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService)],
  inputs: { projectId: 42 }, // signal inputs take the VALUE, not the signal
});
```

**Covered: signals, effects, resources and HTTP.** Use `mockSignalProp`, `mockReadonlyProp`,
`runEffect`, `flushEffects`, `stable(fixture)`, and `settleResource`. Use
[`expectRequest`](/adapters/angular-http) in place of `SpectatorHttp` and `HttpTestingController` calls.

**Not covered: DOM queries and events.** Replace `spectator.query`, `byTestId`, and `spectator.click`
with the Angular APIs that Spectator wraps:

```ts
import { By } from '@angular/platform-browser';

const row = fixture.debugElement.query(By.css('[data-testid="task-row"]'));
row.triggerEventHandler('click', {});
```

**Not covered: DOM matchers.** For `toHaveClass`, `toHaveText`, `toBeVisible`, and most other matchers,
use [`@testing-library/jest-dom`](https://github.com/testing-library/jest-dom) with Vitest's `expect.extend`.

If you mostly test the DOM, use `vitest-auto-spy` for spies and `TestBed` setup, and
[`@testing-library/angular`](https://testing-library.com/docs/angular-testing-library/intro) for
rendering and queries. Both packages are maintained.

## The typing trap {#the-typing-trap}

Spectator types `inject` as `SpyObject<T>` even when the token resolves to a real instance:

```ts
// node_modules/@ngneat/spectator/lib/base/base-spectator.d.ts:7
inject<T>(token: Token<T>): SpyObject<T>;
```

`SpyObject<T>` types every method of `T` as a spy:

```ts
// node_modules/@ngneat/spectator/lib/mock.d.ts:29
export type SpyObject<T> = T & {
  [P in keyof T]: T[P] extends UnknownFunction ? T[P] & CompatibleSpy<T[P]> : T[P];
} & { castToWritable(): Writable<T> };
```

If you forget `mockProvider`, `spectator.inject(RealService).doThing.andReturn(1)` still compiles.
Calling `andReturn` throws `andReturn is not a function`. Calling the real method directly can let
an incorrect test pass.

- **`Spy<T>` leaves out `private` and `#private` members.** When a function expects the real class
  type `T`, use `asInstance(spy)`. Use `asSpy(x)` for the reverse. Neither needs an `as unknown as T` cast. See
  [Bridging `Spy<T>` and `T`](/core/spy-typing).
- **`injectSpy` checks what Angular actually provides.** If it gets a real instance, it warns once
  per token and names the missing `provideAutoSpy` call. To fail the test instead, use
  [`enableAngularDiagnostics({ unspiedProviders: true })`](/adapters/angular-diagnostics).

If you misspell a method name, `createSpyObject` creates no spy for it, and `SpyObject<T>` won't
flag it. With `createSpyFromClass(UserService, { onlyMethodsToSpyOn: ['laod'] })`, you get a message
that `laod` isn't on the class. With [`strict: true`](/core/create-spy-from-class#strict), an unconfigured
call throws instead of returning `undefined`. The error names the class, method, and arguments.

## What you gain by moving

- **No runtime dependencies.** Spectator has three, including jQuery.
- **No Jasmine globals.** Remove `@types/jasmine` with Spectator if you no longer need it.
  `vitest-auto-spy` does not declare `namespace jasmine`.
- **Angular 22, 21, and 20 support** without the deprecated package.
- **Getter and setter spies.** Use `gettersToSpyOn` and `settersToSpyOn`, or let `autoSpyAccessors`
  find every accessor on the class and its parents. Spectator doesn't spy on accessors.
- **Helpers for different returns.** Use `resolveWith` and `rejectWith` for a `Promise`, or `nextWith`
  and `throwWith` for an `Observable`. Use `calledWith(...)` to answer by argument and `failWith` to
  throw on any call. Spectator has `andReturn` and `andCallFake`.
- **Type and provider checks.** `Spy<T>` follows the class type. `injectSpy` warns if you forgot the spy provider.
- **With or without zone.js.** Spies don't use `NgZone`. To use Angular's `fakeAsync`, load
  [`vitest-auto-spy/zone`](/runtimes/vitest).
- **Works with AOT (ahead-of-time compilation).** Use Angular's `@angular/build:unit-test` builder.
  [`assertNgModuleScopes` and `assertComponentDefIntact`](/adapters/angular-diagnostics) report two
  AOT-only errors closer to their cause.
- **Beyond Vitest.** Use the same API on `bun:test` and `node:test`, or run Angular's `TestBed`
  [under `bun test`](/runtimes/bun-angular).
- **[Lint rules](/utilities/eslint-plugin)** ship with the API they recommend.

## Did the migration lose a test?

Compare test **names**, not counts. If one `describe` disappears and a flaky test passes elsewhere,
matching counts can hide the loss. Use `compareTestRuns` on two JSON reports. See the
[Jest migration example](/migrating#did-the-migration-lose-a-test).

Use your last passing Spectator run as the baseline. On Angular 22, install
`@angular/platform-browser-dynamic` for that run and remove it afterward.

## Why Spectator stops working

The versions and figures below come from published packages and the npm and GitHub APIs, checked on
**2026-09-02**.

::: info How these were checked
`npm pack @ngneat/spectator` and `npm pack @openng/spectator` supplied the package files. `npm view`
supplied versions and publish dates, and `api.github.com` supplied repository status. A fresh
`npm install` in an empty directory reproduced the failure with Angular 22.1.4 and Spectator.
:::

**The repository is gone.** Both `https://github.com/ngneat/spectator` and
`api.github.com/repos/ngneat/spectator` return **HTTP 404**. Its issues and pull requests are gone with
it. The `ngneat` organisation still exists: `api.github.com/orgs/ngneat` returns **200**.

A third party created [`ngneat-archive/spectator`](https://github.com/ngneat-archive/spectator) on
**2026-06-07**. It describes itself as a "Verified archive of ngneat/spectator at
`@ngneat/spectator@22.1.0`". It is an archived snapshot and accepts no changes (4 stars; default branch
`restore/npm-spectator-22.1.0`).

**The last release was 22.1.0 on 2025-11-02.** It still had the `latest` dist-tag at the time of the
check. Version 22.0.0 came out on 2025-10-08 (`npm view @ngneat/spectator time`). npm does not mark the
package as deprecated.

The npm API recorded **739 852** downloads of `@ngneat/spectator` from **2026-07-31 to 2026-08-29**.
Many test projects rely on it and have no maintained upgrade path.

### The Angular 22 failure

Spectator imports a deprecated Angular testing module:

```ts
// node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs:7
import { BrowserDynamicTestingModule } from '@angular/platform-browser-dynamic/testing';
```

The bundle uses the import only for `overrideModule(BrowserDynamicTestingModule, {})` at lines
1605, 1751, 1878, and 2469. The proposed fix below removes this unused override.

- **The Angular package still installs.** At the time of the check, npm's `latest` tag was
  **22.1.4**, released alongside the other Angular packages. `types/testing.d.ts:21` still declares
  `BrowserDynamicTestingModule`. The deprecation notice says:
  _"@angular/platform-browser-dynamic is deprecated. Use `@angular/platform-browser` instead."_
- **Spectator imports the package without declaring it.** It lists it in neither `dependencies` nor
  `peerDependencies`. Its only peers are `@angular/common`, `@angular/router`, and
  `@angular/animations`. The import works if the workspace already has the package, but a fresh
  Angular 22 workspace doesn't include it.

This reproduces the failure with a clean Angular 22.1.4 install:

```console
$ npm i @angular/core@22.1.4 @angular/common@22.1.4 @angular/platform-browser@22.1.4 \
        @angular/compiler@22.1.4 @angular/router@22.1.4 @angular/animations@22.1.4 \
        @ngneat/spectator@22.1.0 rxjs zone.js
$ node -e "import('@ngneat/spectator')"
FAILED: ERR_MODULE_NOT_FOUND | Cannot find package '@angular/platform-browser-dynamic'
imported from node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs
```

**Temporary workaround:** add `@angular/platform-browser-dynamic` to your `devDependencies` so the
import resolves and your Angular 22 tests run. When Angular removes that package, the tests will
break again, and the original Spectator repository is gone.

[`openng-org/spectator#13`](https://github.com/openng-org/spectator/pull/13) proposes a fix on the fork:
_"fix: remove BrowserDynamicTestingModule override"_. It was opened on **2026-07-26**, last updated on
**2026-08-13**, and still open on 2026-09-02. The original repository no longer accepts pull requests.

### Three runtime dependencies, one of them jQuery

From the tarball's `package.json`:

```json
"dependencies": {
  "@testing-library/dom": "^10.4.1",
  "jquery": "^3.7.1",
  "tslib": "^2.6.2"
}
```

Spectator requires `jquery` at runtime. `vitest-auto-spy` has no runtime dependencies.

### It puts Jasmine's globals into your Vitest project

Spectator declares its matchers in Jasmine's namespace:

```ts
// node_modules/@ngneat/spectator/lib/matchers-types.d.ts:1
declare namespace jasmine {
  interface Matchers<T> {
    toExist(): boolean;
    // …and 20 more
  }
}
```

Its spy type also refers to Jasmine, so skipping the matchers isn't enough:

```ts
// node_modules/@ngneat/spectator/lib/mock.d.ts:11
export interface CompatibleSpy<F extends UnknownFunction = UnknownFunction>
  extends jasmine.Spy<(...args: Parameters<F>) => ReturnType<F>> {
```

`SpyObject<T>` uses `CompatibleSpy`, which depends on the global `jasmine` namespace. The Vitest entry
still uses it: `@ngneat/spectator/vitest` defines its `SpyObject` as `BaseSpyObject<T> & { … Mock … }`.
`BaseSpyObject` comes from the main entry. Even without Jasmine as your runner, you keep
`@types/jasmine` alongside Vitest's globals. Both declare `expect`.

### The `@openng/spectator` fork — what it is and is not

[`@openng/spectator`](https://www.npmjs.com/package/@openng/spectator) **1.0.1** came out on
**2026-07-10** from [`openng-org/spectator`](https://github.com/openng-org/spectator). The repository
opened on 2026-06-21 and was active at the time of the check (39 stars, 7 open issues, not archived).
From 2026-07-31 to 2026-08-29, it had **16 251** downloads to the original's 739 852, about **2.1 %**
of their combined downloads.

The fork isn't byte-identical to the original. A plain `diff` shows about 1450 changed lines,
mostly because lines moved. Normalize the package name and compiler version, remove indentation,
and sort the lines to see what changed:

```bash
norm() { sed -e 's/ngneat/openng/g' -e 's/version: "2[0-9]\.[0-9]*\.[0-9]*"/version: "X"/g' "$1" \
         | sed 's/^[[:space:]]*//' | sort; }
diff <(norm ngneat-spectator.mjs) <(norm openng-spectator.mjs)
```

Both bundles are 2543 lines. After normalisation exactly **three** lines differ:

| The fork's runtime differs by                                               | Detail                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Recompiled with a newer Angular compiler                                    | `version: "22.0.5"` in the declarations, against `"20.1.0"` |
| The internal host component gained a change-detection strategy              | `changeDetection: ChangeDetectionStrategy.Eager`            |
| A triple-slash reference to `matchers-types.ts` was dropped from the bundle | a result of how the types are packaged, below               |

The fork ships 33 files instead of 121. It bundles declarations into four files under `types/`
instead of copying the source tree. It raises `peerDependencies` to `>= 22.0.0` and adds
`"type": "module"`. All three runtime dependencies, including jQuery, stay the same.

Two problems remain:

- **Angular 22 still fails to load the fork.** `openng-spectator.mjs:7` imports the undeclared
  `@angular/platform-browser-dynamic/testing`. A fresh install of `@openng/spectator@1.0.1` with
  Angular 22.1.4 gives the same `ERR_MODULE_NOT_FOUND`. The Angular 22 build recompiles the library
  and raises the peer range. The Angular 22 fix in PR #13 was still open at the time of the check.
- **Jasmine's namespace is still present.** `types/openng-spectator.d.ts:11` declares
  `namespace jasmine {`, and line 84 still has `CompatibleSpy … extends jasmine.Spy`.

The fork has an active maintainer, but it hasn't shipped the Angular 22 fix.

## See also

- [Comparison](/comparison): Angular testing libraries side by side, with their last release dates.
- [Angular adapter](/adapters/angular): `provideAutoSpy`, `injectSpy`, `renderShallow`, and waiting
  for changes without zone.js.
- If you also use an auto-spy library, see [Migrating from jest-auto-spies](/migrating) or
  [from jasmine-auto-spies](/migrating-jasmine).
