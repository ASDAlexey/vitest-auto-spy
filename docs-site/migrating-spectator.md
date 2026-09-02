---
title: Migrating from @ngneat/spectator
description: What is actually wrong with @ngneat/spectator — verified against the published tarball, not repeated from memory — and a mechanical translation of a Spectator spec onto vitest-auto-spy, including the parts this library deliberately does not replace.
---

# Migrating from `@ngneat/spectator`

If you are here because a workspace upgrade broke your test suite and the repository you went
looking for returned a 404, this page is the confirmation and the exit route. It is written to be
checkable: every claim below was verified against the published tarball and the npm and GitHub APIs
on **2026-09-02**, and where the widely repeated version of a claim turned out to be wrong, what is
written here is what was actually found.

## What is true, and what only sounds true

::: info How these were checked
`npm pack @ngneat/spectator` and `npm pack @openng/spectator`, then reading the extracted files;
`npm view` for versions and publish dates; `api.github.com` for repository state; and a clean
`npm install` of Angular 22.1.4 plus Spectator in an empty directory to reproduce the failure rather
than reason about it. Dates and versions are stated next to each claim so they can be re-run.
:::

**The repository is gone — but the organisation is not.** `https://github.com/ngneat/spectator`
returns **HTTP 404**, and so does `api.github.com/repos/ngneat/spectator`. The often-repeated
stronger claim that the whole `ngneat` org was deleted does **not** hold: `api.github.com/orgs/ngneat`
still returns **200**. What is gone is this one repository, and with it every issue and pull request
that lived on it. A third party published a restore at
[`ngneat-archive/spectator`](https://github.com/ngneat-archive/spectator) — created **2026-06-07**,
already archived, 4 stars, default branch `restore/npm-spectator-22.1.0`, described as a "Verified
archive of ngneat/spectator at `@ngneat/spectator@22.1.0`". It is a snapshot of the published
package, not a continuation, and being archived it accepts nothing.

**The last release is 22.1.0, published 2025-11-02** (`npm view @ngneat/spectator time`; 22.0.0
preceded it on 2025-10-08). That is the `latest` dist-tag as of this writing, and the package is
**not** marked deprecated on npm.

**It is still very widely installed.** The npm downloads API for the window **2026-07-31 → 2026-08-29**
reports **739 852** downloads for `@ngneat/spectator`. This is not an abandoned toy; it is a large
number of suites with nowhere to go.

### The Angular 22 failure — the real cause is not the one usually given

Spectator imports a module Angular has moved on from:

```ts
// node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs:7
import { BrowserDynamicTestingModule } from '@angular/platform-browser-dynamic/testing';
```

It is used in four places — lines 1605, 1751, 1878 and 2469 of that same bundle — and every one of
them is an `overrideModule(BrowserDynamicTestingModule, {})` call, which is why the open fix linked
below is titled "remove the **unused** override".

Two commonly repeated details about this are wrong, and the difference matters if you are deciding
what to do:

- **`@angular/platform-browser-dynamic` has not been removed from npm.** Its `latest` is **22.1.4**,
  it publishes alongside every other Angular package, and `types/testing.d.ts:21` still declares
  `BrowserDynamicTestingModule`. It **is** flagged on npm — asking for its `deprecated` field
  answers _"@angular/platform-browser-dynamic is deprecated. Use `@angular/platform-browser`
  instead."_ — but a deprecated package still installs and still works.
- **The failure is a missing declaration, not a missing package.** Spectator's own `package.json`
  lists `@angular/platform-browser-dynamic` in **neither `dependencies` nor `peerDependencies`** —
  its peers are only `@angular/common`, `@angular/router` and `@angular/animations`. So it imports a
  package it never asks for, and works only on a workspace that happens to still have it. Angular 22
  workspaces do not.

Reproduced rather than reasoned about — a clean directory, Angular 22.1.4, nothing else:

```console
$ npm i @angular/core@22.1.4 @angular/common@22.1.4 @angular/platform-browser@22.1.4 \
        @angular/compiler@22.1.4 @angular/router@22.1.4 @angular/animations@22.1.4 \
        @ngneat/spectator@22.1.0 rxjs zone.js
$ node -e "import('@ngneat/spectator')"
FAILED: ERR_MODULE_NOT_FOUND | Cannot find package '@angular/platform-browser-dynamic'
imported from node_modules/@ngneat/spectator/fesm2022/ngneat-spectator.mjs
```

**This means there is a workaround, and you should know it before you migrate anything.** Adding
`@angular/platform-browser-dynamic` to your own `devDependencies` resolves the import and gets a
suite running again on Angular 22. It buys time. It does not buy a maintainer — you are now pinning
a deprecated Angular package on behalf of a library whose repository does not exist, and the next
Angular release that actually removes it takes the suite down with no one to file against.

**The fix exists and has not landed.** It is
[`openng-org/spectator#13`](https://github.com/openng-org/spectator/pull/13), _"fix: remove
BrowserDynamicTestingModule override"_, opened **2026-07-26**, last touched **2026-08-13**, still
**open and unmerged** on 2026-09-02. Note where it lives: on the fork. The original repository is a
404, so it cannot have pull requests at all.

### Three runtime dependencies, one of them jQuery

Straight from the tarball's `package.json`:

```json
"dependencies": {
  "@testing-library/dom": "^10.4.1",
  "jquery": "^3.7.1",
  "tslib": "^2.6.2"
}
```

`jquery` is a hard runtime dependency of an Angular testing library in 2026. `vitest-auto-spy` has
**zero** runtime dependencies.

### It puts Jasmine's globals into your Vitest project

The frequently cited file is real:

```ts
// node_modules/@ngneat/spectator/lib/matchers-types.d.ts:1
declare namespace jasmine {
  interface Matchers<T> {
    toExist(): boolean;
    // …and 20 more
  }
}
```

But there is a second, worse one, and it is the one that will actually bite you, because it is not
in a matchers file you might not load — it is in the type of the double itself:

```ts
// node_modules/@ngneat/spectator/lib/mock.d.ts:11
export interface CompatibleSpy<F extends UnknownFunction = UnknownFunction>
  extends jasmine.Spy<(...args: Parameters<F>) => ReturnType<F>> {
```

`SpyObject<T>` is defined in terms of `CompatibleSpy`, so `SpyObject<T>` transitively requires the
`jasmine` global namespace to exist. And this is not confined to the Jasmine entry point:
`@ngneat/spectator/vitest`'s own `SpyObject` is declared as
`BaseSpyObject<T> & { … Mock … }`, where `BaseSpyObject` is imported from `@ngneat/spectator` — the
main entry. **Using the Vitest entry point does not escape the Jasmine types.** In practice you keep
`@types/jasmine` installed in a project that has no Jasmine, where it sits next to Vitest's globals
and both declare `expect`.

### The `@openng/spectator` fork — what it is and is not

[`@openng/spectator`](https://www.npmjs.com/package/@openng/spectator) **1.0.1**, published
**2026-07-10**, from [`openng-org/spectator`](https://github.com/openng-org/spectator) (created
2026-06-21, active, not archived, 39 stars, 7 open issues). Downloads over the same
2026-07-31 → 2026-08-29 window: **16 251**, against 739 852 for the original — about **2.1 %** of the
pair.

It is often described as byte-identical plus an Angular 22 build. **It is not byte-identical**, and
the way to be sure is worth writing down, because the naive comparison is misleading. A plain `diff`
of the two main bundles reports ~1450 changed lines, which is almost entirely line-offset noise. The
comparison that answers the question normalises the two obvious cosmetic axes — the package name and
the embedded compiler version — strips indentation and sorts, so only genuine content differences
survive:

```bash
norm() { sed -e 's/ngneat/openng/g' -e 's/version: "2[0-9]\.[0-9]*\.[0-9]*"/version: "X"/g' "$1" \
         | sed 's/^[[:space:]]*//' | sort; }
diff <(norm ngneat-spectator.mjs) <(norm openng-spectator.mjs)
```

Both bundles are 2543 lines, and after normalisation exactly **three** lines differ:

| The fork's runtime differs by                                               | Detail                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Recompiled with a newer Angular compiler                                    | `version: "22.0.5"` in the declarations, against `"20.1.0"` |
| The internal host component gained a change-detection strategy              | `changeDetection: ChangeDetectionStrategy.Eager`            |
| A triple-slash reference to `matchers-types.ts` was dropped from the bundle | consequence of how the types are packaged, below            |

Packaging differs more than the code does: 33 files against 121, because the fork ships four rolled-up
declaration bundles under `types/` instead of a mirror of the source tree. `peerDependencies` move to
`>= 22.0.0`, and `"type": "module"` is added. The three runtime dependencies — jQuery included — are
**identical**.

Two things the fork does **not** fix, both verified the same way as above:

- **It fails on Angular 22 for exactly the same reason.** `openng-spectator.mjs:7` still imports
  `@angular/platform-browser-dynamic/testing`, and still declares it nowhere. The same clean-install
  reproduction against `@openng/spectator@1.0.1` and Angular 22.1.4 produces the identical
  `ERR_MODULE_NOT_FOUND`. The "Angular 22 build" is a recompile and a peer-range bump; PR #13, which
  would actually fix it, is still open.
- **The Jasmine namespace is still there**, now inside the rolled-up bundle:
  `types/openng-spectator.d.ts:11` is `namespace jasmine {`, and `:84` is the same
  `CompatibleSpy … extends jasmine.Spy` declaration.

The fork is a real, active repository with a maintainer, which is more than the original has. Judge
it on that, not on an Angular 22 fix that has not shipped.

## What this library is, and what it is not

Read this before the table, because it decides whether the rest of the page is useful to you.

Spectator is two things bolted together: a **double factory** (`createSpyObject`, `mockProvider`,
`SpyObject<T>`) and a **component-rendering harness** (`createComponentFactory`, `SpectatorHost`,
`spectator.query`, the DOM matchers, `byTestId`, `dispatchMouseEvent`, `typeInElement`).

`vitest-auto-spy` replaces the **first** of those, and does it considerably better. It is **not** a
rendering library and does not try to be. There is no `spectator.query`, no `byText`, no
`toHaveClass`, no event-dispatch helpers.

So the honest shape of this migration is:

| Spectator does                     | Here                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| service doubles and DI             | **fully covered**, and with typing the compiler can actually use                            |
| shallow component setup            | **covered** by [`renderShallow`](/adapters/angular#shallow-component-rendering)             |
| DOM querying, events, DOM matchers | **not covered** — use `fixture.debugElement.query(By.css(…))` or `@testing-library/angular` |

If your suite is mostly service specs, this is a mechanical translation you can do file by file. If
it is mostly DOM-assertion component specs, expect to pair this with
[`@testing-library/angular`](https://testing-library.com/docs/angular-testing-library/intro), which
is actively maintained and is the better replacement for that half.

## Install and delete

```bash
npm i -D vitest-auto-spy
npm un @ngneat/spectator
```

Then remove `@types/jasmine` from `devDependencies` if nothing else needs it — with Spectator gone,
the reason it was there goes too. If you kept `@angular/platform-browser-dynamic` only as the
workaround described above, that goes as well.

`vitest-auto-spy/angular` needs the usual Vitest + Angular wiring
(`@analogjs/vite-plugin-angular` plus a TestBed setup file), or Angular's own
`@angular/build:unit-test` builder. See [the Angular adapter](/adapters/angular).

## The translation table

| `@ngneat/spectator`                                          | `vitest-auto-spy`                                                            | Notes                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `createSpyObject(Service)`                                   | [`createSpyFromClass(Service)`](/core/create-spy-from-class)                 | reads the real prototype; see [the typing difference](#the-typing-trap)          |
| `mockProvider(Service)`                                      | [`provideAutoSpy(Service)`](/adapters/angular)                               | goes in `providers`, same place                                                  |
| `mockProvider(Service, { getX: 1 })`                         | `provideAutoSpy(Service, { returns: { getX: 1 } })`                          | `overrides` for a member that is not a method result                             |
| `createServiceFactory(Service)`                              | `TestBed.configureTestingModule({ providers: [...] })`                       | Angular's own API; there is no factory to create                                 |
| `spectator.service`                                          | `TestBed.inject(Service)`                                                    | the real instance under test                                                     |
| `spectator.inject(Dep)`                                      | [`injectSpy(Dep)`](/adapters/angular)                                        | **warns** when the injector returned a real instance — Spectator cannot          |
| `SpyObject<T>`                                               | [`Spy<T>`](/core/create-spy-from-class)                                      | a mapped type over the real prototype                                            |
| `as SpyObject<T>` cast                                       | [`asSpy(x)`](/core/create-spy-from-class) / `asInstance(spy)`                | named views instead of an assertion the linter argues with                       |
| `spy.method.andReturn(v)`                                    | `spy.method.mockReturnValue(v)`                                              | plus `calledWith(...)` for per-argument dispatch                                 |
| `spy.method.andCallFake(fn)`                                 | `spy.method.mockImplementation(fn)`                                          |                                                                                  |
| _(no equivalent)_                                            | `spy.load.resolveWith(v)` / `.nextWith(v)` / `.failWith(e)`                  | [helpers picked from the return type](/core/control-helpers)                     |
| _(no equivalent)_                                            | `gettersToSpyOn` / `settersToSpyOn` / `autoSpyAccessors`                     | Spectator has no accessor spies at all                                           |
| `createComponentFactory(Cmp)` (shallow)                      | [`renderShallow(Cmp, { … })`](/adapters/angular#shallow-component-rendering) | one call for `configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent` |
| `spectator.component`                                        | `component` from `renderShallow`                                             |                                                                                  |
| `spectator.fixture`                                          | `fixture` from `renderShallow`                                               | a real `ComponentFixture`                                                        |
| `spectator.detectChanges()`                                  | `fixture.detectChanges()` / `await stable(fixture)`                          | prefer `stable` when zoneless — see [the trap](/adapters/angular)                |
| `spectator.setInput({ x: 1 })`                               | `inputs: { x: 1 }` on `renderShallow`, or `fixture.componentRef.setInput`    | signal inputs take the **value**                                                 |
| `SpectatorHost` / `createHostFactory`                        | `renderShallow(Cmp, { template: '…', keepTemplate: true })`                  | closest equivalent; not identical                                                |
| `spectator.query(byTestId('x'))`                             | `fixture.debugElement.query(By.css('[data-testid=x]'))`                      | **not provided here** — Angular's own API, or Testing Library                    |
| `spectator.click(el)`, `typeInElement`, `dispatchMouseEvent` | `@testing-library/angular` + `@testing-library/user-event`                   | **not provided here**                                                            |
| `toHaveClass`, `toHaveText`, `toBeVisible`, …                | `@testing-library/jest-dom`                                                  | **not provided here**                                                            |
| `SpectatorHttp` / `createHttpFactory`                        | [`provideHttpTesting()` / `expectRequest()`](/adapters/angular-http)         | and it fails a test that leaks an unanswered request                             |
| `flushEffects()`                                             | [`flushEffects()`](/adapters/angular)                                        | same name, same job                                                              |
| `runInInjectionContext(fn)`                                  | `TestBed.runInInjectionContext(fn)`                                          | Angular's own                                                                    |

## A service spec, before and after

The common shape: a service under test, two collaborators, one of them returning an `Observable`.

::: code-group

```ts [Before — @ngneat/spectator]
import { SpectatorService, SpyObject, createServiceFactory, mockProvider } from '@ngneat/spectator/vitest';

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

Three things changed beyond the names. `nextWith` replaces `andReturn(of(…))` because the helper is
[chosen from the method's return type](/core/control-helpers) — an `Observable`-returning method gets
`nextWith` / `throwWith`, a `Promise`-returning one gets `resolveWith` / `rejectWith`. `injectSpy`
**tells you** when the injector handed back a real instance instead of a double, naming the token and
the missing `provideAutoSpy` call. And the `Spy<T>` declarations are load-bearing rather than
decorative, which is the next section.

### The same spec with no `let` and no `beforeEach`

On Vitest 4.1,
[`extendWithAutoSpies`](/adapters/angular#fixtures-instead-of-let--beforeeach--extendwithautospies)
collapses the whole block — and a test that never names a dependency never builds it:

```ts
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

## The typing trap {#the-typing-trap}

This is the single most valuable thing to understand about the move, because it is the one difference
that changes which bugs your suite can catch.

Spectator's `SpyObject<T>` maps over `T` and types **every** function member as a spy:

```ts
// node_modules/@ngneat/spectator/lib/mock.d.ts:29
export type SpyObject<T> = T & {
  [P in keyof T]: T[P] extends UnknownFunction ? T[P] & CompatibleSpy<T[P]> : T[P];
} & { castToWritable(): Writable<T> };
```

And `inject` is declared to return one unconditionally, for any token:

```ts
// node_modules/@ngneat/spectator/lib/base/base-spectator.d.ts:7
inject<T>(token: Token<T>): SpyObject<T>;
```

Read those together and the consequence is: **the compiler tells you a token is a spy whether you
mocked it or not.** Forget a `mockProvider`, and `spectator.inject(RealService).doThing.andReturn(1)`
type-checks perfectly, then fails at runtime with `andReturn is not a function` — or worse, does not
fail, because the real method ran and returned something plausible. The type system is actively
concealing the mistake.

`vitest-auto-spy` closes this from both ends:

- **`Spy<T>` is a mapped type over the real prototype**, and is deliberately **not** assignable to
  `T` — it drops `private` and `#private` members. That is a feature: the two directions have named
  conversions, `asSpy(x)` and `asInstance(spy)`, instead of an `as unknown as T` that stops checking.
  See [`Spy<T>` is not assignable to `T`](/core/create-spy-from-class).
- **`injectSpy` checks what actually came out of the container** and reports, once per token, when it
  is a plain instance rather than an auto-spy — naming the token and the `provideAutoSpy` call that is
  missing. [`enableAngularDiagnostics({ unspiedProviders: true })`](/adapters/angular-diagnostics)
  raises that from a warning to a failure.

There is a second, smaller trap in the same family. `createSpyObject` builds from the prototype, so a
method name you typo'd is simply absent at runtime while `SpyObject<T>`'s index over `keyof T` gives
you no help finding it. Here, `onlyMethodsToSpyOn` **reports a name that is not on the prototype**,
and [`strict: true`](/core/create-spy-from-class#strict) turns an unconfigured method from an
`undefined` that fails three frames later into a throw naming the class, the method and the arguments.

## Component specs — what is and is not covered

Be clear-eyed here. A Spectator component spec usually does four things, and this library covers two
of them.

**Covered — the TestBed setup.** [`renderShallow`](/adapters/angular#shallow-component-rendering) is
the `configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent` sequence in one call, which
is the part `createComponentFactory` was really saving you:

```ts
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService)],
  inputs: { projectId: 42 }, // signal inputs take the VALUE, not the signal
});
```

It blanks child templates **on purpose** — that is what makes it shallow, and what makes it fast
(291 ms → 174 ms on three real component specs). Lifecycle hooks, inputs, signals and DI all still
work, which is everything a spec asserting on TypeScript state reads. `keepTemplate: true` keeps the
real template while still emptying child imports, for `viewChild` and content projection.

**Covered — signals, effects, resources and HTTP.** `mockSignalProp`, `mockReadonlyProp`, `runEffect`,
`flushEffects`, `stable(fixture)`, `settleResource`, and
[`expectRequest`](/adapters/angular-http) for the `HttpTestingController` dance. Spectator's
`SpectatorHttp` maps onto the last of those.

**Not covered — DOM querying and events.** There is no `spectator.query`, no `byTestId`, no
`spectator.click`. Use Angular's own API, which is what Spectator wrapped:

```ts
import { By } from '@angular/platform-browser';

const row = fixture.debugElement.query(By.css('[data-testid="task-row"]'));
row.triggerEventHandler('click', {});
```

**Not covered — the DOM matchers.** `toHaveClass`, `toHaveText`, `toBeVisible` and the rest of the
list in `matchers-types.d.ts` have no counterpart here.
[`@testing-library/jest-dom`](https://github.com/testing-library/jest-dom) provides equivalents for
most of them and works with Vitest's `expect.extend`.

For a suite that is mostly DOM assertions, the pragmatic migration is **two packages, not one**:
`vitest-auto-spy` for the doubles and the TestBed setup,
[`@testing-library/angular`](https://testing-library.com/docs/angular-testing-library/intro) for the
rendering and querying. Both are maintained; neither pretends to be the other.

## What you gain by moving

Short and factual.

- **Zero runtime dependencies**, against three — and one of those three is jQuery.
- **No Jasmine globals.** Nothing here declares `namespace jasmine`, so `@types/jasmine` leaves the
  project along with Spectator.
- **It runs on Angular 22** — and on Angular 21 and 20 — with no deprecated package pinned on the
  side to make an undeclared import resolve.
- **Getter and setter spies**, which Spectator has none of: `gettersToSpyOn`, `settersToSpyOn`, and
  `autoSpyAccessors` to discover them across the prototype chain.
- **Helpers chosen from the return type** — `resolveWith` / `rejectWith` for a `Promise`, `nextWith` /
  `throwWith` for an `Observable`, `calledWith(...)` for per-argument dispatch, `failWith` to make one
  set of arguments throw while the rest answer. Spectator has `andReturn` and `andCallFake`.
- **A double that is honestly typed**, and an `injectSpy` that reports a token you forgot to provide
  instead of typing it as a spy regardless.
- **Zoneless and zone.js alike.** Nothing in the spy path touches `NgZone`. `fakeAsync` is available
  behind [`vitest-auto-spy/zone`](/runtimes/vitest) when a suite still needs it.
- **AOT-safe.** It works under Angular's `@angular/build:unit-test` builder, with
  [`assertNgModuleScopes` and `assertComponentDefIntact`](/adapters/angular-diagnostics) for the two
  ways an AOT test bundle fails half an hour later in someone else's spec.
- **Beyond Vitest**, the same API runs on `bun:test` and `node:test`, and Angular's `TestBed` runs
  [under `bun test`](/runtimes/bun-angular).
- **[Nineteen lint rules](/utilities/eslint-plugin)** versioned with the API they recommend.

## Did the migration lose a test?

The same answer as on [the jest page](/migrating#did-the-migration-lose-a-test): counters cannot tell
you, because a file can lose an entire `describe` while a flake elsewhere starts passing and the
totals still match. `compareTestRuns` diffs the two **sets of test names** from the JSON report both
runs write. Take the baseline from the last green run on Spectator — if that run needs
`@angular/platform-browser-dynamic` installed to happen at all, install it for the baseline and
remove it at the end.

## See also

- [Comparison](/comparison) — the full field with last-release dates, including the measurements
  behind the numbers on this page.
- [Angular adapter](/adapters/angular) — `provideAutoSpy`, `injectSpy`, `renderShallow`, zoneless
  waiting.
- [Migrating from jest-auto-spies](/migrating) and
  [from jasmine-auto-spies](/migrating-jasmine) — if the Spectator suite also carries one of those.
