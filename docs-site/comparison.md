---
title: Comparison
description: How vitest-auto-spy compares to jest-auto-spies, vitest-mock-extended, @golevelup/ts-vitest, @suites/unit, ng-mocks, @testing-library/angular, spectator, sinon and Vitest's own built-ins — with last-release dates.
---

# Comparison

How `vitest-auto-spy` compares to the rest of the field. The niche is narrow and deliberate: **the
only auto-spy library that reads a real _class_ and returns a _fully-typed_ spy of every method with
_return-type-aware_ control helpers, portable across Vitest / Bun / `node:test` and across Angular /
NestJS / React / Vue / Svelte.**

Everything else on this page does some part of that. Nothing does all of it, and a surprising amount
of it is no longer being worked on at all.

::: info Where the numbers come from
Download counts are the npm window **2026-07-29 → 2026-08-27**, from a field survey dated
**2026-08-29**. Versions, publish dates, dependency lists, repository status and the typings quoted
below were re-read from the npm registry and the published tarballs on **2026-08-30** — every one of
them reproduced. Treat all of it as a dated snapshot, not a live feed: re-check before quoting.

The one figure not re-measured here is the type-instantiation count in
[Type-check cost](#_3-type-check-cost), which is carried from the 2026-08-29 survey.
:::

## Half the field has stopped shipping

This is the first thing to know about the alternatives, and no comparison table anywhere makes it.
Last release per package, read from the registry on 2026-08-30:

| Library                                                                                  | Latest  | Published      | Repo                                                                                                              | State                            |
| ---------------------------------------------------------------------------------------- | ------- | -------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| [ts-auto-mock](https://www.npmjs.com/package/ts-auto-mock)                               | 3.7.4   | **2024-08-24** | [Typescript-TDD/ts-auto-mock](https://github.com/Typescript-TDD/ts-auto-mock)                                     | feature-frozen by its author     |
| [testdouble](https://www.npmjs.com/package/testdouble)                                   | 3.20.2  | **2024-03-21** | [testdouble/testdouble.js](https://github.com/testdouble/testdouble.js)                                           | dormant, ~2.5 years              |
| [moq.ts](https://www.npmjs.com/package/moq.ts)                                           | 10.0.8  | **2023-05-02** | [dvabuzyarov/moq.ts](https://github.com/dvabuzyarov/moq.ts)                                                       | dormant since 2023               |
| [@fluffy-spoon/substitute](https://www.npmjs.com/package/@fluffy-spoon/substitute)       | 1.208.0 | **2021-05-07** | [ffMathy/FluffySpoon.JavaScript.Testing.Faking](https://github.com/ffMathy/FluffySpoon.JavaScript.Testing.Faking) | last shipped 2021                |
| [@golevelup/nestjs-testing](https://www.npmjs.com/package/@golevelup/nestjs-testing)     | 0.1.2   | **2019**       | [golevelup/nestjs](https://github.com/golevelup/nestjs)                                                           | dead — do not cite it as current |
| [@ngneat/spectator](https://www.npmjs.com/package/@ngneat/spectator)                     | 22.1.0  | **2025-11-02** | `ngneat/spectator` is **HTTP 404** → [ngneat-archive/spectator](https://github.com/ngneat-archive/spectator)      | ~10 months, repository gone      |
| [jest-auto-spies](https://www.npmjs.com/package/jest-auto-spies)                         | 3.0.1   | 2025-09-22     | [hirezio/auto-spies](https://github.com/hirezio/auto-spies)                                                       | quiet; its core dep is from 2023 |
| [@bugsplat/vitest-auto-spies](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies) | 1.0.0   | 2026-02-04     | [BugSplat-Git/auto-spies](https://github.com/BugSplat-Git/auto-spies)                                             | 102 downloads in the window      |

Five of them last published more than a year ago, and a sixth's repository no longer exists. Two
corrections to claims this page used to make, and to claims still made elsewhere:

- **`ts-auto-mock` is not "one transformer away".** It is feature-frozen by its author and does not
  work with esbuild or swc — which is to say not with Vitest, not with Vite, not with Bun, and not
  with the Angular builder. The old line here ("no ttsc transformer to install") undersold it: the
  true statement is that it cannot run on a modern toolchain at all.
- **`@ngneat/spectator` is a maintenance risk, not just a stale version.** 22.1.0 shipped
  2025-11-02; the `ngneat` org was wiped around 2026-06-05 with every issue and PR, and
  `github.com/ngneat/spectator` returns 404 (verified 2026-08-30). It is still pulled **771 498
  times a month**, so plenty of suites are sitting on it. Three runtime dependencies — `tslib`,
  `@testing-library/dom` and **`jquery`** — and `lib/matchers-types.d.ts` opens with
  `declare namespace jasmine`, so installing it drags the Jasmine global types into a Vitest
  project. It has been broken on new workspaces since 2026-07-16: it imports
  `BrowserDynamicTestingModule` from `@angular/platform-browser-dynamic/testing`, a package Angular
  20 deprecated and no longer installs, so a fresh Angular 22 workspace errors. The
  [`@openng/spectator`](https://www.npmjs.com/package/@openng/spectator) fork
  ([openng-org/spectator](https://github.com/openng-org/spectator), 1.0.1, 2026-07-10) is
  a straight continuation fork with an Angular 22 build, at 18 092 downloads — 2.3% of the original.

## The live field

The competition that is actually shipping, with the same window's downloads:

| Library                                                                            | Latest              | Downloads/mo | Repo                                                                                                  | What it is                                                                  |
| ---------------------------------------------------------------------------------- | ------------------- | ------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [sinon](https://www.npmjs.com/package/sinon)                                       | 22.1.0, 2026-07-20  | 50 371 190   | [sinonjs/sinon](https://github.com/sinonjs/sinon)                                                     | the general-purpose toolkit; `createStubInstance` is the class-reading part |
| [jest-mock-extended](https://www.npmjs.com/package/jest-mock-extended)             | 4.0.1, 2026-04-20   | 9 397 966    | [marchaos/jest-mock-extended](https://github.com/marchaos/jest-mock-extended)                         | deep type-driven Proxy mocks, Jest                                          |
| [vitest-mock-extended](https://www.npmjs.com/package/vitest-mock-extended)         | 5.1.1, 2026-08-02   | 5 443 915    | [eratio08/vitest-mock-extended](https://github.com/eratio08/vitest-mock-extended)                     | the same, ported to Vitest                                                  |
| [ng-mocks](https://www.npmjs.com/package/ng-mocks)                                 | 14.17.3, 2026-08-24 | 2 502 024    | [help-me-mom/ng-mocks](https://github.com/help-me-mom/ng-mocks)                                       | healthy; mocks an Angular **declaration graph**, not one class              |
| [@testing-library/angular](https://www.npmjs.com/package/@testing-library/angular) | 19.4.2, 2026-08-07  | 1 020 821    | [testing-library/angular-testing-library](https://github.com/testing-library/angular-testing-library) | rendering-first, but `/vitest-utils` ships a `createMock` of its own        |
| [vitest-when](https://www.npmjs.com/package/vitest-when)                           | 0.10.0, 2025-11-11  | 702 637      | [mcous/vitest-when](https://github.com/mcous/vitest-when)                                             | `when(mock).calledWith(…).thenReturn(…)` for mocks you already have         |
| [@suites/unit](https://www.npmjs.com/package/@suites/unit)                         | 3.1.1, 2026-05-08   | 473 130      | [suites-dev/suites](https://github.com/suites-dev/suites)                                             | DI-driven unit builder, recommended by the NestJS docs                      |
| [@golevelup/ts-vitest](https://www.npmjs.com/package/@golevelup/ts-vitest)         | 4.0.0, 2026-03-18   | 353 803      | [golevelup/nestjs](https://github.com/golevelup/nestjs)                                               | `createMock<T>()` deep Proxy, the Nest community default                    |
| [Vitest's own `vi`](https://vitest.dev/api/vi)                                     | Vitest 4            | —            | [vitest-dev/vitest](https://github.com/vitest-dev/vitest)                                             | `vi.fn` / `vi.spyOn` / `vi.mockObject` — increasingly the default answer    |

For scale in the other direction: `jasmine-core` still pulls **23 922 905** downloads a month, and
Angular's official v22 answer for a service double is a hand-written
`const stub: Mocked<TaxCalculator> = { calculate: vi.fn() }`. Most of the field is not another
library — it is a literal somebody typed out by hand.

## Feature by feature

### The double itself

|                                          | vitest-auto-spy | jest-auto-spies | \*-mock-extended | @golevelup/ts-vitest |     @suites/unit     | ng-mocks | @testing-library/angular | @ngneat/spectator |         sinon          | Vitest 4 built-ins |
| ---------------------------------------- | :-------------: | :-------------: | :--------------: | :------------------: | :------------------: | :------: | :----------------------: | :---------------: | :--------------------: | :----------------: |
| Reads a real **class** at runtime        |       ✅        |       ✅        |        ❌        |       partial        | constructor metadata |    ✅    |            ✅            |        ✅         |  `createStubInstance`  |  `vi.mockObject`   |
| Mocks from a **type** with no class      |       ✅        |       ❌        |        ✅        |          ✅          |          ❌          |    ❌    |            ❌            |        ❌         |           ❌           |         ❌         |
| Recursive deep mock                      |       ✅        |       ❌        |        ✅        |          ✅          |          ❌          |    ❌    |            ❌            |        ❌         |           ❌           |      partial       |
| Return-type-aware **promise** helpers    |       ✅        |       ✅        |        ❌        |          ❌          |          ❌          |    ❌    |            ❌            |        ❌         |           ❌           |         ❌         |
| Return-type-aware **observable** helpers |       ✅        |       ✅        |        ❌        |          ❌          |          ❌          |    ❌    |            ❌            |        ❌         |           ❌           |         ❌         |
| **Getter / setter spies**                |       ✅        |       ✅        |        ❌        |          ❌          |          ❌          |    ❌    |            ❌            |        ❌         |           ✅           |         ✅         |
| `calledWith`                             |       ✅        |       ✅        |        ✅        |          ❌          |          ❌          |    ❌    |            ❌            |        ❌         |       `withArgs`       |         ❌         |
| `mustBeCalledWith` (fails on a mismatch) |       ✅        |       ✅        |        ❌        |          ❌          |          ❌          |    ❌    |            ❌            |        ❌         |           ❌           |         ❌         |
| Typed as a **spy type**, not as `T`      |    `Spy<T>`     |    `Spy<T>`     |  `MockProxy<T>`  |   `DeepMocked<T>`    |     `Mocked<T>`      | **`T`**  |  `Mock<T>` (see below)   |  `SpyObject<T>`   | `SinonStubbedInstance` | `MaybeMockedDeep`  |

Two cells worth expanding, both read out of the published tarballs on 2026-08-30:

- **ng-mocks returns `T`.** `index.d.ts:1473` declares `MockService<T>(service: AnyType<T>,
spyNamePrefix?: string): T` — the double is typed as the real service, so `.mockReturnValue(…)`
  does not compile and their own e2e specs launder it through `vi.mocked(...)` to get it back. This
  is a typing gap, not a runtime one: since 14.17.0 (2026-08-10) `ngMocks.autoSpy('vitest')` makes
  every mocked method a real `vi.fn()`, and a dedicated `e2e/vitest` project exercises it on CI. The
  methods are spies; the type just will not admit it.
- **`@testing-library/angular`'s `Mock<T>` over-promises.** Its type is
  `T & { [K in keyof T]: T[K] & Mock }` — _every_ member is typed callable — while the runtime
  factory assigns a `vi.fn()` only where `typeof descriptor.value === 'function'`. A data property
  is therefore typed as a mock and is `undefined` at runtime.

`vitest-mock-extended` and `jest-mock-extended` share the `*-mock-extended` column: same API, same
`ts-essentials` deep-Proxy core, different runner.

**`vitest-when` is the direct competitor for `calledWith`, and only for that.** 702 637 downloads in
the same window against a two-function API: `when(mock).calledWith(args).thenReturn(v)`, plus
`thenResolve`, `thenReject`, `thenThrow`, `thenDo`, a `debug()` helper and `{ ignoreExtraArgs, times }`.
Argument matching is deep equality through `@vitest/expect`'s `equals`, so Vitest's asymmetric matchers
work inside it — the same semantics as `calledWith` here.

It starts one step later. `when()` stubs a mock you already have; it never produces one. There is no
class reading, no type-only mocking, no getter spies, no return-type-aware promise or observable
helpers, no Angular, Bun or `node:test` story, and no `mustBeCalledWith` — an unmatched call falls
through to `undefined` rather than failing. The two compose cleanly, and if argument-matched stubbing
on Vitest is genuinely all that is wanted, it is the smaller tool. Two packaging notes: **pin 0.10.0**
— `0.10.1` (2026-09-01, currently `latest`) ships `dist/vitest-when.mjs` and `.d.mts` while its
`exports` map still points at `dist/vitest-when.js` and `.d.ts`, so the published package cannot be
imported at all — and install `@vitest/expect` explicitly under pnpm, since the bundle imports it
unconditionally while `peerDependenciesMeta` marks it optional.

### Where it runs, and what it costs

|                                   | vitest-auto-spy | jest-auto-spies | vitest-mock-extended | jest-mock-extended | @golevelup/ts-vitest | @suites/unit |   ng-mocks   | @testing-library/angular | @ngneat/spectator |   sinon    |
| --------------------------------- | :-------------: | :-------------: | :------------------: | :----------------: | :------------------: | :----------: | :----------: | :----------------------: | :---------------: | :--------: |
| Vitest                            |       ✅        |       ❌        |          ✅          |         ❌         |          ✅          |      ✅      |      ✅      |            ✅            |     partial¹      | own stubs³ |
| Jest                              |    via API²     |       ✅        |          ❌          |         ✅         |          ❌          |      ✅      |      ✅      |            ✅            |        ✅         | own stubs³ |
| Bun (`bun:test`)                  |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |        ❌         | own stubs³ |
| `node:test`                       |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |        ❌         | own stubs³ |
| Angular `TestBed` helpers         |       ✅        |       ✅        |          ❌          |         ❌         |          ❌          |    **❌**    |      ✅      |            ✅            |        ✅         |     ❌     |
| Angular **TestBed under `bun`**   |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |        ❌         |     ❌     |
| Angular **zoneless** helpers      |       ✅        |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |    ✅ (`./zoneless`)     |        ❌         |     ❌     |
| Works with specs compiled **AOT** |       ✅        |        —        |          —           |         —          |          —           |      —       | `aot: false` |            —             |         —         |     —      |
| NestJS recipe                     |       ✅        |       ❌        |          ❌          |         ❌         |          ✅          |      ✅      |      ❌      |            ❌            |        ❌         |     ❌     |
| React / Vue / Svelte recipes      |       ✅        |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |        ❌         |     ❌     |
| Runtime dependencies              |      **0**      |        1        |          1           |         2          |          0           |      4       |      0       |            1             | 3 (incl. jQuery)  |     4      |

¹ There is a real `@ngneat/spectator/vitest` secondary entry point, shipped since 19.2.0
(2024-12-17) — Vitest is supported, not bolted on. The asterisk is elsewhere: it ships
`declare namespace jasmine` in its own typings, so installing it drags the Jasmine globals into a
Vitest project, and it imports a package Angular 20 deprecated — see
[above](#half-the-field-has-stopped-shipping).
² The core is runner-agnostic behind a `MockAdapter`; Vitest, Bun and `node:test` have shipped
adapters — see [Runtimes](/runtimes/vitest).
³ sinon is a library rather than a runner integration: its stubs are its own, so the runner's
matchers and its `clearMocks` / `restoreMocks` housekeeping do not see them.

Dependency counts are each package's own `dependencies` field on npm, read 2026-08-30:
`@hirez_io/auto-spies-core` for `jest-auto-spies` (itself last published 2023-06-03), `ts-essentials`
for `vitest-mock-extended`, plus `lodash.isequal` for `jest-mock-extended`, four `@suites/*` packages
for `@suites/unit`, `tslib` for `@testing-library/angular`, `tslib` + `jquery` +
`@testing-library/dom` for spectator, and four `@sinonjs/*` + `diff` packages for sinon.

## Three things nothing else does

These are not "we also have it" items — as far as this survey found, no other library on the page has
them at all.

### 1. Accessor spies on Bun

`bun:test`'s own `spyOn` refuses accessors outright. Verified here on Bun 1.4.0:

```ts
const o = {
  get v() {
    return 1;
  },
};
spyOn(o, 'v', 'get');
// TypeError: spyOn(target, prop) does not support accessor properties yet
```

`src/lib/redefine-accessor-spy.ts` never calls it. It redefines the property with a mock built by
the adapter's own `createMockFn`, preserving the accessor it is not replacing — so
`accessorSpies.getters` works identically on Vitest, Bun and `node:test`.

Per the table above, **none of ng-mocks, spectator, `@testing-library/angular`,
`vitest-mock-extended`, `jest-mock-extended`, `@golevelup` or Suites has getter/setter spies on any
runtime** — no library that generates a double from a class or a type does. The two that can stub an
accessor at all do it one property at a time and by hand: `vi.spyOn(obj, key, 'get')`, which is
Vitest-only, and sinon's `stub(obj, key).get(fn)`, which is not a runner mock at all. On Bun,
neither the runner nor a generated double leaves you anything.

See [Accessor spies](/core/create-spy-from-class) and [Bun](/runtimes/bun).

### 2. `injectSpy` tells you when the injector handed back the real thing

`reportWhenNotASpy` (`src/lib/angular.ts:132`) checks what came out of the container and warns, once
per token, when it is a plain instance rather than an auto-spy — naming the token and the
`provideAutoSpy` call that is missing. Without it, a forgotten provider surfaces much later, as
`.mockReturnValue is not a function` on a real method, in whichever test happens to touch it first.
`enableAngularDiagnostics({ unspiedProviders: true })` raises the same report from a warning to a
failure, at which point the de-duplication drops: a throw is once per test by definition.

Spectator does the opposite: `spectator.d.ts:17` declares `inject<T>(token: Token<T>):
SpyObject<T>` — **every** token is typed as a spy whether it was mocked or not, so the compiler
actively hides the mistake.

### 3. Type-check cost

Deep-Proxy mocking is paid for at `tsc` time, and nobody publishes the bill. From the 2026-08-29
survey — one fixture, an 80-member class, 30 mock declarations, 600 member touches,
`tsc --extendedDiagnostics`, identical across three runs:

| Type                    | Instantiations |
| ----------------------- | -------------: |
| `Spy<T>` (this package) |      **2 656** |
| `@golevelup/ts-vitest`  |          5 092 |
| `vitest-mock-extended`  |          5 614 |

Roughly half the type-checker work of the deep-proxy libraries, while carrying more helpers on each
method. This is the one number on the page not re-measured on 2026-08-30.

## Angular

Two Angular libraries are direct competition, and the honest summary is that one of them beats this
package at something it does not attempt.

**[ng-mocks](https://github.com/help-me-mom/ng-mocks)** — 14.17.3 on 2026-08-24, 2.5M downloads a
month, healthy. It wins on the whole-graph problem: `MockBuilder` mocks an entire declaration graph
at once, `MockInstance` reaches a dependency read in a **field initializer of a nested child**, and
`ngMocks.findInstance` digs a real instance out of a rendered tree. Nothing here does any of that. It
loses on typing (`MockService<T>` returns `T`, quoted above), on type-only mocking, on **AOT** —
it requires `aot: false`, where specs here go through full AOT template type-checking — on
[resources](/adapters/angular#resources-httpresource-and-resource), and on zoneless, where it has
nothing. Its Vitest support is real and current: `ngMocks.autoSpy('vitest')` landed in 14.17.0
(2026-08-10) and rides a dedicated `e2e/vitest` project against `@angular/build:unit-test` with
`runner: vitest`. Note it declares no `vitest` peer dependency — `vi` is resolved off the global at
runtime — and that the vitest branch is marked `istanbul ignore` in the unit suite, so it is covered
by those e2e projects only.

**[@testing-library/angular](https://github.com/testing-library/angular-testing-library)** — 19.4.2
on 2026-08-07. Usually filed as complementary; it is not. Its `/vitest-utils` entry exports
`createMock` / `provideMock` doing the same job as `createSpyFromClass` / `provideAutoSpy`. Reading
`fesm2022/testing-library-angular-vitest-utils.mjs` at 19.4.2, it is worse in three specific ways:

- **No accessor handling.** The walk assigns a mock only when
  `typeof descriptor?.value === 'function'`; a getter's descriptor has no `value`, so accessors are
  skipped silently.
- **No `Object.prototype` guard.** `mockFunctions(Object.getPrototypeOf(proto))` recurses until the
  prototype is null — so `hasOwnProperty`, `toString`, `valueOf` and `isPrototypeOf` end up mocked
  on the double.
- **Eager only.** Every method is built up front; [lazy spies](/core/performance) exist because that
  costs 68.6 µs against 10.3 µs on a 40-method service.

It is also the only third party on this page with **zoneless support** — a `./zoneless` entry point
added in 19.2.0 on 2026-03-17 (verified in the tarball's `exports` map). That is a real point in its
favour, and its rendering API remains a genuinely different tool from a spy factory.

## NestJS

**[@suites/unit](https://github.com/suites-dev/suites)** — 473 130 downloads a month, recommended by
the NestJS docs, and the most serious live competitor to the [NestJS recipe](/recipes). Its
solitary/sociable model is the thing this package's Nest entry does not have: Suites builds the unit
under test from its DI metadata, so a constructor change does not rewrite the spec.

The contrast:

- **Backend only, by its own description.** The published DI adapters are `@suites/di.nestjs` and
  `@suites/di.inversify`; the doubles adapters are `@suites/doubles.jest`, `.vitest` and `.sinon`
  (all 3.1.0, listed on npm 2026-08-30). **No Bun, no `node:test`, no Angular.**
- **It structurally cannot do Angular.** It discovers collaborators from the constructor's
  `design:paramtypes`, and `readonly #x = inject(X)` — the pattern every modern Angular class uses —
  emits no such metadata. (There is no open Angular request on the repo; issue #931 is the
  maintainer's own injection-js item, not one.)
- **`reflect-metadata` plus `emitDecoratorMetadata` are mandatory**, which is a `tsconfig` and a
  runtime import a Vite/esbuild project may not otherwise need.
- **Its Proxy answers every property**, so a typo in a mocked method name never fails — where
  `createSpyFromClass` reads the real prototype and
  [`onlyMethodsToSpyOn` reports a name that is not on it](/core/create-spy-from-class).
- **v4 has been in beta since 2025-11-04** (`4.0.0-beta.0`), unreleased.

**[@golevelup/ts-vitest](https://github.com/golevelup/nestjs)** — 4.0.0 on 2026-03-18, 353 803
downloads a month, the community default. `createMock<T>()` is a deep Proxy with no return-type
helpers and no argument matching; it costs about twice the type instantiations
([above](#_3-type-check-cost)). Note that **`@golevelup/nestjs-testing` is dead** — 0.1.2 from 2019 —
and should not be cited as the current package.

## Beyond the class spy

The tables above compare the part every one of these libraries does. What none of the others ship
alongside it:

- [**Angular's `TestBed` under `bun test`**](/runtimes/bun-angular) — Bun ships no DOM and cannot
  resolve `templateUrl`, so Angular specs do not run there at all. One preload closes both gaps.
- [`renderShallow`](/adapters/angular#shallow-component-rendering) and
  [`createWithAutoSpies`](/adapters/angular#building-a-class-with-auto-spied-dependencies) — the
  shallow-`TestBed` copy-paste and DI-driven instantiation as one call each.
- [`stable` / `flushEffects`](/adapters/angular#zoneless-waiting) and `toHaveSignalValue` — zoneless
  waiting and a signal matcher, for a codebase where `detectChanges()` is no longer enough.
- [Observable assertions](/core/observable-assertions) that fail when the stream stays silent,
  duck-typed so they pull in no rxjs.
- [`setupFakeTimers()` / `advanceTimers()`](/utilities/fake-timers) — an advance that also drains the
  microtasks a bare `advanceTimersByTime()` leaves pending, and
  [`flushEventLoop` / `settleDynamicImport`](/utilities/event-loop) for the queue the clock does not
  reach at all.
- [`mockConstructor` / `stubConstructor`](/utilities/constructor-doubles) — a double the code under
  test can call with `new`, which a runner's own `vi.fn(() => instance)` is not.
- [`fakeAsync` and `waitForAsync` on Vitest](/utilities/zone) — `zone.js/testing` installs its
  ProxyZone through Jasmine and Jest hooks only, so both throw until this patch is imported.
- [`assertMocked` / `moduleNamespace`](/utilities/module-mocks) — proof that a `vi.mock()` actually
  applied under a bundler, instead of a spec quietly asserting on the real module.
- [`setupAutoSpy({ strayRejections: true })`](/utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed) —
  the promise rejections zone.js drains into `console.error` and no further, turned into failed
  tests. Nothing else on this list looks there: a swallowed rejection never reaches the channel
  Vitest watches, so a spec that asserts inside a `.then()` nobody awaits stays green and exits 0.
- [`setupAutoSpy({ pruneMockRegistry: true })`](/utilities/setup#_9-pruning-the-mock-registry-nothing-empties) —
  the `Set` inside `@vitest/spy` that every `vi.fn()` joins and that nothing ever takes anything out
  of, kept to the mocks that outlive a file. On `isolate: false` it is what makes `clearMocks` cost
  more with every test already run, and what keeps a whole run's recorded arguments — and the
  component trees behind them — alive in one worker.
- [Fourteen ESLint rules](/utilities/eslint-plugin) versioned together with the API they recommend, and
  [`setupAutoSpy()`](/utilities/setup) for the test-run hygiene a shared environment needs.
- [Per-file `TestBed` diagnostics](/adapters/angular#where-a-spec-spends-its-time) — which specs
  actually pay for `TestBed`, and by how much.
- [`compareTestRuns`](/migrating) — whether the migration that brought you here lost a test, from
  the two sets of names rather than from two totals that happen to match.

## Where another library is the better answer

- **You are on Jest and staying there.** [`jest-auto-spies`](https://github.com/hirezio/auto-spies)
  is the same API; there is nothing to gain from switching runner just for this. It is quiet —
  3.0.1 from 2025-09-22, on a core package last published 2023-06-03 — but it works.

- **You already have your mocks and only want argument-matched stubbing.**
  [`vitest-when`](https://github.com/mcous/vitest-when) is 700k downloads a month of exactly that and
  nothing else. Pin 0.10.0 — see above.
- **You need to mock a whole Angular declaration graph.**
  [`ng-mocks`](https://github.com/help-me-mom/ng-mocks) is the tool: `MockBuilder`, `MockInstance`
  into a nested child's field initializer, `ngMocks.findInstance`. This package spies classes, not
  component trees, and the two compose.
- **You render components and assert on what the user sees.**
  [`@testing-library/angular`](https://github.com/testing-library/angular-testing-library) is a
  different discipline; only its `/vitest-utils` `createMock` overlaps.
- **You only ever mock interfaces, never classes, and want nothing else.**
  [`vitest-mock-extended`](https://github.com/eratio08/vitest-mock-extended) is smaller and does
  exactly that. `createAutoMock` / [`mockDeep`](/core/auto-mock-by-type) cover the same ground here
  if you want the helpers too — the two are complementary, not exclusive.
- **You want a NestJS unit built from its DI metadata, on Jest or Vitest, and never anywhere else.**
  [`@suites/unit`](https://github.com/suites-dev/suites) is the closest thing, with the caveats
  [above](#nestjs).
- **You need sandboxes, fake servers, or a full test-double toolkit.**
  [`sinon`](https://github.com/sinonjs/sinon) is a wider tool; this package is deliberately only
  about turning a type or a class into a typed spy.
