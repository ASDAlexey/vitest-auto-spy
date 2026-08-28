---
title: Angular
description: provideAutoSpy, injectSpy, renderShallow, createWithAutoSpies, zoneless waiting and TestBed diagnostics — on Vitest and on bun test.
---

# Angular

The `vitest-auto-spy/angular` entry adds `provideAutoSpy` — a shorthand for providing an auto-spy
in a `TestBed` — plus `injectSpy`, shallow component rendering, DI-driven instantiation, zoneless
waiting, a signal matcher, `TestBed` diagnostics and the signal/readonly property mockers.

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [
    provideAutoSpy(MyService),
    // accepts the same second argument as createSpyFromClass
    provideAutoSpy(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }),
  ],
});

let myService: Spy<MyService>;

beforeEach(() => {
  myService = injectSpy(MyService);
});
```

The spies are change-detection agnostic, so they work in **both zoneless and zone.js** Angular
projects — nothing here touches `NgZone` or change detection. You still need the usual Vitest +
Angular wiring (`@analogjs/vite-plugin-angular` plus a TestBed setup file).

::: tip Running the same suite on Bun
`bun test` cannot run Angular specs out of the box — Bun ships no DOM and cannot resolve
`templateUrl`. [`vitest-auto-spy/bun-angular`](/runtimes/bun-angular) closes both from one preload
and re-exports everything on this page except `registerSignalMatchers` and the `TestBed`
diagnostics, which need the runner's `expect.extend` and suite-level hooks.
:::

## Lazy spies by default

Angular tests spy a wide service and call a couple of its methods, so a spy is built on first
access rather than eagerly up-front. Everything else is unchanged: `Object.keys`,
`vi.isMockFunction`, `calledWith`, `resetAutoSpy` / `clearAutoSpy` all behave identically, because
the placeholder is an enumerable accessor.

```ts
provideAutoSpy(WideService); // lazy — the default
provideAutoSpy(WideService, { lazySpies: false }); // opt out: build every spy eagerly
```

This is the **core default rather than something this entry adds** — `createSpyFromClass` behaves
the same. Until v2 only `provideAutoSpy` turned it on, which made the Angular path quietly faster
than the plain one for no reason anybody could see. What it buys, on a forty-method class with two
methods touched: [27 ms and 35 MB against 257 ms and 425 MB](../core/performance#memory-not-just-time).

### Is it fast enough to call in every `beforeEach`?

Yes, and it is the fastest of the three ways to build a double. Measured on the repo's own
benchmark (`npm run bench`, a ten-method class):

| Call                                          |     ops/sec | per call |
| --------------------------------------------- | ----------: | -------: |
| `provideAutoSpy(Service)` — lazy, the default | **118 900** |    ~8 µs |
| `createSpyFromClass(Service)` — eager         |      34 600 |   ~29 µs |
| `createAutoMock<Service>()` + 4 accesses      |      30 600 |   ~33 µs |

The gap is `lazySpies`, which `provideAutoSpy` turns on and the plain factory does not: a wide
service where a test touches two methods builds two spies instead of twenty. Prototype discovery is
cached per class, so calling it once per test does not re-walk the chain.

At ~8 µs, five providers across two thousand tests come to under a tenth of a second for the whole
suite. If a spec feels slow, the time is in `TestBed` — which is what
[`enableTestBedDiagnostics()`](#where-a-spec-spends-its-time) measures, and usually what
[`renderShallow`](#shallow-component-rendering) fixes.

Two things do cost more, and both are avoidable:

- **`{ lazySpies: false }`** gives up the win above. Only worth it when a spec enumerates the spy
  object itself rather than calling methods on it.
- **`autoSpyAccessors: true`** walks the prototype chain for getters and setters on every call, and
  that walk is not cached. Name the accessors you need instead when a class is spied per test.

## Shallow component rendering

`renderShallow` is the standard `TestBed` sequence a component-heavy suite ends up copy-pasting —
`configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent` with emptied `imports` and a
blank template — given a name:

```ts
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService), provideHttpClient()],
  inputs: { projectId: 42 }, // set through componentRef.setInput, before the first CD
});
```

| Option          | Default | What it does                                                                                                                    |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `providers`     | `[]`    | Providers for the testing module. `EnvironmentProviders` (`provideHttpClient()`, …) welcome                                     |
| `imports`       | `[]`    | Extra imports for the testing module (a stub module, a routing harness)                                                         |
| `inputs`        | —       | Values for the component's inputs — signal inputs take the **value**, not the signal                                            |
| `keepTemplate`  | `false` | Keep the real template (for `viewChild`, content projection, host bindings)                                                     |
| `keepChildren`  | `[]`    | Child components/directives/pipes that stay resolvable; everything else is dropped                                              |
| `template`      | `''`    | A stand-in template to render instead of a blank one                                                                            |
| `beforeCreate`  | —       | Runs after the module is configured, before the component exists — the seam for stubbing a dependency a field initializer reads |
| `detectChanges` | `true`  | Run the first change detection, and therefore `ngOnInit`                                                                        |

`fixture` is a real `ComponentFixture`; nothing here replaces `@angular/core/testing`. Blanking the
template keeps lifecycle hooks, inputs, signals and DI — everything a spec that asserts on
TypeScript state actually reads.

### What it saves, measured

On a private Angular 22 zoneless suite (784 specs, the AOT `@angular/build:unit-test` builder), three
of its most expensive component specs were converted and the ten-file batch re-run three times —
medians, same batch, same machine:

| Spec (479 tests in the batch, all still green) | Before | After  | Change   |
| ---------------------------------------------- | ------ | ------ | -------- |
| a container with a deep child tree (34 tests)  | 129 ms | 61 ms  | **2.1×** |
| a list rendering 58 fixtures                   | 133 ms | 75 ms  | **1.8×** |
| a small leaf component (20 tests)              | 29 ms  | 38 ms  | **0.8×** |
| the three together                             | 291 ms | 174 ms | **1.7×** |

The third row is the honest half of the result: a leaf component has almost no subtree to remove, so
the per-test `overrideComponent` costs more than it saves. **Shallow rendering pays where there is a
real child tree to skip.** Use [the diagnostics](#where-a-spec-spends-its-time) to find the files
worth converting rather than guessing.

## Building a class with auto-spied dependencies

The alternative a project writes by hand is a `providers` array listing each dependency with a
`useValue` object of `vi.fn()`s, rewritten whenever a dependency is added. Here the injector itself
answers an unknown token with a spy, so the spec names only what it wants to control:

```ts
import { createWithAutoSpies } from 'vitest-auto-spy/angular';

