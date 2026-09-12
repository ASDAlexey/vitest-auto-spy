---
title: Angular
description: provideAutoSpy, injectSpy, extendWithAutoSpies, renderShallow, createWithAutoSpies, zoneless waiting and TestBed diagnostics — on Vitest and on bun test.
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

## Fixtures instead of `let` + `beforeEach` — `extendWithAutoSpies`

Vitest 4.1 infers a fixture's type from its factory, which makes the block above one statement with
no type written twice and no `let` that is `undefined` between tests:

```ts
import { test as base } from 'vitest';
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

test('does not build what it does not name', ({ api }) => {
  // `cart` and `passcode` are never constructed for this test.
  api.get.mockReturnValue(of([]));
});
```

Each entry is a class, a `[Class, config]` pair taking whatever `provideAutoSpy` takes, or an
`InjectionToken` — built from the token's own type, exactly as `provideAutoSpyForToken` does.
Anything else the module needs goes in the third argument and is registered in the same call, after
the generated providers, so a token named there wins:

```ts
const test = extendWithAutoSpies(base, { cart: CartService }, { providers: [provideHttpClient(), CartComponent] });
```

A fixture whose token that list names — `{ provide: CartService, useValue: real }` or a bare class —
resolves to what the list provides, read with `TestBed.inject` rather than `injectSpy`: keeping a real
service is a decision, not a misconfiguration, so it stays quiet under `misconfiguration: 'throw'` and
`preset: 'strict'` too.

::: info Why the whole map at once, rather than a chain of `.extend`s
This is a `TestBed` rule, not a typing limitation. Fixtures resolve lazily and independently, so in
`base.extend('cart', …).extend('api', …)` the `cart` fixture would configure the testing module
**and** inject — instantiating it — and `api` would then reach `configureTestingModule` after
instantiation and fail with Angular's own _"Cannot configure the test module when the test module has
already been instantiated"_. Every provider has to be known before the first injection.
:::

A `beforeEach` that configures the module further still composes: it runs before any fixture
resolves, and repeated `configureTestingModule` calls merge right up until the first injection. A
`beforeEach` that **injects** does not, and nothing can repair that from here — by then Angular has
already made the decision.

::: warning Needs Vitest 4.1
The builder form of `test.extend` is what infers the types. On an older Vitest the call throws at
once — `extendWithAutoSpies needs Vitest 4.1 or newer` — rather than letting the older `extend` take
the string, register fixtures named `"0"`, `"1"`, … and hand every test `undefined`. There is no
version to ask, so the check reads the arity of `extend`: one parameter through 4.0, three from 4.1.
Until the upgrade, keep the `let` + `beforeEach` form at the top of this page — everything else on
it works unchanged.
:::

## An `abstract class` DI token

`abstract class LocalStorage extends AbstractStorage {}`, provided in production as
`{ provide: LocalStorage, useClass: BrowserLocalStorage }`, is the standard way to declare a
DI token in an Angular codebase — and it used to be the one shape `provideAutoSpy` could not serve.
It failed twice over: the bare call compiled and produced an empty double, while the config form
that would fix it did not compile at all (`TS2345: Cannot assign an abstract constructor type to a
non-abstract constructor type`).

Both halves work now.

```ts
abstract class LocalStorage extends AbstractStorage {
  abstract read(key: string): string | null;
  abstract write(key: string, value: string): void;
}

TestBed.configureTestingModule({ providers: [provideAutoSpy(LocalStorage)] });

const storage = injectSpy(LocalStorage);

storage.read.calledWith('token').mockReturnValue('abc');
```

`ClassType<T>` now carries an **abstract** construct signature — nothing in this library ever calls
`new` on the token, so requiring a concrete one bought no safety. At runtime the abstract members
are erased before they reach a prototype, so there is nothing to discover; when discovery comes back
empty the factory hands back the `createAutoMock` proxy, which answers every method of the declared
type. `injectSpy` recognises it as an auto-spy and stays quiet, and the hand-written workaround —
`{ provide: LocalStorage, useValue: createAutoMock<LocalStorage>() }` — is no longer needed.

One concrete member changes that, and it is worth knowing which side of the line a token is on:

```ts
abstract class LocalStorage {
  abstract read(key: string): string | null;
  clear(): void {} // discovery is no longer empty, so the fallback does not fire
}

const storage = injectSpy(LocalStorage);

storage.clear; // a spy
storage.read; // undefined — and `Spy<T>` says it is there
```

`abstract read()` is erased before it reaches a prototype, so only `clear` is discovered and the
abstract members are simply absent — the call then dies as `storage.read is not a function` inside
the component, not in the spec. Nothing can detect it automatically: TypeScript erases `abstract`,
so at runtime this class and a concrete one are the same object. Ask for it:

```ts
providers: [provideAutoSpy(LocalStorage, { fillMissing: true })];
```

