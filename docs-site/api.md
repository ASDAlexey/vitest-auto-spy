---
title: API reference
description: Every export of vitest-auto-spy and its subpaths, the helper surface per return type, and the public types.
---

# API reference

The exported surface of `vitest-auto-spy` and its subpaths.

| Export                                                                                                       | Description                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `createSpyFromClass(Class, methodsOrConfig?)`                                                                | Build a fully-typed `Spy<T>` from a class                                                       |
| `createAutoMock<T>(overrides?)`                                                                              | Build a `Spy<T>` from a **type/interface** alone (Proxy, no class)                              |
| `createMock<T>(partial?)`                                                                                    | Build a plain, spy-free `T` from the fields a test seeds — for data shapes, not collaborators   |
| `mockDeep<T>(overrides?)`                                                                                    | Recursive `DeepMockProxy<T>` — nested access auto-creates chainable spies                       |
| `clearAutoSpy(spy)` / `resetAutoSpy(spy)`                                                                    | Clear calls (keep config) / full reset of every spy inside an assembled spy                     |
| `provideAutoSpy(Class, methodsOrConfig?)`                                                                    | Angular `{ provide, useValue }` shorthand (`/angular`); NestJS / Vue variants in their subpaths |
| `injectSpy(token)`                                                                                           | `TestBed.inject` typed as `Spy<T>` (`/angular`); NestJS variant takes `(moduleRef, token)`      |
| `createFunctionSpy(name)`                                                                                    | A single standalone function spy with all helpers                                               |
| `createObservableWithValues(configs, opts?)`                                                                 | Build an Observable from value configs (`/rxjs`)                                                |
| `mockReadonlyProp` / `mockReadonlyPropGetter` / `mockValueProp` / `mockAccessorsProp`                        | Mock readonly / writable / accessor / signal props (core, also re-exported from `/angular`)     |
| `restoreMockedProps()` / `countMockedProps()`                                                                | Undo every `mock*Prop` patch / how many are still applied                                       |
| `expectEmission(source$, opts?)` / `expectEmissions(source$, n, opts?)` / `expectNoEmission(source$, opts?)` | Assert an Observable without a `subscribe` callback that may never run                          |
| `asInstance(spy)` / `asSpy(instance)`                                                                        | The two named views between `Spy<T>` and `T`, instead of `as any`                               |
| `createSpyClass(Class, config?)`                                                                             | A spy that can be called with `new`; records `calls` and `instances`                            |
| `setupAutoSpy(opts?)`                                                                                        | Property restore + duplicate-copy detection + mock-registry hygiene, in one call (`/setup`)     |
| `setupFakeTimers(config?)` / `advanceTimers(ms?)`                                                            | Paired fake-timer install/restore, and an advance that settles queued microtasks (`/setup`)     |
| `stubIntersectionObserver()` / `stubResizeObserver()` / `stubMutationObserver()` / `stubObserver(name)` | Replace an observer global with one the spec drives; restored by `restoreMockedProps()`         |
| `intersectionEntry(target, isIntersecting, overrides?)`                                                 | Build one `IntersectionObserverEntry` without the fields nothing reads                          |
| `mockSignalProp(object, prop, initial)`                                                                 | Replace a signal-valued property with a real writable signal, and hand back the handle (`/angular`) |
| `blockNetwork()`                                                                                        | Reject every `fetch`, naming what was requested (`/setup`)                                      |
| `restoreTimerGlobals()` / `getWatchedTimerGlobals()`                                                    | Put back timer globals the fakes deleted / the names captured (`/setup`)                        |
| `renderShallow(Component, opts?)`                                                                            | `TestBed` component without its children and (by default) its template (`/angular`)             |
| `createWithAutoSpies(Class, opts?)`                                                                          | Build a class through Angular DI with every unprovided token auto-spied (`/angular`)            |
| `stable(fixture)` / `flushEffects()`                                                                         | Zoneless waiting: flush effects, then await the fixture (`/angular`)                            |
| `registerSignalMatchers()`                                                                                   | Adds `expect(sig).toHaveSignalValue(value)` (`/angular`)                                        |
| `enableTestBedDiagnostics(opts?)`                                                                            | Per-file report of how much of a spec's time went into `TestBed` (`/angular`)                   |
| `registerDomGlobals(opts?)`                                                                                  | Install a DOM into a runtime that ships none; returns the registrar used (`/bun-angular`)       |
| `createJsdomRegistrar(opts)` / `createGlobalRegistratorRegistrar(opts)`                                      | The two DOM strategies `registerDomGlobals` tries, for a custom preload (`/bun-angular`)        |
| `copyWindowGlobals(source, target)`                                                                          | Copy a window's properties onto a global-like target, without clobbering runtime built-ins      |
| `inlineAngularResources(source, path, opts?)`                                                                | Rewrite `templateUrl` / `styleUrl` / `styleUrls` into inline `template` / `styles`              |
| `consoleDebugSpy` … `consoleWarnSpy`                                                                         | Silent typed spies replacing the global `console` methods on import (`/console`)                |
| `installConsoleSpies()` / `resetConsoleSpies()` / `restoreConsole()`                                         | Install / clear / undo the console spies (`/console`)                                           |
| `errorHandler`                                                                                               | The `mustBeCalledWith` argument-mismatch error helper                                           |
| `vitest-auto-spy/eslint-plugin`                                                                              | Five flat-config lint rules that steer a suite onto these helpers                               |