const { instance, spies, injector } = createWithAutoSpies(CartService, {
  providers: [{ provide: TaxService, useValue: realTax }], // explicit providers win
});

spies.get(PricingService).total.mockReturnValue(100);
expect(instance.checkout()).toBe(100);
```

The class is built through its own Angular factory, so constructor parameters **and** `inject()`
field initializers resolve normally. An unprovided token gets a `createSpyFromClass` spy (a class)
or a `createAutoMock` proxy (an `InjectionToken`); `inject(X, { optional: true })` still returns
`null`, exactly as it would in the app. `spies.get(token)` resolves through the same injector the
instance used — so it returns the explicit provider when there is one — and `spies.autoSpiedTokens()`
lists what was invented.

::: warning Plain providers only
This builds an `Injector.create()` injector, which does not accept the `EnvironmentProviders`
returned by `provideHttpClient()` and friends. A class that needs those belongs in a `TestBed` —
[`renderShallow`](#shallow-component-rendering), or a plain `configureTestingModule`.
:::

## Zoneless waiting

```ts
import { flushEffects, stable } from 'vitest-auto-spy/angular';

component.filter.set('open');
await stable(fixture); // flush effects, then await the fixture
expect(component.visible()).toEqual([openTask]);

flushEffects(); // the no-fixture half: services, stores, runInInjectionContext code
```

`fixture.detectChanges()` runs a single change-detection pass and does **not** flush pending
effects, so an assertion right after it reads state that has not finished computing. In a zoneless
app the state that matters is signal-derived and effects are what move it forward. `stable` does
both, in the right order; `flushEffects` prefers `TestBed.tick()` (Angular ≥ 20) and falls back to
`ApplicationRef.tick()`.

## Running one effect on demand

`flushEffects()` asks the scheduler to run everything currently dirty. Sometimes a spec needs one
specific effect to run _now_ — typically because its trigger has been replaced with a static signal,
so it will never become dirty on its own:

```ts
import { mockReadonlyProp, runEffect } from 'vitest-auto-spy/angular';