See [`fillMissing`](../core/create-spy-from-class#fill-missing) for what it
does and does not fill.

## Seeding the double in the provider

Both factories take both halves: `returns` for what a spied **method** answers, `overrides` for a
member that is not a method result — an Observable property, a plain field, a signal.

```ts
provideAutoSpy(FavoritesService, {
  returns: { load: of([]) },
  overrides: { favoritesCacheUpdated$: of(undefined), favoriteItems: [] },
});

provideAutoSpyForToken(PRODUCTS, undefined, { returns: { getProducts: of([]), getById: of(null) } });
```

Until 3.5.0 the two helpers had one half each — `provideAutoSpyForToken` took property seeds,
`provideAutoSpy` took method configuration — so a double needing both was provided in one statement
and finished in another, in a `beforeEach` below it.

A seeded `overrides` member is stored **verbatim and is no longer a spy**, which is the line between
the two: seed data there, and name a method in `returns` when it must stay assertable. The reason to
prefer either over a second statement is not brevity — the shortcut people take instead is an
exported `const` provider carrying the values, and under `isolate: false` that is one set of spies
shared by every file that imports it.

### Observable properties behind a token

`observablePropsToSpyOn` is the third option both forms now share, and it matters more on the token
path than on the class one. A class tells the factory which members are methods; a type does not, so
every unnamed key of a token-driven double is a **function** spy — an `Observable` property included,
which the code under test then subscribes to as if it were a function, with the failure surfacing
far from the double.

```ts
provideAutoSpyForToken(FAVORITES, undefined, { observablePropsToSpyOn: ['favorites$'] });
// …
injectSpy(FAVORITES).favorites$.nextWith([{ id: 1 }]);
```

A member also named in `overrides` keeps its seed — hand the double a real `Subject` there when the
spec drives the stream itself, and name it here when `nextWith` is what the spec wants; the class
factory resolves the same contradiction the same way. Until 3.5.0 the option existed only on the
class path, so a token with observable members sent people back to a hand-written double — which is
what `prefer-provide-auto-spy` and `prefer-create-spy-from-class` exist to steer them away from.

## Do not write a local `injectSpy`

A wrapper of the shape `TestBed.inject(token as never) as Spy<T>`, typed
`<T>(token: abstract new (...args: never[]) => T)`, is a common thing to find already in a
repository. The library's is strictly wider: it accepts a `ClassType<T>`, an `InjectionToken<T>` and
an abstract constructor, warns when the injector returns something that is not a spy, and carries no
type assertion for the project's lint rules to argue with. Two functions with the same name and
different signatures means the import order in each file decides which one it gets — delete the
local one, or re-export this one under that name.

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

Yes, and the choice between the three barely registers — all of them are a couple of microseconds.
Measured on the same ten-method case the core benchmark uses (`bench/auto-spy.bench.ts`: a class
with ten methods, two of them called):

| Call                                                        | per call (p75) |
| ----------------------------------------------------------- | -------------: |
| `provideAutoSpy(Service)` — lazy, the default               |     **2.1 µs** |
| `createSpyFromClass(Service, { lazySpies: false })` — eager |         2.8 µs |
| `createAutoMock<Service>()` + 4 accesses                    |         1.5 µs |

Measured 2026-09-06 on Node v24.19.0, Vitest 5.0.0, Angular 22.1.5, Apple M4 Max — the median `p75`
of five runs, which disagreed by at most 0.1 µs. The published figure is `p75` and not ops/sec for
the reason [Performance](../core/performance#measured) gives: these cases allocate by the hundred
thousand, so a GC pause moves `hz` several-fold between runs while `p75` stays put.

`createAutoMock` is the quickest of the three, and this page's own advice still does not point at
it: it is a `Proxy` over a type with no class to read, so it skips the prototype walk the other two
pay for — and gives up the thing that walk buys, a double that fails when the real class loses a
method. The two rows built from a class are the ones worth choosing between.

The gap is `lazySpies`: the first row runs at its default, the second has it switched off, and a wide
service where a test touches two methods builds two spies instead of twenty. `provideAutoSpy` adds
nothing here — it inherits the core default, which is lazy. Prototype discovery is
cached per class, so calling it once per test does not re-walk the chain.

At ~2 µs, five providers across two thousand tests come to about two hundredths of a second for the
whole suite. If a spec feels slow, the time is in `TestBed` — which is what
[`enableTestBedDiagnostics()`](#where-a-spec-spends-its-time) measures, and usually what
[`renderShallow`](#shallow-component-rendering) fixes.

Three things do cost more, and all three are avoidable:

- **`{ lazySpies: 'proxy' }`** keeps the laziness and drops the per-method placeholder, which is
  nearly all of what an untouched wide double retains — 11.8 kB against 101.6 kB on a 400-method
  generated client. Opt-in: it taxes every read by ~30 ns forever and loses below ~20 methods. See
  [Performance](/core/performance#where-the-remaining-memory-is-and-lazyspies-proxy).
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

### Changing an input mid-test

`inputs` covers the first values a component is given. Everything after it is the two lines a spec
writes by hand — one `componentRef.setInput` per name, then a wait, because a zoneless fixture
recomputes nothing until something asks it to. `setInputs` is that pair:

```ts
import { setInputs } from 'vitest-auto-spy/angular';

await setInputs(fixture, { projectId: 7, filter: 'open' });
expect(component.visible()).toEqual([openTask]);
```

The wait is [`stable`](#zoneless-waiting), and the third argument is its options — `{ timeout, label }`
when a spec drives more than one fixture. Leaving it out is the failure this helper exists for: an
assertion placed straight after a bare `setInput` reads the state the **previous** value produced, and
the spec then fails on a number that was right one render ago.

The names are checked against the compiled definition before the first one is set, so a refused call
leaves the component exactly as it was. `componentRef.setInput` answers a name the component does not
declare with an `NG0303` on the console and no change at all — a typo, an input renamed since the
spec was written, or a plain field mistaken for an input all land there, and the assertion that
follows fails on state nothing moved. Either spelling of an aliased input works: the class field the
type is keyed by, or the public name Angular binds.

A `model()` is set here like any other input. Its **output** half emits when the component itself
moves the value, so subscribe before the call and await after it:

```ts
const emitted = expectEmission(component.total); // subscribed now, before anything moves

await setInputs(fixture, { step: 3 });

await expect(emitted).resolves.toBe(30); // the effect the new step started has already run
```

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

A spec that needs the real template is not excluded from this: `keepTemplate: true` still drops the
child components — while keeping the pipes and directives the template is written in — and still
measures 1.29× against the full cycle — see
[the middle rung](/core/performance#the-middle-rung-keeptemplate-true).

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

`spies.get(token)` **refuses a token the instance never asked for**, naming it and listing the ones
that were auto-spied. The injector at the bottom of the chain answers anything, so before this the
wrong token — a base class instead of the implementation, a service the class stopped injecting
after a refactor, `PricingService` where the class injects `PRICING_TOKEN` — silently minted a
second spy: `spies.get(X).m.mockReturnValue(…)` configured an object the instance had never seen,
and the assertion then failed on the real collaborator several frames into the code under test, or
passed while testing nothing at all. A token the instance asked for **optionally** and got `null`
for is refused for the same reason: there is no double behind it to configure.

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

### `autoDetect` is already on under zoneless

Older advice — including this page, until now — describes automatic change detection as something a
spec has to arrange. That is a zone-era description. Since Angular 19.0.0 the fixture's default is
conditional, and on `@angular/core@21.2.17` it reads:

```ts
// @angular/core/fesm2022/testing.mjs:164-167, rewrapped
autoDetectDefault = this.zonelessEnabled ? true : false;
autoDetect = inject(ComponentFixtureAutoDetect, { optional: true }) ?? this.autoDetectDefault;
```

So in a zoneless suite it is **on by default**: nothing has to provide `ComponentFixtureAutoDetect`,
and nothing has to call `autoDetectChanges()`. What is still the spec's job is _when_ — autoDetect
schedules the pass rather than running it at the point of the write, so an assertion on the line
after a signal write still reads the state from before it. `await stable(fixture)` is what puts the
pass and the effects in front of the assertion; another `detectChanges()` is not.

Two related deprecations in the same version, both pointing the same way:

| `@angular/core@21.2.17`                  |                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `autoDetectChanges(autoDetect: boolean)` | `@deprecated` at `types/testing.d.ts:112` — use the no-argument `autoDetectChanges()` at `:121` |
| `TestBed.flushEffects()`                 | `@deprecated` at `:498` in favour of `TestBed.tick()` at `:506`                                 |

`flushEffects()` from this package already prefers `TestBed.tick()` and falls back to
`ApplicationRef.tick()` only for Angular < 20, so a suite using it is on the surviving call already.

### The wait is bounded

`stable` gives the fixture **2000 ms** and then throws the cause. A fixture that never stabilises —
a real `HttpClient` request nothing completed, a `PendingTasks` entry nothing released, a
`setInterval` running under real timers — used to hang here until Vitest reported a 5 s _file-level_
timeout naming neither the helper nor the fixture, which blames the file for the state of one
component.

One shape that was reported as a deadlock and is not: a pending `HttpClient` request under
`provideHttpClientTesting`. Re-checked on Angular 21.2.17 — the testing backend answers without a
real request, so `whenStable()` settles and `stable` returns. If a fixture of yours hangs there, the
cause is elsewhere: a `PendingTasks` entry, a real timer, or a request the test never flushed
against `HttpTestingController`.

```ts
await stable(fixture, { timeout: 5000, label: 'the products fixture' });
```

Pass `label` when a spec awaits more than one fixture, so the failure says which. Pass
`{ timeout: 0 }` to disable the watchdog and wait indefinitely — worth it only for a deliberately
long real-timer test. The watchdog runs on a timer captured at import, so `vi.useFakeTimers()`
cannot stop it: a watchdog the code under test can freeze is not a watchdog.

## Resources: `httpResource()` and `resource()`

Angular's resource primitives need a **different wait each**, and neither is the one a spec reaches
for. Measured on Angular 21.2.17, zoneless TestBed:

| What                                            | What it needs to settle            |
| ----------------------------------------------- | ---------------------------------- |
| `httpResource()`, after its response is flushed | one tick + one microtask           |
| `resource()` with an async loader               | two rounds of the same             |
| `httpResource()` that has just been created     | a tick, or it makes **no request** |

Getting it wrong does not fail loudly. It asserts against the resource's _default_ value — a green
test proving nothing, until the day the default changes. `settleResource` is the loop both converge
under:

```ts
import { flushEffects, settleResource } from 'vitest-auto-spy/angular';

const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

flushEffects(); // the request is issued here — not when the resource was created
TestBed.inject(HttpTestingController).expectOne('/api/products').flush([product]);
await settleResource(products, { label: 'the product resource' });

expect(products.value()).toEqual([product]);
```

**That `flushEffects()` is not optional and `settleResource` cannot replace it.** An `httpResource`
issues no request until something ticks, so there is nothing for `expectOne` to find until then —
and awaiting first would spend the whole budget on a resource that stays `loading` for a reason no
amount of waiting fixes. One tick to get the request out, your flush, then one wait to take
delivery. A plain `resource()` needs no flush and so needs no tick: `await settleResource(data)` is
the whole of it.

The wait ends on `resolved` and on `error` — a request that threw has finished, and
`toHaveResourceError` is the assertion for it. Each round is a tick plus a microtask, and from the
third round an event-loop turn as well, so a loader resolving from a real timer, a `fetch` polyfill
or an `rxResource` over `timer(0)` gets there too; nothing that settles in the usual one or two
rounds pays for that. `{ turns }` is the budget and it is spent exactly as the failure reports it, so
`{ turns: 0 }` is the check-and-fail form. On expiry it names the resource and the flush it is
missing.

`idle` fails instead of passing quietly, because it is the default-value trap in person: the
`params()` computation returned `undefined`, the loader never ran, `value()` is still the default,
and every assertion after the wait would read that default and pass.

```ts
const productId = signal<string | undefined>(undefined); // the spec never set it
const product = TestBed.runInInjectionContext(() =>
  resource({ params: () => productId(), loader: loadProduct, defaultValue: EMPTY_PRODUCT }),
);

await settleResource(product, { label: 'the product resource' });
// [vitest-auto-spy] settleResource: the product resource never started — its status is 'idle', so
// the loader has not run and `value()` is still the default every assertion below is about to read.
```

Pass `{ allowIdle: true }` when the idle state is itself what the spec asserts.

::: tip Three of those lines are one — `vitest-auto-spy/angular-http`
The snippet above is the general form, and it is what to reach for when the wait is not tied to one
request. When it is, [`expectRequest()`](/adapters/angular-http) collapses the tick, the controller,
the `expectOne`, the flush and the settling into a single line:

```ts
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

await expectRequest('/api/products').flush([product]);

expect(products.value()).toEqual([product]);
```

It lives behind its own subpath because it is the only part of the package that imports
`@angular/common` — an optional peer, paid for by the suites that ask for it. `settleResource` stays
exactly as it is for `resource()`, `rxResource()`, reloads and anything not driven by HTTP.
:::

::: tip Not `flushEventLoopUntil`
`flushEventLoopUntil` takes real event-loop turns and never ticks. A resource awaited through it
finishes the whole budget having issued zero requests, then fails saying the condition was never
met. Its docstring used to claim this exact use case; it never worked.
:::

### An `httpResource()` that lives on a component

Everything above creates the resource through `TestBed.runInInjectionContext`, because that is the
shortest form to write down. The shape people actually ship is a field on a component, and the only
thing that changes is where the injection context comes from — `renderShallow` supplies it, the
first change detection issues the request, and the wait is the same one:

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
import { flushEffects, registerResourceMatchers, renderShallow, settleResource, stable } from 'vitest-auto-spy/angular';

registerResourceMatchers(); // once, in the setup file

it('renders what it loaded, and re-requests when the query changes', async () => {
  const { fixture, component } = renderShallow(ProductListComponent, {
    providers: [provideHttpClient(), provideHttpClientTesting()],
    keepTemplate: true,
  });
  const httpTesting = TestBed.inject(HttpTestingController);

  // renderShallow's first change detection is the tick — the request is already out.
  expect(component.products).toBeLoading();

  httpTesting.expectOne('/api/products?q=').flush([{ id: 1, name: 'Anvil' }]);
  await settleResource(component.products, { label: 'the product list' });

  expect(component.products).toHaveResourceValue([{ id: 1, name: 'Anvil' }]);

  await stable(fixture); // the view is one frame behind the value until this
  expect(fixture.nativeElement.querySelectorAll('.product')).toHaveLength(1);

  component.query.set('anv');
  flushEffects(); // the new params() is read here, and the second request goes out

  httpTesting.expectOne('/api/products?q=anv').flush([]);
  await settleResource(component.products, { label: 'the product list' });

  expect(component.products).toHaveResourceValue([]);
});
```

Two things are worth reading off that: `renderShallow` already ticked, so the first request exists
before the first assertion, and every later change to a signal the `params()` computation reads needs
its own `flushEffects()` before the next `expectOne` — the request is issued by change detection, not
by the `set()`. With
[`expectRequest()`](/adapters/angular-http) both lines of each pair collapse into one:

```ts
await expectRequest('/api/products?q=').flush([{ id: 1, name: 'Anvil' }]);

expect(component.products).toHaveResourceValue([{ id: 1, name: 'Anvil' }]);
```

### Skipping the request entirely — `mockResourceProp`

Everything above is the answer when the request _is_ the point. Often it is not: the spec is about a
component's own logic, it never wanted an `HttpTestingController`, and the value it needs is one it
picked in advance. `mockResourceProp` replaces the property with a double the spec moves directly.

```ts
import { mockResourceProp } from 'vitest-auto-spy/angular';

const service = injectSpy(ProductService);
const products = mockResourceProp(service, 'products', []);

expect(component.emptyState()).toBe(true);

products.set([product]); // status → 'resolved'
expect(component.emptyState()).toBe(false);

products.loading(); // status → 'loading', the value left where it was
expect(component.spinner()).toBe(true);

products.fail('offline'); // status → 'error', error() → Error('offline'), hasValue() → false
expect(component.errorMessage()).toBe('offline');

products.idle(); // status → 'idle', back at the initial value
expect(component.placeholder()).toBe(true);
```

Nothing is ever in flight, so there is nothing to wait for — no tick, no flush, no budget, and no
way for the test to pass against a default value by accident. The resource starts `'resolved'` at
the initial value, because that is the state most assertions want and the one that would otherwise
have to be arranged. A resource driven by `params` that has not started yet is the other common
opening, and it is an argument rather than a first line:
`mockResourceProp(service, 'products', [], { status: 'idle' })`. Any status except `'error'` can be
named there — an error needs a reason, and that is what `fail()` takes.

Reactivity is genuine: the double is built from real `signal()`s, so a `computed()` reading
`products.value()` recomputes and an `effect()` watching `products.status()` runs, exactly as
against a real `httpResource`. A plain object with the same keys would satisfy every read and notify
nothing.

| Member        | What it is                                                   |
| ------------- | ------------------------------------------------------------ |
| `set(value)`  | resolve with a value; clears any error                       |
| `fail(error)` | fail with an `Error` or a message string                     |
| `loading()`   | put it back in flight, leaving the value alone               |
| `idle()`      | park it before it ever ran, back at the initial value        |
| `reload`      | the spied `reload()` — assert the call, nothing is re-issued |
| `resource`    | the installed double, for asserting on it directly           |

The double on the property is a whole `ResourceRef`, not the read-only half of one, because the code
under test calls the other half: a service hands out `readonly products = this.#products.asReadonly()`,
and an optimistic update writes straight through the resource. Each of these does what Angular's own
does, including to the status.

| On the double           | What it does                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `value`                 | a writable signal; `value.set` / `value.update` move the status to `'local'`            |
| `set(v)` / `update(fn)` | the same write, spelled the way Angular spells it                                       |
| `hasValue()`            | `true` unless the status is `'error'` or the value is `undefined`                       |
| `snapshot()`            | `{ status, value }`, or `{ status: 'error', error }` — what `@switch` reads             |
| `asReadonly()`          | the same double back                                                                    |
| `destroy()`             | back to `'idle'` at the initial value; later writes from the code under test do nothing |
| `reload()`              | the spy — `true` until the spec says otherwise, and nothing is re-issued                |

`hasValue()` is the one worth reading twice. It has been value-based since Angular v20, not
status-based: a resource declared with a `defaultValue` has a defined value from the moment it is
created, so `hasValue()` is `true` while it is `loading`, `reloading` and `idle`, and `false` only in
the `error` state or over an `undefined` value. A template written as
`@if (products.hasValue()) { … } @else { <spinner/> }` therefore keeps showing the list while the
next page loads, and a double that answered the old status-based rule showed the spinner instead.

Undone by `restoreMockedProps()` like every other property patch, so a suite running `setupAutoSpy()`
needs no teardown of its own.

## Asserting a resource

`registerResourceMatchers()` adds three matchers that read the value **and** the status, because
either one alone is misleading.

```ts
registerResourceMatchers(); // once, in the setup file

expect(component.products).toBeLoading();

httpTesting.expectOne('/api/products').flush([product]);
await settleResource(component.products);

expect(component.products).toHaveResourceValue([product]);
expect(other.products).toHaveResourceError(/503/);
```

The one that earns its place is `toHaveResourceValue`: it **fails a resource that has not resolved
even when its default value matches**. That is precisely the assertion this family exists to stop
passing — `expect(products.value()).toEqual([])` is just as happy against a resource still loading
with its default `[]` as against one that genuinely resolved to nothing. The failure names the
status it was actually in and the flush that is missing.

Duck-typed on `{ status, value, error }` with `error` optional, so `httpResource`, `resource`,
`rxResource` and a `mockResourceProp` double all work. Handed something that is not a resource, each
matcher says so rather than throwing a `TypeError` — the two ways to get there are passing
`products.value()` instead of `products`, and passing a property that was never a resource, and both
are silent otherwise.

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

`runEffect` runs the body with the signal values as they stand, without marking the effect clean — a
later flush still behaves normally. It runs the previous run's cleanup first, exactly where
Angular's own scheduler runs it, so this is also how a spec observes an `onCleanup` callback:

```ts
runEffect(component.subscription); // the cleanup the last run registered fires here

expect(component.unsubscribed).toBe(true);
```

Two calls therefore leave one registered cleanup on the effect, not two. That matters for the
cleanup that is not idempotent — a `queue.pop()`, a counter decrement, an `unsubscribe` on a shared
subject: before, every call left one more closure behind and all of them fired together at
`fixture.destroy()`.

::: warning Before reaching for `vi.mock('@angular/core')` instead
The instinct is to replace `effect()` with the identity function so the callback becomes something
the spec holds. That mock can be made to work under the Angular unit-test builder — but only if its
factory avoids one specific construct, and a relative path never works at all. See
[module mocks under the unit-test builder](#module-mocks-under-the-unit-test-builder) before
writing one; asserting the effect's result stays the more durable shape either way.
:::

A destroyed effect is refused rather than run. After `fixture.destroy()`, or after
`effectRef.destroy()`, Angular would never run the body again, so a spec that gets a run there is
asserting something production cannot produce — and it is teardown behaviour that a spec is usually
asserting at that point. The message names the repair: move the call above the `destroy()`, or check
what the teardown left behind.

It reads Angular's reactive node off the `EffectRef`, so it is tied to an internal-by-convention
detail. If a future Angular moves the effect body, `runEffect` throws with a message saying to assert
the effect's **result** instead — set the signals it reads, `await stable(fixture)`, check what came
out. That is the more durable shape wherever it is practical.

## Counting recomputations and effect runs

A `computed()` returns the same value whether it was cached or recomputed, so "this did not
recompute" is not an assertion a spec can write — unless the computation itself carries a counter,
which means editing production code to make a test possible. `trackRecomputations` and
`trackEffectRuns` count from the outside:

```ts
import { trackEffectRuns, trackRecomputations } from 'vitest-auto-spy/angular';

const recomputed = trackRecomputations(component.total);
const synced = trackEffectRuns(component.syncEffect);

component.unrelatedFilter.set('open');
await stable(fixture);

expect(component.total()).toBe(42);
expect(recomputed.count).toBe(0);
expect(synced.count).toBe(0);
```

Both hand back a `{ count, stop() }`. `count` is live — read it as often as the spec needs — and
`stop()` puts the node's own member back. So does `restoreMockedProps()`, and therefore
`setupAutoSpy()` after every test, so a spec that never reaches `stop()` still leaves nothing behind.

`trackRecomputations` counts the **computation**, not the reads: a `computed()` read ten times
without an input changing recomputes once. It takes a `computed()` or a `linkedSignal()`; a plain
`signal()` holds a value rather than computing one and is refused with the helper that fits it.
`trackEffectRuns` counts every run, whoever asked for it — a scheduler flush, a `stable(fixture)`, a
`runEffect()` of the same effect.

## `window` and `document` without losing the real one

These two are the most hand-written providers an Angular suite has — 95 `window` ones and 70
`document` ones across two private suites — and they come in three shapes: `useValue: window`, which
isolates nothing (whatever the test writes stays there for the rest of the worker); a slice,
`{ screen: { width: 1280, height: 720 } }`; and a `mockDocument` carrying one hand-written
`querySelector`. The last two share a failure. The component reads `screen.colorDepth`, or calls
`document.createElement`, and gets `undefined` — the double knows only the members its author
happened to think of, and the spec fails somewhere that has nothing to do with what it was testing.

`provideWindowDouble` / `provideDocumentDouble` merge the overrides **over the real jsdom object**
instead:

```ts
import { provideDocumentDouble, provideWindowDouble } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [provideWindowDouble(WINDOW, { screen: { width: 1920, height: 1080 } }), provideDocumentDouble({ visibilityState: 'hidden' })],
});
```

`screen.colorDepth`, `location.href`, `getComputedStyle`, `addEventListener`,
`document.createElement` and everything else the overrides did not name still answer the way jsdom
answers them.

| Call                                                                  | Does                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `provideWindowDouble(token, overrides?)`                              | a `FactoryProvider` under the application's own window token                         |
| `provideDocumentDouble(overrides?, token?)`                           | the same under Angular's `DOCUMENT`, or under a token of your own                    |
| `createWindowDouble(overrides?)` / `createDocumentDouble(overrides?)` | the same doubles without a `TestBed` — for `new LayoutProbe(win)` or a bare function |

Five things to know:

- **The window helper takes your token, the document helper does not need one.** Angular ships
  `DOCUMENT`, from `@angular/core` itself since v20. It has never shipped a `WINDOW`: every
  application declares its own `InjectionToken<Window>`, so `provideWindowDouble` has to be handed
  that one. It is generic over the token's type, so an `InjectionToken<AppWindow>` has that
  interface's own members checked in the overrides too.
- **A plain `{ … }` merges into the member; anything else replaces it.** `{ screen: { width: 1920 } }`
  leaves `screen.colorDepth` real, while a `vi.fn()`, an array, a `URL` or a stub instance is the
  member, whole — those are things a spec built to stand in for it, not descriptions of it. The slice
  goes three levels down, the way the merge does: `{ document: { location: { href: '' } } }` is checked
  and merged member by member, and past that depth a member takes its whole type.
- **There is nothing to restore.** The real `window` and `document` are never patched: the double is
  a view over them, and every write and delete the code under test makes lands on the view. Which is
  also how a spec moves a value mid-test — `Object.assign(TestBed.inject(WINDOW), { scrollY: 40 })`,
  `Object.assign` rather than an assignment because lib.dom declares most of `Window` `readonly`.
  There is no handle to learn and no `restoreMockedProps()` to remember.
- **A factory, not a `useValue`.** Every injector builds its own, so a provider array hoisted to a
  module constant cannot carry one test's writes into the next.
- **`location` takes overrides like every other member.** The platform declares its members
  unforgeable, which is what makes the hand-written `{ location: { reload: vi.fn() } }` the shape it
  is; here it merges the same way everything else does:

  ```ts
  const win = TestBed.inject(WINDOW); // provideWindowDouble(WINDOW, { location: { reload } })

  win.location.href = '/checkout'; // moves the double, not the address bar
  expect(reload).toHaveBeenCalled(); // and `location.origin` is still jsdom's
  ```

  `mockValueProp(win, 'innerWidth', 800)` and its restore work on the double too, and neither
  touches the global.

::: warning `provideDocumentDouble` hands the double to Angular as well
Overriding `DOCUMENT` for a testing module means the renderer injects it too. Replacing
`createElement` or `body` therefore changes how the fixture is built, not only what the component
reads — override those only where the spec means to.
:::

## The Material dialog, without Material as a dependency

Three providers, 36 of them across two private suites, and they are the same three every time: an
object (or `null`) on `MAT_DIALOG_DATA`, a hand-rolled `{ close: vi.fn() }` on `MatDialogRef`, and a
spy on `MatDialog` itself.

The ref one is where they break, twice. `close` is the only member anybody writes, so the component
that subscribes to `afterClosed()` dies on "is not a function" — and the repair written next to it,
`afterClosed: () => of('saved')`, answers the result before anything closed the dialog, so the spec
passes whether or not `close()` was ever called.

```ts
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { expectEmission, injectMatDialogRef, provideMatDialogData, provideMatDialogRef } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [provideMatDialogData<EditUserData>(MAT_DIALOG_DATA, { id: 7, name: 'Ada' }), provideMatDialogRef(MatDialogRef)],
});

const dialog = injectMatDialogRef(MatDialogRef);

TestBed.createComponent(EditUserDialog).componentInstance.save();

expect(dialog.close).toHaveBeenCalledWith('saved');
await expect(expectEmission(dialog.ref.afterClosed())).resolves.toBe('saved');
```

::: info `@angular/material` is not a dependency of this package, and will not become one
This library ships no runtime dependencies at all, and a dialog is one component library's shape
rather than Angular's. That is why the token and the ref class are **arguments** rather than
something imported here: `MatDialogRef` is the DI token, the shape the double is measured against
and the type its result is read off — so the import in your own spec stays the only place Material
is named.
:::

| Call                                      | Does                                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `provideMatDialogData(token, data)`       | a typed `{ provide, useValue }` — name the type argument and the data is checked against it               |
| `provideMatDialogRef(RefClass, init?)`    | a `FactoryProvider` — a fresh ref per injector; `init`: `closedWith`, `disableClose`, `componentInstance` |
| `injectMatDialogRef(RefClass, injector?)` | the handle: `.ref`, `.close` (the spy), `emitClose(result?)`                                              |
| `createMatDialogRef(RefClass, init?)`     | the same handle without a `TestBed` — and the ref a spied `MatDialog.open()` hands back                   |

### Opening one: `MatDialog` needs no helper of its own

`provideAutoSpy(MatDialog)` already spies it. What the recipe was missing is the ref its `open()`
hands back — which is the double, seeded with the result the user is about to choose:

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(MatDialog)] });

injectSpy(MatDialog).open.mockReturnValue(createMatDialogRef(MatDialogRef, { closedWith: 'saved' }).ref);

fixture.componentInstance.edit(); // opens, pipes afterClosed(), gets 'saved'
```

There is no `openDialogReturning()` wrapper, on purpose: it would say `mockReturnValue` in different
words, and it would have to know `MatDialog`'s own type — the one thing this design keeps out.

Five things to know:

- **`close` is the spy, and it is the same function the ref carries.** `expect(dialog.close)` and
  `expect(TestBed.inject(MatDialogRef).close)` are one assertion, so a component asserted the old way
  keeps reading the same. `emitClose(result?)` is the other half: the user closing the dialog from
  outside, where the streams move and the spy records nothing — and the only way to close with
  `undefined`, which is what a dismissal is and what `closedWith` cannot express.
- **`afterClosed()` is replayed, where Material's own is a plain `Subject`.** The one deliberate
  departure, because in a spec the assertion usually subscribes _after_ the component has already
  closed the dialog, and a `Subject` has nothing left to say by then. `beforeClosed()` is the same
  stream — the double closes instantly, so there is no window between the two — and `afterOpened()`
  has already emitted and completed.
- **Material declares `MAT_DIALOG_DATA` as `InjectionToken<any>`**, which is why `useValue: null`
  compiles for a component that reads `data.name`. `provideMatDialogData<EditUserData>(…)` checks the
  object against the type you name; an `InjectionToken<EditUserData>` of your own checks it without
  naming anything. The value is handed out as it is, so build it per test rather than hoisting it to
  a module constant.
- **`componentInstance` is how the opener drives the dialog**, and Material declares it as a class
  field rather than on the prototype — so a double without it would hand the opener `undefined`
  instead of failing. Pass the stand-in and it is checked, member by member, against the component
  the ref class names:

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

- **Everything else the ref class declares throws by name.** `backdropClick`, `keydownEvents`,
  `updateSize`, `updatePosition`, `getState`, `componentRef` and `id` are the dialog doing its own
  work: the double names the member in the failure instead of reading `undefined`, and the answer is
  the real `MatDialogModule` with a `MatDialog` that opens it for real. A `componentInstance` nobody
  passed says so by name too, and names the init field that fixes it.

## Module mocks under the unit-test builder

This page used to say that `@angular/core` "cannot be mocked at all" under
`@angular/build:unit-test`, and that the reason was the shared chunks a multi-entry build emits.
**That was wrong**, and it sent people to rewrite specs that did not need rewriting. Measured
2026-08-29 on a fixture of 11 spec files always collected in one run, on `@angular/build` 21.2.16
and 22.1.6:

> `vi.mock('@angular/core')` **does work** — with `TestBed` in the graph, with app code in the
> graph, with every spec collected together.

The real rule is narrower, and it is a one-line fix in the spec rather than a reason to abandon the
approach.

### The rule: a `vi.mock` factory must not use object spread

Angular's builder sets `'object-rest-spread': false` unconditionally in `getFeatureSupport`
(`@angular/build/src/tools/esbuild/utils.js:172`) — a deliberate workaround for a V8 performance
defect, [crbug/v8/11536](https://bugs.chromium.org/p/v8/issues/detail?id=11536). So `{ ...actual, x }`
never survives as spread: it is downlevelled to a bundle-scope `__spreadValues` helper. `vi.mock`
factories are hoisted above the bundle's own initialisation, so the factory reaches that helper
before it exists.

```ts
// ❌ the spread compiles to a helper the hoisted factory runs before it is initialised
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();

  return { ...actual, effect: (fn: () => void) => fn };
});

// ✅ identical mock, no spread
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();

  return Object.assign({}, actual, { effect: (fn: () => void) => fn });
});
```

A modern `.browserslistrc` does not get you out of it — the flag is not target-derived. And code
splitting only decides which spelling of the error you get, which is why the shared chunks looked
like the cause:

| Splitting | What the run says                                                                            |
| --------- | -------------------------------------------------------------------------------------------- |
| on        | `Cannot access '__vi_import_1__' before initialization` — the helper lives in a shared chunk |
| off       | `__spreadValues is not a function` — the helper is a module-scope `var`                      |

Neither message mentions spread, and neither mentions the factory.

### A relative path is blocked, permanently

`vi.mock('./thing')` is not a bundling accident — the builder rejects it on purpose. It injects a
virtual entry point, `angular:vitest-mock-patch`
(`@angular/build/src/builders/unit-test/runners/vitest/build-options.js`), which monkey-patches
`vi.mock`, `vi.doMock`, `vi.importMock`, `vi.unmock` and `vi.doUnmock` to throw when the specifier
matches `/^[./]/`:

```text
The "vi.mock" and related methods are not supported for relative imports with the Angular
unit-test system. Please use Angular TestBed for mocking dependencies.
```

No build flag changes that. Mock through `TestBed` providers instead — which is what the rest of
this page is about.

::: danger A tsconfig path alias slips past the guard and does nothing
`@app/thing` does not start with `.` or `/`, so the regex above never fires. There is **no throw**:
the real module is used, the mock is silently ignored, and the spec fails later on an assertion that
reads like a bug in the code under test. An alias is the worst of the three cases precisely because
it looks like the one that works.
:::

### What the measurement does not cover

Worth saying plainly, because the claim it replaces was stated too broadly once already. The fixture
was a toy: no components, no templates, no barrels, no `externalDependencies` entries, and jsdom
rather than happy-dom. It says `vi.mock('@angular/core')` is not categorically blocked and that
spread is what breaks the factory; it does not say every mock of every module will work in a real
application suite. The `splitting` option discussed below was never executed against it, because no
published `@angular/build` ships it yet.

## When the unit-test build has code splitting off

`npx vitest-auto-spy doctor` reports `angular-build-splitting-off` when the installed
`@angular/build` is in `[22.1.5, 22.1.7)`. People also arrive here from the other direction: a CI
job that was fine last week is killed under `--coverage`, with no message from the builder about
why.

In that version window the unit-test bundle is built with esbuild code splitting **off**, and there
is no option to turn it back on. What that buys is real — the live-binding and undefined-export
class of failures upstream disabled it for — but the trade is not the one it is usually assumed to
be:

- **It buys nothing for module mocking.** `vi.mock` behaves the same either way; splitting only
  changes the wording of the spread error above.
- **It costs a bundle graph.** Every spec becomes a self-contained bundle: **791 chunks / 596 MB**
  on a 784-spec suite, growing by hundreds of megabytes under `--coverage` with no plateau until the
  run is killed. **The builder emits no warning in either mode.**

PR #33961 restores a `splitting` option with splitting **on** by default, so 22.1.7 closes the
window: upgrade and set `"splitting": true` on the test target.

Neither the doctor nor this page is where the failure is noticed, so
[`setupAutoSpy()`](/utilities/setup#_13-the-builder-version-that-eats-memory-named-in-the-run)
says it in the run itself: when the process is a worker of the unit-test builder and the installed
`@angular/build` is in the window, the setup file writes one line to stderr — once per worker, since
the builder evaluates it once — naming the version, both exits and the opt-out. It reads a single
`node_modules/@angular/build/package.json` for that, and nothing else depends on the read.
`setupAutoSpy({ angularBuildHint: false })` silences it.

### The escape hatch, and why it is not shipped here

Until then the only lever is to patch the installed builder in place. The shape of that patch — a
version-guarded `postinstall` that rewrites `disableCodeSplitting: true,` in `node_modules` — is
copy-pasteable, and is yours to own once you paste it: it is neither run nor tested by this
repository, and it depends entirely on that literal still being there.

```js
// scripts/patch-angular-build.cjs — delete this once you are on @angular/build 22.1.7
const { readdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', 'node_modules', '@angular', 'build');
const { version } = require(join(root, 'package.json'));
const [major, minor, patch] = version.split('.').map(Number);
const affected = major === 22 && minor === 1 && patch >= 5 && patch < 7;

if (!affected) {
  process.stdout.write(`@angular/build ${version} needs no patch\n`);
  process.exit(0);
}

const NEEDLE = 'disableCodeSplitting: true,';
let patched = 0;

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith('.js')) {
      const source = readFileSync(full, 'utf8');

      if (source.includes(NEEDLE)) {
        writeFileSync(full, source.split(NEEDLE).join('disableCodeSplitting: false,'));
        patched += 1;
      }
    }
  }
};

