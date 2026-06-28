# API reference

The exported surface of `vitest-auto-spy` and its subpaths.

| Export | Description |
| --- | --- |
| `createSpyFromClass(Class, methodsOrConfig?)` | Build a fully-typed `Spy<T>` from a class |
| `provideAutoSpy(Class, methodsOrConfig?)` | Angular `{ provide, useValue }` shorthand (`/angular`); NestJS / Vue variants in their subpaths |
| `injectSpy(token)` | `TestBed.inject` typed as `Spy<T>` (`/angular`); NestJS variant takes `(moduleRef, token)` |
| `createFunctionSpy(name)` | A single standalone function spy with all helpers |
| `createObservableWithValues(configs, opts?)` | Build an Observable from value configs (`/rxjs`) |
| `mockReadonlyProp` / `mockReadonlyPropGetter` / `mockAccessorsProp` | Mock readonly / accessor / signal props (`/angular`) |
| `errorHandler` | The `mustBeCalledWith` argument-mismatch error helper |

## Helper surface by return type

**Spied sync method:** `mockReturnValue`, `calledWith(...)`, `mustBeCalledWith(...)`

**Spied Promise method:** `resolveWith`, `rejectWith`, `resolveWithPerCall`

**Spied Observable method / property:** `nextWith`, `nextOneTimeWith`, `nextWithValues`,
`nextWithPerCall`, `throwWith`, `complete`, `returnSubject`

## Configuration

**`ClassSpyConfiguration`:** `methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`,
`settersToSpyOn`

**`ValueConfig`** (for `nextWithValues`): `{ value, delay? }` | `{ errorValue, delay? }` |
`{ complete?, delay? }`.

<!-- TODO: expand — document Spy<T>, ClassType, and the per-subpath export lists (bun/node/react/vue/svelte/nestjs) once their public types are confirmed against src/. -->