mockReadonlyProp(component, 'state', signal(State.Selected));

runEffect(component.highlightEffect);

expect(component.icon()).toBe('starFilled');
```

`runEffect` runs the body with the signal values as they stand, cleanup registration intact, without
marking the effect clean — a later flush still behaves normally.

::: warning Do not reach for `vi.mock('@angular/core')` instead
The instinct is to replace `effect()` with the identity function so the callback becomes something
the spec holds. Under the Angular unit-test builder that is not available: specs are bundled,
`@angular/core` lands in a chunk other chunks already depend on, and substituting it re-enters that
chunk mid-initialisation. The run dies with `Cannot access '__vi_import_N__' before initialization`,
which says nothing about mocking. The same applies to `vi.mock()` with a relative path — once
bundled there is no module boundary left to replace.
:::

It reads Angular's reactive node off the `EffectRef`, so it is tied to an internal-by-convention
detail. If a future Angular moves the effect body, `runEffect` throws with a message saying to assert
the effect's **result** instead — set the signals it reads, `await stable(fixture)`, check what came
out. That is the more durable shape wherever it is practical.

## Asserting a signal

```ts
import { registerSignalMatchers } from 'vitest-auto-spy/angular';

registerSignalMatchers(); // once, in your setup file

expect(component.total).toHaveSignalValue(3);
expect(component.items).toHaveSignalValue([{ id: 1 }]);
```

`expect(component.total).toBeTruthy()` passes for every signal ever created — a signal is a
function. The matcher reads it, deep-compares with the runner's own equality, and rejects anything
that is not a zero-argument getter, so the missing-parentheses mistake fails instead of quietly
passing.

## Signal / readonly property mocking

```ts
import { mockAccessorsProp, mockReadonlyProp, mockReadonlyPropGetter, mockValueProp, restoreMockedProps } from 'vitest-auto-spy/angular';

mockReadonlyProp(service, 'isReady', true); // static value (incl. signals)
mockReadonlyPropGetter(service, 'label', () => 'A'); // dynamic getter
mockValueProp(service, 'retries', 3); // plain writable value
mockAccessorsProp(service, 'theme'); // spied get + set
```

Every helper records the descriptor it overwrote, so a single `restoreMockedProps()` puts them all
back — and each one also returns the undo for _its own_ patch, for a stub that has to come off
inside a single test. That matters when the patched object outlives the spec file (a global, a
class prototype, a singleton), which is always the case under Vitest's `isolate: false`:
[`setupAutoSpy()`](../utilities/setup) wires the `afterEach` for you.

Nothing about these helpers is Angular-specific: they are exported from the **core** entry too, and
`vitest-auto-spy/angular` keeps re-exporting them unchanged. `countMockedProps()` reports how many
patches are still applied.

### Driving a signal

`createSpyFromClass` walks the prototype, and a `signal()` / `computed()` field is not there — it is
assigned on the instance. Listing it in `methodsToSpyOn` does not help either: that makes it a
function spy, and a function spy answers `undefined` until configured, so a component reading
`service.count()` gets nothing where it expects a value.

What a spec wants is the signal real and writable, so the component reacts the way it does in the
application. That is the two-line pair every suite ends up writing — a writable handle for the test,
a readonly one for the service:

```ts
const count = signal(0);
mockReadonlyProp(service, 'count', count);
```

`mockSignalProp` is that pair with the handle returned rather than declared:

```ts
import { mockSignalProp } from 'vitest-auto-spy/angular';