walk(join(root, 'src'));

// Fail loudly rather than silently doing nothing: the literal moving is the expected way this breaks.
if (patched === 0) {
  throw new Error(`@angular/build ${version}: "${NEEDLE}" not found — the patch needs revisiting`);
}
```

**This package deliberately does not ship it**, and would not accept a PR that did. Making it
automatic means a `postinstall` that rewrites another package's files inside `node_modules`, which
is the single most alarming thing a test library can do to a supply-chain audit — the same posture
that keeps this package's own bundles unminified and readable. It is also string surgery against a
literal at no fixed path, so an upstream refactor breaks it silently, which is the worst failure
mode for a package whose whole pitch is that failures name their own cause. And its useful life is
weeks. Whether a workspace trades a 596 MB bundle graph for anything at all is the app team's call,
not a test-double library's; the diagnosis belongs here, the mutation does not.

## Coverage under the unit-test builder

Two settings in this area read as configuration and configure nothing. `npx vitest-auto-spy doctor`
reports both — `coverage-all-removed` and `coverage-include-misses-bundle` — because neither one
fails anything: the run is green and a report is produced, it is just not the report the setting
describes.

**Coverage is matched twice, and the first pass sees chunks.** `@vitest/coverage-v8` calls
`isIncluded` on the URL of each executed script before any remap, and — when `excludeAfterRemap` is
on — again on the remapped source path. `@angular/build` sets `excludeAfterRemap: true` itself, so
under this builder both passes run against the same list. The suite runs over a bundle, so the first
pass compares your globs against `spec-*.js` / `chunk-*.js`, not against `.ts` files: a list of
source globs drops every counter there and the report comes out **empty**.

The builder handles this for the list it owns — it prepends `spec-*.js` and `chunk-*.js` to the
target's `coverageInclude` option. It does not, and cannot, do that for a list written inside the
Vitest runner config. So under this builder the include list belongs on the target:

```jsonc
// angular.json — the list the builder can fix up for you
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "runnerConfig": "tools/vitest-runner.config.ts",
    "coverageInclude": ["libs/**/*.ts", "apps/**/*.ts"]
  }
}
```

**The provider is not only a speed choice here.** With `coverage.include` set, the pass over
files no test imported resolves them itself, and `@vitest/coverage-istanbul` does that through
Vite's resolver rather than through the aliases the builder hands out: on a workspace with tsconfig
path aliases the first aliased import ends the whole run.

```text
Error: Failed to resolve import "@workspace/api" from
"apps/app/src/main.server.ts?cache=…&vitest-uncovered-coverage=true". Does the file exist?
```

The package named there changes between runs — it is the first unresolved import, not a guilty file.
`v8` degrades softly on the same pass: files it cannot parse are dropped with a warning and the run
stays green. Reported from one Angular monorepo, on one series of runs: 184 files of 4969 dropped
that way, and `v8` 28 % faster than istanbul at matching settings (81 s against 113 s).

**`coverage.all` no longer exists.** It is absent from `coverageConfigDefaults` in Vitest 4, and the
pass over files no test imported is driven by the presence of `coverage.include` instead. A config
carried over from Vitest 3 with `all: true` and no `include` reports only the files the run touched,
with no error and no warning — verified on 4.1.9 against a fixture whose second module nothing
imports: absent with `all: true`, present once `include` is declared.

## Coverage matching costs more than coverage

Narrowing the scope with `coverage.include` is supposed to make the report smaller and the run
faster. On a large workspace it makes the run **slower**, and the reason is not in your config.

`@vitest/coverage-v8` decides whether a file belongs in the report by calling `isIncluded`, which
calls `picomatch` with the whole pattern array. Its `globCache` memoises the **verdict**, keyed by
the filename — never the compiled matcher. So every filename recompiles every pattern.

::: tip Fixed upstream in Vitest 5
`BaseCoverageProvider.getGlobMatchers()` builds the two matchers on first use and keeps them, so on
Vitest 5 the surcharge below is gone and the wrapper is unnecessary. Everything from here to the end
of this section applies to Vitest 4 and earlier — which the package still supports, its peer range
being `>=2.1.0`. Upgrading is the cheaper fix where it is available.
:::

Profiled on one shard of a 1 725-file Angular suite, with a scope of 124 include globs plus 304
negations:

| Phase of `Generate coverage`, 224.2 s total |        time |
| ------------------------------------------- | ----------: |
| reading the 432 workers' coverage files     |       2.6 s |
| before the first conversion                 |      54.3 s |
| remapping the 1 958 covered files           |      50.5 s |
| the pass over the 458 untested files        |  **0.35 s** |
| the final `coverageMap.filter`              | **114.1 s** |

The pass over untested files is what a narrowed scope is usually blamed for, and it is a third of a
second. The filter — a loop whose entire body is one `isIncluded` call per file — is half the run.
Timed operation by operation against a matcher compiled once, on the same globs:

| Operation                          |      stock | compiled once |
| ---------------------------------- | ---------: | ------------: |
| `isIncluded`, 8 000 calls          | 167 853 ms |      1 808 ms |
| `coverageMap.filter`               |  81 393 ms |        713 ms |
| the pass over 1 816 untested files |  69 779 ms |      9 439 ms |

### The fix is a provider wrapper, in your own config

`coverage.provider: 'custom'` is a supported seam, and the provider it returns is an ordinary
object. Re-export `@vitest/coverage-v8` and replace one method:

```ts
// tools/coverage-provider.ts
import * as v8 from '@vitest/coverage-v8';
import { cleanUrl, slash } from '@vitest/utils/helpers';
import pm from 'picomatch';

