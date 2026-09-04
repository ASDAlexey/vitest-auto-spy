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

Re-verified since: the two `@testing-library/angular` `createMock` defects quoted under
[Angular](#angular) were re-read in the published 19.4.2 tarball on **2026-09-02** and both still
hold, at the same two lines. Every performance figure on this page is this package's own
measurement, re-run in full on **2026-09-04** — the tables it summarises are in
[Performance](/core/performance).

The one figure not re-measured against the competitors is the type-instantiation count in
[Type-check cost](#_3-type-check-cost), which is carried from the 2026-08-29 survey. The package's
own cost has had a CI-measured number since 2026-09-02 — see the same section.
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
  2025-11-02; `github.com/ngneat/spectator` returns **404** and took every issue and PR with it,
  though the `ngneat` org itself still resolves. A third-party snapshot sits at
  [ngneat-archive/spectator](https://github.com/ngneat-archive/spectator) (created 2026-06-07,
  already archived). It is still pulled **739 852 times a month** (2026-07-31 → 2026-08-29), so
  plenty of suites are sitting on it. Three runtime dependencies — `tslib`, `@testing-library/dom`
  and **`jquery`** — and `lib/mock.d.ts:11` declares `CompatibleSpy … extends jasmine.Spy`, which
  `SpyObject<T>` is built from, so even `@ngneat/spectator/vitest` drags the Jasmine global types
  into a Vitest project. It does not resolve on a clean Angular 22 workspace: it imports
  `BrowserDynamicTestingModule` from `@angular/platform-browser-dynamic/testing` while declaring
  that package in neither `dependencies` nor `peerDependencies`, so the install errors with
  `ERR_MODULE_NOT_FOUND` — the package itself still ships (22.1.4) and is merely npm-deprecated, so
  adding it by hand is a workaround. The [`@openng/spectator`](https://www.npmjs.com/package/@openng/spectator)
  fork ([openng-org/spectator](https://github.com/openng-org/spectator), 1.0.1, 2026-07-10, at
  16 251 downloads — 2.1 % of the original) is an active repository, but its Angular 22 build is a
  recompile: it carries the same undeclared import and fails identically, and the fix
  ([#13](https://github.com/openng-org/spectator/pull/13)) has been open since 2026-07-26.
  [The full migration path is its own page](/migrating-spectator). Verified 2026-09-02.

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

¹ There is a real `@ngneat/spectator/vitest` secondary entry point, shipped since 19.2.0
(2024-12-17) — Vitest is supported, not bolted on. The asterisk is elsewhere: it ships
`declare namespace jasmine` in its own typings, so installing it drags the Jasmine globals into a
Vitest project, and it imports a package Angular 20 deprecated — see
[above](#half-the-field-has-stopped-shipping).
² The core is runner-agnostic behind a `MockAdapter`, and Vitest, Bun and `node:test` have shipped
adapters — see [Runtimes](/runtimes/vitest). **Jest is not one of them today**: the adapter registry
is internal, `registerMockAdapter` is not exported from any entry point, and a Jest consumer
therefore has no supported way to plug one in. The architecture allows it; the package does not yet
expose it. Checked 2026-09-02.
³ sinon is a library rather than a runner integration: its stubs are its own, so the runner's
matchers and its `clearMocks` / `restoreMocks` housekeeping do not see them.

Dependency counts are each package's own `dependencies` field on npm, read 2026-08-30:
`@hirez_io/auto-spies-core` for `jest-auto-spies` (itself last published 2023-06-03), `ts-essentials`
for `vitest-mock-extended`, plus `lodash.isequal` for `jest-mock-extended`, four `@suites/*` packages
for `@suites/unit`, `tslib` for `@testing-library/angular`, `tslib` + `jquery` +
`@testing-library/dom` for spectator, and four `@sinonjs/*` + `diff` packages for sinon.

## Four things nothing else does

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

The figure is guarded now. `npm run types:budget`, part of `npm run check`, regenerates a fixture of
the same shape — an 80-member class mixing sync, `Promise` and `Observable` methods with a few
properties and getters, 30 `createSpyFromClass` declarations typed `Spy<T>`, 600 member touches —
into a temporary directory, type-checks it against the library's **sources** with
`tsc --extendedDiagnostics`, subtracts a control program with the same class and imports but no
spies, and fails the gate when the instantiations attributable to `Spy<T>` and its helpers exceed
the budget. On 2026-09-02, TypeScript 5.9.3: total 19 933, control 10 807, **delta 9 126** against
a budget of **11 000** — about 20 % of headroom, where a deep-proxy regression would roughly double
the delta. It is a different fixture from the survey's (which was never committed) and it counts
against the sources rather than the published declarations, so the delta is not comparable to the
2 656 above — only to itself across commits. `node scripts/check-type-budget.mjs --print` dumps the
fixture, `--measure` prints the numbers without failing.

### 4. Runtime cost

The type-check bill above has a runtime sibling, and nobody publishes that one either: what the
same class costs across a whole suite, not per mock.

`jest-auto-spies@3.0.1`, `jasmine-auto-spies@8.0.1` and `@bugsplat/vitest-auto-spies@1.0.0` are all
measured directly — not one standing in for another. All three depend on
`@hirez_io/auto-spies-core@3.0.0` and differ only in the spy factory they hand it (`jest.fn()`,
`jasmine.createSpy()`, `vi.fn()`), and they land within a few per cent of each other on every
micro-benchmark case. `jest-auto-spies` and `jasmine-auto-spies` run here under a minimal `jest` /
`jasmine` global backed by `vi.fn()`, so every arm creates the same underlying mock and the
runner's own per-mock cost is a shared constant — the numbers describe each library's own code, not
what a real Jest or Jasmine suite would show.

Against that shared core, this package runs roughly one and a half times faster at suite scale —
holds at 1 000, 3 000 and 10 000 tests, on both a 20- and a 100-method class, every round measured.
Re-measured on the 4.1 build 2026-09-04, medians of three rounds on a 20-method class: 1.50× at
1 000 tests, 1.61× at 3 000, 1.54× at 10 000, the nine individual rounds spread 1.46–1.62×; and
1.68× on a 100-method class at 10 000 tests, five rounds out of five above 1.0× (1.66–1.73×).

The micro-benchmark figures behind the claims in this section are the **median p75 of seven
independent runs** at doubled iteration budgets, not a single run, and each row's ± column reports
how far that median can be off — a median of ±0.9% and at worst ±6.3% across the run's 47
rows. **A difference under about 20% is still not worth quoting off a single local run**; the
narrowest margin in any table is 2.19×, which is an order of magnitude clear of both. Full
methodology:
[Performance → the measured resolution limit](/core/performance#the-measured-resolution-limit).

The micro-benchmark tables all changed hands in 4.1, when method spies stopped being `vi.fn()`s —
[the spy engine](/core/performance#the-spy-engine). Six rows were losses and one was parity before
it; the narrowest margin now is 2.19×, on the row where a test calls every method of the class it
doubled:

| | 4.0 | 4.1 | best other arm |
| --- | ---: | ---: | ---: |
| all 14 of 14 methods called | 18.92 µs (a loss) | **8.17 µs** | 17.92 µs hand-written `vi.fn()` |
| all 45 of 45 methods called | 75.33 µs (a loss) | **26.12 µs** | 62.04 µs hand-written `vi.fn()` |
| `createAutoMock<T>()`, 40 members | 72.88 µs (a loss) | **18.92 µs** | 56.79 µs vitest-mock-extended |
| `mockDeep<T>()`, 3 levels | 8.83 µs (a loss) | **2.29 µs** | 5.46 µs vitest-mock-extended |
| `calledWith` dispatch | 0.54 µs (parity) | **0.17 µs** | 0.54 µs vitest-mock-extended |
| retained heap, one materialised method | 5 445 B | **1 929 B** | 5 169 B hand-written `vi.fn()` |
 This package now leads **every** published
head-to-head table, including the two `worst case` blocks where a test calls every method of the
class it doubled and there is nothing for a lazy library to skip. The counterweights that go with
that:

- Part of the lead is that this package no longer pays the runner's per-mock cost while every other
  arm still does. That is a difference in the product, not in the measurement, and the table is
  built to show it: the `hand-written vi.fn() per method` arm is the runner's own mock assembled by
  hand with no library in the way, and the distance to that arm is the whole size of it.
  `setSpyEngine('runner')` puts this package back on `vi.fn()` for anyone who wants the comparison
  without it.
- Hand-written `vi.fn()` doubles are **cheaper**, not more expensive, than this library across a
  suite under the default `isolate: true` — about **3 %** at the median on the 4.1 build, down from
  10-15 % before it, with individual rounds between 0.84× and 1.00×. Micro-benchmark multipliers do not transfer to
  suite scale: building a double is on the order of one per cent of what a test costs, which is why
  a 10× win on the double is worth a few per cent on the run.

Where the library wins outright is memory, not wall-clock. On a 100-method class under
`test.isolate: false`, hand-written doubles peak at 6366 MB against 2103 MB for the default lazy
mode and 1851 MB with `lazySpies: 'proxy'` — the difference between a CI worker finishing and one
getting OOM-killed.

A second, independent memory measurement — retained bytes per double, not peak RSS of a whole run —
confirms the shape down at the level of a single mock, which is the figure that decides a large
suite: untouched on a 100-method class, this package's default retains **256 B per method** against
`jest-auto-spies`' **5 835 B**. Full tables, methodology and per-library figures are in
[Performance → Retained memory per double](/core/performance#retained-memory-per-double).

Measured 2026-09-04, Node v24.19.0, Vitest 4.1.11, Apple M4 Max. Full tables, the isolate-mode and
interleaving methodology, and reproduction steps (`npm run bench:vs:precise` for the seven-run
median used above, about eleven minutes; plain `npm run bench:vs` is a single ~1-minute run for
local iteration; `npm run bench:suite`) are in [Performance](/core/performance).

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
`fesm2022/testing-library-angular-vitest-utils.mjs` at 19.4.2 — the whole file is 52 lines, and both
defects below were re-read in the published tarball on **2026-09-02** — it is worse in three
specific ways:

- **No accessor handling** (line 14). The walk assigns a mock only when
  `typeof descriptor?.value === 'function'`; a getter's descriptor has no `value`, so accessors are
  skipped silently. A service's `get isLoggedIn()` is therefore absent from the double while
  `Mock<T>` still types it as callable — the two defects compound, and the failure surfaces as
  `undefined` at the reading site rather than at the double.
- **No `Object.prototype` guard** (line 18). `mockFunctions(Object.getPrototypeOf(proto))` recurses
  until the prototype is null — so `hasOwnProperty`, `toString`, `valueOf` and `isPrototypeOf` end
  up mocked on the double. `createSpyFromClass` stops before it —
  `walkOwnPrototypes` (`src/lib/create-spy-from-class.ts:81`) visits a prototype only when it still
  has a parent, so `Object.prototype`'s own members are never collected.
- **Eager only.** Every method is built up front; [lazy spies](/core/performance) exist because that
  costs 11.50 µs against 6.04 µs on a 40-method service.

It is also the only third party on this page with **zoneless support** — a `./zoneless` entry point
added in 19.2.0 on 2026-03-17 (verified in the tarball's `exports` map). That is a real point in its
favour, and its rendering API remains a genuinely different tool from a spy factory.

**`httpResource()` is the one place where the whole field is empty.** It is Angular's flagship data
primitive, and none of the three Angular libraries above ships anything for it — no helper, no
recipe, no mention — `httpResource` does not appear anywhere in the published tarballs of ng-mocks
14.17.3, `@ngneat/spectator` 22.1.0 or `@testing-library/angular` 19.4.2, read on 2026-09-02. A spec is left with the six-step dance in full: tick, because a resource created
in an injection context has issued nothing yet; inject the `HttpTestingController`; `expectOne`;
`flush`; let one microtask run so the response reaches the resource; tick again so the view reading it
is current. Both halves fail quietly. Skip the first tick and `expectOne` reports a request that was
never sent, which reads as a bug in the code under test. Skip the microtask and the assertion runs
against the resource's **default** value — the test is green, and it stays green until the day the
default changes.
[`expectRequest(url).flush(body)`](/adapters/angular-http) is all six steps, and the value is readable
on the next line. That is not a claim about ergonomics: the measurement behind it (Angular 21.2.17,
zoneless `TestBed`) is that an `httpResource()` settles exactly one microtask plus one tick after its
response is flushed, and a plain `resource()` takes two rounds — which is also why
[`settleResource`](/adapters/angular#resources-httpresource-and-resource) still exists for every wait
that is not tied to a single request. The cost is honest and confined: one **optional** peer
(`@angular/common`) behind one 2.2 kB subpath, so a project that never tests an HTTP call never
installs it.

## NestJS

**[@suites/unit](https://github.com/suites-dev/suites)** — 473 130 downloads a month, recommended by
the NestJS docs, and the most serious live competitor to the [NestJS recipe](/recipes). Its solitary/sociable model — the unit built from its DI metadata, so a constructor change does not rewrite the spec — is now [`createNestUnit`](/adapters/nestjs#building-the-unit-from-its-metadata) on this package's Nest entry: `expose` is `sociable().expose()`, `providers` wins over both. The differences are the ones below — the double behind every token is `createSpyFromClass`, which reads the real prototype, so a typo fails instead of being answered; it reads the same metadata Suites reads and needs nothing beyond what Nest itself needs (`reflect-metadata`, `emitDecoratorMetadata`), with no adapter packages; and it runs wherever the core runs.

The contrast:

- **Backend only, by its own description.** The published DI adapters are `@suites/di.nestjs` and
  `@suites/di.inversify`; the doubles adapters are `@suites/doubles.jest`, `.vitest` and `.sinon`
  (all 3.1.0, listed on npm 2026-08-30). **No Bun, no `node:test`, no Angular.**
- **It structurally cannot do Angular.** It discovers collaborators from the constructor's
  `design:paramtypes`, and `readonly #x = inject(X)` — the pattern every modern Angular class uses —
  emits no such metadata. (There is no open Angular request on the repo; issue #931 is the
  maintainer's own injection-js item, not one.)
- **`reflect-metadata` plus `emitDecoratorMetadata` are mandatory**, which is a `tsconfig` and a
  runtime import a Vite/esbuild project may not otherwise need — the same requirement a Nest app already meets, and the one `createNestUnit` shares; it adds none.
- **Its Proxy answers every property**, so a typo in a mocked method name never fails — where
  `createSpyFromClass` reads the real prototype and
  [`onlyMethodsToSpyOn` reports a name that is not on it](/core/create-spy-from-class), and `createNestUnit` builds every class token with it.
- **v4 has been in beta since 2025-11-04** (`4.0.0-beta.0`), unreleased.

The spec-by-spec translation — `unitRef.get` to `spies.get`, `.mock().impl()` to a control helper or
`providers`, string and symbol tokens, `@Optional()`, and the `await` that disappears — is
[Migrating from @suites/unit](/migrating-suites).

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
  shallow-`TestBed` copy-paste and DI-driven instantiation as one call each. What the first saves
  is however much markup the component owns, so it is a shape and not a headline number:
  `renderShallow` is flat in the number of children because it never builds the subtree, while
  `TestBed.createComponent` scales linearly with it — which also means a leaf component with no
  children has nothing to save, and the per-test `overrideComponent` can cost more than it saves
  there. The mechanism, and the `keepTemplate: true` middle rung, are in
  [Performance](/core/performance#_2-rendering-the-child-subtree).
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
- [Nineteen ESLint rules](/utilities/eslint-plugin) versioned together with the API they recommend, and
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
