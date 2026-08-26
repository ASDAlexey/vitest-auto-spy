# API reference

The exported surface of `vitest-auto-spy` and its subpaths.

| Export                                                                                                       | Description                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `createSpyFromClass(Class, methodsOrConfig?)`                                                                | Build a fully-typed `Spy<T>` from a class                                                       |
| `createAutoMock<T>(overrides?)`                                                                              | Build a `Spy<T>` from a **type/interface** alone (Proxy, no class)                              |
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
| `renderShallow(Component, opts?)`                                                                            | `TestBed` component without its children and (by default) its template (`/angular`)             |
| `createWithAutoSpies(Class, opts?)`                                                                          | Build a class through Angular DI with every unprovided token auto-spied (`/angular`)            |
| `stable(fixture)` / `flushEffects()`                                                                         | Zoneless waiting: flush effects, then await the fixture (`/angular`)                            |
| `registerSignalMatchers()`                                                                                   | Adds `expect(sig).toHaveSignalValue(value)` (`/angular`)                                        |
| `enableTestBedDiagnostics(opts?)`                                                                            | Per-file report of how much of a spec's time went into `TestBed` (`/angular`)                   |
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

**`ClassSpyConfiguration`:** `methodsToSpyOn`, `instanceMethodsToSpyOn` (callables that live on the
instance — `signal()` fields, arrow props, `signalStore()` methods), `observablePropsToSpyOn`,
`gettersToSpyOn`, `settersToSpyOn`, `autoSpyAccessors` (auto-discover getters/setters), `lazySpies`
(build each method spy on first access — the `provideAutoSpy` default on Angular)

**`ValueConfig`** (for `nextWithValues`): `{ value, delay? }` | `{ errorValue, delay? }` |
`{ complete?, delay? }`.

<!-- TODO: expand — document Spy<T>, ClassType, and the per-subpath export lists (bun/node/react/vue/svelte/nestjs) once their public types are confirmed against src/. -->