export * from '@vitest/coverage-v8';

export async function getProvider() {
  const provider = await v8.getProvider();
  const original = provider.isIncluded.bind(provider);
  let match;

  provider.isIncluded = (filename) => {
    const { include, exclude, allowExternal } = provider.options ?? {};

    // A `--changed` run selects by its own file list, and a config with no `include` has nothing
    // to compile: the only two questions this wrapper genuinely cannot answer.
    if (!include) {
      return original(filename);
    }

    match ??= pm(include, { contains: true, dot: true, ignore: exclude });

    const path = slash(cleanUrl(filename));

    // Inline, NOT delegated — see the note below.
    if (!allowExternal && !path.startsWith(workspaceRoot) && !path.startsWith(projectRoot)) {
      return false;
    }

    return match(path);
  };

  return provider;
}
```

```ts
// vitest.config.ts
coverage: {
  provider: 'custom',
  customProviderModule: './tools/coverage-provider.ts',
}
```

Measured on the same real shard, same reporters: the Vitest phase drops **229.59 s → 22.88 s**,
432/432 files both ways, a cobertura report of 8.0 MB both ways, and the numbers do not move —
`Statements 41.77 %`, 27 292/65 325 before and 27 289/65 325 after, the same denominator and three
statements of the shared environment's ordinary drift. Per file, on 200 distinct paths: 1.13 ms
stock against 0.018 ms compiled, with identical verdicts on every path.

::: danger The one mistake that makes a correct wrapper measure as zero
Do **not** delegate the `allowExternal: false` case back to the original method "to be safe".
`@angular/build:unit-test` turns that option on, so every call would take the slow path: the first
attempt at this came out at 227.6 s against a 229.6 s baseline, which reads as "the idea does not
work" rather than "the fast path was never entered". Do the test inline, with two `startsWith`
against the workspace and project roots.
:::

Two more mechanics worth not rediscovering. `getProvider()` runs **before** Vitest calls
`initialize()`, so `provider.options` does not exist yet at swap time and the matcher has to be
built lazily on the first question. And the filename must be normalised exactly as the original does
it — `slash(cleanUrl(filename))`, both helpers from `@vitest/utils/helpers` — or the verdicts
diverge on the paths the two forms disagree about. The provider's own `globCache` stays a cache and
keeps working.

### Narrowing the scope is not only about speed

In the same series the cobertura report was **10.78 MB** without `include` and 8.89 MB with it,
against GitLab's **10 MB** parse limit. Over that limit the report is dropped **silently**: the job
is green, the percentages are in the log, and there is no line highlighting in the merge request at
all. That failure names nothing, which is why it is worth knowing the number.

`npx vitest-auto-spy doctor` reports `coverage-include-recompiles-globs` when it sees a scope large
enough for this to be worth the twenty lines above, and only on a Vitest older than 5 — on 5 it says
nothing, because there is nothing left to say. It is an `info` finding — nothing is broken, and the
report it produces is correct.

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

A spy is a zero-argument callable too, so the matcher recognises one and refuses it **without
reading it** — `expect(service.load).toHaveSignalValue(undefined)` would otherwise pass on the
`undefined` an unconfigured spy returns and leave a phantom call behind for the next
`toHaveBeenCalledTimes` to trip over. The refusal throws rather than failing softly, so `.not`
cannot hide it either; put a real signal on the property with `mockSignalProp` when that is what
you meant. A plain zero-argument getter is still read, as before.

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

**That journal is made of strong references, which is the memory half of the same rule.** Each
entry holds the patched object _and_ the descriptor it replaced, and an entry whose patch has
already been undone is marked rather than spliced out — splicing would make a suite that patches
thousands of properties quadratic. The list is therefore only ever emptied wholesale, by
`restoreMockedProps()`. Under `isolate: true` it lives on a per-file `globalThis` and dies with the
file, so nothing accumulates. Under `isolate: false` it is the worker's, and without a
`restoreMockedProps()` between tests every object every spec has patched stays reachable for the
whole run — which is the case `setupAutoSpy()` covers, and the reason to run it rather than to
remember the undo by hand.

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

**What it replaces, and what it does not.** Angular links a consumer to the signal it read, not to
the property it read it through. A spec that renders first and patches second would therefore leave
every `computed()`, `effect()` and template binding on the old signal for the rest of the test —
cached value and all, with nothing said about it. So a member that is already writable — `signal()`,
`model()`, `linkedSignal()` — is not replaced: the helper writes into the signal the class already
has and hands that one back. Order stops mattering, a `model()` keeps its output half, and there is
nothing for `restoreMockedProps()` to put back — the value simply stays where the spec left it,
which is only visible on an object that outlives the test.

The swap is kept for the two shapes with no node to write into: a `computed()` the class declares,
and a member the spy does not have yet. Those still have to be patched **before anything reads
them** — before the first `detectChanges()` / `stable(fixture)` — and the helper checks rather than
assumes. A read-only signal a live consumer has already read is refused by name instead of being
replaced where nothing would notice.

An `input()` is refused outright. Angular sets an input through the input node rather than through
the property, so a replaced one breaks the host's next write with
`inputSignalNode.applyValueToInputSignal is not a function`. Drive it the supported way:
`fixture.componentRef.setInput('mode', value)` during the test, or
`renderShallow(Component, { inputs: { … } })` for the value it starts at.

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

How far away is worth spelling out, because this is one of the most-reported traps in the whole
library. `@Component({ providers: [DeleteAccountService] })` with a module-level
`provideAutoSpy(DeleteAccountService)` builds the **real** service, and what fails is whatever that
service touches first — in one observed case a logger, with
`TypeError: Cannot read properties of undefined (reading 'pipe')`. That message names neither the
component, nor the provider, nor the spy.

There are two fixes and the choice is about intent. Use `overrideComponentProvider` when the spec
wants a double at the component level; use `TestBed.overrideComponent(..., { remove: { providers } })`
when the module already provides the spy and the component's own declaration is simply in the way:

```ts
TestBed.overrideComponent(ProfileComponent, { remove: { providers: [DeleteAccountService] } });
```

```ts
import { overrideAutoSpy, overrideComponentProvider } from 'vitest-auto-spy/angular';

