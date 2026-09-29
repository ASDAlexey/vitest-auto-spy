---
title: Comparison
description: How vitest-auto-spy compares to jest-auto-spies, vitest-mock-extended, @golevelup/ts-vitest, @suites/unit, ng-mocks, @testing-library/angular, spectator, sinon and Vitest's own built-ins, with last-release dates.
---

# Comparison

`vitest-auto-spy` turns a class or a type into an object whose every method is a typed
[spy](/glossary). Each spy gets helpers that match the method's return type, such as `resolveWith`
for a `Promise` and `nextWith` for an `Observable`. It runs on Vitest, Bun and `node:test`, with
helpers for Angular, NestJS, React, Vue and Svelte. This page shows which library fits which situation,
and what you gain or lose by switching.

## Which one to pick

| Your situation                                                        | Pick                                                                                            | Why                                                                                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| You use `jest-auto-spies` and stay on Jest                            | keep [`jest-auto-spies`](https://github.com/hirezio/auto-spies)                                 | same API; `vitest-auto-spy` does not run on Jest yet                                                                                        |
| You use `jest-auto-spies` and move to Vitest, Bun or `node:test`      | `vitest-auto-spy`                                                                               | same API, mostly an import change; see [before and after](#before-and-after)                                                                |
| You use `ng-mocks` to replace services with spies                     | `vitest-auto-spy`                                                                               | you get `Spy<UserService>` instead of `UserService`, and specs keep AOT compilation, which ng-mocks asks you to turn off ([why](#ng-mocks)) |
| You use `ng-mocks` to mock a whole tree of components and modules     | keep [`ng-mocks`](https://github.com/help-me-mom/ng-mocks)                                      | `MockBuilder`, `MockInstance`, `ngMocks.findInstance` have no equivalent here; use both in one project                                      |
| You render components and assert on what the user sees                | keep [`@testing-library/angular`](https://github.com/testing-library/angular-testing-library)   | keep it for rendering; swap only its `createMock` for `createSpyFromClass`                                                                  |
| You use `@ngneat/spectator`                                           | `vitest-auto-spy`                                                                               | its repository is gone and it does not install on Angular 22; see [Angular](#angular)                                                       |
| You mock only interfaces, never classes, and need nothing else        | [`vitest-mock-extended`](https://github.com/eratio08/vitest-mock-extended)                      | smaller, runs on Vitest 4 and later; for the helpers too, use `createAutoMock` / `mockDeep` from `vitest-auto-spy`                          |
| You want a NestJS unit built from DI metadata, on Jest or Vitest only | [`@suites/unit`](https://github.com/suites-dev/suites), or [`createNestUnit`](/adapters/nestjs) | see [NestJS](#nestjs)                                                                                                                       |
| You already have mocks and want only answers that depend on arguments | [`vitest-when`](https://github.com/mcous/vitest-when)                                           | exactly that and nothing else; take 0.10.2, skip 0.10.1                                                                                     |
| You need sandboxes, fake servers or a full test-double toolkit        | [`sinon`](https://github.com/sinonjs/sinon)                                                     | a wider tool; this package only turns a class or a type into a typed spy                                                                    |

## Before and after

From `jest-auto-spies`, most specs change only their imports. Angular helpers live in their own
entry point. The `Observable` helpers also need `import 'vitest-auto-spy/rxjs'` once, in the setup
file ([how to add it](/runtimes/rxjs)):

```diff
- import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
+ import { createSpyFromClass } from 'vitest-auto-spy';
+ import { provideAutoSpy } from 'vitest-auto-spy/angular';
```

From `ng-mocks`, the type of the service double changes. `ng-mocks` types it as the real service,
so you cast to reach the mock. ng-mocks also needs `ngMocks.autoSpy('vitest')` in the setup file; remove
that line once no spec uses ng-mocks.

```ts
import { TestBed } from '@angular/core/testing';
import { MockProvider, ngMocks } from 'ng-mocks';
import { of } from 'rxjs';
import { vi } from 'vitest';

TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [MockProvider(UserService)] });
const users = TestBed.inject(UserService); // typed as UserService
vi.mocked(users.load).mockReturnValue(of({ id: 1, name: 'Ann' })); // cast to reach the mock
```

With `vitest-auto-spy`, `injectSpy` returns `Spy<UserService>`, and `load` gets helpers for its
`Observable` return type. Those helpers need `import 'vitest-auto-spy/rxjs'` once per project,
in the Vitest setup file (see [RxJS](/runtimes/rxjs)). `nextWith` sets the value every later call to
`load()` emits. Call it before `TestBed.createComponent`, because the component calls `load()`
when it is created:

```ts
import { TestBed } from '@angular/core/testing';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

it('shows the user name', async () => {
  TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [provideAutoSpy(UserService)] });
  const users = injectSpy(UserService); // Spy<UserService>
  users.load.nextWith({ id: 1, name: 'Ann' }); // checked against Observable<User>

  const fixture = TestBed.createComponent(ProfileComponent);
  await fixture.whenStable();

  expect(fixture.nativeElement.textContent).toContain('Ann');
  expect(users.load).toHaveBeenCalledTimes(1); // Vitest matchers work on these spies
});
```

The full step-by-step guides: [Migrating from jest-auto-spies](/migrating),
[Migrating from Spectator](/migrating-spectator),
[Migrating from @testing-library/angular](/migrating-testing-library-angular),
[Migrating from @suites/unit](/migrating-suites).

## What you gain and lose by switching

| Coming from                | You gain                                                                                                                                                                                                                        | You lose                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `jest-auto-spies`          | Vitest, Bun and `node:test`; mocks from a type with no class (`createAutoMock`, `mockDeep`); zoneless and `httpResource()` helpers; a package that still ships releases; less memory per spy ([Runtime cost](#_4-runtime-cost)) | Jest: this package does not run on it yet                                                                                                     |
| `ng-mocks`                 | `Spy<T>` instead of `T`, so no `vi.mocked()` casts; return-type helpers; `calledWith` / `mustBeCalledWith`; getter and setter spies; specs compiled AOT; zoneless and resource helpers; mocks from a type                       | whole-graph mocking (`MockBuilder`), `MockInstance` (set up a dependency a nested child reads in a field initializer), `ngMocks.findInstance` |
| `@testing-library/angular` | getters on the double; no `Object.prototype` methods mocked by mistake; lazy spies (a method's spy is built on first use)                                                                                                       | nothing, if you keep its `render` and replace only `createMock`                                                                               |

## Half the field has stopped shipping

Before you compare features, check who still releases. Last release per package, read from the npm
registry on 2026-08-30 and again on 2026-09-04:

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

The first five rows last published more than a year ago, and `@ngneat/spectator` has lost its
repository. On 2026-09-04 the first five were 740, 896, 1 220, 1 945 and 2 486 days old.
`jest-auto-spies` was 346 days old then, so without a new release it passes one year on 2026-09-22.

Two corrections to claims this page used to make, and that other pages still make:

- **`ts-auto-mock` cannot run on a modern toolchain.** Its author has frozen it, and it does not
  work with esbuild or swc. That rules out Vitest, Vite, Bun and the Angular builder. The old line
  here ("no ttsc transformer to install") undersold the problem.
- **`@ngneat/spectator` is a maintenance risk, not only an old version.** Details, verified on
  2026-09-02:
  - 22.1.0 shipped on 2025-11-02. `github.com/ngneat/spectator` returns **404**, with every issue
    and PR gone; the `ngneat` org still exists.
  - A third-party snapshot sits at [ngneat-archive/spectator](https://github.com/ngneat-archive/spectator),
    created on 2026-06-07 and already archived.
  - It is still downloaded **739 852 times a month** (2026-07-31 → 2026-08-29).
  - It has three runtime dependencies: `tslib`, `@testing-library/dom` and **`jquery`**.
  - `lib/mock.d.ts:11` declares `CompatibleSpy … extends jasmine.Spy`, and `SpyObject<T>` is built
    on it. Even `@ngneat/spectator/vitest` therefore pulls Jasmine's global types into a Vitest
    project.
  - It does not install on a clean Angular 22 workspace. It imports `BrowserDynamicTestingModule`
    from `@angular/platform-browser-dynamic/testing` but declares that package nowhere. The install
    fails with `ERR_MODULE_NOT_FOUND`. That package still ships (22.1.4) and is only deprecated, so
    adding it by hand works around the error.
  - The [`@openng/spectator`](https://www.npmjs.com/package/@openng/spectator) fork
    ([openng-org/spectator](https://github.com/openng-org/spectator), 1.0.1, 2026-07-10) is active,
    at 16 251 downloads, 2.1 % of the original. Its Angular 22 build is a recompile with the same
    undeclared import, so it fails the same way. The fix
    ([#13](https://github.com/openng-org/spectator/pull/13)) has been open since 2026-07-26.

  The migration path has [its own page](/migrating-spectator).

## The live field

The libraries that still ship, with downloads for the same window:

| Library                                                                            | Latest              | Downloads/mo | Repo                                                                                                  | What it is                                                                  |
| ---------------------------------------------------------------------------------- | ------------------- | ------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [sinon](https://www.npmjs.com/package/sinon)                                       | 22.1.0, 2026-07-20  | 50 371 190   | [sinonjs/sinon](https://github.com/sinonjs/sinon)                                                     | the general-purpose toolkit; `createStubInstance` is the class-reading part |
| [jest-mock-extended](https://www.npmjs.com/package/jest-mock-extended)             | 4.0.1, 2026-04-20   | 9 397 966    | [marchaos/jest-mock-extended](https://github.com/marchaos/jest-mock-extended)                         | deep type-driven Proxy mocks, Jest                                          |
| [vitest-mock-extended](https://www.npmjs.com/package/vitest-mock-extended)         | 5.1.1, 2026-08-02   | 5 443 915    | [eratio08/vitest-mock-extended](https://github.com/eratio08/vitest-mock-extended)                     | the same, ported to Vitest                                                  |
| [ng-mocks](https://www.npmjs.com/package/ng-mocks)                                 | 14.17.3, 2026-08-24 | 2 502 024    | [help-me-mom/ng-mocks](https://github.com/help-me-mom/ng-mocks)                                       | healthy; mocks an Angular **declaration graph**, not one class              |
| [@testing-library/angular](https://www.npmjs.com/package/@testing-library/angular) | 19.4.2, 2026-08-07  | 1 020 821    | [testing-library/angular-testing-library](https://github.com/testing-library/angular-testing-library) | rendering-first, but `/vitest-utils` ships a `createMock` of its own        |
| [vitest-when](https://www.npmjs.com/package/vitest-when)                           | 0.10.2, 2026-09-03  | 702 637      | [mcous/vitest-when](https://github.com/mcous/vitest-when)                                             | `when(mock).calledWith(…).thenReturn(…)` for mocks you already have         |
| [@suites/unit](https://www.npmjs.com/package/@suites/unit)                         | 3.1.1, 2026-05-08   | 473 130      | [suites-dev/suites](https://github.com/suites-dev/suites)                                             | DI-driven unit builder, recommended by the NestJS docs                      |
| [@golevelup/ts-vitest](https://www.npmjs.com/package/@golevelup/ts-vitest)         | 4.0.0, 2026-03-18   | 353 803      | [golevelup/nestjs](https://github.com/golevelup/nestjs)                                               | `createMock<T>()` deep Proxy, the Nest community default                    |
| [Vitest's own `vi`](https://vitest.dev/api/vi)                                     | Vitest 4            | —            | [vitest-dev/vitest](https://github.com/vitest-dev/vitest)                                             | `vi.fn` / `vi.spyOn` / `vi.mockObject` — increasingly the default answer    |

The biggest competitor is not a library. `jasmine-core` still gets **23 922 905** downloads a month.
Angular's official v22 answer for a service double is a hand-written object:
`const stub: Mocked<TaxCalculator> = { calculate: vi.fn() }`.

## Feature by feature

### The double itself

A _double_ is the object that stands in for the real service in a test.

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

Three cells need more detail. The first two were read from the published packages on 2026-08-30.

- **ng-mocks returns `T`.** `index.d.ts:1473` declares
  `MockService<T>(service: AnyType<T>, spyNamePrefix?: string): T`. The double is typed as the real
  service, so `.mockReturnValue(…)` does not compile. Its own e2e specs cast through `vi.mocked(...)`.
  At runtime the methods are real spies: since 14.17.0 (2026-08-10), `ngMocks.autoSpy('vitest')`
  makes each one a `vi.fn()`, tested in a dedicated `e2e/vitest` project. Only the type hides it.
- **`@testing-library/angular`'s `Mock<T>` promises too much.** Its type is
  `T & { [K in keyof T]: T[K] & Mock }`, so _every_ member is typed as callable. The runtime factory
  assigns a `vi.fn()` only where `typeof descriptor.value === 'function'`. A data property is
  therefore typed as a mock and is `undefined` at runtime.
- **sinon's `createStubInstance` builds a new object.** It takes a constructor and returns a fresh
  stub. It does not spy on an object you already hold. For that, this package has
  `createSpyFromInstance`, which turns the object's methods into spies in place. `bun:test` and
  `node:test` spy on one method at a time and have no call for a whole object.

`vitest-mock-extended` and `jest-mock-extended` share the `*-mock-extended` column. They have the
same API and the same `ts-essentials` deep-Proxy core, on different runners.

#### vitest-mock-extended and Prisma

Much of `vitest-mock-extended`'s traffic comes from one recipe. Prisma's testing series mocks
`PrismaClient` with its `mockDeep`. Version 5.1.1 (2026-08-02) had 897 290 downloads in the week to
2026-09-18.

| Before you choose | vitest-mock-extended | vitest-auto-spy          |
| ----------------- | -------------------- | ------------------------ |
| Vitest peer range | `>=4.0.0`            | `>=2.1.0`                |
| Runners           | Vitest only          | Vitest, Bun, `node:test` |

The same recipe with this package's `mockDeep` adds typed `resolveWith` / `rejectWith`,
`resolveWithPerCall`, `resetAutoSpy` over the whole tree and an interactive `$transaction`. See
[Mocking Prisma Client](/guides/mocking-prisma).

#### vitest-when

**`vitest-when` competes with `calledWith`, and only with that.** It has 702 637 downloads in the same
window and a two-function API: `when(mock).calledWith(args).thenReturn(v)`. It also offers
`thenResolve`, `thenReject`, `thenThrow`, `thenDo`, a `debug()` helper and
`{ ignoreExtraArgs, times }`. Arguments are compared by deep equality through `@vitest/expect`'s
`equals`, so Vitest's asymmetric matchers work inside it. `calledWith` here uses the same rules.

`when()` configures a mock you already have; it never creates one. So it has none of these:

- class reading or mocks from a type alone;
- getter spies;
- return-type-aware promise or observable helpers;
- support for Angular, Bun or `node:test`;
- `mustBeCalledWith`: a call with other arguments returns `undefined` instead of failing.

The two work together. If argument-matched answers on Vitest are all you need, `vitest-when` is the
smaller tool. Two packaging notes:

- **Take 0.10.2 and skip 0.10.1.** `0.10.1` (2026-09-01) shipped `dist/vitest-when.mjs` and `.d.mts`,
  but its `exports` map pointed at `.js` and `.d.ts`, so it could not be imported. `0.10.2`
  (2026-09-03) fixes the map, checked in the published package on 2026-09-04. The older advice here
  to pin 0.10.0 no longer applies.
- **Under pnpm, install `@vitest/expect` yourself.** The bundle always imports it, while
  `peerDependenciesMeta` marks it optional.

### Where it runs, and what it costs

|                                   | vitest-auto-spy | jest-auto-spies | vitest-mock-extended | jest-mock-extended | @golevelup/ts-vitest | @suites/unit |   ng-mocks   | @testing-library/angular | @ngneat/spectator |   sinon    |
| --------------------------------- | :-------------: | :-------------: | :------------------: | :----------------: | :------------------: | :----------: | :----------: | :----------------------: | :---------------: | :--------: |
| Vitest                            |       ✅        |       ❌        |          ✅          |         ❌         |          ✅          |      ✅      |      ✅      |            ✅            |     partial¹      | own stubs³ |
| Jest                              |    not yet²     |       ✅        |          ❌          |         ✅         |          ❌          |      ✅      |      ✅      |            ✅            |        ✅         | own stubs³ |
| Bun (`bun:test`)                  |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |        ❌         | own stubs³ |
| `node:test`                       |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |        ❌         | own stubs³ |
| Angular `TestBed` helpers         |       ✅        |       ✅        |          ❌          |         ❌         |          ❌          |    **❌**    |      ✅      |            ✅            |        ✅         |     ❌     |
| Angular **TestBed under `bun`**   |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |        ❌         |     ❌     |
| Angular **zoneless** helpers      |       ✅        |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |    ✅ (`./zoneless`)     |        ❌         |     ❌     |
| `httpResource()` test helper      |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |        ❌         |     ❌     |
| Works with specs compiled **AOT** |       ✅        |        —        |          —           |         —          |          —           |      —       | `aot: false` |            —             |         —         |     —      |
| NestJS recipe                     |       ✅        |       ❌        |          ❌          |         ❌         |          ✅          |      ✅      |      ❌      |            ❌            |        ❌         |     ❌     |
| NestJS unit from DI metadata      |       ✅        |       ❌        |          ❌          |         ❌         |          ❌          |      ✅      |      ❌      |            ❌            |        ❌         |     ❌     |
| React / Vue / Svelte recipes      |       ✅        |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |        ❌         |     ❌     |
| Runtime dependencies              |      **0**      |        1        |          1           |         2          |          0           |      4       |      0       |            1             | 3 (incl. jQuery)  |     4      |

¹ `@ngneat/spectator/vitest` is a real entry point, shipped since 19.2.0 (2024-12-17). The catch is
elsewhere: its typings declare `namespace jasmine`, which pulls Jasmine's globals into a Vitest
project. It also imports a package Angular 20 deprecated; see
[above](#half-the-field-has-stopped-shipping).
² The core works with any runner through a runner adapter; Vitest, Bun and `node:test` have one. See
[Runtimes](/runtimes/vitest). Importing an entry point registers the adapter; you do nothing else. **Jest has no adapter today**, and no entry point exports a way to
register your own. So a Jest project has no supported way to use the package yet. Checked
2026-09-02.
³ sinon is a library, not a runner integration. Its stubs are its own, so the runner's matchers and
its `clearMocks` / `restoreMocks` cleanup do not see them.

Dependency counts come from each package's `dependencies` field on npm, read on 2026-08-30:

| Package                    | Runtime dependencies                                    |
| -------------------------- | ------------------------------------------------------- |
| `jest-auto-spies`          | `@hirez_io/auto-spies-core` (last published 2023-06-03) |
| `vitest-mock-extended`     | `ts-essentials`                                         |
| `jest-mock-extended`       | `ts-essentials`, `lodash.isequal`                       |
| `@suites/unit`             | four `@suites/*` packages                               |
| `@testing-library/angular` | `tslib`                                                 |
| `@ngneat/spectator`        | `tslib`, `jquery`, `@testing-library/dom`               |
| `sinon`                    | four `@sinonjs/*` packages and `diff`                   |

## Four things nothing else does

As far as this survey found, no other library on this page has any of these. Two are features; two
are costs that no one else measures and publishes.

### 1. Accessor spies on Bun

Bun's own `spyOn` refuses getters and setters (accessors). Checked on Bun 1.4.0:

```ts
const o = {
  get v() {
    return 1;
  },
};
spyOn(o, 'v', 'get');
// TypeError: spyOn(target, prop) does not support accessor properties yet
```

This package never calls Bun's `spyOn` for accessors. It replaces the property itself with a mock
from your runner, and keeps the other half of a getter/setter pair. So `accessorSpies.getters`
behaves the same on Vitest, Bun and `node:test`.

No library on this page that builds a double from a class or a type spies on getters or setters, on
any runtime. That covers ng-mocks, spectator, `@testing-library/angular`, both `*-mock-extended`
packages, `@golevelup` and Suites. Only two tools stub an accessor at all, one property at a time:

- `vi.spyOn(obj, key, 'get')`, which works on Vitest only;
- sinon's `stub(obj, key).get(fn)`, which is not a runner mock.

On Bun, neither the runner nor a generated double gives you anything. See
[Accessor spies](/core/create-spy-from-class) and [Bun](/runtimes/bun).

### 2. `injectSpy` warns when it gets the real service

You call `injectSpy(UserService)` but forgot `provideAutoSpy(UserService)`. `injectSpy` then prints a
warning, once per token in each spec file. It names the token and the `provideAutoSpy` call that is
missing.

Without that warning, the mistake shows up much later. Some test calls `.mockReturnValue` on a real
method and fails with `.mockReturnValue is not a function`.

To turn the warning into a failure, call `enableAngularDiagnostics({ unspiedProviders: true })` from
`vitest-auto-spy/angular/diagnostics`. Then every test that hits the mistake fails, not only the
first one.

Spectator does the opposite. `spectator.d.ts:17` declares
`inject<T>(token: Token<T>): SpyObject<T>`, so **every** token is typed as a spy, mocked or not. The
compiler hides the mistake.

### 3. Type-check cost

Deep-Proxy mocks slow down `tsc`, and no library publishes by how much. The 2026-08-29 survey
measured one fixture with `tsc --extendedDiagnostics`, identical across three runs:

- an 80-member class;
- 30 mock declarations;
- 600 member reads.

| Type                    | Instantiations |
| ----------------------- | -------------: |
| `Spy<T>` (this package) |      **2 656** |
| `@golevelup/ts-vitest`  |          5 092 |
| `vitest-mock-extended`  |          5 614 |

`Spy<T>` costs the type-checker about half as much as the deep-Proxy libraries, with more helpers
on each method. This is the one number on the page not re-measured on 2026-08-30.

A check in this repository's CI keeps the number from growing: `npm run types:budget`, part of
`npm run check`. It builds a fixture of the same shape and type-checks it against the library's
sources. Then it subtracts a control program with the same class and no spies. The check fails when
the difference exceeds the budget.

| Date       | TypeScript |  Total | Control | Delta (`Spy<T>`) | Budget |
| ---------- | ---------- | -----: | ------: | ---------------: | -----: |
| 2026-09-02 | 5.9.3      |      — |  10 807 |            9 126 | 11 000 |
| 2026-09-12 | 6.0.3      | 23 265 |  12 855 |       **10 410** | 12 500 |

The budget leaves about 20 % of headroom; a regression to a deep-Proxy type would roughly double the
delta. The rise from 9 126 is not a regression. The control program alone grew 18.9 %, and the
delta grew 14.1 %. So `Spy<T>`'s share of the total shrank. Most of the rise comes from the new major TypeScript
version and typed features added since, not from a type gone bad.

This fixture differs from the survey's, which was never committed. It also counts against the
sources, not the published declarations. So compare the delta only with itself across commits,
never with the 2 656 above. `node scripts/check-type-budget.mjs --print` prints the fixture;
`--measure` prints the numbers without failing.

### 4. Runtime cost

What does the same class cost across a whole test run, not per mock? No other library publishes
that either.

The comparison uses `jest-auto-spies@3.0.1`, `jasmine-auto-spies@8.0.1` and
`@bugsplat/vitest-auto-spies@1.0.0`, each measured directly. All three wrap
`@hirez_io/auto-spies-core@3.0.0` and differ only in the spy factory they pass it (`jest.fn()`,
`jasmine.createSpy()`, `vi.fn()`). They land within a few per cent of each other on every case.
The Jest and Jasmine packages run here under a minimal `jest` / `jasmine` global backed by `vi.fn()`.
So every contender (an _arm_ in the tables below) creates the same underlying mock. The numbers describe each library's own code, not a
real Jest or Jasmine run.

**Whole-run speed against that shared core** (re-measured on the 4.1 build, 2026-09-04):

| Class size  |  Tests | This package is faster by | Rounds                                |
| ----------- | -----: | ------------------------: | ------------------------------------- |
| 20 methods  |  1 000 |                     1.50× | median of 3                           |
| 20 methods  |  3 000 |                     1.61× | median of 3                           |
| 20 methods  | 10 000 |                     1.54× | median of 3; all 9 rounds 1.46–1.62×  |
| 100 methods | 10 000 |                     1.68× | 5 of 5 rounds above 1.0× (1.66–1.73×) |

**Micro-benchmarks.** Version 4.1 stopped building method spies on `vi.fn()`; Vitest's `expect` matchers still work on
them. See
[the spy engine](/core/performance#the-spy-engine). Before that, six rows across the published tables were losses and one
was a tie. The biggest changes:

|                                        |               4.0 |          4.1 |                  best other arm |
| -------------------------------------- | ----------------: | -----------: | ------------------------------: |
| all 14 of 14 methods called            | 18.92 µs (a loss) |  **8.17 µs** | 17.92 µs hand-written `vi.fn()` |
| all 45 of 45 methods called            | 75.33 µs (a loss) | **26.12 µs** | 62.04 µs hand-written `vi.fn()` |
| `createAutoMock<T>()`, 40 members      | 72.88 µs (a loss) | **18.92 µs** |   56.79 µs vitest-mock-extended |
| `mockDeep<T>()`, 3 levels              |  8.83 µs (a loss) |  **2.29 µs** |    5.46 µs vitest-mock-extended |
| `calledWith` dispatch                  |  0.54 µs (parity) |  **0.17 µs** |    0.54 µs vitest-mock-extended |
| retained heap, one materialised method |           5 445 B |  **1 929 B** |  5 169 B hand-written `vi.fn()` |

This package now wins **every** published head-to-head micro-benchmark table. That includes the two `worst case`
blocks, where a test calls every method and a lazy library has nothing to skip. The narrowest margin
is 2.19×, on the row where a test calls every method of its double.

How precise these figures are:

- Each is the **median p75 of seven independent runs** at doubled iteration budgets.
- Each row's ± column says how far that median can be off: ±0.9 % typically, ±6.3 % at worst across
  47 rows.
- **Do not quote a difference under about 20 % from a single local run.** 2.19× is far clear of
  that.

Full methodology:
[Performance → the measured resolution limit](/core/performance#the-measured-resolution-limit).

Two counterweights:

- **Part of the win comes from not paying the runner's per-mock cost**, while every other arm
  still pays it. That is a real product difference, and the table shows its size. The
  `hand-written vi.fn() per method` arm is the runner's own mock with no library in the way.
  `setSpyEngine('runner')` puts this package back on `vi.fn()` if you want the comparison without
  it.
- **Across a whole test run, hand-written `vi.fn()` doubles are still cheaper.** The micro-benchmarks
  above time building a double alone. Under the default
  `isolate: true`, hand-written doubles win by about **3 %** at the median on the 4.1 build (10–15 % before it).
  Single rounds range from 0.84× to 1.00×. Building a double is about one per cent of a test's
  cost, so a 10× win on the double is worth a few per cent on the run.

**Memory is where the library wins outright.** Two measurements:

| Measurement                                            | Hand-written / other        | This package                                                                                                            |
| ------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Peak memory, 100-method class, `test.isolate: false`   | 6366 MB (hand-written)      | 1851 MB (`lazySpies: 'proxy'`, the default at this class size; measured before 2026-09-27); 2103 MB (`lazySpies: true`) |
| Retained memory per method, untouched 100-method class | 5 835 B (`jest-auto-spies`) | **256 B** (default)                                                                                                     |

The first is the difference between a CI worker that finishes and one killed for running out of
memory. The second is the figure that decides a large test run. Full tables, methodology and
per-library figures:
[Performance → Retained memory per double](/core/performance#retained-memory-per-double).

Measured on 2026-09-04: Node v24.19.0, Vitest 4.1.11, Apple M4 Max. To reproduce:

| Command                    | What it runs                                          |
| -------------------------- | ----------------------------------------------------- |
| `npm run bench:vs:precise` | the seven-run median used above, about eleven minutes |
| `npm run bench:vs`         | a single run of about one minute, for local iteration |
| `npm run bench:suite`      | the whole-run comparison                              |

The isolate-mode and interleaving methodology is in [Performance](/core/performance).

## Angular

Two Angular libraries compete directly. `ng-mocks` does one job this package does not attempt:
mocking a whole component tree.

### ng-mocks

**[ng-mocks](https://github.com/help-me-mom/ng-mocks)**: 14.17.3 on 2026-08-24, 2.5M downloads a
month, healthy.

It wins on mocking a whole graph of components and modules. Nothing here does any of this:

- `MockBuilder` mocks an entire declaration graph at once.
- `MockInstance` reaches a dependency read in a **field initializer of a nested child**.
- `ngMocks.findInstance` finds a real instance in a rendered tree.

It loses on:

- typing: `MockService<T>` returns `T` (see [The double itself](#the-double-itself));
- mocks from a type with no class;
- **AOT** (ahead-of-time compilation, which type-checks templates): it requires `aot: false`, while
  specs using `vitest-auto-spy` keep full AOT template checking;
- [resources](/adapters/angular#resources-httpresource-and-resource);
- zoneless, where it has nothing. _Zoneless_ means Angular without zone.js, with change detection
  driven by signals.

Its Vitest support is real and current. `ngMocks.autoSpy('vitest')` landed in 14.17.0 (2026-08-10).
A dedicated `e2e/vitest` project runs it against `@angular/build:unit-test` with `runner: vitest`.
Two caveats:

- It declares no `vitest` peer dependency; it reads `vi` from the global at runtime.
- Its unit tests mark the Vitest branch `istanbul ignore`, so only those e2e projects cover it.

### @testing-library/angular

**[@testing-library/angular](https://github.com/testing-library/angular-testing-library)**: 19.4.2 on
2026-08-07. It is usually called complementary, but it overlaps. Its `/vitest-utils` entry exports
`createMock` / `provideMock`, which do the job of `createSpyFromClass` / `provideAutoSpy`.

The whole file, `fesm2022/testing-library-angular-vitest-utils.mjs` at 19.4.2, is 52 lines. Both
defects below were re-read in the published package on **2026-09-02**. It is worse in three ways:

- **Getters are skipped** (line 14). It assigns a mock only when
  `typeof descriptor?.value === 'function'`. A getter's descriptor has no `value`, so a service's
  `get isLoggedIn()` is missing from the double. `Mock<T>` still types it as callable. The test then
  sees `undefined` where it reads the getter, not where the double was built.
- **`Object.prototype` gets mocked** (line 18). It walks up the prototype chain until `null`. So
  `hasOwnProperty`, `toString`, `valueOf` and `isPrototypeOf` end up mocked on the double.
  `createSpyFromClass` stops before `Object.prototype` and never collects its members.
- **Eager only.** It builds every method up front. [Lazy spies](/core/performance) exist because
  that costs 11.50 µs against 6.04 µs on a 40-method service.

It is also the only third party on this page with **zoneless support**. The `./zoneless` entry point
is absent from 19.1.1's `exports` map and present in 19.2.0's, published 2026-03-17. Both maps were
read from the published packages. That is a real point in its favour. Its rendering API remains a
different tool from a spy factory.

That is why this page tells you to keep it. The spec-by-spec translation of the `/vitest-utils` half
is on [Migrating from @testing-library/angular](/migrating-testing-library-angular). It covers
`createMock` to `createSpyFromClass`, `provideMock` to `provideAutoSpy`, `values` versus `returns`,
both defects reproduced in a REPL, and what the `./zoneless` `render` gives you.

### httpResource()

**No other Angular library helps with `httpResource()`.** It is Angular's main data primitive. The
word `httpResource` does not appear in the published packages of ng-mocks 14.17.3,
`@ngneat/spectator` 22.1.0 or `@testing-library/angular` 19.4.2, read on 2026-09-02.

Without a helper, a spec does six steps by hand:

1. Tick, because a resource created in an injection context has not sent anything yet.
2. Inject `HttpTestingController`.
3. Call `expectOne`.
4. Call `flush`.
5. Let one microtask run, so the response reaches the resource.
6. Tick again, so the view that reads it is current.

Both halves fail quietly:

- Skip the first tick, and `expectOne` reports a request that was never sent. That looks like a bug
  in the code under test.
- Skip the microtask, and the assertion reads the resource's **default** value. The test is green,
  and stays green until the default changes.

[`expectRequest(url).flush(body)`](/adapters/angular-http) does all six steps, and the value is
readable on the next line. This is based on a measurement (Angular 21.2.17, zoneless `TestBed`). An
`httpResource()` settles exactly one microtask plus one tick after its response is flushed. A plain
`resource()` takes two rounds. That is why
[`settleResource`](/adapters/angular#resources-httpresource-and-resource) still exists, for every
wait not tied to a single request.

The cost is small and opt-in: one **optional** peer dependency (`@angular/common`) behind one 2.2 kB
entry point. A project that never tests an HTTP call never installs it.

### Angular's own test `Log`

[`createLog()`](/utilities/call-log) is ported from `Log` in Angular's own test code
(`packages/core/testing/src/logger.ts`). Angular keeps three copies of it, in core, router and forms.
It is the usual answer there wherever the subject is a sequence: lifecycle hooks, guards, resolvers,
teardown.

## NestJS

### @suites/unit

**[@suites/unit](https://github.com/suites-dev/suites)**: 473 130 downloads a month, recommended by
the NestJS docs. It is the most serious live competitor to the [NestJS recipe](/recipes).

Suites builds the unit from its DI metadata, so a constructor change does not rewrite the spec. This
package's Nest entry has the same model:
[`createNestUnit`](/adapters/nestjs#building-the-unit-from-its-metadata). `expose` is
`sociable().expose()`. Your own values in `providers` win over both the spies and `expose`. The
differences:

- The double behind every token is `createSpyFromClass`, which reads the real prototype. A typo
  fails instead of being answered.
- It reads the same metadata Suites reads. It needs only what Nest itself needs (`reflect-metadata`,
  `emitDecoratorMetadata`), and no adapter packages.
- It runs wherever the core runs.

How Suites compares:

- **Backend only, by its own description.** The DI adapters are `@suites/di.nestjs` and
  `@suites/di.inversify`. The doubles adapters are `@suites/doubles.jest`, `.vitest` and `.sinon`
  (all 3.1.0, listed on npm 2026-08-30). **No Bun, no `node:test`, no Angular.**
- **It cannot do Angular by design.** It finds collaborators from the constructor's
  `design:paramtypes`. `readonly #x = inject(X)`, the pattern modern Angular classes use, emits no
  such metadata. There is no open Angular request on the repo; issue #931 is the maintainer's own
  injection-js item.
- **`reflect-metadata` and `emitDecoratorMetadata` are required.** That is a `tsconfig` flag and a
  runtime import a Vite/esbuild project may not otherwise need. A Nest app already has both, and
  `createNestUnit` needs the same, nothing more.
- **Its Proxy answers every property**, so a typo in a mocked method name never fails.
  `createSpyFromClass` reads the real prototype, and
  [`onlyMethodsToSpyOn` reports a name that is not on it](/core/create-spy-from-class).
  `createNestUnit` builds every class token with it.
- **v4 has been in beta since 2025-11-04** (`4.0.0-beta.0`), still unreleased on 2026-09-19;
  `latest` is 3.1.1 (2026-05-08). Before the 3.1 line, nothing shipped between 3.0.1 (2025-01-02) and
  `4.0.0-alpha.0` (2025-10-27).
- **The Vitest adapter patches another package's typings on install.** `@suites/doubles.vitest`
  3.1.0 has a `postinstall` script. It prepends
  `/// <reference types="@suites/doubles.vitest/unit" />` to `@suites/unit`'s own `index.d.ts`,
  found by a relative path. Sometimes install scripts do not run: pnpm 10's default,
  `--ignore-scripts`, a locked-down CI. Sometimes the two packages do not sit side by side. Then
  `Mocked<T>` quietly stays the runner-neutral type, and the documented fallback is a hand-written
  `global.d.ts`. This package's entry points carry their own types, so there is nothing to patch.
- **On Vitest the decorator metadata needs SWC.** esbuild, and so Vite, does not emit
  `design:paramtypes`. A Nest project on Vitest adds `unplugin-swc` whichever builder it uses.
  `createNestUnit` reads the same metadata and has the same need. The Angular, React, Vue and Svelte
  entries read no decorator metadata at all.
- **The scale.** In the week to 2026-09-18, `@suites/doubles.vitest` had 25 353 downloads and
  `@suites/unit` 80 249. One maintainer, Apache-2.0.

**Solitary and sociable carry over to Angular.** Suites names the two shapes a unit test takes:

- _solitary_: every collaborator is a double;
- _sociable_: a named few are real, and everything past them is still a double.

In a `TestBed` you make the same choice one provider at a time. `provideAutoSpy(X)` makes `X` a
double. To keep `X` real, list `X` itself. A service with `providedIn: 'root'` is real
without being listed. The provider list
itself says which dependencies are real, with no builder to learn. On Nest the builder exists:
[`createNestUnit(S, { expose: [D] })`](/adapters/nestjs#sociable-—-expose) is `sociable().expose()`.

The spec-by-spec translation is on [Migrating from @suites/unit](/migrating-suites). It covers
`unitRef.get` to `spies.get`, `.mock().impl()` to a control helper or `providers`, string and symbol
tokens, `@Optional()`, and the `await` that disappears.

### @golevelup/ts-vitest

**[@golevelup/ts-vitest](https://github.com/golevelup/nestjs)**: 4.0.0 on 2026-03-18, 353 803
downloads a month, the community default. `createMock<T>()` is a deep Proxy with no return-type
helpers and no argument matching. It costs about twice the type instantiations
([Type-check cost](#_3-type-check-cost)). **`@golevelup/nestjs-testing` is dead** (0.1.2, from 2019);
do not cite it as the current package.

## Beyond the class spy

The tables above compare what all these libraries do. Here is what none of the others ship beside
it:

- [**Angular's `TestBed` under `bun test`**](/runtimes/bun-angular). Bun has no DOM and cannot
  resolve `templateUrl`, so Angular specs do not run there at all. One preload fixes both.
- [`renderShallow`](/adapters/angular#shallow-component-rendering) and
  [`createWithAutoSpies`](/adapters/angular#building-a-class-with-auto-spied-dependencies). Each
  replaces the shallow-`TestBed` boilerplate or DI-driven construction with one call.
  `renderShallow` never builds the child components, so its cost stays flat as children grow.
  `TestBed.createComponent` grows with them. A leaf component with no children has nothing to save,
  and the per-test `overrideComponent` can cost more than it saves there. The mechanism and the
  `keepTemplate: true` middle option are in
  [Performance](/core/performance#_2-rendering-the-child-subtree).
- [`stable` / `flushEffects`](/adapters/angular#zoneless-waiting) and `toHaveSignalValue`: zoneless
  waiting and a signal matcher, for code where `detectChanges()` is no longer enough.
- [Observable assertions](/core/observable-assertions) that fail when the stream stays silent. They
  check the shape of the object, so they pull in no rxjs.
- [`setupFakeTimers()` / `advanceTimers()`](/utilities/fake-timers): advancing the clock also runs
  the microtasks a bare `advanceTimersByTime()` leaves pending.
  [`flushEventLoop` / `settleDynamicImport`](/utilities/event-loop) cover the queue the clock does
  not reach.
- [`mockConstructor` / `stubConstructor`](/utilities/constructor-doubles): a double the code under
  test can call with `new`. A runner's own `vi.fn(() => instance)` is not one.
- [`fakeAsync` and `waitForAsync` on Vitest](/utilities/zone). `zone.js/testing` installs its
  ProxyZone through Jasmine and Jest hooks only, so both throw until you import this patch.
- [`assertMocked` / `moduleNamespace`](/utilities/module-mocks): proof that a `vi.mock()` applied
  under a bundler, instead of a spec quietly asserting on the real module.
- [`setupAutoSpy({ strayRejections: true })`](/utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed)
  turns the promise rejections zone.js sends to `console.error` into failed tests. Vitest never sees
  such a rejection. So a spec that asserts inside an un-awaited `.then()` stays green and exits 0.
- [`setupAutoSpy({ pruneMockRegistry: true })`](/utilities/setup#_9-pruning-the-mock-registry-nothing-empties)
  trims a `Set` inside `@vitest/spy`. Every `vi.fn()` joins it and nothing removes them; the option
  keeps only mocks that outlive a file. Under `isolate: false` that `Set` makes `clearMocks` slower
  with every test. It also keeps a whole run's recorded arguments, and the component trees behind
  them, alive in one worker.
- [Fifty-seven ESLint rules](/utilities/eslint-plugin), versioned together with the API they
  recommend, and [`setupAutoSpy()`](/utilities/setup) for the cleanup a shared test environment
  needs.
- [Per-file `TestBed` diagnostics](/adapters/angular#where-a-spec-spends-its-time): which specs
  actually pay for `TestBed`, and how much.
- [`compareTestRuns`](/migrating): whether your migration lost a test. It compares the two sets of
  test names, not two totals that happen to match.

## Sources and dates

::: info Where the numbers come from
Download counts cover the npm window **2026-07-29 → 2026-08-27**, from a survey dated
**2026-08-29**. Versions, publish dates, dependency lists, repository status and quoted typings were
re-read from the npm registry and the published packages on **2026-08-30**. Every one reproduced.
Treat all of it as a dated snapshot and re-check before quoting.

Re-verified since:

- **2026-09-04**: both `@testing-library/angular` `createMock` defects under [Angular](#angular),
  re-read in the published 19.4.2 package. Both still hold at the same two lines. Both were
  reproduced by running the published module; the output is on
  [Migrating from @testing-library/angular](/migrating-testing-library-angular).
- **2026-09-04**: every version and publish date in the two status tables, re-read from the registry.
  Every one reproduced.
- **2026-09-04**: every performance figure on this page, re-run in full. These are this package's
  own measurements; the full tables are in [Performance](/core/performance).

The one figure not re-measured against the competitors is the type-instantiation count in
[Type-check cost](#_3-type-check-cost), carried from the 2026-08-29 survey. The package's own cost
has a CI-measured number since 2026-09-02; see the same section.
:::