const service = injectSpy(CounterService);
const count = mockSignalProp(service, 'count', 0);

expect(component.label()).toBe('0 items');

count.set(42);
await fixture.whenStable();

expect(component.label()).toBe('42 items');
```

The signal comes from `@angular/core`, so reactivity is genuine: a `computed()` downstream
recomputes, an `effect()` runs, a template binding updates. A stand-in with a `set` method would
satisfy `service.count()` and silently notify nothing — the failure this helper exists to avoid
rather than cause.

Returning the handle also removes the temptation to reach for `service.count` and call `.set` on
it: `Signal<T>` has no `set`, so that only type-checks after an assertion.

## Where a spec spends its time

```ts
// vitest.setup.ts
import { enableTestBedDiagnostics } from 'vitest-auto-spy/angular';

if (process.env['SPEC_TIMING']) {
  enableTestBedDiagnostics();
}
```

```
[vitest-auto-spy] src/app/…/layer-editor.component.spec.ts — TestBed 353ms of 661ms (53%), logic 308ms, 155 component(s), 132 module config(s)
```

One line per spec file: how much of its wall clock went into `TestBed` (module configuration,
template compilation, component creation) versus plain logic, and how many components it created.
That is the list of rewrite candidates, and the number that says whether a rewrite helped.

| Option         | Default           | Notes                                                           |
| -------------- | ----------------- | --------------------------------------------------------------- |
| `report`       | one line per file | Receives the `SpecTiming` object — collect the timings yourself |
| `minTestBedMs` | `0`               | Stay quiet about files cheaper than this                        |

`disableTestBedDiagnostics()` puts the untouched `TestBed` back; `instrumentTestBed()`,
`getTestBedTiming()`, `formatSpecTiming()` and `reportSpecTiming()` are the pieces underneath, for
a suite that wants the numbers without the per-file line. The clock is
captured at import time, so a spec using `vi.useFakeTimers()` is still measured honestly rather
than reported as free, and the report goes to `process.stdout` — not `console.info`, which
[`vitest-auto-spy/console`](../utilities/console) replaces with a silent mock.

## Overriding a provider the component declares for itself

`provideAutoSpy` registers on the testing module, and a testing-module provider **loses** to one the
component declares in its own `@Component({ providers: [...] })` — route-scoped services,
per-component stores, `provideX()` helpers. Nothing reports the loss: the spec configures a spy, the
component keeps the real service, and the assertion fails two steps away from the cause.

```ts
import { overrideAutoSpy, overrideComponentProvider } from 'vitest-auto-spy/angular';

// the component is instantiated through a parent's template, so it is not in `imports` yet
const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService); // → Spy<NavigationBuilderService>

// or, when the component is already in the testing module
TestBed.configureTestingModule({ imports: [CheckoutComponent] }).overrideProvider(PaymentMethodService, overrideAutoSpy(PaymentMethodService));
```

Two silent failures this removes.

`overrideProvider(X, provideAutoSpy(X))` passes a **provider** where `{ useValue }` is expected.
There is no error and no warning — the spy is simply not connected, and the test runs on the real
service. `overrideAutoSpy` returns the right shape by construction.

`overrideProvider` only reaches a component the TestBed compiler knows about. A standalone component
instantiated through a parent's template is not in the testing module's `imports`, so the override
never applies to it, and finding that out means knowing how `TestBedCompiler.queueType` works.
`overrideComponentProvider` queues the component — as an import when it is standalone, as a
declaration otherwise.

Do **not** reach for `TestBed.overrideComponent` here. It forces a JIT recompilation, and under an
AOT test bundle that recompilation resolves the component's directives and pipes from a runtime
scope the bundler has stripped, leaving it with none of them — see the next section.

## An NgModule that contributes nothing

Under an AOT test bundle — what `@angular/build:unit-test` produces, and what a Jest suite moving to
the native builder starts getting — `ɵɵsetNgModuleScope` is stripped, because only the TestBed reads
it. Every NgModule then has an empty `ɵmod.declarations` / `ɵmod.exports` at runtime.

Nothing notices while AOT is in charge: the flat dependency list is already baked into each `ɵcmp`.
But the moment the TestBed resolves a scope itself — through `imports: [SomeModule]`, or through a
JIT recompilation after `overrideComponent` — it resolves it from nothing, and reports that in four
different ways, none of which mentions the module:

```
NG0303: Can't bind to 'appTruncate' since it isn't a known property of 'div'
NG0301: Export of name 'focusable' not found!
NG0304: 'ui-smart-row' is not a known element
(nothing at all — an attribute directive simply never instantiates)
```

```ts
import { assertNgModuleScopes } from 'vitest-auto-spy/angular';