// the component is instantiated through a parent's template, so it is not in `imports` yet
const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService); // → Spy<NavigationBuilderService>

// or, when the component is already in the testing module
TestBed.configureTestingModule({ imports: [CheckoutComponent] }).overrideProvider(
  PaymentMethodService,
  overrideAutoSpy(PaymentMethodService),
);
```

`overrideProvider(X, provideAutoSpy(X))` is **not** broken, contrary to what this page used to say.
`provideAutoSpy` returns `{ provide, useValue }`; `overrideProvider` reads `useValue` off it and
ignores the extra `provide`, so the spy is installed. Prefer `overrideAutoSpy` because it says what
it does and hands the spy back directly, not because the other form is a no-op.

The silent failure that is real: `overrideProvider` only reaches a component the TestBed compiler
knows about. A standalone component
instantiated through a parent's template is not in the testing module's `imports`, so the override
never applies to it, and finding that out means knowing how `TestBedCompiler.queueType` works.
`overrideComponentProvider` queues the component — as an import when it is standalone, as a
declaration otherwise.

Do **not** reach for `TestBed.overrideComponent` here. It forces a JIT recompilation, and under an
AOT test bundle that recompilation resolves the component's directives and pipes from a runtime
scope the bundler has stripped, leaving it with none of them — see the next section.

`overrideComponentProvider` also verifies, on the next `TestBed.createComponent`, that the
component's own injector really answers with the spy — see
[Component provider overrides](/adapters/angular-overrides).

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

[`enableAngularDiagnostics({ ngModuleScopes })`](/adapters/angular-diagnostics#ngmodulescopes)
applies this automatically to every testing module, behind a much stricter filter that a
providers-only module passes.

## A component whose own definition has a hole in it

The same bundle, one level down. A component's `providers`, `viewProviders` and compiled scope are
**baked into `ɵcmp` when its module executes** — not read at `createComponent` time. So when a
bundler splits a barrel into a chunk that has not run yet, the definition is assembled with
`undefined` where a provider or a scope dependency should be, and Angular finds out much later, from
inside itself:

```
TypeError: Cannot read properties of undefined (reading 'provide')
  ❯ resolveProvider render3/di_setup.ts:95
