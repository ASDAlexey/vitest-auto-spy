---
title: Migrating from @ngneat/spectator
description: Move Spectator service and component specs to vitest-auto-spy - the API side by side, full before and after specs, the DOM parts you keep, and why Spectator fails on Angular 22.
---

# Migrating from `@ngneat/spectator`

This page moves Angular specs from Spectator to `vitest-auto-spy`. You need it when Spectator stops
loading after an Angular upgrade (it fails on Angular 22), or when you want its jQuery and Jasmine
types out of the project. A service spec changes like this:

::: code-group

```ts [Before — @ngneat/spectator]
import { createServiceFactory } from '@ngneat/spectator/vitest';

const createService = createServiceFactory({ service: CartService, mocks: [PricingService] });

it('totals the cart', () => {
  const spectator = createService();
  spectator.inject(PricingService).total.andReturn(120);
  expect(spectator.service.checkout()).toBe(120);
});
```

```ts [After — vitest-auto-spy]
import { TestBed } from '@angular/core/testing';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

it('totals the cart', () => {
  TestBed.configureTestingModule({ providers: [CartService, provideAutoSpy(PricingService)] });
  injectSpy(PricingService).total.mockReturnValue(120);
  expect(TestBed.inject(CartService).checkout()).toBe(120);
});
```

:::

- `provideAutoSpy(X)` replaces `mocks: [X]` and `mockProvider(X)`.
- `injectSpy(X)` replaces `spectator.inject(X)`. Within one test it always returns the same spy.
- `TestBed.inject(CartService)` runs the `CartService` constructor. If the constructor calls
  `total()`, put the answer in the provider: `provideAutoSpy(PricingService, { returns: { total: 120 } })`.
  Any other answer can be set later, before the test calls the method.

