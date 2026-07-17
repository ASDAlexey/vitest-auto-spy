# API reference

The exported surface of `vitest-auto-spy` and its subpaths.

| Export | Description |
| --- | --- |
| `createSpyFromClass(Class, methodsOrConfig?)` | Build a fully-typed `Spy<T>` from a class |
| `createAutoMock<T>(overrides?)` | Build a `Spy<T>` from a **type/interface** alone (Proxy, no class) |
| `mockDeep<T>(overrides?)` | Recursive `DeepMockProxy<T>` — nested access auto-creates chainable spies |
| `clearAutoSpy(spy)` / `resetAutoSpy(spy)` | Clear calls (keep config) / full reset of every spy inside an assembled spy |
| `provideAutoSpy(Class, methodsOrConfig?)` | Angular `{ provide, useValue }` shorthand (`/angular`); NestJS / Vue variants in their subpaths |
| `injectSpy(token)` | `TestBed.inject` typed as `Spy<T>` (`/angular`); NestJS variant takes `(moduleRef, token)` |
| `createFunctionSpy(name)` | A single standalone function spy with all helpers |
| `createObservableWithValues(configs, opts?)` | Build an Observable from value configs (`/rxjs`) |
| `mockReadonlyProp` / `mockReadonlyPropGetter` / `mockAccessorsProp` | Mock readonly / accessor / signal props (`/angular`) |
| `consoleDebugSpy` … `consoleWarnSpy` | Silent typed spies replacing the global `console` methods on import (`/console`) |
| `installConsoleSpies()` / `resetConsoleSpies()` / `restoreConsole()` | Install / clear / undo the console spies (`/console`) |
| `errorHandler` | The `mustBeCalledWith` argument-mismatch error helper |

## Helper surface by return type

**Spied sync method:** `mockReturnValue`, `calledWith(...)`, `mustBeCalledWith(...)` —
`calledWith` / `mustBeCalledWith` accept asymmetric matchers (`expect.any`, `expect.objectContaining`, …)

**Spied Promise method:** `resolveWith`, `rejectWith`, `resolveWithPerCall`; outcomes are
recorded on `mock.settledResults` (native on Vitest, polyfilled on Bun / `node:test`)

**Spied Observable method / property:** `nextWith`, `nextOneTimeWith`, `nextWithValues`,
`nextWithPerCall`, `throwWith`, `complete`, `returnSubject`

## Configuration

**`ClassSpyConfiguration`:** `methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`,
`settersToSpyOn`

**`ValueConfig`** (for `nextWithValues`): `{ value, delay? }` | `{ errorValue, delay? }` |
`{ complete?, delay? }`.

<!-- TODO: expand — document Spy<T>, ClassType, and the per-subpath export lists (bun/node/react/vue/svelte/nestjs) once their public types are confirmed against src/. -->