```

The stack names neither the barrel, nor the symbol, nor the component. Worse, the spec that breaks is
usually one nobody touched: chunk boundaries move with file _contents_, so editing a type in a
neighbouring file is enough to move a symbol across one. Both obvious cures fail for the same reason
— `await import('@scope/lib')` at the top of `beforeEach` is already too late, and a static import in
the spec header does not fix the order this bundler emits.

```ts
import { assertComponentDefIntact } from 'vitest-auto-spy/angular';

assertComponentDefIntact(HoverMenuComponent);
const fixture = TestBed.createComponent(HoverMenuComponent);
```

```
[vitest-auto-spy] HoverMenuComponent.ɵcmp.providers[0] is undefined.
```

It walks the three lists, nested arrays and the thunk Angular emits for a forward reference included.
The same call answers the related `Cannot read properties of undefined (reading 'ɵcmp')` from
`imports: [Cmp]`, where the class reference itself never arrived — there the message names the
argument position instead. A directive is read the same way, through `ɵdir`.

Neither this nor `assertNgModuleScopes` fixes the build; that is a bundler configuration question.
Both replace a stack inside `@angular/core` with a line naming what is missing, and point it away
from the spec. Full reference on the
[component provider overrides page](/adapters/angular-overrides#assertcomponentdefintact-components).

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
import { setupZoneTestEnv, setupZonelessTestEnv } from 'jest-preset-angular/setup-env';
import { setupAngularTestEnv } from 'vitest-auto-spy/angular';

setupAngularTestEnv({
  zoneless: (testPath) => testPath.includes('/libs/catalog/') || testPath.includes('/apps/storefront/'),
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

| Where                                         | Resolved by                                | An `NgModule` there                                                              |
| --------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| `@Component({ imports })`                     | the AOT compiler, at build time            | **works** — the flat list is baked into `ɵcmp`                                   |
| `TestBed.configureTestingModule({ imports })` | `TestBedCompiler`, at runtime, from `ɵmod` | **contributes nothing** — `ɵɵsetNgModuleScope` is not emitted into a test bundle |

So the host must be **standalone** and must carry the module in its _own_ `imports`. A host written
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
reader to the `@NgModule` where the directive _is_ correctly declared; `NG0304` reports an absent
**directive** as an absent **component**; and a directive used as a bare attribute, with no binding,
reports _nothing at all_ — a green test asserting on a directive that never ran.

The matcher asserts the fact, and its failure names the cause and the fix, including the one that
looks like a fix and is not: `schemas: [NO_ERRORS_SCHEMA]` applies to a testing module's
`declarations` and never to a standalone component, so next to a standalone component it is a dead
entry that reads as if something were deliberately silenced.

## A stand-in for a child — `createComponentStub` {#a-stand-in-for-a-child-createcomponentstub}

The hand-written stub is a class in the spec that restates the child's selector, inputs and
outputs, and nothing checks the copy: rename an input on the real child and the parent's binding goes
to a property nobody declared, while the spec stays green or fails with `NG0303` pointing at the
stub. `createComponentStub` reads the copy from the real class's compiled definition instead —
`ɵcmp`, `ɵdir` or `ɵpipe` — so the two cannot drift apart:

```ts
import { createComponentStub } from 'vitest-auto-spy/angular';