## Helper surface by return type

**Spied sync method:** `mockReturnValue`, `calledWith(...)`, `mustBeCalledWith(...)` —
`calledWith` / `mustBeCalledWith` accept asymmetric matchers (`expect.any`, `expect.objectContaining`, …)

**Spied Promise method:** `resolveWith`, `rejectWith`, `resolveWithPerCall`; outcomes are
recorded on `mock.settledResults` (native on Vitest, polyfilled on Bun / `node:test`)

**Spied Observable method / property:** `nextWith`, `nextOneTimeWith`, `nextWithValues`,
`nextWithPerCall`, `throwWith`, `complete`, `returnSubject`

## Configuration

**`ClassSpyConfiguration`:** `methodsToSpyOn` (added to the discovered methods),
`onlyMethodsToSpyOn` (spy on nothing but these — discovery skipped), `instanceMethodsToSpyOn` (same
behaviour as `methodsToSpyOn`, named for callables that live on the instance — `signal()` fields,
arrow props, `signalStore()` methods), `observablePropsToSpyOn`,
`gettersToSpyOn`, `settersToSpyOn`, `autoSpyAccessors` (auto-discover getters/setters), `lazySpies`
(build each method spy on first access — the `provideAutoSpy` default on Angular)

**`ValueConfig`** (for `nextWithValues`): `{ value, delay? }` | `{ errorValue, delay? }` |
`{ complete?, delay? }`.

## Public types

**`Spy<T>`** — the assembled spy. A **mapped type** over `T`: every method becomes
`AddSpyMethodsByReturnTypes<Method>` (the mock plus the helpers its return type earns), every
`Observable` property gains the observable helpers, everything else keeps its own type. It also adds
an `accessorSpies` bag: `accessorSpies.getters[key]` / `accessorSpies.setters[key]`.

Because it is a mapped type it **drops `#private` and `private` members**, so `Spy<T>` is not
assignable to `T`. Declare the variable as `Spy<T>` — `injectSpy(X)` already returns it — or bridge
the two with [`asInstance` / `asSpy`](/core/spy-typing).

**`ClassType<T>`** — a constructor of `T`, the token `createSpyFromClass` / `provideAutoSpy` take.

**`DeepMockProxy<T>`** — what `mockDeep<T>()` returns: object properties become nested deep mocks,
so `mock.a.b.c` is chainable without seeding.

**`AddSpyMethodsByReturnTypes<Method>`** — the per-method surface: the mock itself intersected with
`calledWith` / `mustBeCalledWith`, plus the `Promise` or `Observable` helper bundle when the return
type earns one.

**`ClassSpyConfiguration<T>`**, **`ValueConfig<T>`**, `NextValueConfig`, `ErrorValueConfig`,
`CompleteValueConfig`, `ValueConfigPerCall`, `OnlyMethodKeysOf<T>`, `OnlyObservablePropsOf<T>` are
exported from the core as well.

## Exports by subpath

Every runtime and framework subpath re-exports the **whole core** on top of what it adds, so a spec
never needs two imports from this package.

| Subpath                       | Adds on top of the core                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest-auto-spy`             | — (this is the core; registers the Vitest adapter)                                                                                                  |
| `/bun`                        | — (registers the `bun:test` adapter)                                                                                                                |
| `/node`                       | — (registers the `node:test` adapter)                                                                                                               |
| `/bun-angular`                | `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable`, `flushEffects`, the DOM/inliner building blocks; registers the Bun adapter and boots a zoneless `TestBed` |
| `/rxjs`                       | `createObservableWithValues` + the observable type surface; registers the observable layer                                                          |
| `/angular`                    | `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable`, `flushEffects`, `registerSignalMatchers`, the TestBed diagnostics    |
| `/nestjs`                     | `provideAutoSpy`, `injectSpy(moduleRef, token)`, `NestModuleRef`, `NestValueProvider`                                                                |
| `/vue`                        | `provideAutoSpy`, `VueInjectionToken`, `VueProvideSpy`                                                                                              |
| `/react`, `/svelte`           | — (the core, under a name that reads right in those suites)                                                                                         |
| `/console`                    | `consoleDebugSpy` … `consoleWarnSpy`, `installConsoleSpies`, `resetConsoleSpies`, `restoreConsole`                                                   |
| `/setup`                      | `setupAutoSpy`, `setupFakeTimers`, `advanceTimers`, `blockNetwork`, `restoreTimerGlobals`, the stray-timer trackers, `describeDuplicateCopies`, `getPackageCopies` |
| `/eslint-plugin`              | the flat-config plugin object                                                                                                                       |

::: warning One adapter per run
Each entry registers its mock adapter **on import**. Import the one that matches your runner —
pulling `vitest-auto-spy` into a `bun test` run leaves Vitest's adapter installed.
:::

Two helpers are Vitest-only and deliberately absent from `/bun-angular`, because they need the
runner's `expect.extend` and suite-level hooks: `registerSignalMatchers` and the TestBed diagnostics
family.
