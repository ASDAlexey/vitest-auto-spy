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
    provideAutoSpy(ApiService, { methodsToSpyOn: ['get', 'post'] }),
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

Angular tests typically spy a wide service but call only a couple of its methods per test, so
`provideAutoSpy` defaults to **lazy** spies: each method spy is built on first access instead of
eagerly up-front. On a wide service where a test touches two methods, spy assembly is roughly
**4× faster** (≈8× on a 20-method service) — the unused methods never pay the full spy-construction
cost. Everything else is unchanged: `Object.keys`, `vi.isMockFunction`, `calledWith`,
`resetAutoSpy` / `clearAutoSpy` all behave identically.

```ts
provideAutoSpy(WideService); // lazy — the fast default
provideAutoSpy(WideService, { lazySpies: false }); // opt out: build every spy eagerly
```

Only `provideAutoSpy` (the Angular entry) defaults to lazy; the framework-agnostic
`createSpyFromClass` still builds eagerly unless you pass `{ lazySpies: true }`.

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

| Spec (479 tests in the batch, all still green)     | Before | After  | Change   |
| --------------------------------------------------- | ------ | ------ | -------- |
| a container with a deep child tree (34 tests)      | 129 ms | 61 ms  | **2.1×** |
| a list rendering 58 fixtures                       | 133 ms | 75 ms  | **1.8×** |
| a small leaf component (20 tests)                  | 29 ms  | 38 ms  | **0.8×** |
| the three together                                 | 291 ms | 174 ms | **1.7×** |

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
specific effect to run *now* — typically because its trigger has been replaced with a static signal,
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