const ChartStub = createComponentStub(ChartComponent); // a directive or a pipe works the same way

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

| Copied from the definition                                                         | Not copied                                                            |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| the selector — compiled back to the same selector list                             | the template: the stub renders one `<ng-content>` per projection slot |
| every input under its public name, alias and transform included                    | host bindings and host directives                                     |
| `input()` as a signal input, `model()` as a model, a decorator input as a property | providers, so nothing the real child provides reaches its content     |
| every output, as an `EventEmitter`                                                 | lifecycle hooks and queries                                           |
| `exportAs`; for a pipe, its name and purity                                        | anything the second argument does not seed                            |

The second argument seeds members on every instance, copied per instance — a method the parent calls
through a `viewChild`, or a pipe's `transform`, which is the identity by default:
`createComponentStub(TranslatePipe, { transform: (key) => key })`. The third takes `{ template }` to
render something other than the projected content.

It is not a replacement for [`renderShallow`](#shallow-component-rendering): that one drops the
children, which is right when nothing reads the template. A stub is for the spec that does read the
template and wants the child's slot there without the child, and the two combine — keep the
template, and name the stub as the one child to keep:

```ts
const { fixture } = renderShallow(DashboardComponent, { keepTemplate: true, keepChildren: [ChartStub] });
```

The real `ChartComponent` is dropped with the other child components, and the stub, matching the same
selector, takes its place.

## Patching a property of a spy

```ts
const playback = injectSpy(PlaybackStateService);

mockSignalProp(playback, 'navigationState', 'idle'); // a real, writable signal
mockReadonlyProp(playback, 'currentItem', signal(item));
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

A token typed with an _interface_ has no class to read, which is where the usual workaround comes
from: a `PasscodeServiceMock` written in the spec, spied, and provided — after which `Spy<Mock>` and
`Spy<PasscodeService>` disagree about `calledWith` and somebody reaches for an assertion (or, more
often, `TestBed.inject<any>(TOKEN)` with an `eslint-disable` at the top of the file).
`provideAutoSpyForToken` reads the type off the token; `injectSpy` already accepts one. Note the
name: `provideAutoSpy` reads a _class prototype_, which a token has none of, so it is not the call
that works here.

The second argument is needed more often than it looks. A spy answers `undefined` until it is told
otherwise, which is fatal the moment the code under test **chains** off it: a constructor doing
`inject(LOGGER).channel('auth').debug('…')` dies on the `.debug` of `undefined` before the spec's
first line runs, because nothing in production wrote `?.` there. Name the link that returns the
object:

```ts
provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] });
```

[`selfReturning`](/core/create-spy-from-class#self-returning) keeps `channel` a spy — assertable, and
configured as far as `strict` is concerned — while it answers the double itself. When every file
needs the same double, say it once in the setup file: `registerAutoSpyDefaults(LOGGER, { … })`,
imported from `vitest-auto-spy/angular`, is read by every `provideAutoSpyForToken(LOGGER)` after it
([a dependency behind an `InjectionToken`](/core/create-spy-from-class#token-defaults)).

For a chain more than one link long, [`mockDeep<T>()`](/core/auto-mock-by-type#recursive-deep-mocks-%E2%80%94-mockdeep) is the double that answers
at every level.

## `injectSpy` says when it got the real thing

```text
[vitest-auto-spy] injectSpy(DeviceRegistryService): the injector returned a plain instance, not an
auto-spy. Register it with provideAutoSpy(DeviceRegistryService) …
```

A provider the spec forgot to register is otherwise found much later — when `.mockReturnValue(…)` is
called on the real method, or, if the class has no private members to make the types disagree, never.
The warning is printed once per token.
