---
title: API reference
description: Every export of vitest-auto-spy and its subpaths, the helper surface per return type, and the public types.
---

# API reference

The exported surface of `vitest-auto-spy` and its subpaths.

| Export                                                                                                       | Description                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `createSpyFromClass(Class, methodsOrConfig?)`                                                                | Build a fully-typed `Spy<T>` from a class                                                              |
| `createAutoMock<T>(overrides?)`                                                                              | Build a `Spy<T>` from a **type/interface** alone (Proxy, no class)                                     |
| `createMock<T>(partial?)`                                                                                    | Build a plain, spy-free `T` from the fields a test seeds — for data shapes, not collaborators          |
| `mockDeep<T>(overrides?)`                                                                                    | Recursive `DeepMockProxy<T>` — nested access auto-creates chainable spies                              |
| `clearAutoSpy(spy)` / `resetAutoSpy(spy)`                                                                    | Clear calls (keep config) / full reset of every spy inside an assembled spy                            |
| `provideAutoSpy(Class, methodsOrConfig?)`                                                                    | Angular `{ provide, useValue }` shorthand (`/angular`); NestJS / Vue variants in their subpaths        |
| `injectSpy(token)`                                                                                           | `TestBed.inject` typed as `Spy<T>` (`/angular`); NestJS variant takes `(moduleRef, token)`             |
| `createFunctionSpy(name)`                                                                                    | A single standalone function spy with all helpers                                                      |
| `createObservableWithValues(configs, opts?)`                                                                 | Build an Observable from value configs (`/rxjs`)                                                       |
| `mockReadonlyProp` / `mockReadonlyPropGetter` / `mockValueProp` / `mockAccessorsProp`                        | Mock readonly / writable / accessor / signal props (core, also re-exported from `/angular`)            |
| `restoreMockedProps()` / `countMockedProps()`                                                                | Undo every `mock*Prop` patch / how many are still applied                                              |
| `expectEmission(source$, opts?)` / `expectEmissions(source$, n, opts?)` / `expectNoEmission(source$, opts?)` | Assert an Observable without a `subscribe` callback that may never run                                 |
| `asInstance(spy)` / `asSpy(instance)`                                                                        | The two named views between `Spy<T>` and `T`, instead of `as any`                                      |
| `createSpyClass(Class, config?)`                                                                             | A spy that can be called with `new`; records `calls` and `instances`                                   |
| `setupAutoSpy(opts?)`                                                                                        | Property restore + duplicate-copy detection + mock-registry hygiene, in one call (`/setup`)            |
| `setupFakeTimers(config?, opts?)` / `advanceTimers(ms?)`                                                     | Paired fake-timer install/restore, and an advance that settles queued microtasks (`/setup`)            |
| `stubIntersectionObserver()` / `stubResizeObserver()` / `stubMutationObserver()` / `stubObserver(name)`      | Replace an observer global with one the spec drives; restored by `restoreMockedProps()`                |
| `intersectionEntry(target, isIntersecting, overrides?)`                                                      | Build one `IntersectionObserverEntry` without the fields nothing reads                                 |
| `mockSignalProp(object, prop, initial)`                                                                      | Replace a signal-valued property with a real writable signal, and hand back the handle (`/angular`)    |
| `blockNetwork()`                                                                                             | Reject every `fetch`, naming what was requested (`/setup`)                                             |
| `trackStrayRejections()` / `countStrayRejections()` / `flushStrayRejections()`                               | Read back the promise rejections zone.js swallowed into `console.error` (`/setup`)                     |
| `guardGlobalPatches(reaction)`                                                                               | Name the test that redefined a global property as non-configurable (`/setup`)                          |
| `installPerTest(install)`                                                                                    | Re-install a stub before every test of the block, and read back the current handle (`/setup`)          |
| `stubMediaElement(opts?)`                                                                                    | A `<video>` / `<audio>` that plays, reports a duration and fires the media events                      |
| `assertMocked(namespace, opts?)`                                                                             | Fail when the `vi.mock()` this spec relies on silently did not apply                                   |
| `moduleNamespace(exports, opts?)`                                                                            | The `vi.mock` factory result an interop probe recognises (`default` + `__esModule`)                    |
| `flushEventLoopUntil(isDone, opts?)`                                                                         | Real event-loop turns until a condition holds, with a budget instead of a hang                         |
| `diffByField(actual, expected)`                                                                              | Which field of an array of records moved, in how many elements — the diff the reporter collapses       |
| `setupAngularTestEnv(opts?)`                                                                                 | Zone and zoneless spec files in one worker, switching platforms per file (`/angular`)                  |
| `provideAutoSpyForToken(token, overrides?)`                                                                  | `{ provide, useValue }` for an `InjectionToken`, with the spy built from the token's type (`/angular`) |
| `createDirectiveHost(opts)`                                                                                  | A standalone host for a directive under test, with its scope where the compiler reads it (`/angular`)  |
| `registerDirectiveMatchers()`                                                                                | Adds `expect(fixture).toHaveDirectiveApplied(Directive, selector?)` (`/angular`)                       |
| `asInstances(...spies)`                                                                                      | `asInstance` for a whole argument list, in one edit against one compiler error                         |
| `narrow(value, predicate)` / `narrow.byKey` / `narrow.observable`                                            | The branch of a union a test knows it got, failing with the shape the value actually had               |
| `withOverrides(model, overrides?)`                                                                           | A fixture from a model instance: its getters read once, as data                                        |
| `compareTestRuns(a, b, root?)` / `formatTestRunComparison(diff)` / `summarizeTestRun(report, root?)`         | Whether a migration lost a test — the set of names, which counters cannot answer                       |
| `installProxyZonePatch(opts?)`                                                                               | `fakeAsync` / `waitForAsync` on Vitest (`/zone`, which installs it on import)                          |
| `restoreTimerGlobals()` / `getWatchedTimerGlobals()`                                                         | Put back timer globals the fakes deleted / the names captured (`/setup`)                               |
| `renderShallow(Component, opts?)`                                                                            | `TestBed` component without its children and (by default) its template (`/angular`)                    |
| `createWithAutoSpies(Class, opts?)`                                                                          | Build a class through Angular DI with every unprovided token auto-spied (`/angular`)                   |
| `stable(fixture)` / `flushEffects()`                                                                         | Zoneless waiting: flush effects, then await the fixture (`/angular`)                                   |
| `registerSignalMatchers()`                                                                                   | Adds `expect(sig).toHaveSignalValue(value)` (`/angular`)                                               |
| `enableTestBedDiagnostics(opts?)`                                                                            | Per-file report of how much of a spec's time went into `TestBed` (`/angular`)                          |
| `registerDomGlobals(opts?)`                                                                                  | Install a DOM into a runtime that ships none; returns the registrar used (`/bun-angular`)              |
| `createJsdomRegistrar(opts)` / `createGlobalRegistratorRegistrar(opts)`                                      | The two DOM strategies `registerDomGlobals` tries, for a custom preload (`/bun-angular`)               |
| `copyWindowGlobals(source, target)`                                                                          | Copy a window's properties onto a global-like target, without clobbering runtime built-ins             |
| `inlineAngularResources(source, path, opts?)`                                                                | Rewrite `templateUrl` / `styleUrl` / `styleUrls` into inline `template` / `styles`                     |
| `consoleDebugSpy` … `consoleWarnSpy`                                                                         | Silent typed spies replacing the global `console` methods on import (`/console`)                       |
| `installConsoleSpies()` / `resetConsoleSpies()` / `restoreConsole()`                                         | Install / clear / undo the console spies (`/console`)                                                  |
| `errorHandler`                                                                                               | The `mustBeCalledWith` argument-mismatch error helper                                                  |
| `vitest-auto-spy/eslint-plugin`                                                                              | Nine flat-config lint rules that steer a suite onto these helpers                                      |

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
`gettersToSpyOn`, `settersToSpyOn` (any string key — "is an accessor" is a fact about the
descriptor, not about the value's type, so a signal-valued getter is nameable), `returns` (return
values installed as the spy is built), `autoSpyAccessors` (auto-discover getters/setters),
`lazySpies` (build each method spy on first access — the `provideAutoSpy` default on Angular)

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