This library covers spies and `TestBed` setup, not DOM queries. For `spectator.query` and the DOM
matchers, see [Component specs](#component-specs-—-what-is-and-is-not-covered).

## Install and delete

```bash
npm i -D vitest-auto-spy
npm un @ngneat/spectator
```

Then remove from `devDependencies`:

- `@types/jasmine`, if nothing else needs it. Spectator's types were the reason it was there.
- `@angular/platform-browser-dynamic`, if you added it only as the
  [Angular 22 workaround](#the-angular-22-failure).

`vitest-auto-spy/angular` needs a working Vitest + Angular setup: either Angular's own
`@angular/build:unit-test` builder, or `@analogjs/vite-plugin-angular` plus a `TestBed` setup file.
See [the Angular adapter](/adapters/angular).

If you use the `Observable` helpers (`nextWith`, `throwWith`), import `vitest-auto-spy/rxjs` once in
your setup file: `import 'vitest-auto-spy/rxjs';`. See [RxJS](/runtimes/rxjs).

**Common mistake:** Analog older than 2.7.5 on `@angular/build` 22.2. Vitest fails at startup with
`TypeError: cache.has is not a function`. Update both `@analogjs/vite-plugin-angular` and
`@analogjs/vitest-angular`. `npx vitest-auto-spy doctor` reports this as
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

A service under test with two dependencies. One of them returns an `Observable`.

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

Besides the names, three things changed:

- `nextWith(value)` replaces `andReturn(of(value))`. The helper is
  [picked from the method's return type](/core/control-helpers): an `Observable` method gets
  `nextWith` / `throwWith`, a `Promise` method gets `resolveWith` / `rejectWith`.
- `injectSpy` warns when the injector returns a real instance instead of a spy. The warning names
  the token and the missing `provideAutoSpy` call.
- `Spy<T>` is typed from the real class, so the compiler catches more. See
  [the typing trap](#the-typing-trap).

### The same spec with no `let` and no `beforeEach`

On Vitest 4.1 or newer,
[`extendWithAutoSpies`](/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies)
turns each dependency into a test fixture. A test builds only the spies it names:

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

This library replaces Spectator's `TestBed` setup and its spies. It does not query the DOM or fire
events. A typical Spectator component spec moves like this:

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

The spy's answer is set in the provider, so the component reads it on its first change detection.
You no longer need `detectChanges: false` to set it before `ngOnInit`. To set the answer later instead, pass
`detectChanges: false` to `renderShallow`, configure `injectSpy(UserService)`, then call
`fixture.detectChanges()`.

**Covered: the `TestBed` setup.** [`renderShallow`](/adapters/angular#shallow-component-rendering)
does `configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent` in one call. It empties the
component's `imports` and blanks its template, so no child component renders. Lifecycle hooks,
inputs, signals and DI still work. Pass `keepTemplate: true` to keep the real template (for
`viewChild` and content projection); child components are still dropped.

```ts
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService)],
  inputs: { projectId: 42 }, // signal inputs take the VALUE, not the signal
});
```

**Covered: signals, effects, resources and HTTP.** `mockSignalProp`, `mockReadonlyProp`,
`runEffect`, `flushEffects`, `stable(fixture)`, `settleResource`, and
[`expectRequest`](/adapters/angular-http) in place of the `HttpTestingController` calls. Spectator's
`SpectatorHttp` maps onto `expectRequest`.

**Not covered: DOM queries and events.** There is no `spectator.query`, no `byTestId`, no
`spectator.click`. Use Angular's own API, which Spectator wrapped:

```ts
import { By } from '@angular/platform-browser';

const row = fixture.debugElement.query(By.css('[data-testid="task-row"]'));
row.triggerEventHandler('click', {});
```

**Not covered: DOM matchers.** `toHaveClass`, `toHaveText`, `toBeVisible` and Spectator's other
DOM matchers have no counterpart here.
[`@testing-library/jest-dom`](https://github.com/testing-library/jest-dom) has equivalents for most
of them and works with Vitest's `expect.extend`.

If your specs mostly assert on the DOM, migrate to two packages: `vitest-auto-spy` for spies and
`TestBed` setup, and
[`@testing-library/angular`](https://testing-library.com/docs/angular-testing-library/intro) for
rendering and queries. Both are maintained.

## The typing trap {#the-typing-trap}

This is the difference that changes which bugs your tests can catch.

Spectator's `inject` returns a `SpyObject<T>` for any token, mocked or not:

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

So if you forget a `mockProvider`, `spectator.inject(RealService).doThing.andReturn(1)` still
compiles. At runtime it throws `andReturn is not a function`. Or it does not throw: the real method
runs, returns something plausible, and the test passes for the wrong reason.

`vitest-auto-spy` closes this from both ends:

- **`Spy<T>` is typed from the real class.** It has no `private` or `#private` members, so you
  cannot pass it where a `T` is expected without a conversion. Use `asInstance(spy)` for that, and
  `asSpy(x)` for the other direction, instead of `as unknown as T`. See [Bridging `Spy<T>` and `T`](/core/spy-typing).
- **`injectSpy` checks what came out of the container.** When it is a real instance, it warns once
  per token and names the missing `provideAutoSpy` call.
  [`enableAngularDiagnostics({ unspiedProviders: true })`](/adapters/angular-diagnostics) turns the
  warning into a test failure.

A smaller trap of the same kind: a misspelt method name. `createSpyObject` has no spy for it, and
`SpyObject<T>` does not help you find it. Here, `createSpyFromClass(UserService, { onlyMethodsToSpyOn: ['laod'] })`
reports that `laod` is not on the class. [`strict: true`](/core/create-spy-from-class#strict) makes an unconfigured method throw,
naming the class, the method and the arguments, instead of returning `undefined`.

## What you gain by moving

- **Zero runtime dependencies**, against Spectator's three, one of them jQuery.
- **No Jasmine globals.** Nothing here declares `namespace jasmine`, so `@types/jasmine` leaves with
  Spectator.
- **It runs on Angular 22, 21 and 20** without an extra deprecated package.
- **Getter and setter spies**, which Spectator does not have: `gettersToSpyOn`, `settersToSpyOn`,
  and `autoSpyAccessors` to find every accessor on the class and its parents.
- **Helpers picked from the return type.** `resolveWith` / `rejectWith` for a `Promise`,
  `nextWith` / `throwWith` for an `Observable`, `calledWith(...)` to answer per argument, `failWith`
  to make any call throw. Spectator has `andReturn` and `andCallFake`.
- **An honest type**, and an `injectSpy` that reports a token you forgot to provide.
- **Zoneless and zone.js alike.** Nothing in the spy path touches `NgZone`. `fakeAsync` is available
  from [`vitest-auto-spy/zone`](/runtimes/vitest) when your tests still need it.
- **Works with AOT.** It runs under Angular's `@angular/build:unit-test` builder.
  [`assertNgModuleScopes` and `assertComponentDefIntact`](/adapters/angular-diagnostics) catch two
  AOT-only failures that otherwise break a spec far from the cause.
- **Beyond Vitest.** The same API runs on `bun:test` and `node:test`, and Angular's `TestBed` runs
  [under `bun test`](/runtimes/bun-angular).
- **[Lint rules](/utilities/eslint-plugin)** that ship with the same version as the API they
  recommend.

## Did the migration lose a test?

Test counts cannot tell you. One file can lose a whole `describe` while a flaky test elsewhere starts
passing, and the totals still match. `compareTestRuns` compares the **names** of the tests in two JSON
reports; see [the jest page](/migrating#did-the-migration-lose-a-test) for the code.

Take the baseline from the last green run on Spectator. On Angular 22 that run only works with
`@angular/platform-browser-dynamic` installed; install it for the baseline and remove it after.

## Why Spectator stops working

Everything in this section was checked against the published tarballs and the npm and GitHub APIs on
**2026-09-02**. Where a widely repeated claim turned out wrong, this section says what was found.

::: info How these were checked
`npm pack @ngneat/spectator` and `npm pack @openng/spectator`, then reading the extracted files.
`npm view` for versions and publish dates. `api.github.com` for repository state. A clean
`npm install` of Angular 22.1.4 plus Spectator in an empty directory, to reproduce the failure.
Dates and versions sit next to each claim so you can re-run them.
:::

**The repository is gone, but the organisation is not.** `https://github.com/ngneat/spectator`
returns **HTTP 404**, and so does `api.github.com/repos/ngneat/spectator`. The claim that the whole
`ngneat` organisation was deleted is wrong: `api.github.com/orgs/ngneat` still returns **200**. Only
this one repository is gone, with all its issues and pull requests.

A third party published a restore at
[`ngneat-archive/spectator`](https://github.com/ngneat-archive/spectator). It was created on
**2026-06-07** and is already archived (4 stars, default branch `restore/npm-spectator-22.1.0`). Its
description reads "Verified archive of ngneat/spectator at `@ngneat/spectator@22.1.0`". It is a
snapshot of the published package, not a continuation, and it accepts nothing.

**The last release is 22.1.0, published 2025-11-02** (`npm view @ngneat/spectator time`; 22.0.0 came
out on 2025-10-08). It is the `latest` dist-tag as of this writing. The package is **not** marked
deprecated on npm.

**It is still widely installed.** For **2026-07-31 → 2026-08-29** the npm downloads API reports
**739 852** downloads of `@ngneat/spectator`. Many test projects depend on it and have no maintained
upgrade path.

### The Angular 22 failure

Spectator imports a module Angular has moved away from:

```ts
// node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs:7
import { BrowserDynamicTestingModule } from '@angular/platform-browser-dynamic/testing';
```

The bundle uses it in four places (lines 1605, 1751, 1878 and 2469). Each one is an
`overrideModule(BrowserDynamicTestingModule, {})` call. That is why the open fix linked below is
titled "remove the **unused** override".

Two often-repeated details are wrong:

- **`@angular/platform-browser-dynamic` is still on npm.** Its `latest` is **22.1.4**, published with
  every other Angular package, and `types/testing.d.ts:21` still declares
  `BrowserDynamicTestingModule`. npm does flag it as deprecated: _"@angular/platform-browser-dynamic is
  deprecated. Use `@angular/platform-browser` instead."_ A deprecated package still installs and
  works.
- **The failure is a missing declaration, not a missing package.** Spectator's `package.json` lists
  `@angular/platform-browser-dynamic` in **neither `dependencies` nor `peerDependencies`**. Its peers
  are only `@angular/common`, `@angular/router` and `@angular/animations`. So it imports a package it
  never asks for. It works only where the workspace still has that package, and Angular 22 workspaces
  do not.

Reproduced in a clean directory with Angular 22.1.4 and nothing else:

```console
$ npm i @angular/core@22.1.4 @angular/common@22.1.4 @angular/platform-browser@22.1.4 \
        @angular/compiler@22.1.4 @angular/router@22.1.4 @angular/animations@22.1.4 \
        @ngneat/spectator@22.1.0 rxjs zone.js
$ node -e "import('@ngneat/spectator')"
FAILED: ERR_MODULE_NOT_FOUND | Cannot find package '@angular/platform-browser-dynamic'
imported from node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs
```

**The workaround:** add `@angular/platform-browser-dynamic` to your own `devDependencies`. The import
resolves, and your tests run on Angular 22 again. This buys time, not a maintainer. You now pin a
deprecated Angular package for a library whose repository does not exist. The Angular release that
actually removes the package breaks your tests, and there is no one to report it to.

**The fix exists and has not landed.** It is
[`openng-org/spectator#13`](https://github.com/openng-org/spectator/pull/13), _"fix: remove
BrowserDynamicTestingModule override"_. It was opened on **2026-07-26**, last touched on
**2026-08-13**, and was still **open and unmerged** on 2026-09-02. It lives on the fork, because the
original repository is a 404 and cannot take pull requests.

### Three runtime dependencies, one of them jQuery

From the tarball's `package.json`:

```json
"dependencies": {
  "@testing-library/dom": "^10.4.1",
  "jquery": "^3.7.1",
  "tslib": "^2.6.2"
}
```

`jquery` is a hard runtime dependency of an Angular testing library. `vitest-auto-spy` has **zero**
runtime dependencies.

### It puts Jasmine's globals into your Vitest project

The often-cited file is real:

```ts
// node_modules/@ngneat/spectator/lib/matchers-types.d.ts:1
declare namespace jasmine {
  interface Matchers<T> {
    toExist(): boolean;
    // …and 20 more
  }
}
```

A second one matters more, because it is in the type of the spy object itself, not in an optional
matchers file:

```ts
// node_modules/@ngneat/spectator/lib/mock.d.ts:11
export interface CompatibleSpy<F extends UnknownFunction = UnknownFunction>
  extends jasmine.Spy<(...args: Parameters<F>) => ReturnType<F>> {
```

`SpyObject<T>` is built on `CompatibleSpy`, so it needs the global `jasmine` namespace. The Vitest
entry does not avoid this: `@ngneat/spectator/vitest` declares its `SpyObject` as
`BaseSpyObject<T> & { … Mock … }`, and `BaseSpyObject` comes from the main entry. In practice you
keep `@types/jasmine` in a project without Jasmine. It sits next to Vitest's globals, and both declare
`expect`.

### The `@openng/spectator` fork — what it is and is not

[`@openng/spectator`](https://www.npmjs.com/package/@openng/spectator) **1.0.1** was published on
**2026-07-10** from [`openng-org/spectator`](https://github.com/openng-org/spectator). The repository
was created on 2026-06-21 and is active: not archived, 39 stars, 7 open issues. Over the same
2026-07-31 → 2026-08-29 window it had **16 251** downloads, against 739 852 for the original: about
**2.1 %** of the pair.

It is often described as byte-identical plus an Angular 22 build. **It is not byte-identical.** A
plain `diff` of the two main bundles reports about 1450 changed lines, almost all of them line-offset
noise. To see the real differences, replace the package name and the embedded compiler version,
strip indentation, sort, and compare:

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

The packaging differs more than the code. The fork ships 33 files against 121: four rolled-up
declaration bundles under `types/` instead of a copy of the source tree. `peerDependencies` move to
`>= 22.0.0`, and `"type": "module"` is added. The three runtime dependencies, jQuery included, are
**identical**.

Two things the fork does **not** fix, checked the same way:

- **It fails on Angular 22 for the same reason.** `openng-spectator.mjs:7` still imports
  `@angular/platform-browser-dynamic/testing` and still does not declare it. The clean-install
  reproduction with `@openng/spectator@1.0.1` and Angular 22.1.4 gives the same
  `ERR_MODULE_NOT_FOUND`. The "Angular 22 build" is a recompile and a peer-range bump. PR #13, which
  would fix it, is still open.
- **The Jasmine namespace is still there**, now inside the rolled-up bundle:
  `types/openng-spectator.d.ts:11` is `namespace jasmine {`, and `:84` is the same
  `CompatibleSpy … extends jasmine.Spy` declaration.

The fork is a real, active repository with a maintainer, which the original no longer has. Judge it
on that, not on an Angular 22 fix that has not shipped.

## See also

- [Comparison](/comparison): this library next to the other Angular testing libraries, with
  last-release dates.
- [Angular adapter](/adapters/angular): `provideAutoSpy`, `injectSpy`, `renderShallow`, zoneless
  waiting.
- [Migrating from jest-auto-spies](/migrating) and [from jasmine-auto-spies](/migrating-jasmine), if
  your Spectator tests also use one of those.