assertNgModuleScopes(DirectivesModule, PipesModule);
TestBed.configureTestingModule({ imports: [DirectivesModule, PipesModule] });
```

The error names the module and the cause, and the fix is to declare what the spec needs in the
TestBed module directly. Pass only modules you import **for their declarations** — a providers-only
module is legitimately empty and would be reported as a false positive.

## Focus assertions

```ts
import { registerFocusMatchers } from 'vitest-auto-spy/setup';

registerFocusMatchers(); // once, in the setup file

expect(fixture.nativeElement.querySelector('.play')).toHaveFocus();
```

Focus tests are written in one of two shapes and both report nothing useful.
`expect(document.activeElement).toBe(button)` prints two enormous DOM dumps with no visible
difference; `expect(activeFocus() === getElement(row)).toEqual(value)` collapses the comparison to a
boolean before `expect` ever sees it, and fails with `expected false to deeply equal true` — a
message compatible with every possible cause.

The three causes worth telling apart are: the expected element does not exist at all (by far the most
frequent), focus is still on `<body>` because nothing claimed it, and focus is on a different
element. `toHaveFocus` names which of the three happened and describes both nodes by tag, id and
class rather than by dumping their subtrees.

## `injectSpy` and tokens

`injectSpy` takes an `InjectionToken` as well as a class, which matters in a codebase where half the
dependencies live behind one (`LIST_DATA_PROVIDER_TOKEN`, `ROOT_MEDIA_ELEMENT`).

For a **generic** class, name the type argument. `TestBed.inject` infers `Service<any>` from the
constructor rather than the declared default, and the `any` then surfaces much later as a mismatch
between `AddPromiseSpyMethods<unknown>` and `WithMockReturnValue<…>` — eight levels deep, with
nothing in the message about type parameters:

```ts
const config = injectSpy<FeatureFlagService>(FeatureFlagService);
```

## Zone and zoneless in the same run

```ts
// vitest-setup.ts
import { setupAngularTestEnv } from 'vitest-auto-spy/angular';
import { setupZoneTestEnv, setupZonelessTestEnv } from 'jest-preset-angular/setup-env';

setupAngularTestEnv({
  zoneless: (testPath) => testPath.includes('/libs/music/') || testPath.includes('/apps/kion-top/'),
  initZone: setupZoneTestEnv,
  initZoneless: setupZonelessTestEnv,
});
```

`TestBed.initTestEnvironment` may be called once per platform, and under `isolate: false` the
platform lives for the whole worker. A repository migrating to zoneless gradually — a few libraries
switched, the rest still on zone.js — therefore cannot express itself in setup files at all: the
second file the worker picks up in the other mode fails with `Cannot set base providers because it
has already been called`, and the message names neither file.

Vitest's own answer, `test.projects`, does not solve it either. Nothing promises that a worker serves
files of one project, and a worker handed a file of the other mode fails exactly the same way.

What works is to decide the mode from the file about to run and, when it differs from the one
installed, tear the environment down before initialising the other. The mode is remembered per
worker, so a run of files in the same mode pays for one initialisation and no resets.

The initialisers stay yours: which platform, which providers and which `teardown` policy a project
wants is not something this library should decide, and the packages that supply them
(`@analogjs/vitest-angular`, `jest-preset-angular`, a hand-written `initTestEnvironment`) are not
dependencies of it.

## A host for a directive under test

```ts
import { createDirectiveHost, registerDirectiveMatchers } from 'vitest-auto-spy/angular';