**`Spy<T, Options>`** — the second parameter is `{ overload?: 'first' | 'last' }`. `Parameters` and
`ReturnType` read the **last** signature of an overloaded method, which on a generated API client is
`observe: 'events'` — the one nobody calls. `Overload<F, 0>` names one signature on its own.

**`DeepPartial<T>`** — what `createMock` / `createAutoMock` take: partial at every depth, and a key
`T` does not have is still rejected at every depth. Built-ins (`Date`, `Map`, `Promise`, functions)
pass through untouched. A real value is accepted wherever a partial is, so a host object such as
a `NodeList` stays assignable to the mapping of itself.

**`ClassSpyConfiguration<T>`**, **`ValueConfig<T>`**, `NextValueConfig`, `ErrorValueConfig`,
`CompleteValueConfig`, `ValueConfigPerCall`, `OnlyMethodKeysOf<T>`, `OnlyObservablePropsOf<T>`,
`AccessorKeysOf<T>`, `MethodReturns<T>`, `PropStubValue<V>`, `SpyOptions`, `Overloads<F>` are
exported from the core as well.

## Exports by subpath

Every runtime and framework subpath re-exports the **whole core** on top of what it adds, so a spec
never needs two imports from this package.

| Subpath             | Adds on top of the core                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest-auto-spy`   | — (this is the core; registers the Vitest adapter)                                                                                                                                                                                                                                                                              |
| `/bun`              | — (registers the `bun:test` adapter)                                                                                                                                                                                                                                                                                            |
| `/node`             | — (registers the `node:test` adapter)                                                                                                                                                                                                                                                                                           |
| `/bun-angular`      | `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable`, `flushEffects`, the DOM/inliner building blocks; registers the Bun adapter and boots a zoneless `TestBed`                                                                                                                                      |
| `/rxjs`             | `createObservableWithValues` + the observable type surface; registers the observable layer                                                                                                                                                                                                                                      |
| `/angular`          | `provideAutoSpy`, `provideAutoSpyForToken`, `injectSpy`, `overrideAutoSpy`, `overrideComponentProvider`, `assertNgModuleScopes`, `setupAngularTestEnv`, `createDirectiveHost`, `registerDirectiveMatchers`, `renderShallow`, `createWithAutoSpies`, `stable`, `flushEffects`, `registerSignalMatchers`, the TestBed diagnostics |
| `/nestjs`           | `provideAutoSpy`, `injectSpy(moduleRef, token)`, `NestModuleRef`, `NestValueProvider`                                                                                                                                                                                                                                           |
| `/vue`              | `provideAutoSpy`, `VueInjectionToken`, `VueProvideSpy`                                                                                                                                                                                                                                                                          |
| `/react`, `/svelte` | — (the core, under a name that reads right in those suites)                                                                                                                                                                                                                                                                     |
| `/console`          | `consoleDebugSpy` … `consoleWarnSpy`, `installConsoleSpies`, `resetConsoleSpies`, `restoreConsole`                                                                                                                                                                                                                              |
| `/zone`             | `installProxyZonePatch` — and installs it on import. The only entry that touches zones; zone.js is a **devDependency of this package and nothing else**, and no other entry reaches this module                                                                                                                                 |
| `/setup`            | `setupAutoSpy`, `setupFakeTimers`, `advanceTimers`, `mockSystemTime`, `withSystemTime`, `mockNow`, `useCountingClock`, `registerFocusMatchers`, `blockNetwork`, `guardGlobalPatches`, `installPerTest`, `restoreTimerGlobals`, the stray-timer and stray-rejection trackers, `describeDuplicateCopies`, `getPackageCopies`      |
| `/eslint-plugin`    | the flat-config plugin object                                                                                                                                                                                                                                                                                                   |

The core itself also carries, beyond the factories: `asInstances`, `narrow`, `withOverrides`,
`compareTestRuns`, `mockConstructor`, `stubConstructor`,
`stubAbortController`, `stubMediaElement`, `flushEventLoop`, `flushEventLoopUntil`,
`settleDynamicImport`, `assertMocked`, `moduleNamespace`, `diffByField`, `autoMocked`, the observer
stubs (`stubIntersectionObserver` / `stubResizeObserver` / `stubMutationObserver` / `stubObserver`)
and their entry builders (`intersectionEntry`, `mutationRecord`, `resizeEntry`).

::: warning One adapter per run
Each entry registers its mock adapter **on import**. Import the one that matches your runner —
pulling `vitest-auto-spy` into a `bun test` run leaves Vitest's adapter installed.
:::

Two helpers are Vitest-only and deliberately absent from `/bun-angular`, because they need the
runner's `expect.extend` and suite-level hooks: `registerSignalMatchers` and the TestBed diagnostics
family.
