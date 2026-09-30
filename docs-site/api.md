---
title: API reference
description: Every export of vitest-auto-spy, grouped by import path, one line each, with a link to the page that documents it.
---

# API reference

Every export of the package, grouped by the import path it comes from. Each row says in one line what
the export does and links to the page with examples and options. New to the library? Start with the
[introduction](/core/introduction); unfamiliar words are in the [glossary](/glossary).

## A first example

Build a [spy](/glossary) object from a class, set what one method answers, then check the result.

```ts
import 'vitest-auto-spy/rxjs';

import { expect, it } from 'vitest';
import { createSpyFromClass, expectEmission } from 'vitest-auto-spy';

import { UserService } from './user.service';

it('answers with the user', async () => {
  const users = createSpyFromClass(UserService); // load(id: number): Observable<User>
  users.load.nextWith({ id: 1, name: 'Ada' });

  const user = await expectEmission(users.load(1));

  expect(user).toEqual({ id: 1, name: 'Ada' });
  expect(users.load).toHaveBeenCalledWith(1);
});
```

`createSpyFromClass` comes from the core. `nextWith` is a [control helper](#control-helpers-by-return-type)
that you call on the spied method. `expectEmission` waits for the stream's first value.

`import 'vitest-auto-spy/rxjs'` turns on `nextWith` and the other Observable helpers. Without it,
`nextWith` throws `Observable spies require rxjs`. The import is separate so that projects without rxjs
never load it. Put it at the top of each spec file that needs it, or once in the
[setup file](/glossary) (`setupFiles` in the Vitest config).

In an Angular `TestBed` spec, `provideAutoSpy` provides the spy and `injectSpy` gets it back typed
`Spy<UserService>`. Both come from `vitest-auto-spy/angular`:

```ts
import 'vitest-auto-spy/rxjs';

import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/angular';

import { ProfileComponent } from './profile.component';
import { UserService } from './user.service';

it('loads the user', async () => {
  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [provideAutoSpy(UserService)],
  });
  const users = injectSpy(UserService);
  users.load.nextWith({ id: 1, name: 'Ada' });

  const fixture = TestBed.createComponent(ProfileComponent);
  await stable(fixture);

  expect(users.load).toHaveBeenCalledTimes(1);
});
```

`stable` waits until the component has rendered, with or without zone.js. You can also set the answer
in the provider: `provideAutoSpy(UserService, { returns: { load: of({ id: 1, name: 'Ada' }) } })`, with `of` from `rxjs`.
The method stays a spy either way, so `nextWith` can change the answer later.

## Pick an import path

Each import path is an [entry point](/glossary). Pick the row for your test runner:

| You test with                    | Import spies from                                          | Add for your framework                                    |
| -------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Vitest                           | `vitest-auto-spy`                                          | `/angular`, `/nestjs`, `/vue`, `/react`, `/svelte`        |
| Bun                              | `vitest-auto-spy/bun`                                      | `/bun-angular` for Angular                                |
| `node:test`                      | `vitest-auto-spy/node`                                     | `/nestjs`                                                 |
| Rstest                           | `vitest-auto-spy/rstest`                                   | `/nestjs`                                                 |
| Observable methods or properties | also `vitest-auto-spy/rxjs` (see above)                    | —                                                         |
| Angular, beyond spies            | `/angular` plus `/angular/matchers`, `/angular/doubles`, … | [more Angular entries](#vitest-auto-spy-angular-matchers) |

On Bun, `node:test` or Rstest, import from the runner's entry before any other `vitest-auto-spy`
import. The first one imported decides whose mock function the spies use. On Vitest the order does not
matter.

Where `createSpyFromClass` and the other factories of the core can be imported from:

- **From these entries too:** `/bun`, `/node`, `/rstest`, `/react`, `/svelte`, `/vue`, `/bun-angular`.
  They include everything `vitest-auto-spy` exports, so one import line is enough.
- **Not from any other entry**, `/angular` and `/nestjs` included. A spec that uses `provideAutoSpy` from
  `/angular` needs no `vitest-auto-spy` import. A spec that also calls `createSpyFromClass` has two
  import lines. `/angular` does re-export a few core items: the `Spy<T>` type, the `mock*Prop`
  helpers and the Observable assertions.

## `vitest-auto-spy`

The core. Importing it connects spies to Vitest's mock function ([runner adapter](/glossary)).

### Build a spy or a double

| Export                                              | What it does                                                                                   | Docs                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `createSpyFromClass(Class, methodsOrConfig?)`       | Builds a typed `Spy<T>`: every method of the class becomes a spy                               | [Spies from a class](/core/create-spy-from-class)                                                      |
| `createSpyFromInstance(instance, methodsOrConfig?)` | Turns the methods of an object you already have into spies, in place                           | [`passthrough`](/core/create-spy-from-class#passthrough)                                               |
| `restoreSpiedInstance(instance)`                    | Puts the real methods back on that object                                                      | same                                                                                                   |
| `spyOnOwnMethod(instance, method)`                  | Records one method of the object under test and still runs the real one; use it for `vi.spyOn` | [One method](/core/create-spy-from-class#spy-on-own-method)                                            |
| `spyOnVoidMethod(target, method)`                   | Records one native void method (`preventDefault`, `focus`) without a strict-mode throw         | [Spies from a class](/core/create-spy-from-class)                                                      |
| `createAutoMock<T>(overrides?, config?)`            | Builds a `Spy<T>` from a type or interface, with no class                                      | [From a type](/core/auto-mock-by-type#from-a-type-—-createautomock)                                    |
| `autoMocked<T>(overrides?, config?)`                | The same, typed as both `T` and `Spy<T>`, for a `let` set in `beforeEach`                      | [`autoMocked`](/core/auto-mock-by-type#automocked-—-one-object-typed-as-both-t-and-spy-t)              |
| `createMock<T>(partial?)`                           | Builds a plain `T` with no spies, for data rather than collaborators                           | [`createMock`](/core/auto-mock-by-type#from-a-type-without-spies-—-createmock)                         |
| `mockDeep<T>(overrides?, options?)`                 | A double where `a.b.c` is a spy at any depth, without setup                                    | [`mockDeep`](/core/auto-mock-by-type#recursive-deep-mocks-—-mockdeep)                                  |
| `createFunctionSpy(name, unstubbed?)`               | One standalone function spy with every helper; type it as `FunctionSpy<Fn>`                    | [One function](/core/create-spy-from-class#a-single-function-—-createfunctionspy)                      |
| `createSpyClass(Class, config?, options?)`          | A spy you can call with `new`; records `calls` and `instances`                                 | [Call with `new`](/core/spy-typing#a-spy-you-can-call-with-new)                                        |
| `mockConstructor(factory, name?)`                   | A constructor double for a class the code under test builds with `new`                         | [Constructor doubles](/utilities/constructor-doubles)                                                  |
| `stubConstructor(target, property, factory)`        | Replaces a global or module class with such a double, restored after the test                  | same                                                                                                   |
| `registerAutoSpyDefaults(Class, config)`            | Registers a class's usual configuration once; every spy of that class starts from it           | [Defaults](/core/create-spy-from-class#registerautospydefaults-—-the-composition-lives-with-the-class) |
| `clearAutoSpyDefaults(Class?)`                      | Drops one registration, or all of them                                                         | same                                                                                                   |
| `clearAutoSpy(spy)`                                 | Clears recorded calls on every spy inside the object; keeps what you configured                | [Resetting](/core/control-helpers#resetting-spies-—-clearautospy-resetautospy)                         |
| `resetAutoSpy(spy)`                                 | Clears calls and configuration, as `vi.resetAllMocks()` does                                   | same                                                                                                   |

### Control helpers by return type

A spied method gets the helpers its return type allows. They are methods of the spy
(`users.load.nextWith(...)`), not separate exports. The Observable ones work after
`import 'vitest-auto-spy/rxjs'`.

| The method              | Helpers                                                                                                           | Docs                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| returns a value         | `mockReturnValue` and the runner's own mock API, `calledWith(...)`, `mustBeCalledWith(...)`, `once()`, `times(n)` | [Synchronous methods](/core/control-helpers#synchronous-methods)                     |
| any method              | `failWith(error)`: throw on every call, or only for the arguments of a `calledWith` chain                         | [`failWith`](/core/control-helpers#making-a-call-throw-—-failwith)                   |
| returns `Promise<T>`    | `resolveWith`, `rejectWith`, `resolveWithPerCall`; outcomes land on `mock.settledResults`                         | [Promise methods](/core/control-helpers#promise-returning-methods-—-resolvewith)     |
| returns `Observable<T>` | `nextWith`, `nextOneTimeWith`, `nextWithValues`, `nextWithPerCall`, `throwWith`, `complete`, `returnSubject`      | [Observable methods](/core/control-helpers#observable-methods-properties-—-nextwith) |

`calledWith` accepts asymmetric
matchers such as `expect.any(Number)` at any depth; see
[what counts as the same argument](/core/control-helpers#what-counts-as-the-same-argument).

### Properties

| Export                                             | What it does                                                         | Docs                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `mockReadonlyProp(object, property, value)`        | Sets a `readonly` property for one test                              | [Property mocking](/adapters/angular#signal-readonly-property-mocking)                                |
| `mockReadonlyPropGetter(object, property, getter)` | Same, with a getter function                                         | same                                                                                                  |
| `mockValueProp(object, property, value)`           | Sets a writable property for one test                                | [`mockValueProp`](/core/spy-typing#readonly-survives-onto-the-double-and-mockvalueprop-is-the-answer) |
| `mockAccessorsProp(object, property, accessors?)`  | Replaces a getter and setter pair                                    | [Property mocking](/adapters/angular#signal-readonly-property-mocking)                                |
| `restoreMockedProps()`                             | Undoes every `mock*Prop` patch (and the stubs that register with it) | [Setup](/utilities/setup)                                                                             |
| `countMockedProps()`                               | How many patches are still applied                                   | same                                                                                                  |
| `reportPropsOutsideHooks(reaction)`                | Reports a patch made outside a test or hook, without `setupAutoSpy`  | same                                                                                                  |

### Observable assertions

Each one subscribes for you and fails with a clear message when the stream stays silent.

| Export                                      | What it does                                         | Docs                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `expectEmission(source$, options?)`         | Waits for one value and returns it                   | [Observable assertions](/core/observable-assertions)                                                         |
| `expectEmissions(source$, count, options?)` | Waits for `count` values and returns them            | same                                                                                                         |
| `expectAllEmissions(source$, options?)`     | Returns every value once the stream completes        | same                                                                                                         |
| `expectNoEmission(source$, options?)`       | Passes when nothing arrives within the wait          | same                                                                                                         |
| `expectNoEmissionSync(source$, options?)`   | The same check, without `await`                      | [`expectNoEmissionSync`](/core/observable-assertions#expectnoemissionsync-—-silence-in-a-spec-with-no-await) |
| `expectCompletion(source$, options?)`       | Passes when the stream completes, value or not       | [`expectCompletion`](/core/observable-assertions#expectcompletion-—-when-the-value-is-not-the-point)         |
| `expectError(source$, options?)`            | Passes when the stream errors, and returns the error | [`expectError`](/core/observable-assertions#expecterror-—-when-the-failure-is-the-subject)                   |
| `setEmissionTimeout(milliseconds)`          | Changes the default wait for all of them             | [Observable assertions](/core/observable-assertions)                                                         |

### Typing, fixtures and arguments

| Export                                   | What it does                                                                                                                   | Docs                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `asInstance(spy)` / `asSpy(instance)`    | Views a `Spy<T>` as `T`, or a `T` as `Spy<T>`, instead of `as any`                                                             | [Spy typing](/core/spy-typing)                                                |
| `asInstances(...spies)`                  | `asInstance` for a whole argument list                                                                                         | [`asInstances`](/core/spy-typing#asinstances-—-a-whole-argument-list-at-once) |
| `outOfType<T>(value)`                    | A value outside `T` on purpose (a `null` the backend sends), typed `T`                                                         | [Spy typing](/core/spy-typing)                                                |
| `createFixture<T>(defaults, overrides?)` | A fresh `T` from a full default plus this test's changes                                                                       | [Fixtures](/utilities/fixtures)                                               |
| `createFixtureFactory<T>(defaults)`      | Returns `(overrides?) => T` over one default                                                                                   | same                                                                          |
| `withOverrides(model, overrides?)`       | A fixture from a model instance; its getters are read once, as data                                                            | same                                                                          |
| `narrow(value, predicate)`               | The branch of a union the test expects, failing with the actual shape; also `.byKey`, `.defined`, `.observable`, `.instanceOf` | same                                                                          |
| `captureArg<T>(options?)`                | Captures an argument the code under test built, to assert on it later                                                          | [Recipes](/recipes#an-argument-the-spec-cannot-spell)                         |
| `createLog<T>()`                         | One call-order journal that several collaborators write to                                                                     | [Call log](/utilities/call-log)                                               |

### Modules and the event loop

| Export                                  | What it does                                                            | Docs                                    |
| --------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| `assertMocked(namespace, options?)`     | Fails when the `vi.mock()` the spec relies on did not apply             | [Module mocks](/utilities/module-mocks) |
| `moduleNamespace(exports, options?)`    | The object a `vi.mock` factory should return (`default` + `__esModule`) | same                                    |
| `adoptMock(mock, options?)`             | Turns a runner mock from a `vi.mock` factory into a typed function spy  | same                                    |
| `flushEventLoop(turns?)`                | Runs real event-loop turns, even under fake timers                      | [Event loop](/utilities/event-loop)     |
| `flushEventLoopUntil(isDone, options?)` | Runs turns until a condition holds, with a budget instead of a hang     | same                                    |
| `settleDynamicImport(load, turns?)`     | Waits for an `import()` the code under test started                     | same                                    |

### Diagnostics in the core

| Export                                             | What it does                                                                 | Docs                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `errorHandler`                                     | The object whose `throwArgumentsError` builds the `mustBeCalledWith` failure | [Control helpers](/core/control-helpers#what-a-mustbecalledwith-failure-prints) |
| `describeDuplicateCopies()` / `getPackageCopies()` | Name the copies of this package loaded in one process                        | [Setup](/utilities/setup)                                                       |

## Runner entry points

These re-export the whole core and register their runner's adapter instead of Vitest's.

| Import                   | Adds                                                                                                      | Docs                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `vitest-auto-spy/bun`    | `createNestUnit` (from `/nestjs`)                                                                         | [Bun](/runtimes/bun)                         |
| `vitest-auto-spy/node`   | `createNestUnit`; `trackNodeMocks()`, `pruneNodeMocks()`, `countNodeMocks()` free spies `node:test` keeps | [`node:test`](/runtimes/node#tracknodemocks) |
| `vitest-auto-spy/rstest` | nothing                                                                                                   | [Rstest](/runtimes/rstest)                   |
| `vitest-auto-spy/react`  | nothing; the same exports as `vitest-auto-spy`, under a React name                                        | [React](/adapters/react)                     |
| `vitest-auto-spy/svelte` | nothing; the same, under a Svelte name                                                                    | [Svelte](/adapters/svelte)                   |
| `vitest-auto-spy/vue`    | `provideAutoSpy` for `global.provide`, plus Pinia store spies                                             | [Vue](/adapters/vue)                         |

## `vitest-auto-spy/rxjs`

Import it in each spec file that uses it, or once in the setup file. It turns on the Observable helpers and
`observablePropsToSpyOn`, and makes `returnSubject()` an rxjs `Subject<T>` in the types.

| Export                                          | What it does                                       | Docs                                                 |
| ----------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `createObservableWithValues(configs, options?)` | Builds an Observable from a list of `ValueConfig`s | [rxjs](/runtimes/rxjs#standalone-observable-builder) |

## `vitest-auto-spy/angular`

Angular `TestBed` helpers on Vitest. You do not need `import { … } from 'vitest-auto-spy'` next to it;
`import 'vitest-auto-spy/rxjs'` is still needed for `nextWith`. A typical
spec imports
`import { injectSpy, provideAutoSpy, type Spy } from 'vitest-auto-spy/angular';`.

| Export                                                                                                                                       | What it does                                                                                              | Docs                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `provideAutoSpy(Class, methodsOrConfig?)`                                                                                                    | A `TestBed` provider that hands out a spy instead of the service                                          | [Replace a service](/adapters/angular#replace-a-service-provideautospy-and-injectspy)                  |
| `injectSpy(token)`                                                                                                                           | Gets that spy from `TestBed`, typed `Spy<T>`                                                              | same                                                                                                   |
| `provideAutoSpyForToken(token, overrides?, config?)`                                                                                         | The same for an `InjectionToken`, the spy built from the token's type                                     | [Tokens](/adapters/angular#a-dependency-behind-an-injectiontoken)                                      |
| `registerAutoSpyDefaults` / `clearAutoSpyDefaults`                                                                                           | The core's registration, also for an `InjectionToken`                                                     | [Defaults](/core/create-spy-from-class#registerautospydefaults-—-the-composition-lives-with-the-class) |
| `extendWithAutoSpies(test, spec, options?)`                                                                                                  | Typed `test` fixtures for a map of dependencies (Vitest 4.1+)                                             | [`extendWithAutoSpies`](/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies)    |
| `createWithAutoSpies(Class, options?)`                                                                                                       | Builds a class through DI with every unprovided dependency spied                                          | [Auto-spied dependencies](/adapters/angular#building-a-class-with-auto-spied-dependencies)             |
| `renderShallow(Component, options?)`                                                                                                         | Renders a component without its child components ([shallow render](/glossary))                            | [Shallow rendering](/adapters/angular#shallow-component-rendering)                                     |
| `prepareShallow(Component, options?)`                                                                                                        | `renderShallow` with options shared by every test; `.create(overrides?)` per test                         | [`prepareShallow`](/adapters/angular#the-same-options-in-every-test-—-prepareshallow)                  |
| `createComponentStub(Class, overrides?, options?)`                                                                                           | A standalone stand-in for a child component, directive or pipe                                            | [`createComponentStub`](/adapters/angular#a-stand-in-for-a-child-createcomponentstub)                  |
| `createDirectiveHost(options)`                                                                                                               | A standalone host component for a directive under test                                                    | [Directive host](/adapters/angular#a-host-for-a-directive-under-test)                                  |
| `setInputs(fixture, inputs, options?)`                                                                                                       | Sets inputs by alias or field name, then waits until the fixture is stable                                | [Changing an input](/adapters/angular#changing-an-input-mid-test)                                      |
| `hostElement(fixture, Type?)` / `queryElement(fixture, selector, Type?)`                                                                     | The host element or a query match, typed and checked with `instanceof`                                    | [Typed elements](/adapters/angular#typed-elements-under-a-strict-lint)                                 |
| `stable(fixture, options?)` / `flushEffects()`                                                                                               | Waits for the component: flushes effects, then waits until the fixture is stable; with or without zone.js | [Zoneless waiting](/adapters/angular#zoneless-waiting)                                                 |
| `settleResource(resource, options?)`                                                                                                         | Waits until a `resource()` or `httpResource()` leaves `loading`                                           | [Resources](/adapters/angular#resources-httpresource-and-resource)                                     |
| `mockResourceProp(object, property, initial, options?)`                                                                                      | Replaces a resource property with a `ResourceRef` double the spec drives                                  | [`mockResourceProp`](/adapters/angular#skipping-the-request-entirely-—-mockresourceprop)               |
| `mockSignalProp(object, property, initial)`                                                                                                  | Drives a signal property with a real writable signal                                                      | [Driving a signal](/adapters/angular#driving-a-signal)                                                 |
| `mockSignalProps(object, values)`                                                                                                            | Sets several signals of a store double in one call                                                        | same                                                                                                   |
| `runEffect(effectRef)`                                                                                                                       | Runs one `effect()` body now                                                                              | [Running one effect](/adapters/angular#running-one-effect-on-demand)                                   |
| `trackRecomputations(signal)` / `trackEffectRuns(effectRef)`                                                                                 | Counts `computed()` recomputations or `effect()` runs                                                     | [Counting runs](/adapters/angular#counting-recomputations-and-effect-runs)                             |
| `overrideAutoSpy(Class, methodsOrConfig?)`                                                                                                   | Replaces a provider everywhere in the `TestBed`, component providers included                             | [Overrides](/adapters/angular-overrides)                                                               |
| `overrideComponentProvider(Component, Class, methodsOrConfig?)`                                                                              | Replaces a provider the component declares for itself                                                     | same                                                                                                   |
| `assertNgModuleScopes(...modules)` / `assertComponentDefIntact(...components)`                                                               | Checks that a module or component definition survived compilation                                         | same                                                                                                   |
| `trackInjections(tokens, options?)`                                                                                                          | Records which collaborators the code under test asked DI for                                              | [Track injections](/utilities/track-injections)                                                        |
| `setupAngularTestEnv(options)`                                                                                                               | Runs zone and zoneless spec files in one worker                                                           | [Zone and zoneless](/adapters/angular#zone-and-zoneless-in-the-same-run)                               |
| `Spy`, the `mock*Prop` helpers, `restoreMockedProps`, `countMockedProps`, the `expect*Emission*` family, `expectError`, `setEmissionTimeout` | Re-exported from the core                                                                                 | [Core](#vitest-auto-spy)                                                                               |

## `vitest-auto-spy/angular/matchers`

Vitest only. Call each registrar once, from the [setup file](/glossary). Does not re-export the core.

| Export                             | Adds the matcher                                                             | Docs                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `registerSignalMatchers(options?)` | `toHaveSignalValue(value)`; `{ strict: true }` compares like `toStrictEqual` | [Asserting a signal](/adapters/angular#asserting-a-signal)           |
| `registerResourceMatchers()`       | `toBeLoading`, `toHaveResourceValue`, `toHaveResourceError`                  | [Asserting a resource](/adapters/angular#asserting-a-resource)       |
| `registerDirectiveMatchers()`      | `toHaveDirectiveApplied(Directive, selector?)` on a fixture                  | [`toHaveDirectiveApplied`](/adapters/angular#tohavedirectiveapplied) |

## `vitest-auto-spy/angular/doubles`

Ready-made doubles for Angular and Material services. Registers the Vitest adapter; does not re-export
the core. `@angular/material` and `@angular/cdk` are never dependencies: you pass their classes in.

| Export                                                                                                                     | What it does                                                                        | Docs                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `provideWindowDouble(token, overrides?)` / `createWindowDouble(overrides?)`                                                | A `window` with your overrides over the real one; `create*` works without `TestBed` | [Window and document](/adapters/angular#window-and-document-without-losing-the-real-one)                   |
| `provideDocumentDouble(overrides?, token?)` / `createDocumentDouble(overrides?)`                                           | The same for `document`                                                             | same                                                                                                       |
| `provideMatDialogData(token, data)`                                                                                        | The dialog's data for DI, typed by the token                                        | [Material dialog](/adapters/angular#the-material-dialog-without-material-as-a-dependency)                  |
| `provideMatDialogRef(RefClass, init?)` / `injectMatDialogRef(RefClass, injector?)` / `createMatDialogRef(RefClass, init?)` | The dialog ref: spied `close`, `emitClose(result?)`, `afterClosed()`                | same                                                                                                       |
| `providePlatform(platform, flags?)`                                                                                        | `PLATFORM_ID` and your own platform flags, in agreement                             | [Platform and other doubles](/adapters/angular#platform-sanitizer-change-detector-and-cdk-overlay-doubles) |
| `provideDomSanitizerDouble()` / `createDomSanitizerDouble()`                                                               | A `DomSanitizer` whose bypass spies return real safe values                         | same                                                                                                       |
| `provideChangeDetectorRefDouble()` / `createChangeDetectorRefDouble()`                                                     | A `ChangeDetectorRef` of four spies                                                 | same                                                                                                       |
| `provideOverlayDouble(Overlay, init?)` / `injectOverlayDouble(Overlay, injector?)` / `createOverlayDouble(Overlay, init?)` | A CDK `Overlay` whose refs you can drive                                            | same                                                                                                       |

## `vitest-auto-spy/angular/diagnostics`

Vitest only. Does not re-export the core and registers no adapter.

| Export                                                                                              | What it does                                                  | Docs                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `enableAngularDiagnostics(options?)` / `disableAngularDiagnostics()`                                | Turns five silent `TestBed` mistakes into failing tests       | [Angular diagnostics](/adapters/angular-diagnostics)                                                     |
| `assertNoPendingRequests(options?)`                                                                 | Fails on HTTP requests nobody answered                        | [`assertNoPendingRequests`](/adapters/angular-diagnostics#assertnopendingrequests)                       |
| `assertNoShadowedProviders(component, fixture)`                                                     | Fails when the component's own providers hide your spy        | [`assertNoShadowedProviders`](/adapters/angular-diagnostics#assertnoshadowedproviders-component-fixture) |
| `enableTestBedDiagnostics(options?)` / `disableTestBedDiagnostics()`                                | Reports how much of each spec file's time went into `TestBed` | [Where a spec spends its time](/adapters/angular#where-a-spec-spends-its-time)                           |
| `instrumentTestBed()`, `getTestBedTiming()`, `formatSpecTiming(timing)`, `reportSpecTiming(timing)` | The building blocks of that report, for your own reporter     | same                                                                                                     |

## `vitest-auto-spy/angular-http`

`HttpClient` and `httpResource()` in a spec. Needs `@angular/common`. Does not re-export the core.

| Export                                | What it does                                                                   | Docs                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `provideHttpTesting(options?)`        | The HTTP client and its testing backend in one provider, with a teardown check | [`provideHttpTesting`](/adapters/angular-http#providehttptesting)                   |
| `expectRequest(matcher, options?)`    | Finds the one matching request and answers it, settling included               | [`expectRequest`](/adapters/angular-http#expectrequest-matcher-options)             |
| `expectNoRequest(matcher?, options?)` | Asserts that nothing matching was requested                                    | [`expectNoRequest`](/adapters/angular-http#expectnorequest-matcher-options)         |
| `verifyNoPendingRequests(options?)`   | Asserts that nothing was left unanswered                                       | [`verifyNoPendingRequests`](/adapters/angular-http#verifynopendingrequests-options) |
| `injectHttpTesting()`                 | The `HttpTestingController`, for `expectOne` and friends                       | [`injectHttpTesting`](/adapters/angular-http#injecthttptesting)                     |

## `vitest-auto-spy/angular-router`

Router doubles. Needs `@angular/router`. Does not re-export the core.

| Export                                                                                   | What it does                                                            | Docs                                                                         |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `provideActivatedRoute(init?)`                                                           | A real `ActivatedRoute` whose streams and snapshot come from one record | [Angular router](/adapters/angular-router)                                   |
| `injectActivatedRoute(injector?)` / `createActivatedRoute(init?)`                        | Its handle: setters move streams and snapshot together                  | same                                                                         |
| `provideRouterDouble(init?)`                                                             | A `Router` over one URL; `navigate` and `navigateByUrl` are spies       | [The router double](/adapters/angular-router#the-router-double)              |
| `injectRouterDouble(injector?)` / `createRouterDouble(init?)`                            | Its handle: `setUrl`, `emitNavigation`, `setCurrentNavigation`          | same                                                                         |
| `collectRouterEvents(events)`                                                            | Records router events as class and URL pairs, for one-line assertions   | [`collectRouterEvents`](/adapters/angular-router#collectrouterevents-events) |
| `provideLocationDouble()` / `injectLocationDouble(injector?)` / `createLocationDouble()` | Angular's `SpyLocation` and `MockLocationStrategy` in one call          | [The location double](/adapters/angular-router#the-location-double)          |

## `vitest-auto-spy/signal-forms`

Angular signal forms. Needs `@angular/forms` and Angular 22. Does not re-export the core.

| Export                                 | What it does                                                        | Docs                                   |
| -------------------------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| `createForm(model, schema?, options?)` | Angular's `form()`, built in the `TestBed` injection context        | [Signal forms](/adapters/signal-forms) |
| `registerFormMatchers()`               | Adds `toHaveFieldErrors(['required'])`: the field's whole error set | same                                   |

## `vitest-auto-spy/bun-angular`

Angular's `TestBed` under `bun test`. Re-exports `/bun` (the whole core) and most of `/angular`:
`provideAutoSpy`, `injectSpy`, `renderShallow`, `prepareShallow`, `setInputs`, `hostElement`,
`queryElement`, `createWithAutoSpies`, `stable`, `flushEffects`, `settleResource`, `runEffect`,
`trackRecomputations`, `trackEffectRuns`. Not included: the matchers, the diagnostics and the
`mock*Prop` helpers. See [Bun + Angular](/runtimes/bun-angular).

| Export                                                                        | What it does                                                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `registerDomGlobals(options?)`                                                | Installs a DOM into a runtime that has none; returns the registrar used      |
| `createJsdomRegistrar(options)` / `createGlobalRegistratorRegistrar(options)` | The two DOM strategies it tries, for a custom preload                        |
| `copyWindowGlobals(source, target)`                                           | Copies a window's properties onto a global, keeping runtime built-ins        |
| `inlineAngularResources(source, path, options?)`                              | Rewrites `templateUrl` and `styleUrl(s)` into inline `template` and `styles` |

## `vitest-auto-spy/nestjs`

NestJS `Test.createTestingModule` helpers. Works on any runner: it uses the adapter your runner entry
registered, and on Vitest builds one from `vi`. Does not re-export the core.

| Export                                    | What it does                                                       | Docs                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `provideAutoSpy(Class, methodsOrConfig?)` | A `{ provide, useValue }` provider with a spy                      | [NestJS](/adapters/nestjs)                                                |
| `injectSpy(moduleRef, token)`             | Gets that spy from the testing module, typed `Spy<T>`              | same                                                                      |
| `createNestUnit(Class, options?)`         | Builds a provider from its DI metadata with every dependency spied | [Building the unit](/adapters/nestjs#building-the-unit-from-its-metadata) |
| `trackInjections(tokens, options?)`       | Records which collaborators the code asked DI for                  | [Track injections](/utilities/track-injections)                           |

## `vitest-auto-spy/setup`

One-call hygiene for a whole run, plus timers and network. Put `setupAutoSpy()` in the setup file.

| Export                                                                                                                                                                             | What it does                                                                                     | Docs                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `setupAutoSpy(options?)`                                                                                                                                                           | Turns on property restore, leak guards and a suite-wide `strict` in one call                     | [Setup](/utilities/setup)                                                   |
| `takeStrictViolations()`                                                                                                                                                           | Takes the strict-mode throws a test caused on purpose                                            | [Strict mode](/core/strict-mode)                                            |
| `setupFakeTimers(config?, options?)` / `advanceTimers(ms?)`                                                                                                                        | Installs fake timers with a matching restore; advances and settles microtasks                    | [Fake timers](/utilities/fake-timers)                                       |
| `withFakeTimers(fn, config?)`                                                                                                                                                      | Runs one body on fake timers                                                                     | same                                                                        |
| `mockSystemTime(time)` / `withSystemTime(time, body)` / `mockNow(source)` / `useCountingClock(options?)`                                                                           | Control what `Date` says                                                                         | [The clock](/utilities/event-loop#the-clock)                                |
| `restoreTimerGlobals()` / `getWatchedTimerGlobals()`                                                                                                                               | Puts back timer globals the fakes deleted / names the ones watched                               | [Setup](/utilities/setup)                                                   |
| `blockNetwork(options?)`                                                                                                                                                           | Closes `fetch`, XHR and `sendBeacon`, naming what was requested                                  | same                                                                        |
| `stubResponse(init?)`                                                                                                                                                              | A real `Response` for a stubbed `fetch`, with no cast                                            | [`stubResponse`](/utilities/setup#answering-a-stubbed-fetch-—-stubresponse) |
| `BLOCKED_FETCH_MESSAGE` / `BLOCKED_XHR_MESSAGE`                                                                                                                                    | The fixed start of a refused request's message, to match on                                      | [Setup](/utilities/setup)                                                   |
| `trackStrayTimers(host?, options?)`, `countStrayTimers`, `cancelStrayTimers`, `describeStrayTimers`                                                                                | Find and cancel timers that outlive their file                                                   | same                                                                        |
| `withoutStrayTimerTracking(work, host?)`                                                                                                                                           | Runs setup work whose timers the tracker must ignore                                             | same                                                                        |
| `flushUnhandledObservableErrors(host?)` / `expectUnhandledObservableErrors(expected?, host?)`                                                                                      | Surface Observable errors nothing handled                                                        | same                                                                        |
| `trackStrayRejections`, `countStrayRejections`, `flushStrayRejections`                                                                                                             | Read back promise rejections zone.js swallowed                                                   | same                                                                        |
| `trackStrayListeners`, `baselineStrayListeners`, `countStrayListeners`, `describeStrayListeners`, `removeStrayListeners`                                                           | Find and remove `window` and `document` listeners a file leaves                                  | same                                                                        |
| `captureGlobalBaseline(host?)` / `restoreGlobals(host?)`                                                                                                                           | Snapshot `globalThis` once; put back every changed global at the file boundary                   | same                                                                        |
| `guardGlobalPatches(reaction)`                                                                                                                                                     | Names the test that made a global non-configurable                                               | same                                                                        |
| `guardPrototypePollution(reaction)`                                                                                                                                                | Names and removes a key left on `Object.prototype`                                               | same                                                                        |
| `guardDocumentPollution(option)`                                                                                                                                                   | Names and removes an attribute left on `<html>`, `<head>` or `<body>`                            | same                                                                        |
| `guardStrayConsole(option)`                                                                                                                                                        | Fails a test that wrote to the console without absorbing it                                      | same                                                                        |
| `restoreWebStorage(options?)` / `restoreStorageSpies()`                                                                                                                            | A working `localStorage` / `sessionStorage`; removes spies `mockRestore()` cannot                | same                                                                        |
| `installPerTest(install)`                                                                                                                                                          | Re-installs a stub before every test and returns the current handle                              | same                                                                        |
| `trackMockRegistry()`, `keepMockRegistered(mock)`, `keepRegisteredMocks()`, `pruneMockRegistry()`, `getMockRegistrySize()`, `captureMockRegistry()`, `resetMockRegistryTracking()` | Keep Vitest's mock registry to the mocks that outlive a file                                     | same                                                                        |
| `restoreLongLivedImplementations()`                                                                                                                                                | Restores the implementation a cross-file `vi.resetAllMocks()` removed                            | same                                                                        |
| `setSpyEngine(engine)` / `getSpyEngine()`                                                                                                                                          | Build method spies from the library's own mock (`'auto-spy'`, default) or `vi.fn()` (`'runner'`) | [The spy engine](/core/performance#the-spy-engine)                          |
| `registerFocusMatchers()`                                                                                                                                                          | Adds `toHaveFocus()`, which names why focus is elsewhere                                         | [Focus assertions](/adapters/angular#focus-assertions)                      |
| `isAngularUnitTestBuilder()`                                                                                                                                                       | Tells whether the run is under Angular's unit-test builder                                       | [Setup](/utilities/setup)                                                   |
| `describeDuplicateCopies()` / `getPackageCopies()`                                                                                                                                 | Re-exported from the core                                                                        | [Core](#diagnostics-in-the-core)                                            |

## `vitest-auto-spy/dom-stubs`

Stand-ins for browser APIs the code under test creates itself. Registers the Vitest adapter only if no
runner entry did. Stubs restore with `restoreMockedProps()`.

| Export                                                                                                                                 | What it does                                                      | Docs                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `stubIntersectionObserver(options?)`, `stubResizeObserver(options?)`, `stubMutationObserver(options?)`, `stubObserver(name, options?)` | Replace an observer global with one the spec drives               | [Observer stubs](/utilities/observer-stubs)           |
| `intersectionEntry(target, isIntersecting, overrides?)`, `resizeEntry(target, rect?)`, `mutationRecord(target, init?)`                 | Build one observer entry without the unused fields                | same                                                  |
| `stubMediaElement(options?)`                                                                                                           | A `<video>` or `<audio>` that plays and fires media events        | [Media element](/utilities/media-element)             |
| `stubAnimationFrame(options?)`                                                                                                         | `requestAnimationFrame` run at once or on `flush(timestamp?)`     | [Frame and rect](/utilities/frame-and-rect)           |
| `stubElementRect(element, rect?)`                                                                                                      | `getBoundingClientRect()` answering a real `DOMRect`              | same                                                  |
| `stubAbortController()`                                                                                                                | An `AbortController` whose signal works with jsdom listeners      | [Constructor doubles](/utilities/constructor-doubles) |
| `stubWebStorage(key?, options?)`                                                                                                       | An in-memory `localStorage` or `sessionStorage` with `snapshot()` | [Mocking localStorage](/guides/mocking-local-storage) |
| `stubWorker(options?)`                                                                                                                 | A `Worker` whose script is the spec                               | [Worker stub](/utilities/worker-stub)                 |
| `createElementStub(options?)`                                                                                                          | An `HTMLElement` for `ElementRef` whose spies keep state          | [Element stub](/utilities/element-stub)               |
| `fillMissingDomApis(options?)`                                                                                                         | Fills DOM members jsdom and happy-dom leave out, once             | same                                                  |

## `vitest-auto-spy/diagnostics`

Plain functions that register nothing; they also work from a Node script.

| Export                                                                                                                | What it does                                                       | Docs                                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `explainSpy(spy, method?)`                                                                                            | Shows each configured argument list next to each recorded call     | [explainSpy](/utilities/explain-spy)                                      |
| `compareTestRuns(baseline, current, root?)`, `summarizeTestRun(report, root?)`, `formatTestRunComparison(comparison)` | Tell whether a migration lost a test                               | [Did the migration lose a test](/migrating#did-the-migration-lose-a-test) |
| `diffByField(actual, expected)`                                                                                       | Which field of a list of records differs, and in how many elements | [Recipes](/recipes#find-the-field-that-differs-in-a-list-of-records)      |

## `vitest-auto-spy/console`

Silent typed spies over the global `console`. See [Console spies](/utilities/console).

| Export                                                                                                                                              | What it does                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `consoleLogSpy`, `consoleInfoSpy`, `consoleWarnSpy`, `consoleErrorSpy`, `consoleDebugSpy`, `consoleTraceSpy`, `consoleTimeSpy`, `consoleTimeEndSpy` | The spies, installed on import                                   |
| `useConsoleSpies()`                                                                                                                                 | Installs the spies before each test of the block, restores after |
| `installConsoleSpies()` / `resetConsoleSpies()` / `restoreConsole()`                                                                                | Install, clear, undo                                             |
| `consoleOutput()`                                                                                                                                   | Everything written, keyed by channel                             |
| `consoleLines()`                                                                                                                                    | Everything written, as one list in call order                    |

## Other entry points

| Import                           | Exports                                                                                                                                                                                         | Docs                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `vitest-auto-spy/jasmine`        | `createSpyObj`, the `jasmine` namespace, `registerJasmineMatchers`, `enableJasmineCompat`, plus `createSpyFromClass`, `createFunctionSpy`, `provideAutoSpy` with `.and` / `.calls`; Vitest only | [Migrating from Jasmine](/migrating-jasmine#the-auto-spies-api)              |
| `vitest-auto-spy/jasmine-compat` | `enableJasmineCompat()` alone, for `bun test` and `node --test`                                                                                                                                 | [On Bun and `node:test`](/migrating-jasmine#on-bun-and-node-test)            |
| `vitest-auto-spy/observer-spy`   | `subscribeSpyTo`, `ObserverSpy`, `SubscriberSpy`: the `@hirez_io/observer-spy` API                                                                                                              | [rxjs](/runtimes/rxjs#subscribespyto-for-a-suite-arriving-with-observer-spy) |
| `vitest-auto-spy/zone`           | `installProxyZonePatch(options?)`, installed on import: `fakeAsync` under Vitest                                                                                                                | [Zone](/utilities/zone)                                                      |
| `vitest-auto-spy/eslint-plugin`  | The flat-config lint plugin (default export)                                                                                                                                                    | [ESLint plugin](/utilities/eslint-plugin)                                    |
| `vitest-auto-spy/perf-reporter`  | The Vitest reporter `npx vitest-auto-spy perf` uses (default export)                                                                                                                            | [CLI](/utilities/cli)                                                        |
| `vitest-auto-spy/package.json`   | The manifest, for tools that read it (Storybook, Nx)                                                                                                                                            | —                                                                            |

## Configuration objects

The second argument of `createSpyFromClass`, `createSpyFromInstance` and `provideAutoSpy` is a
`ClassSpyConfiguration`. All options with examples: [Spies from a class](/core/create-spy-from-class#configuration).

| Option                                         | Type                 | What it does                                                                                                                                    |
| ---------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `methodsToSpyOn`                               | `string[]`           | Adds callables to the methods found on the prototype                                                                                            |
| `onlyMethodsToSpyOn`                           | `string[]`           | Spies only these; nothing is discovered                                                                                                         |
| `instanceMethodsToSpyOn`                       | `string[]`           | Like `methodsToSpyOn`, for callables on the instance (`signal()` fields, arrow props)                                                           |
| `observablePropsToSpyOn`                       | `string[]`           | Observable properties that get `nextWith` and friends                                                                                           |
| `gettersToSpyOn` / `settersToSpyOn`            | `string[]`           | Accessors to spy on, read back through `accessorSpies`                                                                                          |
| `autoSpyAccessors`                             | `boolean`            | Finds getters and setters by itself                                                                                                             |
| `returns`                                      | `{ method: value }`  | What a method returns from the start (for an Observable method, pass `of(value)`); the method stays a spy                                       |
| `returnsUndefined`                             | `string[]`           | Methods that answer `undefined`; counts as configured under `strict`                                                                            |
| `returnsClass`                                 | `{ method: Class }`  | The method answers one spy of that class per double, reached as `asSpy(double.method())` — [details](/core/create-spy-from-class#returns-class) |
| `overrides`                                    | `{ member: value }`  | Replaces a member with a plain value (see [returns or overrides](/core/returns-vs-overrides))                                                   |
| `selfReturning`                                | `string[]`           | Methods that return the double itself, for chained calls                                                                                        |
| `fillMissing`                                  | `boolean`            | Adds a spy for a name the prototype does not have (`abstract` members)                                                                          |
| `lazySpies`                                    | `boolean \| 'proxy'` | When method spies are built (`'proxy'`: one proxy object builds them on first use); unset, the number of methods decides                        |
| `strict`, `onUnstubbedCall`, `onUnstubbedRead` | see below            | [Strict mode](/core/strict-mode)                                                                                                                |
| `passthrough`                                  | `boolean`            | `createSpyFromInstance` only: unconfigured methods run the real one                                                                             |

`createAutoMock`, `autoMocked` and `provideAutoSpyForToken` take an `AutoMockConfiguration` as the
last argument: `observablePropsToSpyOn`, `returns`, `returnsUndefined`, `returnsClass`, `selfReturning`,
`name` (what a strict report calls the double), and the strict fields. With nothing to seed, the
options can go first: `createAutoMock<EventSource>({ returnsUndefined: ['close'] })`. That works when
the object names at least one of `returnsUndefined`, `selfReturning`, `returnsClass`,
`observablePropsToSpyOn`, `onUnstubbedCall`, `onUnstubbedRead`; `strict`, `name` or `returns` alone
still go second — [options without values](/core/auto-mock-by-type#options-without-values).

**`StrictSpyConfiguration`**: accepted by every factory, and by `setupAutoSpy(options?)` as a
suite-wide default. See [precedence](/core/strict-mode#precedence).

| Field              | Type                                                                                                                | What it does                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `strict?`          | `boolean`                                                                                                           | A call to a method nobody configured throws, naming class, method and arguments. Default off               |
| `onUnstubbedCall?` | `(call: { className: string \| undefined; method: string; args: unknown[] }) => unknown`                            | Runs instead, and its result becomes the call's result. Wins over `strict`                                 |
| `onUnstubbedRead?` | `(read: { className: string \| undefined; member: string; kind: 'getter' \| 'observable'; count: number }) => void` | Gets the getters read and streams subscribed with nothing configured, after the test. Needs `setupAutoSpy` |

**`ValueConfig`** (for `nextWithValues`, `createObservableWithValues`): `{ value, delay? }`,
`{ errorValue, delay? }` or `{ complete?, delay? }`.

**`createSpyClass` options**: `{ statics?: boolean }` copies the class's static members onto the
double. See [statics](/core/spy-typing#the-class-s-statics-—-statics-true).

**`captureArg` options**: `{ where? }`, a predicate choosing which values the captor accepts.

## Public types

The core exports these; most of them you only see in an error message.

| Type                                                                         | What it is                                                                                       | Docs                                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `Spy<T>`                                                                     | The spy object: each method of `T` plus the helpers its return type allows, plus `accessorSpies` | [Spy typing](/core/spy-typing)                                                            |
| `Spy<T, Options>`                                                            | `{ overload?: 'first' \| 'last' }` picks the overload the helpers read                           | [Overloads](/core/spy-typing#overloads-parameters-reads-the-last-signature)               |
| `FunctionSpy<Fn>`                                                            | What `createFunctionSpy` returns                                                                 | [One function](/core/create-spy-from-class#a-single-function-—-createfunctionspy)         |
| `DeepMockProxy<T>`                                                           | What `mockDeep` returns                                                                          | [`mockDeep`](/core/auto-mock-by-type#recursive-deep-mocks-—-mockdeep)                     |
| `AutoMocked<T>`                                                              | What `autoMocked` returns: `T` and `Spy<T>` at once                                              | [`autoMocked`](/core/auto-mock-by-type#automocked-—-one-object-typed-as-both-t-and-spy-t) |
| `DeepPartial<T>`                                                             | What `createMock` and `createAutoMock` take: partial at every depth                              | [Fixtures](/utilities/fixtures)                                                           |
| `ClassType<T>`                                                               | A class of `T`, abstract classes included                                                        | [Spies from a class](/core/create-spy-from-class)                                         |
| `SpyDisposable`                                                              | Makes every double work with `using`                                                             | [`using`](/core/create-spy-from-class#using)                                              |
| `ObservableLike<T>`, `SubjectLike<T>`, `SubjectOf<T>`, `AutoSpyRxjsTypes<T>` | How the types recognise a stream without naming rxjs                                             | [rxjs in the types](/runtimes/rxjs#rxjs-in-the-types)                                     |
| `SubscribableLike<T>`, `CallbackSubscribable<T>`, `EmissionSource<T>`        | What the Observable assertions accept                                                            | [Which sources work](/core/observable-assertions#which-sources-work)                      |
| `AddSpyMethodsByReturnTypes<Method>`                                         | The helpers one method gets                                                                      | [Spy typing](/core/spy-typing)                                                            |

Every exported type, by entry point. The list is for lookup; the table above covers the ones you use.

```text
vitest-auto-spy (also re-exported by /bun, /node, /rstest, /react, /svelte, /vue, /bun-angular)
  AccessorImplementations, AccessorKeysOf, AddAccessorsSpies, AddCalledWithAny,
  AddCalledWithObservable, AddCalledWithPromise, AddCalledWithSpyMethods, AddObservableSpyMethods,
  AddPromiseSpyMethods, AddSpyMethodsByReturnTypes, AddThrowHelper, AddVoidReturnHelpers,
  AdoptMockOptions, AdoptedMock, AnyReturnHelpers, ArgCaptor, AsInstances, AssertMockedOptions,
  AutoMockConfiguration, AutoMocked, AutoSpyDefaultEntry, AutoSpyRxjsTypes, CallLog,
  CallbackSubscribable, CaptureArgOptions, ClassSpyConfiguration, ClassType, CompleteValueConfig,
  ConstructorMock, ConstructorSpy, DeepMockProxy, DeepPartial, EmissionObserver, EmissionOptions,
  EmissionSource, ErrorValueConfig, FixtureFactory, FlushUntilOptions, Func, FunctionSpy,
  InstanceSpyConfiguration, MethodReturns, MockDeepOptions, ModuleNamespace,
  ModuleNamespaceOptions, Mutable, NextValueConfig, NotAPublicKey, ObservableLike,
  ObservablePropSpyMethods, OnlyMethodKeysOf, OnlyObservablePropsOf, OnlyPropsOf,
  OutsideHookReaction, Overload, OverloadChoice, Overloads, PropStubValue, RestoreProp, Spy,
  SpyClassOptions, SpyDisposable, SpyOptions, StrictSpyConfiguration, SubjectLike, SubjectOf,
  SubscribableLike, UnstubbedCall, UnstubbedCallHandler, UnstubbedRead, UnstubbedReadHandler,
  ValueConfig, ValueConfigPerCall, WithMockReturnValue

/rxjs (re-exported from the core)
  AddObservableSpyMethods, CompleteValueConfig, ErrorValueConfig, NextValueConfig,
  ObservablePropSpyMethods, ValueConfig, ValueConfigPerCall

/angular
  AccessorImplementations, AngularTestEnvMode, AngularTestEnvOptions, AngularTokenProvider,
  AngularValueProvider, AutoSpiedInstance, AutoSpyFixture, AutoSpyOverride, AutoSpyTokenDefaults,
  CallbackSubscribable, ComponentInputs, ComponentStubOptions, CreateWithAutoSpiesOptions,
  DirectiveHostOptions, ElementConstructor, EmissionObserver, EmissionOptions, EmissionSource,
  ExtendWithAutoSpiesOptions, InjectionLog, MockResourceOptions, MockedResource,
  NativeElementHolder, PreparedShallow, RenderShallowOptions, ResourceDouble,
  ResourceDoubleSnapshot, ResourceDoubleStatus, ResourceStatusLike, RestoreProp, RunCounter,
  SettleResourceOptions, ShallowOverrides, ShallowRender, SignalPropHandles, SignalPropValues,
  SpiedFixtures, Spy, SpyRegistry, StableOptions, SubjectOf, SubscribableLike,
  TrackInjectionsOptions, TrackedProvider

/angular/diagnostics
  AngularDiagnosticsOptions, PendingRequestsOptions, SpecTiming, TestBedDiagnosticsOptions

/angular/doubles
  AttachedComponent, DialogComponent, DialogDataOf, DialogRefLike, DialogResult,
  MatDialogRefDouble, MatDialogRefInit, OverlayDouble, OverlayDoubleInit, OverlayLike,
  OverlayRefDouble, OverlayRefStub, PlatformFlagTokens, PlatformName, PlatformOverrides,
  PositionCall

/angular/matchers
  RegisterSignalMatchersOptions, ResourceLike, SignalLike, SignalValueOptions

/angular-http
  ExpectRequestOptions, FlushOptions, HttpTestingOptions, RequestErrorOptions, RequestExpectation,
  RequestMatcher, ResponseBody

/angular-router
  ActivatedRouteChange, ActivatedRouteDouble, ActivatedRouteInit, LocationDouble, NavigationInit,
  RouteResources, RouterDouble, RouterDoubleInit, RouterEventPair, RouterEventsHandle

/signal-forms
  CreateFormOptions, FieldErrorMatch

/bun-angular (beyond the core)
  AngularResourceInlinerOptions, AngularValueProvider, AutoSpiedInstance, ComponentInputs,
  CreateNestUnitOptions, CreateWithAutoSpiesOptions, DomRegistrar, ElementConstructor,
  GlobalRegistratorOptions, JsdomModule, JsdomRegistrarOptions, NativeElementHolder, NestUnit,
  NestUnitClass, NestUnitProvider, NestUnitSpies, PreparedShallow, RegisterDomGlobalsOptions,
  RenderShallowOptions, ResourceStatusLike, RunCounter, SettleResourceOptions, ShallowOverrides,
  ShallowRender, SpyRegistry, StableOptions

/nestjs
  CreateNestUnitOptions, InjectionLog, NestModuleRef, NestUnit, NestUnitClass, NestUnitProvider,
  NestUnitSpies, NestValueProvider, TrackInjectionsOptions, TrackedProvider

/bun (beyond the core)
  CreateNestUnitOptions, NestUnit, NestUnitClass, NestUnitProvider, NestUnitSpies

/node (beyond the core)
  CreateNestUnitOptions, NestUnit, NestUnitClass, NestUnitProvider, NestUnitSpies,
  StopTrackingNodeMocks

/vue (beyond the core)
  VueInjectionToken, VueProvideSpy

/setup
  BlockNetworkOptions, CountingClock, CountingClockOptions, DocumentPollutionOptions,
  DocumentPollutionReaction, DuplicateCopiesReaction, ExpectedUnhandledError, FakeTimersConfig,
  GlobalPatchReaction, MisconfigurationReaction, PerTestHandle, PrototypePollutionReaction,
  RejectionHost, RestoreWebStorageOptions, SchedulerHost, SetupAutoSpyOptions, SetupAutoSpyPreset,
  SpyEngine, StopTrackingListeners, StopTrackingRejections, StopTrackingTimers, StorageSpyKey,
  StrayConsoleOptions, StrayConsoleReaction, StrayListener, StrayListenerReport, StrayRejection,
  StrayTimer, StrayTimerReport, StrayTimersOptions, StubResponseInit, SwallowedStrictCallsReaction,
  SystemTime, TrackedListenerTarget, UnconfiguredReadsReaction, UnhandledObservableError,
  XhrBlockMode

/dom-stubs
  AnimationFrameMode, AnimationFrameStub, AnimationFrameStubOptions, CancelAnimationFrameFn,
  ClassListStub, ElementRectRestore, ElementStub, ElementStubOptions, FillMissingDomApisOptions,
  IntersectionEntryOverrides, IntersectionObserverStubOptions, MediaElementState, MediaElementStub,
  MediaElementStubOptions, MutationRecordInit, ObserverGlobal, ObserverInstance, ObserverStub,
  ObserverStubOptions, RequestAnimationFrameFn, ResizeEntryRect, StyleStub, WebStorageKey,
  WebStorageStub, WebStorageStubOptions, WorkerInstance, WorkerScript, WorkerStub,
  WorkerStubOptions

/diagnostics
  TestRunComparison, TestRunReport, TestRunSummary

/console
  ConsoleChannel, ConsoleLine, ConsoleMethodSpy, ConsoleOutput, ConsoleSpies

/jasmine
  AngularValueProvider, ClassSpyConfiguration, ClassType, JasmineAccessorSpies, JasmineAccessorSpy,
  JasmineAnd, JasmineCallInfo, JasmineCalls, JasmineClassSpyConfiguration, JasmineClock,
  JasmineMethodSpy, JasmineNamespaces, JasmineSpy, JasmineStrategies, JasmineWithArgsAnd,
  JasmineWithArgsStrategies, JasmineWithArgsSync, OnlyMethodKeysOf, OnlyObservablePropsOf,
  OnlyPropsOf, Spy, SpyObj

/jasmine-compat
  JasmineAccessorSpies, JasmineAccessorSpy, JasmineAnd, JasmineCallInfo, JasmineCalls,
  JasmineMethodSpy, JasmineNamespaces, JasmineSpy, JasmineStrategies, JasmineWithArgsAnd,
  JasmineWithArgsStrategies, JasmineWithArgsSync

/observer-spy
  ObserverSpyConfig, ObserverSpyWaitOptions

/zone
  ProxyZonePatchOptions, ProxyZoneScope

/eslint-plugin
  AutoSpyEslintPlugin, FlatConfig, PluginRule, RuleSeverity
```

## In depth

Details that have no other page yet.

- **Where the DOM stubs went.** The `/dom-stubs` helpers and the `/diagnostics` functions moved out of
  the core in 4.0; see
  [Upgrading to 4.0](/upgrading-4#_2-dom-stubs-and-run-diagnostics-moved-to-their-own-subpaths).
- **`createSpyFromInstance` configuration.** It takes `ClassSpyConfiguration` but ignores
  `lazySpies` and `fillMissing`: the members already exist, and an instance has no erased `abstract`
  members. It reports the same misconfigurations as the class factory, judged against the live
  object, so an arrow-function field counts as a member.
- **Suite-wide `strict`.** `setupAutoSpy` arms the default only when you pass `strict` or
  `onUnstubbedCall`, and releases it in `afterAll`. Without that, under `isolate: false` a default
  armed by one file would stay armed for files that never asked for it. The default lives on
  `globalThis`, so it reaches a double whichever bundle of the package built it. An explicit
  `strict: false` on a double is the only way to exempt one wide collaborator.
- **`className` in the strict hooks** is the class the double was built from, or the `name` a
  type-driven double was given, or `createAutoMock(file:line)` when it has none.
- **`SpyDisposable`** is `{ [Symbol.dispose](): void }`, declared structurally rather than as the
  global `Disposable`. That global lives in `lib.esnext.disposable`, so a project whose `lib` stops at
  ES2022 and has no `@types/node` would fail on the published types. `Spy<T>` stays assignable to
  `Disposable` wherever it exists. Disposing any node of a `mockDeep` tree resets the whole tree.
- **`SubscribableLike<T>` / `CallbackSubscribable<T>`** are the two subscription shapes the
  Observable assertions accept: an observer object, as rxjs takes, and a bare `next` callback, as
  Angular's `output()` takes. `EmissionSource<T>` is their union.
- **`AddCalledWithAny<Method>` / `AnyReturnHelpers`.** A method whose return type is `any` keeps
  `mockReturnValue` on its `calledWith` chain and gets the Promise and Observable helpers too, because
  at run time it has all of them. These two types name that chain and that bundle, for a signature
  built outside `Spy<T>`.
- **`DeepPartial<T>`** still rejects a key `T` does not have, at every depth. `Date`, `Map`,
  `Promise` and functions pass through untouched, and a real value is accepted wherever a partial is,
  so a host object such as a `NodeList` stays assignable.
- **`SubjectOf` from `/angular`** does not augment anything: a variable typed with it is rxjs's
  `Subject` only where `vitest-auto-spy/rxjs` is in the TypeScript program, and `SubjectLike`
  otherwise.
- **`restoreGlobals()` and DOM globals.** Vitest puts the jsdom or happy-dom window's properties on
  `globalThis` as getter and setter pairs that forward to the window. `global.ResizeObserver = stub`
  runs the setter and leaves the property descriptor unchanged. So `restoreGlobals()` writes the old
  value back through the same setter, not only by comparing descriptors.
- **`mockResourceProp` after `fail()`**: `value()` throws a `ResourceValueError`, like a real failed
  resource.
