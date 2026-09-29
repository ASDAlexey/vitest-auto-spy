---
title: Angular
description: Test Angular components and services in TestBed with spies built from the real classes - provideAutoSpy, injectSpy, renderShallow, stable, signal and resource helpers.
---

# Angular

`vitest-auto-spy/angular` replaces a service in `TestBed` with a spy object built from its class.
Every method is a typed [spy](/glossary): it records calls and answers what you set. Use it when a
component or service under test depends on other services and you want to control what they return.

```ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/angular';

import { ProfileComponent } from './profile.component';
import { UserService } from './user.service';

describe('ProfileComponent', () => {
  let users: Spy<UserService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [provideAutoSpy(UserService, { returns: { load: of({ id: 1, name: 'Ada' }) } })],
    });
    users = injectSpy(UserService);
  });

  it('shows the user name', async () => {
    const fixture = TestBed.createComponent(ProfileComponent);
    await stable(fixture); // runs change detection and effects, then waits

    expect(fixture.nativeElement.textContent).toContain('Ada');
    expect(users.load).toHaveBeenCalledTimes(1);
  });
});
```

The project still needs the usual Angular + Vitest setup: the `@angular/build:unit-test` builder, or
Analog's Vite plugin with a `TestBed` setup file. See [Installation](/core/installation). The spies
work the same in zoneless and zone.js projects. If something breaks before your first assertion,
see [Angular troubleshooting](/adapters/angular-troubleshooting).

Common next steps:

- set a method's answer or a field's value up front: [Seeding the double in the provider](#seeding-the-double-in-the-provider);
- control a `signal()` field of a spied service: [Driving a signal](#driving-a-signal);
- wait for the component after a change: [Zoneless waiting](#zoneless-waiting);
- render without child components: [Shallow component rendering](#shallow-component-rendering).

## Imports

| Import                                | What it gives                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vitest-auto-spy/angular`             | `provideAutoSpy`, `provideAutoSpyForToken`, `injectSpy`, the `Spy<T>` type, `extendWithAutoSpies`, `renderShallow`, `setInputs`, `stable`, `settleResource`, the signal and property mockers, and everything else on this page |
| `vitest-auto-spy/angular/matchers`    | `registerSignalMatchers`, `registerResourceMatchers`, `registerDirectiveMatchers` (Vitest only)                                                                                                                                |
| `vitest-auto-spy/angular/doubles`     | ready-made `window`, `document`, Material dialog, platform, sanitizer, change detector and CDK overlay doubles                                                                                                                 |
| `vitest-auto-spy/angular/diagnostics` | `enableTestBedDiagnostics` and `enableAngularDiagnostics` (Vitest only)                                                                                                                                                        |
| `vitest-auto-spy/angular-http`        | `expectRequest`, `provideHttpTesting` - see [Angular HTTP](/adapters/angular-http)                                                                                                                                             |
| `vitest-auto-spy`                     | `createSpyFromClass`, `createMock`, `createAutoMock`, `createSpyFromInstance`, `spyOnVoidMethod`, `spyOnOwnMethod`, `stubConstructor`, `asInstance`                                                                            |
| `vitest-auto-spy/setup`               | `setupAutoSpy`, `registerFocusMatchers`                                                                                                                                                                                        |

`vitest-auto-spy/angular` also re-exports a few things from the root entry: the `Spy<T>` type, the
`mock*Prop` helpers with `restoreMockedProps` and `countMockedProps`, the `expectEmission` family,
and `registerAutoSpyDefaults` / `clearAutoSpyDefaults`. The spy factories stay on
`vitest-auto-spy`, so a spec that needs `createSpyFromClass` too has two import lines.

To run the same specs on Bun, use [`vitest-auto-spy/bun-angular`](/runtimes/bun-angular). It exports
everything on this page except the three `register*Matchers`, and it adds the DOM and `templateUrl`
support that `bun test` lacks.

## Replace a service: `provideAutoSpy` and `injectSpy`

`provideAutoSpy(Service)` is a provider that hands out a spy object instead of the real service.
`injectSpy(Service)` gets that object from `TestBed`, typed as `Spy<Service>`.

```ts
TestBed.configureTestingModule({
  providers: [provideAutoSpy(UserService), provideAutoSpy(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] })],
});

const users = injectSpy(UserService);
users.load.nextWith({ id: 1, name: 'Ada' });
```

The second argument is an options object, the same one `createSpyFromClass` takes. The options used
most in Angular specs:

| Option                   | Type                 | Default | Meaning                                                                            |
| ------------------------ | -------------------- | ------- | ---------------------------------------------------------------------------------- |
| `returns`                | `{ method: value }`  | —       | what a method answers from the start; the method stays a spy                       |
| `overrides`              | `{ member: value }`  | —       | replaces a member with a plain value (a field, an Observable property, a signal)   |
| `observablePropsToSpyOn` | `string[]`           | —       | Observable properties that get `nextWith` and friends                              |
| `onlyMethodsToSpyOn`     | `string[]`           | all     | spy only these methods                                                             |
| `fillMissing`            | `boolean`            | `false` | add spies for members the prototype does not have, such as `abstract` methods      |
| `lazySpies`              | `boolean \| 'proxy'` | by size | when each method spy is built; see [Lazy spies by default](#lazy-spies-by-default) |
| `strict`                 | `boolean`            | `false` | a method you did not configure throws instead of returning `undefined`             |

All options: [`createSpyFromClass`](/core/create-spy-from-class).

**Common mistake:** calling `injectSpy` for a class nothing provides. It warns and returns the real
service; see [`injectSpy` says when it got the real thing](#injectspy-says-when-it-got-the-real-thing).

## Seeding the double in the provider

Set answers where you provide the spy, instead of in a `beforeEach` below it. `returns` sets what a
**method** answers. `overrides` sets a member that is not a method result: an Observable property, a
plain field, a signal.

```ts
provideAutoSpy(FavoritesService, {
  returns: { load: of([]) },
  overrides: { savedItemsChanged$: of(undefined), favoriteItems: [] },
});

provideAutoSpyForToken(PRODUCTS, undefined, { returns: { getProducts: of([]), getById: of(null) } });
```

A signal field goes in `overrides` too. Keep the signal in a variable to change it later:

```ts
const isAdmin = signal(false); // WritableSignal<boolean>

provideAutoSpy(SessionService, { overrides: { isAdmin } });
// later, in the test
isAdmin.set(true);
```

If you already hold the spy (from `injectSpy`), [`mockSignalProp`](#driving-a-signal) does the same.
Either way, put the signal in place before the first render; change its value with `set()` any time.

A member in `overrides` is stored as is and **is no longer a spy**; a signal there stays a real,
writable signal. Put data there. Name a method in
`returns` when you still want to assert on its calls. The two are compared on
[returns vs overrides](/core/returns-vs-overrides).

**Common mistake:** an exported `const` provider that carries the values, shared between spec files.
Under [`isolate: false`](/glossary) every file that imports it shares one set of spies. Seed per test instead.

### Observable properties behind a token

A token has a type but no class, so the factory cannot tell a method from a property. Every key you
did not name becomes a **function** spy, an Observable property included. The code under test then
subscribes to a function, and the failure shows up far from the double. Name the Observable
properties:

```ts
provideAutoSpyForToken(FAVORITES, undefined, { observablePropsToSpyOn: ['favorites$'] });

injectSpy(FAVORITES).favorites$.nextWith([{ id: 1 }]);
```

If a member is in both `overrides` and `observablePropsToSpyOn`, the `overrides` value wins. Put a
real `Subject` in `overrides` when the spec drives the stream itself. Name it in
`observablePropsToSpyOn` when you want `nextWith`.

## Fixtures instead of `let` + `beforeEach` — `extendWithAutoSpies`

`extendWithAutoSpies` turns spies into Vitest [test fixtures](https://vitest.dev/guide/test-context).
A test names the spies it needs in its arguments, and there is no `let` that is `undefined` between
tests. Needs Vitest 4.1 or newer.

```ts
import { of } from 'rxjs';
import { test as base, expect } from 'vitest';
import { extendWithAutoSpies } from 'vitest-auto-spy/angular';

const test = extendWithAutoSpies(base, {
  cart: CartService,
  api: [ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }],
  passcode: PASSCODE_TOKEN,
});

test('checks out', async ({ cart }) => {
  cart.checkout.resolveWith(true);

  await expect(cart.checkout(1)).resolves.toBe(true);
});

test('builds only what it names', ({ api }) => {
  api.get.mockReturnValue(of([])); // `cart` and `passcode` are never built for this test
});
```

Each entry is one of:

- a class;
- a `[Class, config]` pair, where `config` is whatever `provideAutoSpy` takes;
- an `InjectionToken`, built from the token's type the way `provideAutoSpyForToken` does.

The third argument takes the other providers and imports the module needs. They are registered after
the generated ones, so a token named there wins:

```ts
const test = extendWithAutoSpies(base, { cart: CartService }, { providers: [provideHttpClient(), CartComponent] });
```

If that list provides a fixture's token (`{ provide: CartService, useValue: real }` or a bare class),
the fixture resolves to that value through `TestBed.inject`. Keeping a real service is a choice, so
this stays quiet under `misconfiguration: 'throw'` and `preset: 'strict'`.

Each spy is built the first time something injects it: the test that names it, or a real provider
that depends on it. A test that uses one fixture of ten builds one spy.

**Common mistakes:**

- Chaining `.extend` calls instead of passing one map. The first fixture would inject, which creates
  the testing module, and the next one then fails with Angular's _"Cannot configure the test module
  when the test module has already been instantiated"_. `TestBed` must know every provider before
  the first injection.
- A `beforeEach` that **injects**. It has the same effect. A `beforeEach` that only calls
  `configureTestingModule` is fine: it runs before any fixture resolves.
- On Vitest older than 4.1 the call throws `extendWithAutoSpies needs Vitest 4.1 or newer`. Use the
  `let` + `beforeEach` form from the top of this page until you upgrade.

## An `abstract class` DI token

An abstract class is a common DI token in Angular apps:
`{ provide: LocalStorage, useClass: BrowserLocalStorage }`. `provideAutoSpy` accepts it.

```ts
abstract class LocalStorage extends AbstractStorage {
  abstract read(key: string): string | null;
  abstract write(key: string, value: string): void;
}

TestBed.configureTestingModule({ providers: [provideAutoSpy(LocalStorage)] });

const storage = injectSpy(LocalStorage);
storage.read.calledWith('token').mockReturnValue('abc');
```

TypeScript removes `abstract` members before runtime, so there is nothing on the prototype to find.
When a class has no methods at all, you get a [`createAutoMock`](/core/auto-mock-by-type) object that
answers every method of the type.

**Common mistake:** one concrete member turns that off. Then only the concrete member is a spy, and
the abstract ones are missing:

```ts
abstract class LocalStorage {
  abstract read(key: string): string | null;
  clear(): void {}
}

const storage = injectSpy(LocalStorage);
storage.clear; // a spy
storage.read; // undefined, although Spy<T> says it is there
```

The component then fails with `storage.read is not a function`. Nothing can detect this at runtime,
so ask for the missing members:

```ts
providers: [provideAutoSpy(LocalStorage, { fillMissing: true })];
```

See [`fillMissing`](/core/create-spy-from-class#fill-missing) for what it fills.

## A dependency behind an `InjectionToken`

For a token typed with an interface, use `provideAutoSpyForToken`. It reads the type off the token.
`provideAutoSpy` needs a class, so it does not work here.

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpyForToken(PASSCODE_SERVICE_TOKEN)] });

const passcode = injectSpy(PASSCODE_SERVICE_TOKEN); // Spy<PasscodeService>
```

The signature is `provideAutoSpyForToken(token, overrides?, config?)`. The second argument means the
same as the `overrides` key: plain values for members. Pass `undefined` when you only need `config`.

A spy answers `undefined` until you configure it. That breaks code that **chains** off the result:
a constructor doing `inject(LOGGER).channel('auth').debug('…')` fails on `.debug` before your test
starts. Name the method that returns the object itself:

```ts
provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] });
```

[`selfReturning`](/core/create-spy-from-class#self-returning) keeps `channel` a spy you can assert
on, and makes it return the spy object. To set this once for every file, call
`registerAutoSpyDefaults(LOGGER, { … })` from `vitest-auto-spy/angular` in the setup file. Every
later `provideAutoSpyForToken(LOGGER)` reads it
([token defaults](/core/create-spy-from-class#token-defaults)).

For a chain more than one link long, use
[`mockDeep<T>()`](/core/auto-mock-by-type#recursive-deep-mocks-%E2%80%94-mockdeep), which answers at
every level.

## `injectSpy` and tokens

`injectSpy` takes a class, an abstract class or an `InjectionToken`.

For a **generic** class, name the type argument:

```ts
const flags = injectSpy<FeatureFlagService>(FeatureFlagService);
const modal = injectSpy<ModalRef<PurchaseOptions>>(ModalRef);
```

Without the argument, what you get depends on the constructor:

- If the constructor does not use the type parameter, you get the declared default.
- If it does (`constructor(public data: T)`, common in modal refs), you get the **constraint**. `ModalRef<T = unknown>` gives `Spy<ModalRef<unknown>>`, and
  `ConfigService<T extends Config = Defaults>` gives `Spy<ConfigService<Config>>`. Name the argument
  when you mean the default or one specific type.

**Common mistake:** `TestBed.inject(X) as Spy<X>` on a generic class. It infers `X<any>`, and the
error surfaces much later, deep inside the spy types, without mentioning type parameters.

## `injectSpy` says when it got the real thing

If nothing in the testing module provides a spy, `injectSpy` returns what Angular built and warns
once per token:

```text
[vitest-auto-spy] injectSpy(DeviceRegistryService): got a real DeviceRegistryService — nothing in the testing module provides a double, so Angular built it (providedIn: 'root').
Add provideAutoSpy(DeviceRegistryService) to providers.
```

The reason in the message matches what the injector returned: a `providedIn: 'root'` class Angular
built itself, a class the testing module provides for real, or an `InjectionToken`. For a token the
message suggests `{ provide: TOKEN, useValue: createAutoMock<T>() }`.

Without the warning, a forgotten provider shows up later, when `.mockReturnValue(…)` is called on a
real method. Or never, if nothing in the types disagrees.

## Do not write a local `injectSpy`

Many projects already have a helper like `TestBed.inject(token as never) as Spy<T>`. Delete it, or
re-export this one under that name. This one accepts a class, an `InjectionToken` and an abstract
class, warns when it gets a real service, and needs no type assertion. Two functions with the same
name and different signatures leave the import order in each file to decide which one runs.

## A component is not a provider

`provideAutoSpy(SomeComponent)` throws, and so does a directive. Angular declares or imports a
component; it never injects one, so the provider would do nothing.

```text
[vitest-auto-spy] provideAutoSpy(ChartComponent): ChartComponent is a component. Angular declares or imports a component, it never injects one, so this provider is never read and the double replaces nothing.
```

To keep a child out of the render, use
[`createComponentStub`](#a-stand-in-for-a-child-createcomponentstub) or
[`renderShallow`](#shallow-component-rendering). To test the component, create it with `TestBed`. A
service that extends a component class, without a decorator of its own, is still accepted.

## Lazy spies by default

A spy for each method is built the first time the test reads it. Wide services stay cheap, and you
can call `provideAutoSpy` in every `beforeEach`: it costs a couple of microseconds.

```ts
provideAutoSpy(WideService); // lazy, the default
provideAutoSpy(WideService, { lazySpies: false }); // build every spy up front
```

Nothing changes for the test: `Object.keys`, `vi.isMockFunction`, `calledWith`, `resetAutoSpy` and
`clearAutoSpy` behave the same. `createSpyFromClass` has the same default.

| Option             | Type                 | Default              | Meaning                                                   |
| ------------------ | -------------------- | -------------------- | --------------------------------------------------------- |
| `lazySpies`        | `boolean \| 'proxy'` | picked by class size | `false` builds every spy up front                         |
| `autoSpyAccessors` | `boolean`            | `false`              | spy every getter and setter; walks the prototype per call |

Three settings cost more, and you rarely need them:

- `lazySpies: false` gives up laziness. Use it only when a spec lists the spy's own keys
  (`Object.keys(spy)`).
- An explicit `lazySpies: true` on a class with 8 or more methods overrides the size-based choice
  and makes each spy heavier and slower to build. Leave the option out.
- `autoSpyAccessors: true` walks the prototype chain on every call, without a cache. If a class is
  spied per test, name the accessors you need instead.

If a spec is slow, the time is almost always in `TestBed`, not in the spies.
[`enableTestBedDiagnostics()`](#where-a-spec-spends-its-time) measures it, and
[`renderShallow`](#shallow-component-rendering) usually fixes it. Numbers:
[Performance](/core/performance#memory-not-just-time).

## Spying a real service without replacing it

When the test wants the real service (its dependencies, signals and side effects) and only checks
what the component called, take it from the injector and spy on it in place:

```ts
import { TestBed } from '@angular/core/testing';
import { createSpyFromInstance } from 'vitest-auto-spy';

const cart = createSpyFromInstance(TestBed.inject(CartService), { passthrough: true });
const fixture = TestBed.createComponent(CartComponent);

fixture.componentInstance.addOne();

expect(cart.add).toHaveBeenCalledWith(5); // the real CartService ran
cart.checkout.resolveWith('declined'); // from here on, only checkout is replaced
```

With `passthrough`, every call is recorded and runs the real method until you configure it. DI stays
real, `signal()` fields keep `set` and `update`, and `ngOnDestroy` runs for real on teardown.
Lifecycle hooks are not spied. `setupAutoSpy()` restores the instance after the test. Details:
[`passthrough`](/core/create-spy-from-class#passthrough).

## Building a class with auto-spied dependencies

`createWithAutoSpies` builds a class through Angular DI and answers every dependency you did not
provide with a spy. The spec names only what it wants to control.

```ts
import { createWithAutoSpies } from 'vitest-auto-spy/angular';

const { instance, spies } = createWithAutoSpies(CartService, {
  providers: [{ provide: TaxService, useValue: realTax }], // your providers win
});

spies.get(PricingService).total.mockReturnValue(100);
expect(instance.checkout()).toBe(100);
```

| Returned                  | What it is                                                               |
| ------------------------- | ------------------------------------------------------------------------ |
| `instance`                | the class, built by its own Angular factory                              |
| `spies.get(token)`        | what the instance got for `token`: your provider, or the spy made for it |
| `spies.autoSpiedTokens()` | the tokens that got a spy                                                |
| `injector`                | the injector that built it                                               |

Constructor parameters and `inject()` field initializers both resolve. A missing class token gets a
`createSpyFromClass` spy, and a missing `InjectionToken` gets a `createAutoMock` object.
`inject(X, { optional: true })` still returns `null`, as in the app.

**Common mistake:** `spies.get(X)` for a token the instance never asked for: a base class instead of
the implementation, or a service it stopped injecting. It throws, names the token and lists the ones
that were spied. A token asked for optionally that got `null` throws for the same reason.

::: warning Plain providers only
This uses `Injector.create()`, which does not accept `EnvironmentProviders` such as
`provideHttpClient()`. For a class that needs those, use `TestBed`:
[`renderShallow`](#shallow-component-rendering) or a plain `configureTestingModule`.
:::

## Shallow component rendering

`renderShallow` renders a component without its child components. It runs the usual steps for you:
`configureTestingModule`, `NO_ERRORS_SCHEMA`, and `overrideComponent` with empty `imports` and a
blank template. Use it when the spec checks the component's TypeScript state, not its children.

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService), provideHttpClient()],
  inputs: { projectId: 42 }, // set through componentRef.setInput, before the first change detection
});
```

`fixture` is a real `ComponentFixture`. Lifecycle hooks, inputs, signals and DI all work; only the
template is blank.

| Option               | Default | What it does                                                                                                                            |
| -------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `providers`          | `[]`    | providers for the testing module; `EnvironmentProviders` such as `provideHttpClient()` work                                             |
| `imports`            | `[]`    | extra imports for the testing module (a stub module, a routing harness)                                                                 |
| `inputs`             | —       | input values; a signal input takes the **value**, not a signal; keyed by class field or public name                                     |
| `keepTemplate`       | `false` | keep the real template (for `viewChild`, content projection, host bindings); child components are still dropped                         |
| `keepChildren`       | `[]`    | child components, directives and pipes to keep                                                                                          |
| `keepModules`        | `[]`    | `NgModule`s to put back whole under `keepTemplate`, such as `ReactiveFormsModule`                                                       |
| `keepHostDirectives` | `true`  | `false` drops the component's `hostDirectives` and every service they inject                                                            |
| `template`           | `''`    | a stand-in template to render instead of a blank one                                                                                    |
| `beforeCreate`       | —       | runs after the module is configured, before the component exists; read the injector here                                                |
| `detectChanges`      | `true`  | run the first change detection, and so `ngOnInit`                                                                                       |
| `testBed`            | —       | the rest of `configureTestingModule`: `deferBlockBehavior`, `errorOnUnknownElements`, `errorOnUnknownProperties`, `teardown`, `schemas` |

```ts
renderShallow(CardComponent, { testBed: { deferBlockBehavior: DeferBlockBehavior.Playthrough } });
```

A few details:

- On a `standalone: false` component, a kept standalone child is imported into the testing module,
  and a kept `standalone: false` child is declared there.
- `testBed.schemas` are added to the `NO_ERRORS_SCHEMA` a `standalone: false` component gets. A
  standalone component gets exactly the schemas you pass, none by default.
- `inputs` resolves names the way [`setInputs`](#changing-an-input-mid-test) does. An aliased input
  takes either spelling. A name the component does not declare throws at the call.
- `keepHostDirectives: false` is the supported form of
  `TestBed.overrideComponent(X, { set: { hostDirectives: [] } })`.

**Read the injector in `beforeCreate`, not before the render.** A `TestBed.inject` or `injectSpy` in
a `beforeEach` creates the testing module, and a created module cannot be configured again.
`renderShallow` then throws:

```text
[vitest-auto-spy] renderShallow(TaskListComponent): the testing module was already instantiated, so it can no longer be configured. Something read the injector first — TestBed.inject or injectSpy in a beforeEach, or an earlier render in the same test.
```

Move the read into `beforeCreate`. Inside it, put
[`overrideComponentProvider`](#overriding-a-provider-the-component-declares-for-itself) before the
first `injectSpy`. The lint rule
[`no-inject-before-override`](/utilities/eslint-rules#no-inject-before-override) reports the wrong
order.

```ts
renderShallow(ProfileComponent, {
  beforeCreate: () => {
    overrideComponentProvider(ProfileComponent, DeleteAccountService); // first
    injectSpy(SessionService).user.mockReturnValue(ada); // then read
  },
});
```

**Coverage:** `renderShallow` recompiles the component in JIT for the rest of the spec file. Branch
coverage of the build's own compiled template then drops out, even with `keepTemplate: true`. A
later plain render in the same file does not bring it back. If your coverage gate counts those
branches, keep one real `TestBed.createComponent` render per component, placed **before** any
`renderShallow` of it in the file. A module-declared component under `keepTemplate: true` needs no
override, so it is not recompiled.

Shallow rendering pays off on components with a real child tree. On a small leaf component the
override can cost more than it saves. Use [the diagnostics](#where-a-spec-spends-its-time) to find
the files worth converting. Numbers:
[Performance](/core/performance#the-middle-rung-keeptemplate-true).

### `keepTemplate` and a declaration an `NgModule` owns

`keepTemplate: true` keeps what the template uses. It cannot rebuild a `standalone: false` pipe or
directive that an `NgModule` declares when the build is AOT: the compiler replaced the module with
its declarations. `renderShallow` throws and names the module when it can:

```text
[vitest-auto-spy] renderShallow(ReportComponent, { keepTemplate: true }): WhisperPipe is declared by WhisperModule, not standalone, and Angular takes only standalone declarations and NgModules in `imports`.
An AOT build flattened that module away, so name it and it is put back whole: keepModules: [WhisperModule].
```

Fixes, in order of preference:

1. Name the module: `renderShallow(FormComponent, { keepTemplate: true, keepModules: [ReactiveFormsModule] })`.
   Every declaration the module exports is removed and the module is imported whole.
2. Drop `keepTemplate` if the spec reads TypeScript state only.
3. Build the component with `TestBed` directly, and seed the services its children inject.

Without this check, Angular's own error says the pipe "is not standalone", which sends you to change
a pipe that is fine. The same call works under JIT, where the module stays in the list.

### Changing an input mid-test

`setInputs` sets one or more inputs and waits for the component to update. It is
`componentRef.setInput` for each name plus [`stable`](#zoneless-waiting).

```ts
import { setInputs } from 'vitest-auto-spy/angular';

await setInputs(fixture, { projectId: 7, filter: 'open' });
expect(component.visible()).toEqual([openTask]);
```

The third argument is `stable`'s options, `{ timeout, label }`.

- Names are checked before the first one is set. A name the component does not declare throws, and
  the component is left as it was. A bare `setInput` would log `NG0303` and change nothing.
- An aliased input takes either spelling: the class field or the public name.
- An input a **host directive** exposes counts as declared, because `setInput` accepts it, through
  nested host directives too.
- A fixture of a class with no compiled component definition (a `@Directive`, a `@Pipe`, a plain
  class) throws and says what the class is.

```ts
@Component({ selector: 'app-badge', hostDirectives: [{ directive: TooltipDirective, inputs: ['text: tip'] }], template: '…' })
export class BadgeComponent {}

await setInputs(fixture, { tip: 'Archived' }); // the name the host exposes
```

A `model()` is set like any other input. Its output half emits when the component itself changes the
value, so subscribe before the call and await after it:

```ts
const emitted = expectEmission(component.total); // subscribe first

await setInputs(fixture, { step: 3 });

await expect(emitted).resolves.toBe(30);
```

**Common mistake:** asserting right after a bare `componentRef.setInput`. In a zoneless app nothing
recomputes until something asks, so the assertion reads the state of the **previous** value.

### The same options in every test — `prepareShallow`

`prepareShallow` binds a component and its options once. `create()` then renders it for the current
test, with per-test overrides.

```ts
import { prepareShallow, provideAutoSpy } from 'vitest-auto-spy/angular';

const prepare = prepareShallow(TaskListComponent, { providers: [provideAutoSpy(TaskService)] });

it.each([{ filter: 'open' }, { filter: 'done' }])('renders the $filter tasks', ({ filter }) => {
  const { fixture } = prepare.create({ inputs: { filter } });
  // …
});
```

A key passed to `create()` replaces the prepared one: `create({ providers: [...] })` drops the
prepared providers. To add to them, pass `extraProviders` or `extraImports`. They go after the
prepared lists, so the per-test provider wins for the same token:

```ts
it('reads the feature flag', () => {
  prepare.create({ extraProviders: [provideAutoSpy(FlagService)] });
});
```

`extraProviders` and `extraImports` exist on `create()` only. Call `create()` once per test: a second
call in the same test needs `TestBed.resetTestingModule()` first.

**When it pays off.** Only when the tests repeat the same non-empty `providers` or `imports`. If each
`renderShallow` call passes its own `inputs` or nothing at all, `prepareShallow(X)` only renames the
call, and `renderShallow` is simpler. Count the shared options, not the calls.

## A stand-in for a child — `createComponentStub` {#a-stand-in-for-a-child-createcomponentstub}

`createComponentStub` builds a stand-in for a child component, directive or pipe from the real
class. It copies the selector, inputs and outputs, so the stub cannot drift from the real child.

```ts
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { createComponentStub } from 'vitest-auto-spy/angular';

const ChartStub = createComponentStub(ChartComponent);

TestBed.configureTestingModule({ imports: [DashboardComponent] });
TestBed.overrideComponent(DashboardComponent, {
  remove: { imports: [ChartComponent] },
  add: { imports: [ChartStub] },
});

const fixture = TestBed.createComponent(DashboardComponent);
fixture.detectChanges();

const chart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance;
expect(chart.series()).toEqual([1, 2, 3]); // a signal input stays a signal input
chart.pointSelected.emit(2); // an output the parent listens to
```

| Copied from the real class                                                         | Not copied                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| the selector                                                                       | the template: the stub renders one `<ng-content>` per slot |
| every input under its public name, with alias and transform                        | host bindings and host directives                          |
| `input()` as a signal input, `model()` as a model, a decorator input as a property | providers                                                  |
| every output, as an `EventEmitter`                                                 | lifecycle hooks and queries                                |
| `exportAs`; for a pipe, its name and purity                                        | anything the second argument does not seed                 |

The second argument seeds members on every instance: a method the parent calls through a
`viewChild`, or a pipe's `transform` (the identity by default):
`createComponentStub(TranslatePipe, { transform: (key) => key })`. The third argument takes
`{ template }` to render something other than the projected content.

To keep the template and stub one child, combine it with `renderShallow`:

```ts
const { fixture } = renderShallow(DashboardComponent, { keepTemplate: true, keepChildren: [ChartStub] });
```

The real `ChartComponent` is dropped with the other children, and the stub takes its place.

**Common mistake:** stubbing a child whose inputs come from a `hostDirectives` entry. Those inputs
are not on the stub, so the parent's binding answers `NG0303`. Keep that child instead:
`keepChildren: [TheChild]`, or build the fixture with `TestBed` directly.

## Typed elements under a strict lint

`hostElement` and `queryElement` return typed DOM elements instead of `any`. Use them when
`@typescript-eslint/strict-type-checked` reports every read of `fixture.nativeElement`, and your lint
forbids `as HTMLElement`.

```ts
import { hostElement, queryElement } from 'vitest-auto-spy/angular';

const host = hostElement(fixture); // HTMLElement
queryElement(fixture, '.close').click(); // HTMLElement
expect(queryElement(fixture, 'input[name=q]', HTMLInputElement).value).toBe('');
expect(queryElement(fixture.debugElement, 'circle', SVGCircleElement).getAttribute('r')).toBe('4');
```

- Both take a `ComponentFixture`, a `DirectiveFixture` (from `TestBed.createDirective`, Angular 22.2)
  or a `DebugElement`. `queryElement` also takes an element, so a query can start inside a row.
- The last argument is the element type to check with `instanceof` and return. It defaults to
  `HTMLElement`; pass `SVGElement` or `Element` for non-HTML markup.
- A selector that matches nothing throws with the selector and the host in the message. A match of
  another type throws too: `'.close' matched <a.close> (HTMLAnchorElement), not HTMLButtonElement`.
- A `null` source (what `debugElement.query()` returns on no match) throws and says so.
- Both are also on `vitest-auto-spy/bun-angular`.

Because a miss throws, use `queryElement` for an element that must be there. To assert that an
element is **absent**, use `querySelector` on the typed host:

```ts
expect(queryElement(fixture, '.title').textContent.trim()).toBe('Orders'); // a miss throws here
expect(host.querySelector('.empty-state')).toBeNull(); // absent
```

**Common mistake:** `host.querySelector('.title')?.textContent.trim()`. A miss becomes `undefined`,
which `toBeFalsy()` and `not.toContain()` accept, so the test passes on an empty template.

## Focus assertions

`toHaveFocus` checks which element has focus and says what went wrong when it fails.

```ts
import { registerFocusMatchers } from 'vitest-auto-spy/setup';

registerFocusMatchers(); // once, in the setup file

expect(fixture.nativeElement.querySelector('.play')).toHaveFocus();
```

The failure names one of three causes: the element does not exist, focus is still on `<body>`, or
focus is on another element. Both elements are described by tag, id and class, not dumped as DOM.

A missing element throws instead of failing, so `.not` cannot turn it into a pass. Compare that with
`expect(document.activeElement).toBe(button)`, which prints two large DOM dumps, and with
`expect(a === b).toEqual(true)`, which fails with `expected false to deeply equal true`.

## Zoneless waiting

After you change a signal, `await stable(fixture)` runs change detection and pending effects, then
waits for the fixture. Use it before every assertion that reads the result of a change.

```ts
import { flushEffects, stable } from 'vitest-auto-spy/angular';

component.filter.set('open');
await stable(fixture); // flush effects, then await the fixture
expect(component.visible()).toEqual([openTask]);

flushEffects(); // no fixture: services, stores, runInInjectionContext code
```

| Helper                      | What it does                                                                  |
| --------------------------- | ----------------------------------------------------------------------------- |
| `stable(fixture, options?)` | `flushEffects()`, then `fixture.whenStable()`, with a time limit              |
| `flushEffects()`            | `TestBed.tick()` inside the `NgZone`: runs change detection and dirty effects |

| `stable` option | Type     | Default | Meaning                                                        |
| --------------- | -------- | ------- | -------------------------------------------------------------- |
| `timeout`       | `number` | `2000`  | ms to wait before failing with the cause; `0` waits forever    |
| `label`         | `string` | —       | the name used in the failure, such as `'the products fixture'` |

`stable` takes any fixture with `whenStable()`, including the `DirectiveFixture` of
`TestBed.createDirective(Dir, { tagName })` on Angular 22.2.

**Common mistake:** `fixture.detectChanges()` before an assertion. It runs one change-detection pass
and does **not** flush effects, so the assertion reads state that has not finished computing.

Each call costs a full change-detection pass. Call it once after a group of related writes, not after
each write.

### Both work under zone.js, and the zone is why the tick is wrapped

`stable`, `flushEffects` and `setInputs` work in zone.js projects too, with the same code. The tick
runs inside `NgZone`, which avoids Angular's `NG0101: ApplicationRef.tick is called recursively`
error; see [Angular troubleshooting](/adapters/angular-troubleshooting#ng0101-applicationref-tick-is-called-recursively).
Under zone.js one `flushEffects()` runs two application ticks instead of one. The second finds
nothing to update; you do not need to do anything about it.

### `autoDetect` is already on under zoneless

In a zoneless app, a fixture detects changes automatically by default (Angular 19 and later). You do
not need `ComponentFixtureAutoDetect` or `autoDetectChanges()`.

Automatic detection runs **later**, not at the moment you write a signal. An assertion on the next
line still reads the old state. `await stable(fixture)` runs the pass and the effects before the
assertion; another `detectChanges()` does not.

`flushEffects()` from this package is `TestBed.tick()`, the call Angular recommends in place of the
deprecated `TestBed.flushEffects()`.

### The wait is bounded

`stable` waits **2000 ms**, then throws with the likely cause. Without the limit, a fixture that
never settles hangs until Vitest's file-level timeout, which names neither the helper nor the
fixture.

```ts
await stable(fixture, { timeout: 5000, label: 'the products fixture' });
```

What usually keeps a fixture busy:

- a callback waiting on fake timers: advance them first with `await advanceTimers(ms)`;
- an `HttpClient` request nobody flushed with `HttpTestingController`;
- a `PendingTasks` entry nothing released;
- a real `setInterval` the component started.

Pass `label` when a spec awaits more than one fixture. Pass `{ timeout: 0 }` to wait forever; do that
only for a deliberately long real-timer test. `vi.useFakeTimers()` and `fakeAsync` cannot stop the
time limit: it runs on the real clock.

## Resources: `httpResource()` and `resource()`

`settleResource` waits until a resource has finished loading. Use it before you assert on
`value()`. Otherwise the assertion can read the resource's default value and pass for the wrong
reason.

```ts
import { httpResource, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { flushEffects, settleResource } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });

const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

flushEffects(); // the request is sent here, not when the resource is created
TestBed.inject(HttpTestingController).expectOne('/api/products').flush([product]);
await settleResource(products, { label: 'the product resource' });

expect(products.value()).toEqual([product]);
```

Each kind of resource needs a different wait:

| Resource                                        | What it needs before the value is there |
| ----------------------------------------------- | --------------------------------------- |
| `httpResource()` that was just created          | a tick, or it sends **no request**      |
| `httpResource()`, after its response is flushed | one tick and one microtask              |
| `resource()` with an async loader               | two rounds of the same                  |

`settleResource` covers the last two. The first is the `flushEffects()` line above: an `httpResource`
sends nothing until something ticks, so `expectOne` would find nothing. A plain `resource()` needs no
flush: `await settleResource(data)` is enough.

| Option      | Type      | Default | Meaning                                                 |
| ----------- | --------- | ------- | ------------------------------------------------------- |
| `turns`     | `number`  | `20`    | rounds to try before failing; `0` checks once and fails |
| `label`     | `string`  | —       | the name used in the failure                            |
| `allowIdle` | `boolean` | `false` | accept `idle` as settled                                |

- The wait ends on `resolved` and on `error`. For an error, assert with `toHaveResourceError`.
- Each round is a tick plus a microtask. From the third round it also takes an event-loop turn, so a
  loader resolved by a real timer or an `rxResource` over `timer(0)` settles too.
- On timeout it names the resource and the flush that is missing.

`idle` fails instead of passing: it means the loader never ran, usually because `params()` returned
`undefined`. Pass `{ allowIdle: true }` when idle is what you assert.

```ts
const productId = signal<string | undefined>(undefined); // the spec never set it
const product = TestBed.runInInjectionContext(() =>
  resource({ params: () => productId(), loader: loadProduct, defaultValue: EMPTY_PRODUCT }),
);

await settleResource(product, { label: 'the product resource' });
// [vitest-auto-spy] settleResource: the product resource never started — its status is 'idle', so
// the loader has not run and `value()` is still the default every assertion below is about to read.
```

::: tip One line for an HTTP request: `vitest-auto-spy/angular-http`
When the wait belongs to one request, [`expectRequest()`](/adapters/angular-http) does the tick, the
`expectOne`, the flush and the wait in one line:

```ts
import { expectRequest } from 'vitest-auto-spy/angular-http';

await expectRequest('/api/products').flush([product]);

expect(products.value()).toEqual([product]);
```

It is a separate entry because it needs `@angular/common`, an optional peer dependency.
`settleResource` stays the tool for `resource()`, `rxResource()`, reloads and anything not driven by
HTTP.
:::

**Common mistake:** waiting with `flushEventLoopUntil`. It takes real event-loop turns and never
ticks, so an `httpResource` sends no request and the wait fails.

### An `httpResource()` that lives on a component

In an app the resource is usually a component field. `renderShallow` gives it an injection context,
and the first change detection sends the request. The wait is the same.

```ts
@Component({
  selector: 'app-product-list',
  template: `
    @for (product of products.value(); track product.id) {
      <li class="product">{{ product.name }}</li>
    }
  `,
})
export class ProductListComponent {
  readonly query = signal('');
  readonly products = httpResource<Product[]>(() => `/api/products?q=${this.query()}`, { defaultValue: [] });
}
```

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { flushEffects, renderShallow, settleResource, stable } from 'vitest-auto-spy/angular';
import { registerResourceMatchers } from 'vitest-auto-spy/angular/matchers';

registerResourceMatchers(); // once, in the setup file

it('renders what it loaded, and re-requests when the query changes', async () => {
  const { fixture, component } = renderShallow(ProductListComponent, {
    providers: [provideHttpClient(), provideHttpClientTesting()],
    keepTemplate: true,
  });
  const httpTesting = TestBed.inject(HttpTestingController);

  // renderShallow's first change detection already sent the request
  expect(component.products).toBeLoading();

  httpTesting.expectOne('/api/products?q=').flush([{ id: 1, name: 'Anvil' }]);
  await settleResource(component.products, { label: 'the product list' });

  expect(component.products).toHaveResourceValue([{ id: 1, name: 'Anvil' }]);

  await stable(fixture); // the view lags one frame behind the value until this
  expect(fixture.nativeElement.querySelectorAll('.product')).toHaveLength(1);

  component.query.set('anv');
  flushEffects(); // the new params() is read here, and the second request goes out

  httpTesting.expectOne('/api/products?q=anv').flush([]);
  await settleResource(component.products, { label: 'the product list' });

  expect(component.products).toHaveResourceValue([]);
});
```

Every change to a signal that `params()` reads needs its own `flushEffects()` before the next
`expectOne`. Change detection sends the request, not the `set()`. With
[`expectRequest()`](/adapters/angular-http) each pair becomes one line:

```ts
await expectRequest('/api/products?q=').flush([{ id: 1, name: 'Anvil' }]);

expect(component.products).toHaveResourceValue([{ id: 1, name: 'Anvil' }]);
```

### Skipping the request entirely — `mockResourceProp`

`mockResourceProp` replaces a resource property with a double you move by hand. Use it when the spec
tests the component's own logic and does not care about the request.

```ts
import { injectSpy, mockResourceProp } from 'vitest-auto-spy/angular';

const service = injectSpy(ProductService);
const products = mockResourceProp(service, 'products', []);

expect(component.emptyState()).toBe(true);

products.set([product]); // status → 'resolved'
expect(component.emptyState()).toBe(false);

products.loading(); // status → 'loading', the value stays
expect(component.spinner()).toBe(true);

products.fail('offline'); // status → 'error', error() → Error('offline'), hasValue() → false
expect(component.errorMessage()).toBe('offline');

products.idle(); // status → 'idle', back at the initial value
expect(component.placeholder()).toBe(true);
```

Nothing is in flight, so there is nothing to wait for. The double starts `'resolved'` at the initial
value. To start from another status, pass it:
`mockResourceProp(service, 'products', [], { status: 'idle' })`. Any status except `'error'` works
there; for an error, call `fail()`, which takes the reason.

The double is built from real `signal()`s, so a `computed()` reading `products.value()` recomputes
and an `effect()` watching `products.status()` runs.

| Handle member | What it does                                              |
| ------------- | --------------------------------------------------------- |
| `set(value)`  | resolve with a value; clears any error                    |
| `fail(error)` | fail with an `Error` or a message string                  |
| `loading()`   | put it back in flight, leaving the value alone            |
| `idle()`      | back to before it ever ran, at the initial value          |
| `reload`      | the spied `reload()`: assert the call; nothing is re-sent |
| `resource`    | the installed double, for asserting on it directly        |

The property holds a whole `ResourceRef`, because code under test uses both halves (for example
`asReadonly()`, or an optimistic update written through the resource). Each member behaves like
Angular's own:

| On the double            | What it does                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `value`                  | a writable signal; `value.set` / `value.update` move the status to `'local'`            |
| `set(v)` / `update(fn)`  | the same write, spelled the way Angular spells it                                       |
| `hasValue()`             | `true` unless the status is `'error'` or the value is `undefined`                       |
| `snapshot()`             | `{ status, value }`, or `{ status: 'error', error }`: what `@switch` reads              |
| `asReadonly()`           | the same double                                                                         |
| `destroy()`              | back to `'idle'` at the initial value; later writes from the code under test do nothing |
| `value()` after `fail()` | throws, like a real failed resource                                                     |
| `reload()`               | the spy: `false` while `'idle'` or `'loading'`, `true` otherwise; nothing is re-sent    |

```ts
products.fail('offline');

expect(() => products.resource.value()).toThrow(); // as a real resource does
expect(component.errorMessage()).toBe('offline'); // code that checks hasValue() first is fine
```

To force a `reload()` result, use `reload.mockReturnValue(…)`.

**Common mistake:** expecting `hasValue()` to follow the status. It follows the value: a resource
with a `defaultValue` has a value while `loading`, `reloading` and `idle`. So a template with
`@if (products.hasValue()) { … } @else { <spinner/> }` keeps showing the list while the next page
loads.

`restoreMockedProps()` removes the double like any other property patch, so a project that runs
`setupAutoSpy()` needs no teardown.

## Asserting a resource

`registerResourceMatchers()` adds three matchers that check the value **and** the status together.

```ts
import { registerResourceMatchers } from 'vitest-auto-spy/angular/matchers';

registerResourceMatchers(); // once, in the setup file

expect(component.products).toBeLoading();

httpTesting.expectOne('/api/products').flush([product]);
await settleResource(component.products);

expect(component.products).toHaveResourceValue([product]);
expect(other.products).toHaveResourceError(/503/);
```

`toHaveResourceValue` **fails a resource that has not resolved, even when its default value
matches**. `expect(products.value()).toEqual([])` passes both for a resource still loading with
default `[]` and for one that really resolved to nothing. The failure names the actual status and
the missing flush.

The matchers accept anything with `{ status, value, error? }`: `httpResource`, `resource`,
`rxResource` and a `mockResourceProp` double.

**Common mistake:** passing `products.value()` instead of `products`, or a property that is not a
resource. The matcher **throws** and names what it got. It throws rather than fails because `.not`
would turn a failure into a pass:

```ts
expect(products.value()).not.toBeLoading(); // would pass, and asserts nothing
```

[`toHaveFocus`](#focus-assertions) and [`toHaveDirectiveApplied`](#tohavedirectiveapplied) throw on a
wrong argument for the same reason.

## Asserting a signal

`toHaveSignalValue` reads a signal and compares its value.

```ts
import { registerSignalMatchers } from 'vitest-auto-spy/angular/matchers';

registerSignalMatchers(); // once, in the setup file

expect(component.total).toHaveSignalValue(3);
expect(component.items).toHaveSignalValue([{ id: 1 }]);
expect(component.buttonConfig).toHaveSignalValue({ label: 'Save', color: undefined }, { strict: true });
```

The comparison is `toEqual`'s: an `undefined` property, an array hole and the object's class do not
count. `{ strict: true }` compares like `toStrictEqual`. To make every `toHaveSignalValue` strict,
call `registerSignalMatchers({ strict: true })`; one assertion can opt out with `{ strict: false }`.

The ESLint rule [`prefer-to-have-signal-value`](/utilities/eslint-rules#prefer-to-have-signal-value)
rewrites `expect(component.total()).toBe(3)` into the matcher.

**Common mistakes:**

- `expect(component.total).toBeTruthy()`. A signal is a function, so this passes for every signal.
  The matcher rejects anything that is not a zero-argument getter.
- Passing a spy, such as `expect(service.load).toHaveSignalValue(undefined)`. The matcher throws
  without calling it, so no phantom call is recorded. Put a real signal on the property with
  [`mockSignalProp`](#driving-a-signal).
- A component that copies a member of a double into its own field when it is built
  (`readonly count = inject(Store).count`). It keeps whatever the double held at that moment, and a
  later patch cannot reach it. Seed the signal before render:

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(Store, { overrides: { count: signal(3) } })] });
```

## Signal / readonly property mocking

These helpers replace a property on an object for one test. They work on a read-only property, a
getter or a signal field, where a plain assignment does not compile or does not work.

```ts
import { mockAccessorsProp, mockReadonlyProp, mockReadonlyPropGetter, mockValueProp, restoreMockedProps } from 'vitest-auto-spy/angular';

mockReadonlyProp(service, 'isReady', true); // a fixed value, signals included
mockReadonlyPropGetter(service, 'label', () => 'A'); // a getter computed on each read
mockValueProp(service, 'retries', 3); // a plain writable value
mockAccessorsProp(service, 'theme'); // spied get and set
```

| Helper                                  | What it does                                                       |
| --------------------------------------- | ------------------------------------------------------------------ |
| `mockReadonlyProp(obj, key, value)`     | a fixed value, signals included                                    |
| `mockReadonlyPropGetter(obj, key, get)` | a getter called on every read                                      |
| `mockValueProp(obj, key, value)`        | a plain writable value                                             |
| `mockAccessorsProp(obj, key, impls?)`   | spied getter and setter                                            |
| `mockSignalProp(obj, key, initial)`     | a real, writable signal; see [Driving a signal](#driving-a-signal) |
| `restoreMockedProps()`                  | undo every patch                                                   |
| `countMockedProps()`                    | how many patches are still applied                                 |

`mockReadonlyProp`, `mockReadonlyPropGetter`, `mockValueProp` and `mockAccessorsProp` also return
the undo for their own patch, for a stub that must come off inside one test.
[`setupAutoSpy()`](/utilities/setup) calls `restoreMockedProps()` after every test for you. That
matters when the patched object outlives the spec file (a global, a prototype, a singleton), which is
always the case under `isolate: false`.

**Common mistake:** skipping `restoreMockedProps()` under `isolate: false`. The patches stay applied,
and every patched object stays in memory for the whole run.

These helpers are not Angular-specific: the root `vitest-auto-spy` entry exports them too.

### Driving a signal

`mockSignalProp` puts a real, writable signal on a property and returns its handle (a
`WritableSignal`). Use it for a `signal()` or `computed()` field of a spied service:
`createSpyFromClass` reads the prototype, and signal fields are not there. On a spy the field is
missing, so call `mockSignalProp` **before** the first render or `stable(fixture)`.

```ts
import { injectSpy, mockSignalProp, stable } from 'vitest-auto-spy/angular';

const service = injectSpy(CounterService);
const count = mockSignalProp(service, 'count', 0);

expect(component.label()).toBe('0 items');

count.set(42);
await stable(fixture);

expect(component.label()).toBe('42 items');
```

The signal comes from `@angular/core`, so a `computed()` downstream recomputes, an `effect()` runs
and the template updates. It is the same as this pair, with the handle returned:

```ts
const count = signal(0);
mockReadonlyProp(service, 'count', count);
```

For a `signalStore` double with several signals, `mockSignalProps` sets them in one call and returns
a handle per key. An unknown key or a value of the wrong type fails to compile.

```ts
import { mockSignalProps } from 'vitest-auto-spy/angular';

const { items, loading } = mockSignalProps(injectSpy(CartStore), { items: [], total: 0, loading: false });

loading.set(true);
```

What it does with each kind of member:

| Member                                                                                            | What happens                                                              |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| a real `signal()`, `model()`, `linkedSignal()`, or `.asReadonly()` of one                         | written in place; order does not matter, and a `model()` keeps its output |
| a signal field on a spy (the spy has none until you add it), or a `computed()` the class declares | added or replaced; must happen **before** anything reads it               |
| a `computed()` something has already read                                                         | throws; drive the signal the `computed()` reads instead                   |
| an `input()`                                                                                      | throws; use `setInputs` or `renderShallow`'s `inputs`                     |

A service usually publishes a read-only view of a private signal. That is written in place too:

```ts
export class CounterService {
  readonly #count = signal(0);
  readonly count = this.#count.asReadonly(); // mockSignalProp writes the private signal
}
```

Angular links a consumer to the signal it read, not to the property. Writing in place is what keeps
every `computed()`, `effect()` and binding that already read the signal up to date. A signal written in
place has nothing for `restoreMockedProps()` to put back: the value stays where the spec left it. A
signal that was added or replaced is removed by `restoreMockedProps()` like any other patch.

**Common mistake:** `service.count.set(1)` on the spy. `Signal<T>` has no `set`, so it only compiles
with a cast. Use the handle `mockSignalProp` returns.

## Patching a property of a spy

The `mock*Prop` helpers accept the `Spy<T>` that `injectSpy` returns. The value is checked against
the member's own type, so a real signal fits a signal-valued member.

```ts
const playback = injectSpy(PlaybackStateService);

mockSignalProp(playback, 'navigationState', 'idle'); // a real, writable signal
mockReadonlyProp(playback, 'currentItem', signal(item));
```

For a signal-valued getter, prefer `mockSignalProp` over `gettersToSpyOn`. A spied getter returns
`undefined` until configured; a real signal keeps every `computed()` and `effect()` downstream
reactive.

## Running one effect on demand

`runEffect` runs one specific effect now. Use it when the effect's trigger was replaced with a
static signal, so it never becomes dirty on its own and `flushEffects()` would skip it.

```ts
import { signal } from '@angular/core';
import { mockReadonlyProp, runEffect } from 'vitest-auto-spy/angular';

mockReadonlyProp(component, 'state', signal(State.Selected));

runEffect(component.highlightEffect);

expect(component.icon()).toBe('starFilled');
```

- It runs the body with the current signal values and does not mark the effect clean. A later flush
  behaves as usual.
- It runs the previous run's cleanup first, where Angular runs it. This is how a spec checks an
  `onCleanup` callback:

```ts
runEffect(component.subscription); // the cleanup from the last run fires here

expect(component.unsubscribed).toBe(true);
```

- A destroyed effect (after `fixture.destroy()` or `effectRef.destroy()`) throws. Angular would never
  run it again, so a run there asserts something production cannot do. Move the call above the
  `destroy()`.

If a future Angular changes the internals `runEffect` reads, it throws and tells you to assert the
effect's **result** instead: set the signals it reads, `await stable(fixture)`, check what came out.
That shape is the more durable one anyway.

**Common mistake:** `vi.mock('@angular/core')` to replace `effect()`. It can work under the unit-test
builder, but only without object spread in the factory, and never with a relative path. See
[module mocks under the unit-test builder](/guides/angular-unit-test-builder#module-mocks-under-the-unit-test-builder).

## Counting recomputations and effect runs

`trackRecomputations` and `trackEffectRuns` count how often a `computed()` recomputes or an effect
runs. Use them to assert "this did not recompute", which a value check cannot show.

```ts
import { stable, trackEffectRuns, trackRecomputations } from 'vitest-auto-spy/angular';

const recomputed = trackRecomputations(component.total);
const synced = trackEffectRuns(component.syncEffect);

component.unrelatedFilter.set('open');
await stable(fixture);

expect(component.total()).toBe(42);
expect(recomputed.count).toBe(0);
expect(synced.count).toBe(0);
```

- Both return `{ count, stop() }`. `count` is live. `stop()` removes the tracking, and so do
  `restoreMockedProps()` and `setupAutoSpy()`.
- `trackRecomputations` counts computations, not reads. It takes a `computed()` or a
  `linkedSignal()`; a plain `signal()` throws and names the helper that fits.
- `trackEffectRuns` counts every run: a scheduler flush, a `stable(fixture)`, a `runEffect()`.

## Overriding a provider the component declares for itself

A provider in `@Component({ providers: [...] })` wins over the testing module's
`provideAutoSpy`. The component then gets the real service, and nothing reports it. Use
`overrideComponentProvider` to put the spy on the component itself:

```ts
import { TestBed } from '@angular/core/testing';
import { overrideAutoSpy, overrideComponentProvider } from 'vitest-auto-spy/angular';

// the component is created through a parent's template, so it is not in `imports`
const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService); // Spy<NavigationBuilderService>

// or, when the component is already in the testing module
TestBed.configureTestingModule({ imports: [CheckoutComponent] }).overrideProvider(
  PaymentMethodService,
  overrideAutoSpy(PaymentMethodService),
);
```

The symptom is far from the cause. In one reported case the real service's logger failed with
`TypeError: Cannot read properties of undefined (reading 'pipe')`, naming neither the component nor
the spy.

Which fix to use:

- `overrideComponentProvider(Component, Service)` when the spec wants a spy at the component level.
  It also adds the component to the testing module (as an import if standalone, as a declaration
  otherwise). `overrideProvider` alone does not reach a standalone component created through a
  parent's template.
- `TestBed.overrideComponent(X, { remove: { providers: [Service] } })` when the module already
  provides the spy and the component's own entry is in the way.
- `overrideProvider(X, overrideAutoSpy(X))` for a component already in the testing module.
  `overrideProvider(X, provideAutoSpy(X))` works too; `overrideAutoSpy` just says what it does and
  returns the spy.

On the next `TestBed.createComponent`, `overrideComponentProvider` checks that the component's
injector really returns the spy. See [Component provider overrides](/adapters/angular-overrides).

**Common mistake:** `TestBed.overrideComponent` to change other metadata here. It forces a JIT
recompile, and in an AOT test bundle the recompiled component loses its directives and pipes; see
[an NgModule that contributes nothing](/adapters/angular-troubleshooting#an-ngmodule-that-contributes-nothing).

## A host for a directive under test

`createDirectiveHost` builds a standalone host component for a directive, with typed properties.

```ts
import { TestBed } from '@angular/core/testing';
import { createDirectiveHost } from 'vitest-auto-spy/angular';

const Host = createDirectiveHost({
  template: `<div [appTruncate]="enabled" [truncateText]="text"></div>`,
  scope: [DirectivesModule],
  props: { enabled: false, text: 'hello' },
});

TestBed.configureTestingModule({ imports: [Host] });

const fixture = TestBed.createComponent(Host);
fixture.componentInstance.enabled = true; // typed from `props`
```

| Option     | What it is                                                   |
| ---------- | ------------------------------------------------------------ |
| `template` | the host's template                                          |
| `scope`    | the host's own `imports`: the directive, or its `NgModule`   |
| `props`    | the host's properties; they type `fixture.componentInstance` |

The host is always standalone and carries the module in its own `imports`. That matters under the
unit-test builder: an `NgModule` in `TestBed.configureTestingModule({ imports })` contributes nothing
there, while one in `@Component({ imports })` works. A `standalone: false` host written in a spec is
worse: it compiles with no scope at all, not even `NgClass` or `AsyncPipe`.

On Angular 22.2 and newer, a directive that needs no static host attribute, no `TemplateRef` and no
sibling markup needs no host at all: `TestBed.createDirective(Dir, { tagName, bindings })` builds the
element. `stable`, `hostElement` and `toHaveDirectiveApplied` take its `DirectiveFixture`. `setInputs`
does not, since there is no `componentRef`: bind a signal with `inputBinding` and set the signal.

### `toHaveDirectiveApplied`

`toHaveDirectiveApplied` asserts that a directive really runs on an element.

```ts
import { registerDirectiveMatchers } from 'vitest-auto-spy/angular/matchers';

registerDirectiveMatchers(); // once, in the setup file

expect(fixture).toHaveDirectiveApplied(TruncateDirective, 'div');
```

Angular reports a directive that is out of scope badly: `NG0303` points at the correct `@NgModule`,
`NG0304` calls a directive a component, and a bare attribute directive reports nothing at all. The
matcher's failure names the cause and the fix.

- It takes a `ComponentFixture`, a `DirectiveFixture` or a `DebugElement`. Anything else throws.
- It searches the fixture's root element and everything under it. A `hostDirectives` entry of the
  component under test counts.
- A structural directive (`*dir`, `<ng-template dir>`) counts too. Assert it **without** a selector:
  the element it renders does not carry it.
- The fix it suggests depends on the fixture. For the component under test, add the directive to
  that component's `hostDirectives` or `imports`. For a host from `createDirectiveHost` or
  `TestBed.createDirective`, it points at `createDirectiveHost({ template, scope })`. If the directive
  is already in scope, it prints the directive's selector, since that is what matches nothing.
- `schemas: [NO_ERRORS_SCHEMA]` next to a standalone component does nothing; the failure says so.

Use it to guard an attribute a `hostDirectives` entry provides. An assertion on the attribute alone
stays green when the entry is dropped but the attribute is also written elsewhere:

```ts
const fixture = TestBed.createComponent(CardComponent); // hostDirectives: [TestIdDirective]

expect(fixture).toHaveDirectiveApplied(TestIdDirective); // no selector: the root element counts
expect(hostElement(fixture).getAttribute('data-testid')).toBe('card');
```

## `window` and `document` without losing the real one

`provideWindowDouble` and `provideDocumentDouble` override a few members of `window` or `document`
and keep the rest of the real jsdom object. Hand-written doubles know only the members their author
thought of, so a read of `screen.colorDepth` or a call to `document.createElement` gets `undefined`.

```ts
import { TestBed } from '@angular/core/testing';
import { provideDocumentDouble, provideWindowDouble } from 'vitest-auto-spy/angular/doubles';

TestBed.configureTestingModule({
  providers: [provideWindowDouble(WINDOW, { screen: { width: 1920, height: 1080 } }), provideDocumentDouble({ visibilityState: 'hidden' })],
});
```

| Call                                                                  | Does                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `provideWindowDouble(token, overrides?)`                              | a `FactoryProvider` under your app's window token                                  |
| `provideDocumentDouble(overrides?, token?)`                           | the same under Angular's `DOCUMENT`, or under a token of your own                  |
| `createWindowDouble(overrides?)` / `createDocumentDouble(overrides?)` | the same doubles without `TestBed`, for `new LayoutProbe(win)` or a plain function |

- **The window helper takes your token.** Angular has `DOCUMENT` but no `WINDOW`, so every app
  declares its own `InjectionToken<Window>`. The overrides are checked against the token's type.
- **A plain object merges; anything else replaces.** `{ screen: { width: 1920 } }` keeps
  `screen.colorDepth` real. A `vi.fn()`, an array, a `URL` or a class instance replaces the member
  whole. Merging goes three levels deep.
- **Nothing to restore.** The real `window` and `document` are never patched. The double is a view
  over them, and every write lands on the view. To change a value mid-test, use
  `Object.assign(TestBed.inject(WINDOW), { scrollY: 40 })` (lib.dom marks most members `readonly`).
- **A factory, not a `useValue`.** Every injector builds its own double, so one test's writes cannot
  reach the next.
- **Methods keep their `this`; constructors come back as they are.** `win.Date.now()`,
  `win.Promise.resolve()` and `new win.Event('resize')` work, and `win.Event === window.Event`, so
  `instanceof` checks hold.
- **`location` takes overrides like any member.**

```ts
const win = TestBed.inject(WINDOW); // provideWindowDouble(WINDOW, { location: { reload } })

win.location.href = '/checkout'; // moves the double, not the address bar
expect(reload).toHaveBeenCalled(); // location.origin is still jsdom's
```

`mockValueProp(win, 'innerWidth', 800)` works on the double too and does not touch the global.

To **replace** a global class, pass a [`mockConstructor`](/utilities/constructor-doubles) with the
statics the class declares. The type asks for them, because code like
`source.readyState === EventSource.OPEN` would otherwise compare with `undefined`:

```ts
import { createMock, mockConstructor } from 'vitest-auto-spy';

const FakeSource = Object.assign(
  mockConstructor((url: string | URL) => createMock<EventSource>({ url: String(url) })),
  { CONNECTING: 0, OPEN: 1, CLOSED: 2 } as const,
);

provideDocumentDouble({ defaultView: { EventSource: FakeSource } });
```

::: warning `provideDocumentDouble` reaches Angular's renderer too
The renderer injects `DOCUMENT` as well. Replacing `createElement` or `body` changes how the fixture
is built, not only what the component reads. Override those only when you mean to.
:::

## The Material dialog, without Material as a dependency

Three helpers replace the providers a dialog spec writes by hand: the data on `MAT_DIALOG_DATA`, a
`MatDialogRef` double, and a spy on `MatDialog`. The ref double has working `afterClosed()`, so a
component that subscribes to it does not fail.

```ts
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { expectEmission } from 'vitest-auto-spy/angular';
import { injectMatDialogRef, provideMatDialogData, provideMatDialogRef } from 'vitest-auto-spy/angular/doubles';

TestBed.configureTestingModule({
  providers: [provideMatDialogData<EditUserData>(MAT_DIALOG_DATA, { id: 7, name: 'Ada' }), provideMatDialogRef(MatDialogRef)],
});

const dialog = injectMatDialogRef(MatDialogRef);

TestBed.createComponent(EditUserDialog).componentInstance.save();

expect(dialog.close).toHaveBeenCalledWith('saved');
await expect(expectEmission(dialog.ref.afterClosed())).resolves.toBe('saved');
```

`@angular/material` is not a dependency of this package. You pass the token and the ref class as
arguments, so your spec stays the only place that imports Material.

| Call                                      | Does                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `provideMatDialogData(token, data)`       | a typed `{ provide, useValue }`; name the type argument and the data is checked against it               |
| `provideMatDialogRef(RefClass, init?)`    | a `FactoryProvider`, a fresh ref per injector; `init`: `closedWith`, `disableClose`, `componentInstance` |
| `injectMatDialogRef(RefClass, injector?)` | the handle: `.ref`, `.close` (the spy), `emitClose(result?)`                                             |
| `createMatDialogRef(RefClass, init?)`     | the same handle without `TestBed`, and the ref a spied `MatDialog.open()` returns                        |

### Opening one: `MatDialog` needs no helper of its own

`provideAutoSpy(MatDialog)` already spies `MatDialog`. Make its `open()` return a ref double seeded
with the result the user will choose:

```ts
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
import { createMatDialogRef } from 'vitest-auto-spy/angular/doubles';

TestBed.configureTestingModule({ providers: [provideAutoSpy(MatDialog)] });

injectSpy(MatDialog).open.mockReturnValue(createMatDialogRef(MatDialogRef, { closedWith: 'saved' }).ref);

fixture.componentInstance.edit(); // opens, pipes afterClosed(), gets 'saved'
```

What to know about the ref double:

- **`close` is the spy, and it is the function the ref carries.** `expect(dialog.close)` and
  `expect(TestBed.inject(MatDialogRef).close)` are the same assertion. `emitClose(result?)` closes it
  from outside, as the user would: the streams move and the spy records nothing. It is the only way
  to close with `undefined`, which is what a dismissal is.
- **`afterClosed()` replays its value**, unlike Material's plain `Subject`, so an assertion that
  subscribes after the component closed the dialog still gets it. `beforeClosed()` is the same
  stream, and `afterOpened()` has already emitted and completed.
- **Name the data type.** Material types `MAT_DIALOG_DATA` as `InjectionToken<any>`, so `useValue:
null` compiles for a component that reads `data.name`. `provideMatDialogData<EditUserData>(…)`
  checks the data. Keep the type argument even if `no-unsafe-argument` complains; dropping it turns
  the data back into `any`. Build the data per test, not in a module constant.
- **Name the ref type as a type argument**, not as an instantiation expression:
  `injectMatDialogRef<MatDialogRef<NameInputDialog, string>>(MatDialogRef)`. The form
  `injectMatDialogRef(MatDialogRef<NameInputDialog, string>)` comes back typed `any`. The same goes
  for `createMatDialogRef` and `provideMatDialogRef`.
- **Pass `componentInstance` when the opener drives the dialog.** It is checked against the dialog
  component the ref type names:

  ```ts
  const save = new EventEmitter<string>();
  const dialog = createMatDialogRef<MatDialogRef<NameInputDialog, string>>(MatDialogRef, {
    componentInstance: { save, isSaving: signal(false) },
  });

  injectSpy(MatDialog).open.mockReturnValue(dialog.ref);

  component.rename(); // subscribes to componentInstance.save
  save.emit('Grace');

  expect(dialog.close).toHaveBeenCalledWith('Grace');
  ```

- **Other members throw by name.** `backdropClick`, `keydownEvents`, `updateSize`, `updatePosition`,
  `getState`, `componentRef` and `id` belong to a real dialog: use `MatDialogModule` with a real
  `MatDialog` for those. A `componentInstance` nobody passed throws too and names the `init` field.

Other doubles Material's own specs write by hand (a `ScrollStrategy`, `MAT_ICON_LOCATION`,
`MATERIAL_ANIMATIONS`, `ScrollDispatcher`) need no helper; see
[Material idioms](/guides/angular-material-idioms).

## Platform, sanitizer, change detector and CDK overlay doubles

Four more providers from `vitest-auto-spy/angular/doubles` that large projects write by hand:

```ts
import { TestBed } from '@angular/core/testing';
import {
  provideChangeDetectorRefDouble,
  provideDomSanitizerDouble,
  provideOverlayDouble,
  providePlatform,
} from 'vitest-auto-spy/angular/doubles';

TestBed.configureTestingModule({
  providers: [
    providePlatform('server', { isBrowser: IS_BROWSER }), // PLATFORM_ID plus your own flag, in agreement
    provideDomSanitizerDouble(), // injectSpy(DomSanitizer): bypass spies return real safe values
    provideChangeDetectorRefDouble(), // injectSpy(ChangeDetectorRef): four spies answering undefined
    provideOverlayDouble(Overlay), // injectOverlayDouble(Overlay).lastRef().emitBackdropClick()
  ],
});
```

| Call                                                                           | Does                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `providePlatform('browser' \| 'server', { isBrowser?, isServer? })`            | `PLATFORM_ID`, plus your boolean tokens set so they cannot disagree with it           |
| `provideDomSanitizerDouble()` / `createDomSanitizerDouble()`                   | a `Spy<DomSanitizer>`; `injectSpy(DomSanitizer)` reads it                             |
| `provideChangeDetectorRefDouble()` / `createChangeDetectorRefDouble()`         | a `Spy<ChangeDetectorRef>`: `markForCheck`, `detach`, `detectChanges`, `reattach`     |
| `provideOverlayDouble(Overlay, init?)` / `createOverlayDouble(Overlay, init?)` | a CDK `Overlay` double; `init.componentInstance` is what `attach(…).instance` returns |
| `injectOverlayDouble(Overlay, injector?)`                                      | the handle of the double in the injector (`TestBed`'s unless you pass one)            |

- **Platform flags are your own tokens.** Angular has no `IS_PLATFORM_BROWSER`, so `providePlatform`
  takes yours and sets it from the platform name.
- **The sanitizer's `bypassSecurityTrust*` spies return Angular's real safe values**, so a template
  that binds them still renders. `sanitize` unwraps them and throws Angular's
  `Required a safe HTML, got a Style` on a wrong context. A plain string comes back unchanged; the
  double does not strip markup.
- **The `ChangeDetectorRef` provider reaches only what an environment injector builds**: a service,
  a pipe built with `TestBed.runInInjectionContext(() => new Pipe())`, or a class you pass
  `createChangeDetectorRefDouble()` to. A class the template creates gets its detector from its view.
  Its spies are marked as answering `undefined`, so `strict` accepts them unconfigured.
- **The overlay double is structural.** `@angular/cdk` is not a dependency, so you pass your own
  `Overlay` class. Each `create()` records a ref (`refs`, `lastRef()`). Every link of the
  `position()` chain returns the chain, and `positionCalls()` lists the calls. The four
  `scrollStrategies` are there. The streams stay silent until `emitBackdropClick()`,
  `emitKeydown(event)` or `emitOutsidePointer()`; `dispose()` completes them.

```ts
const overlay = injectOverlayDouble(Overlay);

component.openMenu();
overlay.lastRef().emitBackdropClick();

expect(overlay.lastRef().dispose).toHaveBeenCalled();
```

**Common mistakes:** `lastRef()` before anything opened an overlay throws
`nothing called Overlay.create() yet`. `injectOverlayDouble()` throws when a later provider replaced
the double; put `provideOverlayDouble(Overlay)` last.

## Where a spec spends its time

`enableTestBedDiagnostics` prints, for each spec file, how much time went into `TestBed` versus your
own code. Use it to find the specs worth converting to [`renderShallow`](#shallow-component-rendering).

```ts
// vitest.setup.ts
import { enableTestBedDiagnostics } from 'vitest-auto-spy/angular/diagnostics';

if (process.env['SPEC_TIMING']) {
  enableTestBedDiagnostics();
}
```

```text
[vitest-auto-spy] src/app/…/form-editor.component.spec.ts — TestBed 353ms of 661ms (53%), logic 308ms, 155 component(s), 132 module config(s)
```

`TestBed` time covers module configuration, template compilation and component creation.

| Option         | Default           | Meaning                                                    |
| -------------- | ----------------- | ---------------------------------------------------------- |
| `report`       | one line per file | receives the `SpecTiming` object; collect timings yourself |
| `minTestBedMs` | `0`               | stay quiet about files cheaper than this                   |

`disableTestBedDiagnostics()` puts the original `TestBed` back. `instrumentTestBed()`,
`getTestBedTiming()`, `formatSpecTiming()` and `reportSpecTiming()` are the building blocks, for a
project that wants the numbers without the per-file line. The clock is captured at import, so a spec
with `vi.useFakeTimers()` is still measured. The report goes to `process.stdout`, because
[`vitest-auto-spy/console`](/utilities/console) silences `console.info`.

## Zone and zoneless in the same run

`setupAngularTestEnv` picks zone.js or zoneless for each spec file. Use it while a repository moves
to zoneless one library at a time.

```ts
// vitest-setup.ts
import { setupZoneTestEnv, setupZonelessTestEnv } from 'jest-preset-angular/setup-env';
import { setupAngularTestEnv } from 'vitest-auto-spy/angular';

setupAngularTestEnv({
  zoneless: (testPath) => testPath.includes('/libs/catalog/') || testPath.includes('/apps/storefront/'),
  initZone: setupZoneTestEnv,
  initZoneless: setupZonelessTestEnv,
});
```

| Option         | What it is                                                |
| -------------- | --------------------------------------------------------- |
| `zoneless`     | a function from the spec file path to `true` for zoneless |
| `initZone`     | your initialiser for zone.js files                        |
| `initZoneless` | your initialiser for zoneless files                       |

Without it, under `isolate: false` the second file in the other mode fails with
`Cannot set base providers because it has already been called`. Vitest's `test.projects` does not
help: a worker can still get files of both modes.

When the next file needs the other mode, the helper tears the environment down and runs the other
initialiser. The mode is remembered per worker, so files in the same mode initialise once. If
something else tore the platform down meanwhile, it initialises again.

The initialisers stay yours: `@analogjs/vitest-angular`, `jest-preset-angular` or your own
`initTestEnvironment`. None of them is a dependency of this library.

## Troubleshooting

- A spec fails before your code runs, or with an error that does not mention your code:
  [Angular troubleshooting](/adapters/angular-troubleshooting).
- `ng test` specifics (what the builder compiles, `vi.mock`, coverage, shards, code splitting):
  [Angular unit-test builder](/guides/angular-unit-test-builder).
- Replacing providers a component declares, and checking the override applied:
  [Component provider overrides](/adapters/angular-overrides).
- Why a helper behaves the way it does: [How the Angular helpers work](/adapters/angular-how-it-works).
