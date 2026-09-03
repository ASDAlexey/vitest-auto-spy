---
title: API reference
description: Every export of vitest-auto-spy and its subpaths, the helper surface per return type, and the public types.
---

# API reference

The exported surface of `vitest-auto-spy` and its subpaths.

| Export                                                                                                       | Description                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSpyFromClass(Class, methodsOrConfig?)`                                                                | Build a fully-typed `Spy<T>` from a class                                                                                                                           |
| `createAutoMock<T>(overrides?)`                                                                              | Build a `Spy<T>` from a **type/interface** alone (Proxy, no class)                                                                                                  |
| `createMock<T>(partial?)`                                                                                    | Build a plain, spy-free `T` from the fields a test seeds — for data shapes, not collaborators                                                                       |
| `createFixture<T>(defaults, overrides?)`                                                                     | One `T` from a complete, fully checked default plus the fields this test changes — a fresh copy every call                                                          |
| `createFixtureFactory<T>(defaults)`                                                                          | Somewhere to put that default: returns `(overrides?) => T`, defaults pinned at build time                                                                           |
| `mockDeep<T>(overrides?, options?)`                                                                          | Recursive `DeepMockProxy<T>` — nested **access** auto-creates chainable spies; `{ selfReturning: true }` chains through **calls** too                               |
| `clearAutoSpy(spy)` / `resetAutoSpy(spy)`                                                                    | Clear calls (keep config) / full reset of every spy inside an assembled spy                                                                                         |
| `provideAutoSpy(Class, methodsOrConfig?)`                                                                    | Angular `{ provide, useValue }` shorthand (`/angular`), abstract classes included; NestJS / Vue variants in their subpaths                                          |
| `injectSpy(token)`                                                                                           | `TestBed.inject` typed as `Spy<T>` (`/angular`); NestJS variant takes `(moduleRef, token)`                                                                          |
| `createFunctionSpy(name)`                                                                                    | A single standalone function spy with all helpers                                                                                                                   |
| `createObservableWithValues(configs, opts?)`                                                                 | Build an Observable from value configs (`/rxjs`)                                                                                                                    |
| `mockReadonlyProp` / `mockReadonlyPropGetter` / `mockValueProp` / `mockAccessorsProp`                        | Mock readonly / writable / accessor / signal props (core, also re-exported from `/angular`)                                                                         |
| `restoreMockedProps()` / `countMockedProps()`                                                                | Undo every `mock*Prop` patch / how many are still applied                                                                                                           |
| `expectEmission(source$, opts?)` / `expectEmissions(source$, n, opts?)` / `expectNoEmission(source$, opts?)` | Assert an Observable without a `subscribe` callback that may never run; the emitted type is inferred                                                                |
| `expectCompletion(source$, opts?)`                                                                           | Assert that a stream **terminates** — the `Observable<void>` case `firstValueFrom` rejects with `EmptyError`                                                        |
| `setEmissionTimeout(ms)`                                                                                     | Change the process-wide default wait of the emission helpers; for a suite under global fake timers                                                                  |
| `asInstance(spy)` / `asSpy(instance)`                                                                        | The two named views between `Spy<T>` and `T`, instead of `as any`                                                                                                   |
| `createSpyClass(Class, config?)`                                                                             | A spy that can be called with `new`; records `calls` and `instances`                                                                                                |
| `setupAutoSpy(opts?)`                                                                                        | Property restore, duplicate-copy detection, stray timers and rejections, mock-registry hygiene, the suite-wide `strict` default — one call (`/setup`)               |
| `setupFakeTimers(config?, opts?)` / `advanceTimers(ms?)`                                                     | Paired fake-timer install/restore, and an advance that settles queued microtasks (`/setup`)                                                                         |
| `setSpyEngine(engine)` / `getSpyEngine()`                                                                    | Build method spies from this library's own mock (`'auto-spy'`, the default) or from `vi.fn()` (`'runner'`); Vitest only (`/setup`)                                  |
| `stubIntersectionObserver()` / `stubResizeObserver()` / `stubMutationObserver()` / `stubObserver(name)`      | Replace an observer global with one the spec drives; restored by `restoreMockedProps()`                                                                             |
| `intersectionEntry(target, isIntersecting, overrides?)`                                                      | Build one `IntersectionObserverEntry` without the fields nothing reads                                                                                              |
| `mockResourceProp(object, prop, initial)`                                                                    | Replace a resource-valued property with a double the spec drives — `set` / `fail` / `loading` / spied `reload` (`/angular`)                                         |
| `mockSignalProp(object, prop, initial)`                                                                      | Replace a signal-valued property with a real writable signal, and hand back the handle (`/angular`)                                                                 |
| `blockNetwork(options?)`                                                                                     | Close `fetch`, XHR and `sendBeacon`, naming what was requested (`/setup`)                                                                                           |
| `trackStrayRejections()` / `countStrayRejections()` / `flushStrayRejections()`                               | Read back the promise rejections zone.js swallowed into `console.error` (`/setup`)                                                                                  |
| `trackMockRegistry()` / `keepMockRegistered(mock)` / `pruneMockRegistry()`                                   | Keep `@vitest/spy`'s ever-growing mock registry to the mocks that outlive a file (`/setup`)                                                                         |
| `trackNodeMocks()` / `pruneNodeMocks()` / `countNodeMocks()`                                                 | Give this library its own `node:test` `MockTracker`, so a dropped spy is actually freed (`/node`)                                                                   |
| `restoreLongLivedImplementations()`                                                                          | Put back the implementation a cross-file `vi.resetAllMocks()` took off a shared double (`/setup`)                                                                   |
| `guardGlobalPatches(reaction)`                                                                               | Name the test that redefined a global property as non-configurable (`/setup`)                                                                                       |
| `installPerTest(install)`                                                                                    | Re-install a stub before every test of the block, and read back the current handle (`/setup`)                                                                       |
| `stubMediaElement(opts?)`                                                                                    | A `<video>` / `<audio>` that plays, reports a duration and fires the media events                                                                                   |
| `assertMocked(namespace, opts?)`                                                                             | Fail when the `vi.mock()` this spec relies on silently did not apply                                                                                                |
| `moduleNamespace(exports, opts?)`                                                                            | The `vi.mock` factory result an interop probe recognises (`default` + `__esModule`)                                                                                 |
| `flushEventLoopUntil(isDone, opts?)`                                                                         | Real event-loop turns until a condition holds, with a budget instead of a hang                                                                                      |
| `diffByField(actual, expected)`                                                                              | Which field of an array of records moved, in how many elements — the diff the reporter collapses                                                                    |
| `setupAngularTestEnv(opts?)`                                                                                 | Zone and zoneless spec files in one worker, switching platforms per file (`/angular`)                                                                               |
| `provideAutoSpyForToken(token, overrides?)`                                                                  | `{ provide, useValue }` for an `InjectionToken`, with the spy built from the token's type (`/angular`)                                                              |
| `createDirectiveHost(opts)`                                                                                  | A standalone host for a directive under test, with its scope where the compiler reads it (`/angular`)                                                               |
| `registerDirectiveMatchers()`                                                                                | Adds `expect(fixture).toHaveDirectiveApplied(Directive, selector?)` (`/angular`)                                                                                    |
| `asInstances(...spies)`                                                                                      | `asInstance` for a whole argument list, in one edit against one compiler error                                                                                      |
| `captureArg<T>()`                                                                                            | Take hold of an argument the code under test built, rather than describing it — for assertions, not `calledWith`                                                    |
| `narrow(value, predicate)` / `narrow.byKey` / `narrow.observable`                                            | The branch of a union a test knows it got, failing with the shape the value actually had                                                                            |
| `withOverrides(model, overrides?)`                                                                           | A fixture from a model instance: its getters read once, as data                                                                                                     |
| `compareTestRuns(a, b, root?)` / `formatTestRunComparison(diff)` / `summarizeTestRun(report, root?)`         | Whether a migration lost a test — the set of names, which counters cannot answer                                                                                    |
| `installProxyZonePatch(opts?)`                                                                               | `fakeAsync` / `waitForAsync` on Vitest (`/zone`, which installs it on import)                                                                                       |
| `restoreTimerGlobals()` / `getWatchedTimerGlobals()`                                                         | Put back timer globals the fakes deleted / the names captured (`/setup`)                                                                                            |
| `renderShallow(Component, opts?)`                                                                            | `TestBed` component without its children and (by default) its template (`/angular`)                                                                                 |
| `createWithAutoSpies(Class, opts?)`                                                                          | Build a class through Angular DI with every unprovided token auto-spied (`/angular`)                                                                                |
| `createNestUnit(Class, opts?)`                                                                               | Build a NestJS provider from its DI metadata with every unprovided token auto-spied; `expose` builds collaborators for real, `providers` wins over both (`/nestjs`) |
| `extendWithAutoSpies(test, spec, opts?)`                                                                     | A map of dependencies as typed `TestBed` fixtures, in one `configureTestingModule` — Vitest 4.1+, throws a named error on an older runner (`/angular`)              |
| `stable(fixture, opts?)` / `flushEffects()`                                                                  | Zoneless waiting: flush effects, then await the fixture, with a 2 s budget that names the cause (`/angular`)                                                        |
| `settleResource(resource, opts?)`                                                                            | Tick until an `httpResource()` / `resource()` / `rxResource()` leaves `loading` (`/angular`)                                                                        |
| `provideHttpTesting(options?)`                                                                               | `provideHttpClient()` and `provideHttpClientTesting()` in one spread, plus a teardown check for unanswered requests (`/angular-http`)                               |
| `expectRequest(matcher, opts?)`                                                                              | Tick, find the one matching request, then `flush` / `error` it **with the settling included** — `httpResource()` and `HttpClient` (`/angular-http`)                 |
| `expectNoRequest(matcher?, opts?)` / `verifyNoPendingRequests()`                                             | Assert that nothing was requested / that nothing was left unanswered (`/angular-http`)                                                                              |
| `registerResourceMatchers()`                                                                                 | Adds `toBeLoading` / `toHaveResourceValue` / `toHaveResourceError`; the value matcher fails an unresolved resource (`/angular`)                                     |
| `registerSignalMatchers()`                                                                                   | Adds `expect(sig).toHaveSignalValue(value)` (`/angular`)                                                                                                            |
| `enableTestBedDiagnostics(opts?)`                                                                            | Per-file report of how much of a spec's time went into `TestBed` (`/angular`)                                                                                       |
| `registerDomGlobals(opts?)`                                                                                  | Install a DOM into a runtime that ships none; returns the registrar used (`/bun-angular`)                                                                           |
| `createJsdomRegistrar(opts)` / `createGlobalRegistratorRegistrar(opts)`                                      | The two DOM strategies `registerDomGlobals` tries, for a custom preload (`/bun-angular`)                                                                            |
| `copyWindowGlobals(source, target)`                                                                          | Copy a window's properties onto a global-like target, without clobbering runtime built-ins                                                                          |
| `inlineAngularResources(source, path, opts?)`                                                                | Rewrite `templateUrl` / `styleUrl` / `styleUrls` into inline `template` / `styles`                                                                                  |
| `consoleDebugSpy` … `consoleWarnSpy`                                                                         | Silent typed spies replacing the global `console` methods on import (`/console`)                                                                                    |
| `installConsoleSpies()` / `resetConsoleSpies()` / `restoreConsole()`                                         | Install / clear / undo the console spies (`/console`)                                                                                                               |
| `errorHandler`                                                                                               | The `mustBeCalledWith` argument-mismatch error helper                                                                                                               |
| `vitest-auto-spy/eslint-plugin`                                                                              | Nineteen flat-config lint rules that steer a suite onto these helpers                                                                                               |

## Helper surface by return type

**Spied sync method:** `mockReturnValue`, `calledWith(...)`, `mustBeCalledWith(...)` —
`calledWith` / `mustBeCalledWith` accept asymmetric matchers (`expect.any`, `expect.objectContaining`, …)

**Any spied method:** `failWith(error)` — throw on every call, or, on a `calledWith` /
`mustBeCalledWith` chain, only for those arguments. Named `failWith` and not `throwWith` because
that name belongs to the observable helper below.

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
`fillMissing` (answer a name the prototype never carried with a spy — for a **partially** abstract
class, where the erased members leave the empty-prototype fallback unable to fire),
`lazySpies` (build each method spy on first access — the `provideAutoSpy` default on Angular; `'proxy'` swaps the per-method placeholder for one trap object, which is what keeps a 400-method double from retaining 100 kB), plus
the two strict-mode fields below.

**`AutoMockConfiguration`** (the third argument of `createAutoMock` / `provideAutoSpyForToken`):
`observablePropsToSpyOn` (a type does not say which members are Observables, so an unseeded one
would otherwise be a function spy), `returns` (return values installed as the double is built,
where a seeded `override` would have put a plain function in place of a spy), plus the same two
strict-mode fields.

**`StrictSpyConfiguration`** — the pair every factory that builds a double accepts, and which
`setupAutoSpy(opts?)` takes as a suite-wide default:

| Field              | Type                                                                                     | Effect                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `strict?`          | `boolean`                                                                                | Throw on a call to a method nobody configured, naming the class, the method and the arguments. Default off |
| `onUnstubbedCall?` | `(call: { className: string \| undefined; method: string; args: unknown[] }) => unknown` | Run this instead, and use what it returns as the call's result. The general form of `strict`               |

A double's own configuration wins over the suite-wide one — an explicit `strict: false` included,
which is the only way to exempt one wide collaborator from a global default; and `onUnstubbedCall`
wins over `strict` when both are given. `className` is `undefined` for a type-driven
`createAutoMock`, which has no class to name. `setupAutoSpy` arms the default only when the caller
actually passed one of the two, and releases it in `afterAll` — under `isolate: false` a default
armed by one file's setup would otherwise still be armed for files that never opted in.
[Strict mode](/core/strict-mode) covers what counts as configured.

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

**`SpyDisposable`** — `{ [Symbol.dispose](): void }`. Both `Spy<T>` and `DeepMockProxy<T>` intersect
it, so every double this package builds is disposable and
`using spy = createSpyFromClass(Service)` resets it at the end of the block, retiring the `afterEach`
that existed only to reset one spy. The method calls `resetAutoSpy(this)`; on `mockDeep` every node
of the tree hands back the same function, so disposing any node resets the whole tree. It is
declared structurally rather than as the global `Disposable`, which lives in
`lib.esnext.disposable` — a consumer whose `lib` stops at ES2022 and who has no `@types/node` would
see the published `.d.ts` fail on that name, while `Spy<T>` stays assignable to `Disposable`
wherever it does exist. There is deliberately no `[Symbol.asyncDispose]`: `resetAutoSpy` is
synchronous, and `await using` already accepts a sync-disposable.

**`ClassType<T>`** — a constructor of `T`, the token `createSpyFromClass` / `provideAutoSpy` take. The
construct signature is _abstract_, so an `abstract class` DI token is accepted; nothing here ever
calls `new` on it.

**`DeepMockProxy<T>`** — what `mockDeep<T>()` returns: object properties become nested deep mocks,
so `mock.a.b.c` is chainable without seeding. Depth comes from property _access_: a chain that goes
through a call (`a.b().c()`) needs `{ selfReturning: true }`.

**`SubscribableLike<T>` / `CallbackSubscribable<T>` / `EmissionSource<T>`** — the two subscription
contracts the emission helpers accept (an observer object, as rxjs takes; a bare `next` callback, as
Angular's `output()` takes) and their union.

**`ObservableLike<T>` / `SubjectLike<T>` / `SubjectOf<T>` / `AutoSpyRxjsTypes<T>`** — the rxjs seam,
new in 4.0.0. No declaration this package ships names an rxjs type any more, so a consumer without
rxjs never loads it. `ObservableLike<T>` is what decides that a member is observable — `subscribe`
plus a promise-returning `forEach(next)`, which rxjs's `Observable`, every `Subject` and Angular's
`EventEmitter` satisfy and `Promise`, arrays, `Signal` and `OutputEmitterRef` do not.
`returnSubject()` and `nextWithPerCall()` are typed `SubjectOf<T>`, which is rxjs's own `Subject<T>`
once `vitest-auto-spy/rxjs` is in your TypeScript program (it augments `AutoSpyRxjsTypes`) and the
structural `SubjectLike<T>` when it is not. See [rxjs in the types](/runtimes/rxjs#rxjs-in-the-types).

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

**`ClassSpyConfiguration<T>`**, **`AutoMockConfiguration<T>`**, **`StrictSpyConfiguration`**,
**`ValueConfig<T>`**, `UnstubbedCall`, `UnstubbedCallHandler`, `NextValueConfig`, `ErrorValueConfig`,
`CompleteValueConfig`, `ValueConfigPerCall`, `OnlyMethodKeysOf<T>`, `OnlyObservablePropsOf<T>`,
`AccessorKeysOf<T>`, `MethodReturns<T>`, `PropStubValue<V>`, `SpyOptions`, `Overloads<F>`,
`AddThrowHelper` (the `failWith` every method spy carries) are exported from the core as well;
`/angular` adds `AutoSpyFixture`, `SpiedFixtures<Spec>` and `ExtendWithAutoSpiesOptions` for
`extendWithAutoSpies`; `/angular-http` adds `RequestMatcher`, `RequestExpectation`, `ResponseBody`,
`FlushOptions`, `RequestErrorOptions`, `ExpectRequestOptions` and `HttpTestingOptions` for
`expectRequest` and `provideHttpTesting`; `/nestjs` adds `NestUnit<T>`, `NestUnitSpies`,
`NestUnitClass<T>`, `NestUnitProvider` and `CreateNestUnitOptions` for `createNestUnit`;
`/node` adds `StopTrackingNodeMocks`, the disarm handle `trackNodeMocks()` hands back.

## Exports by subpath

Every runtime and framework subpath re-exports the **whole core** on top of what it adds, so a spec
never needs two imports from this package. Three subpaths are deliberately narrow instead:
`/angular-http` is a companion to `/angular` rather than a replacement for it, and staying narrow is
what keeps `@angular/common` confined to the suites that ask for it; `/dom-stubs` and `/diagnostics`
hold what **moved off** the core in 4.0.0, so that a spec which never touches a DOM global or a run
report does not evaluate them — see [Upgrading to 4.0](/upgrading-4#_2-dom-stubs-and-run-diagnostics-moved-to-their-own-subpaths).

| Subpath             | Adds on top of the core                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest-auto-spy`   | — (this is the core; registers the Vitest adapter)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/bun`              | — (registers the `bun:test` adapter)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/node`             | `trackNodeMocks`, `pruneNodeMocks`, `countNodeMocks` — the private-`MockTracker` opt-in that keeps `node:test` from retaining every spy for the life of the process; registers the `node:test` adapter                                                                                                                                                                                                                                                                                                                                                                        |
| `/bun-angular`      | `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable`, `flushEffects`, `settleResource`, the DOM/inliner building blocks; registers the Bun adapter and boots a zoneless `TestBed`                                                                                                                                                                                                                                                                                                                                                                  |
| `/rxjs`             | `createObservableWithValues` + the observable type surface; registers the observable layer, and is the one module that names an rxjs type — its augmentation of `AutoSpyRxjsTypes` is what makes `returnSubject()` an rxjs `Subject<T>`                                                                                                                                                                                                                                                                                                                                       |
| `/dom-stubs`        | `stubIntersectionObserver`, `stubResizeObserver`, `stubMutationObserver`, `stubObserver`, `stubMediaElement`, `stubAbortController`, `intersectionEntry`, `resizeEntry`, `mutationRecord` — **moved off the root entry in 4.0.0**, because ESM re-export is eager and every spec in every project was evaluating them. Registers the default adapter only if no runtime entry did, like `/console`                                                                                                                                                                            |
| `/diagnostics`      | `compareTestRuns`, `summarizeTestRun`, `formatTestRunComparison`, `diffByField` — **moved off the root entry in 4.0.0** for the same reason. Pure functions that register nothing, so this entry also works from a plain Node script that reads two JSON reports                                                                                                                                                                                                                                                                                                              |
| `/angular`          | `provideAutoSpy`, `provideAutoSpyForToken`, `injectSpy`, `extendWithAutoSpies`, `overrideAutoSpy`, `overrideComponentProvider`, `assertNgModuleScopes`, `assertComponentDefIntact`, `setupAngularTestEnv`, `createDirectiveHost`, `registerDirectiveMatchers`, `renderShallow`, `createWithAutoSpies`, `stable`, `flushEffects`, `settleResource`, `mockResourceProp`, `mockSignalProp`, `registerSignalMatchers`, `registerResourceMatchers`, `enableAngularDiagnostics`, `disableAngularDiagnostics`, `assertNoPendingRequests`, `trackInjections`, the TestBed diagnostics |
| `/angular-http`     | `provideHttpTesting`, `expectRequest`, `expectNoRequest`, `verifyNoPendingRequests` — the `httpResource()` / `HttpClient` recipe in two lines. The **only** entry that imports `@angular/common`, which is an optional peer; the one subpath that does not re-export the core                                                                                                                                                                                                                                                                                                 |
| `/nestjs`           | `provideAutoSpy`, `injectSpy(moduleRef, token)`, `createNestUnit`, `trackInjections`, `NestModuleRef`, `NestValueProvider`, `NestUnit`, `NestUnitSpies`, `CreateNestUnitOptions`, `NestUnitProvider`, `NestUnitClass`                                                                                                                                                                                                                                                                                                                                                         |
| `/vue`              | `provideAutoSpy`, `VueInjectionToken`, `VueProvideSpy`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/react`, `/svelte` | — (the core, under a name that reads right in those suites)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/console`          | `consoleDebugSpy` … `consoleWarnSpy`, `installConsoleSpies`, `resetConsoleSpies`, `restoreConsole`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/zone`             | `installProxyZonePatch` — and installs it on import. The only entry that touches zones; zone.js is a **devDependency of this package and nothing else**, and no other entry reaches this module                                                                                                                                                                                                                                                                                                                                                                               |
| `/setup`            | `setupAutoSpy`, `setupFakeTimers`, `advanceTimers`, `mockSystemTime`, `withSystemTime`, `mockNow`, `useCountingClock`, `registerFocusMatchers`, `blockNetwork`, `guardGlobalPatches`, `installPerTest`, `restoreTimerGlobals`, `setSpyEngine` / `getSpyEngine` / `SpyEngine`, the stray-timer and stray-rejection trackers, the mock-registry trackers, `describeDuplicateCopies`, `getPackageCopies`                                                                                                                                                                         |
| `/eslint-plugin`    | the flat-config plugin object                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

The core itself also carries, beyond the factories: `captureArg`, `asInstances`, `narrow`, `withOverrides`,
`createFixture`, `createFixtureFactory`,
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
runner's `expect.extend` and suite-level hooks: `registerSignalMatchers` / `registerResourceMatchers`
and the TestBed diagnostics family. `mockResourceProp` is Vitest-only for a different reason — it
lives beside the other `mock*Prop` helpers, which `/bun-angular` does not re-export either.