const Host = createDirectiveHost({
  template: `<div [appTruncate]="enabled" [truncateText]="text"></div>`,
  scope: [DirectivesModule],
  props: { enabled: false, text: 'hello' },
});

TestBed.configureTestingModule({ imports: [Host] });

const fixture = TestBed.createComponent(Host);
fixture.componentInstance.enabled = true; // typed from `props`
```

Under the native builder the two halves of Angular disagree about where `imports` is resolved, and
the same line is alive in one place and dead in the other:

| Where                                   | Resolved by                          | An `NgModule` there                          |
| --------------------------------------- | ------------------------------------ | -------------------------------------------- |
| `@Component({ imports })`               | the AOT compiler, at build time      | **works** — the flat list is baked into `ɵcmp` |
| `TestBed.configureTestingModule({ imports })` | `TestBedCompiler`, at runtime, from `ɵmod` | **contributes nothing** — `ɵɵsetNgModuleScope` is not emitted into a test bundle |

So the host must be **standalone** and must carry the module in its *own* `imports`. A host written
`standalone: false` inside a spec is worse still: it is compiled outside any scope at all, with no
`NgClass`, no `AsyncPipe`, nothing. `createDirectiveHost` is that knowledge applied — the host is
always standalone, `scope` becomes the component's imports, and `props` types
`fixture.componentInstance`.

### `toHaveDirectiveApplied`

```ts
registerDirectiveMatchers(); // once, in the setup file

expect(fixture).toHaveDirectiveApplied(TruncateDirective, 'div');
```

Angular reports a directive that is out of scope in three different wrong ways: `NG0303` sends the
reader to the `@NgModule` where the directive *is* correctly declared; `NG0304` reports an absent
**directive** as an absent **component**; and a directive used as a bare attribute, with no binding,
reports *nothing at all* — a green test asserting on a directive that never ran.

The matcher asserts the fact, and its failure names the cause and the fix, including the one that
looks like a fix and is not: `schemas: [NO_ERRORS_SCHEMA]` applies to a testing module's
`declarations` and never to a standalone component, so next to a standalone component it is a dead
entry that reads as if something were deliberately silenced.

## Patching a property of a spy

```ts
const epg = injectSpy(ScheduleStateService);

mockSignalProp(epg, 'navigationState', 'idle'); // a real, writable signal
mockReadonlyProp(epg, 'playingChannel', signal(channel));
```

The `mock*Prop` helpers accept the `Spy<T>` that `injectSpy` / `asSpy` returns, and check the value
against the member's **own** type rather than the spy-decorated one. Without that, a signal-valued
member on a spy is typed `Signal<T> & Mock & …`, no real signal can be written into it, and the spec
has to keep the instance under a second name purely to patch it.

For a signal-valued getter prefer `mockSignalProp` over `gettersToSpyOn`: a spied getter returns
`undefined` until it is configured, while a real signal keeps every `computed()` and `effect()`
downstream of it reactive.

## A dependency behind an `InjectionToken`

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpyForToken(PASSCODE_SERVICE_TOKEN)] });

const passcode = injectSpy(PASSCODE_SERVICE_TOKEN); // Spy<PasscodeService>
```

A token typed with an *interface* has no class to read, which is where the usual workaround comes
from: a `PasscodeServiceMock` written in the spec, spied, and provided — after which `Spy<Mock>` and
`Spy<PasscodeService>` disagree about `calledWith` and somebody reaches for an assertion (or, more
often, `TestBed.inject<any>(TOKEN)` with an `eslint-disable` at the top of the file).
`provideAutoSpyForToken` reads the type off the token; `injectSpy` already accepts one.

## `injectSpy` says when it got the real thing

```text
[vitest-auto-spy] injectSpy(DeviceRegistryService): the injector returned a plain instance, not an
auto-spy. Register it with provideAutoSpy(DeviceRegistryService) …
```

A provider the spec forgot to register is otherwise found much later — when `.mockReturnValue(…)` is
called on the real method, or, if the class has no private members to make the types disagree, never.
The warning is printed once per token.
