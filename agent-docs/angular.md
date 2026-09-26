# vitest-auto-spy — Angular

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 13. Angular

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [provideAutoSpy(MyService), provideAutoSpy(ApiService, { methodsToSpyOn: ['get'] })],
});

const myService = injectSpy(MyService); // Spy<MyService>
```

`provideAutoSpy` defaults to `lazySpies: true` (the plain `createSpyFromClass` does not). Pass
`{ lazySpies: false }` to opt out. The spies never touch `NgZone`, so they work zoneless and with
zone.js alike. The entry needs **Angular >= 20** (§1); on 16 or 17 it does not link at all, because
`ɵSIGNAL` is not there to import.

**Niche Angular helpers ship in narrow companion subpaths, never in `/angular`** — the pattern of
`/angular-http`, `/angular-router` and `/signal-forms`, and since 5.21.0 of `/angular/diagnostics`,
`/angular/doubles` and `/angular/matchers`. An import of `/angular` evaluates its whole graph, so a
helper a suite names once in a setup file must not ride along with every `provideAutoSpy` import;
the diagnostics, doubles and matcher registrars left on that rule (`trackInjections` stays —
`createWithAutoSpies` needs its module).

### The same thing as fixtures — `extendWithAutoSpies` (Vitest 4.1+)

The block above, written once instead of once per dependency, with the types inferred rather than
declared:

```ts
import { test as base } from 'vitest';
import { extendWithAutoSpies } from 'vitest-auto-spy/angular';

const test = extendWithAutoSpies(base, {
  cart: CartService,
  api: [ApiService, { returns: { get: of([]) } }],
  passcode: PASSCODE_TOKEN,
});

test('checks out', async ({ cart }) => {
  cart.checkout.resolveWith(true);

  await expect(cart.checkout(1)).resolves.toBe(true);
});
```

No `let cart: Spy<CartService>` that is `undefined` between tests, and a test that never destructures
`api` never builds it. Entries are a class, `[Class, config]` with whatever `provideAutoSpy` takes,
or an `InjectionToken` (built from the token's own type, like `provideAutoSpyForToken`). Extra
providers — the component under test, a real service, `provideHttpClient()` — go in the third
argument and are registered in the same call, ahead of the generated ones, so a token named there
wins.

**It takes the whole map at once, and that is a `TestBed` constraint rather than a typing one.** The
composing form — `base.extend('cart', …).extend('api', …)` — cannot work: fixtures resolve
independently, so `cart` would configure the testing module _and_ inject, which instantiates it, and
`api` would then reach `configureTestingModule` after instantiation and fail with Angular's own
"Cannot configure the test module when the test module has already been instantiated". A `beforeEach`
that configures the module further still composes, because it runs before any fixture resolves and
repeated `configureTestingModule` calls merge right up until the first injection. A `beforeEach` that
**injects** does not, and nothing can repair that from here.

The token may be an **abstract class** — `abstract class LocalStorage extends AbstractStorage {}`,
the shape production provides with `useClass`. Its members are erased before they reach a prototype,
so there is nothing to discover; the factory notices and returns the `createAutoMock` proxy, which
answers every method of the declared type. `injectSpy(LocalStorage)` recognises it as an auto-spy
and stays quiet.

**Seed the double in the provider, not in the `beforeEach` under it.** Both factories take both
halves — `returns` for what a spied method answers, `overrides` for a member that is not a method
result:

```ts
provideAutoSpy(FavoritesService, {
  returns: { load: of([]) },
  overrides: { savedItemsChanged$: of(undefined), favoriteItems: [] },
});

provideAutoSpyForToken(PRODUCTS, undefined, { returns: { getProducts: of([]), getById: of(null) } });
```

A seeded `overrides` member is stored verbatim and is **no longer a spy**, so seed data there and
name methods in `returns` when they must stay assertable. The reason to prefer this over a second
statement is not brevity: the shortcut people take instead is an exported `const` provider carrying
the values, and under `isolate: false` that is one set of spies shared by every file that imports
it.

**A member named in both wins as the seed**, whatever the seed is — a value, a plain function, a
`vi.fn()`. `returns` and `selfReturning` skip such a member rather than configuring it, which is the
precedence the merge already applies between a registration and a call site: a spec seeding `channel`
over `registerAutoSpyDefaults(LOGGER, { selfReturning: ['channel'] })` gets its own function back, not
the registered link.

**`observablePropsToSpyOn` works on a token too**, and matters more there than on a class. A class
tells the factory which members are methods; a type does not, so _every_ unnamed key of a
token-driven double is a function spy — including an `Observable` property, which the code under
test then subscribes to as if it were a function, failing far from the double:

```ts
provideAutoSpyForToken(FAVORITES, undefined, { observablePropsToSpyOn: ['favorites$'] });
// …
injectSpy(FAVORITES).favorites$.nextWith([{ id: 1 }]);
```

A member also named in `overrides` keeps its seed — hand the double a real `Subject` there when the
spec drives the stream itself, and name it here when `nextWith` is what the spec wants. That is the
same precedence the class-based factory uses. Before 3.5.0 this option existed only on the class
path, and reaching a token with observable members meant going back to a hand-written double —
which is exactly what `prefer-provide-auto-spy` and `prefer-create-spy-from-class` exist to prevent.

**Do not write a local `injectSpy`.** A wrapper of the shape
`TestBed.inject(token as never) as Spy<T>` — a double assertion, typed
`<T>(token: abstract new (...args: never[]) => T)` — is a common thing to find already in a
repository, and the library's is strictly wider: it takes `ClassType<T>`, an `InjectionToken<T>` and
an abstract constructor, warns when the injector hands back something that is not a spy, and has no
assertion for the project's lint rules to argue with. Two functions with the same name and different
signatures means the import order decides which one a file gets. Delete the local one, or re-export
the library's under that name.

### Signals — which helper depends on whose signal it is

```ts
// a DEPENDENCY's signal — name it, then configure the mock like any other
provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current'] });
injectSpy(ProjectStore).current.mockReturnValue({ id: 1 });

// the CLASS UNDER TEST's own signal / computed / input — replace the field with a REAL signal
mockReadonlyProp(component, 'selected', signal(true));
mockReadonlyProp(component, 'items', signal([]));
mockReadonlyProp(component, 'host', signal({ nativeElement: element }));

// a value that changes during the test — keep the signal, set it
const selected = signal(false);

mockReadonlyProp(component, 'selected', selected);
selected.set(true); // every computed reading it updates
```

Pass a real `signal()`, not a `vi.fn()` returning a value — anything `computed()` downstream has to
recompute, and only a real signal notifies it.

`mockSignalProp` is that pair in one call, and hands back the writable half:

```ts
import { mockSignalProp } from 'vitest-auto-spy/angular';

const selected = mockSignalProp(component, 'selected', false);

selected.set(true); // every computed reading it updates
```

Use it whenever the value has to change during the test. `mockReadonlyProp` stays right when the
value is fixed for the whole test and you never need the handle.

A `protected` or TS-`private` signal is reached too: the key is checked against the public type
first, and a key that type does not describe takes the value's own type instead —
`mockSignalProp(component, 'saving', true)`. `mockResourceProp` works the same way. A public key never
falls through to that form, so its value is still checked.

A `linkedSignal()` is a writable signal like any other, so `mockSignalProp` covers it and there is
no separate helper to go looking for.

**An ngrx `signalStore()`'s state members go through `mockSignalProp` too**, on the store double —
`mockSignalProp(store, 'currentAngle', null)`, then `.set(angle)` mid-test. A state slice is a
signal the template reads during the first render; a method spy there answers `undefined`, and
`mockImplementation(() => value())` is re-read by nothing downstream. A nullable object slice is
typed `DeepSignal<A> | Signal<null>`: `overrides` accepts one `signal<A | null>()` for it, but only
`mockSignalProp` hands back the handle.

**It patches as little as it can, and the order rule follows from that.** A member that is already
writable — `signal()`, `model()`, `linkedSignal()` — is **written through**, not replaced: Angular
links a consumer to the signal it read, not to the property it read it through, so replacing one
that anything has already read strands every `computed()`, `effect()` and template binding on the
old signal, silently and for the rest of the test. Writing through keeps all of them, keeps a
`model()`'s output half alive, and leaves nothing for `restoreMockedProps()` to undo — the value
stays where the spec left it.

**A `signal().asReadonly()` member counts as writable.** The view a class exposes is a different
function from the signal behind it, but it is the same reactive node, so the value is set through the
node and the member the class publishes keeps working — whenever it was first read. That is the
common shape for a store's public state (`readonly items = this.#items.asReadonly()`), and it used to
be swapped, which meant a `computed()` that had already read it never saw the new value.

One shape is still swapped: a `computed()` the class declares, and a member the double does not have
yet. **Patch those before anything reads them** — before the first `detectChanges()` /
`stable(fixture)`. A `computed()` a live consumer has already read is refused by name rather than
replaced where nothing would notice it — the refusal now names `computed()` specifically, and says
that driving the signal the computation reads is the way through. An `input()` is refused outright:
Angular sets an input through the input node rather than the property, so a replaced one breaks the
host's next write. Drive an input with `await setInputs(fixture, { … })`, or with
`renderShallow(Component, { inputs: { … } })` for the value it starts at.

### Observers the component constructs itself

Do not assign `globalThis.IntersectionObserver` by hand: it stays assigned, and under
`isolate: false` the next file inherits it.

```ts
import { intersectionEntry, stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';

const observers = stubIntersectionObserver(); // also stubResizeObserver / stubMutationObserver

fixture.detectChanges(); // the component constructs it

observers.last.emit([intersectionEntry(element, true)]); // one batch, as the browser delivers it
await fixture.whenStable();

expect(observers.last.disconnected).toBe(true); // after the component is destroyed
```

`restoreMockedProps()` puts the real constructor back, so `setupAutoSpy()` covers the teardown.
`observers.last` throws if the code under test constructed nothing — render first, and install the
stub before the construction, not after.

Install it in `beforeEach`, **never in `beforeAll`**: a shared setup file's root `beforeEach` runs
_after_ a file's `beforeAll`, so a stub installed there is overwritten by the setup file's default
before the test starts. The symptom is `expected "vi.fn()" to be called 2 times, but got 0 times`,
in a file where the mock class is ten lines above.

Three more knobs, each for a shape that otherwise gets hand-rolled:

```ts
stubIntersectionObserver({ autoEmit: true }); // every observed target reports as visible, at once
observers.last.options; // the init object: { rootMargin, threshold, … }
observers.last.host; // the observer the code under test constructed — and its callback's 2nd argument
observers.last.emit([mutationRecord(host, { addedNodes: [span] })]);
observers.last.emit([resizeEntry(host, { width: 320 })]);
```

**The callback's second argument is the observer the code under test holds**, not an internal
record — so `(entries, observer) => observer.unobserve(entries[0].target)`, `observer.disconnect()`
and `observer.takeRecords()` all reach the thing the spec drives, which is what production code
written against the platform expects. `root`, `rootMargin` and `thresholds` read back off the init
the way the platform normalises them (`null`, `'0px 0px 0px 0px'`, `[0]` by default) rather than as
empty values.

`autoEmit` is the mode a suite ported from Jest needs: there the global mock fired its callback with
`isIntersecting: true` immediately, so lazily-loading sections fetched their data during
`detectChanges()`. Against the default inert observer those specs assert on an empty component and
fail with something that has nothing to do with intersection.

`mutationRecord()` exists because a `MutationRecord` cannot be written as an object literal at all —
`addedNodes` is a `NodeList`. Do not build one from a `DocumentFragment`: appending **moves** the
nodes, so the helper silently rips the element out of the fixture it was just asserted on.

### A component's own `providers` win, and the symptom is nowhere near the cause

Worth reading before the rest of this section: it has now come up twice in one migration wave, and
both times the failure landed in a different file from its cause.

`@Component({ providers: [DeleteAccountService] })` declares the provider on the **element**
injector, and a module-level `provideAutoSpy(DeleteAccountService)` in `configureTestingModule`
loses to it — so the component builds the **real** service. Nothing warns. What fails is whatever
the real service touches first: in the observed case a logger, with
`TypeError: Cannot read properties of undefined (reading 'pipe')`, which names neither the component
nor the provider nor the spy.

Two things fix it, and which one depends on whether the double is wanted:

```ts
// keep a double, but put it where the component will look
const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService);

// or take the component's own provider away, so the module-level one is reached again
TestBed.overrideComponent(ProfileComponent, { remove: { providers: [DeleteAccountService] } });
```

`overrideComponentProvider` is the one to reach for by default — it also queues the component with
the TestBed compiler, which `overrideProvider` alone does not do. Reach for the `remove` form when
the module already provides the spy and the component's declaration is simply in the way.

Under `renderShallow` the override goes in `beforeCreate`, which runs after the testing module is
configured and before the component is created:

```ts
let menu: Spy<NavigationBuilderService>;

renderShallow(CatalogPageComponent, {
  beforeCreate: () => {
    menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService);
  },
});
```

### `injectSpy` cannot reach a component-level provider

`injectSpy(X)` reads the **global** `TestBed` injector. A provider declared on the component
(`@Component({ providers: [...] })`) lives in the element injector, which `TestBed.inject` never
sees. Go through the fixture and re-view the result:

```ts
const player = asSpy(fixture.debugElement.injector.get(PlayerService));

player.play.mockReturnValue(true);
```

To _replace_ it rather than read it, the provider has to be overridden — and `provideAutoSpy` cannot
do that, because a testing-module provider loses to one the component declares:

```ts
import { overrideAutoSpy, overrideComponentProvider } from 'vitest-auto-spy/angular';

const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService); // → Spy<NavigationBuilderService>

// or, when the component is already in the testing module:
TestBed.configureTestingModule({ … }).overrideProvider(PaymentMethodService, overrideAutoSpy(PaymentMethodService));
```

`overrideProvider(X, provideAutoSpy(X))` is **not** broken, contrary to what this section used to
say: `provideAutoSpy` returns `{ provide, useValue }`, `overrideProvider` reads the `useValue` off
it and ignores the extra `provide`, and the spy is installed. `overrideAutoSpy` is the right call
because it says what it does and hands the spy back directly — not because the other form is a
no-op.

The failure that is real: `overrideProvider` only reaches a component the TestBed compiler knows
about, so a standalone component instantiated through a parent's template needs to be in `imports`
first; `overrideComponentProvider` queues it.

**`overrideComponentProvider` verifies itself**, always — not behind a diagnostics flag. On the next
`TestBed.createComponent` it asks the component's **own** injector for the token and throws when the
answer is not the spy it created, naming the component, the token and what was resolved instead. It
checks the **first** fixture only and stays silent when the component was not rendered (behind an
`@if`, a different host), so a throwaway fixture created first means "not checked", not "wrong". A
later `TestBed.overrideProvider(Token, …)` still wins; the check reports that but cannot prevent it.
`overrideAutoSpy` carries no verification of its own.

Do **not** reach for `TestBed.overrideComponent` here — see the next subsection for why it is worse
than the problem it solves.

### An NgModule that contributes nothing

Under an AOT test bundle (`@angular/build:unit-test`, and any builder that compiles specs the way it
compiles production code) `ɵɵsetNgModuleScope` is stripped, because only the TestBed reads it. Every
NgModule then has an empty `ɵmod.declarations` / `ɵmod.exports` at runtime. Nothing notices while
AOT is in charge — the flat dependency list is already baked into each `ɵcmp` — but the moment the
TestBed resolves a scope itself, through `imports: [SomeModule]` or through a JIT recompilation
after `overrideComponent`, it resolves it from nothing:

```
NG0303: Can't bind to 'appTruncate' since it isn't a known property of 'div'
NG0301: Export of name 'focusable' not found!
NG0304: 'ui-smart-row' is not a known element
(nothing at all — an attribute directive simply never instantiates)
```

None of the four names the module. Say so up front instead:

```ts
import { assertNgModuleScopes } from 'vitest-auto-spy/angular';

assertNgModuleScopes(DirectivesModule, PipesModule); // throws, naming the module and the cause
```

Then declare what the spec needs in the TestBed module directly. Pass only modules you expect to
bring declarations — a providers-only module is legitimately empty.

### A component whose own definition has a hole in it

The same bundle, one level down. A component's `providers`, `viewProviders` and compiled scope are
**baked into `ɵcmp` when its module executes**, not read at `createComponent` time — so a barrel
split into a chunk that has not run yet produces a definition with `undefined` in those lists.
Angular finds out much later, from inside itself, with a stack that names neither the barrel nor the
component:

```
TypeError: Cannot read properties of undefined (reading 'provide')
  ❯ resolveProvider render3/di_setup.ts:95
```

Both obvious cures fail: `await import('@scope/lib')` at the top of `beforeEach` is already too late,
and a static import at the top of the spec does not fix the order this bundler emits. Worse, the spec
that breaks is one nobody touched — chunk boundaries move with file _contents_, so editing a type
next door is enough.

```ts
import { assertComponentDefIntact } from 'vitest-auto-spy/angular';

assertComponentDefIntact(HoverMenuComponent); // HoverMenuComponent.ɵcmp.providers[0] is undefined
const fixture = TestBed.createComponent(HoverMenuComponent);
```

It walks the three lists, nested arrays and forward-reference thunks included, and answers the
related `Cannot read properties of undefined (reading 'ɵcmp')` from `imports: [Cmp]` as well — there
the class reference itself never arrived, and the message names the argument position. Directives
(`ɵdir`) are checked the same way. Neither this nor `assertNgModuleScopes` fixes the build; both
replace a stack inside `@angular/core` with a line naming what is missing.

### Four silent failures, as one setup line

```ts
// vitest.setup.ts — AFTER getTestBed().initTestEnvironment(…), because Vitest runs
// afterEach hooks in reverse registration order and this one must run before the teardown.
import { enableAngularDiagnostics } from 'vitest-auto-spy/angular/diagnostics';

enableAngularDiagnostics(); // { ngModuleScopes, deadSchemas, unspiedProviders, pendingRequests, shadowedProviders }
```

| Member | Fails when |
| --- | --- |
| `ngModuleScopes` | a testing module imports an NgModule that contributes nothing at runtime |
| `deadSchemas` | `schemas` sit next to a standalone component (`declarations` empty) — a no-op |
| `unspiedProviders` | `injectSpy` got a real instance; a `console.warn` alone, a throw under the group |
| `pendingRequests` | the test ended with unflushed `HttpTestingController` requests, named one by one; `{ ignoreCancelled: true }` forgives the ones the code under test cancelled |
| `shadowedProviders` | a double on the testing module loses to the component's own `providers` |

Every member defaults to `true`, takes `false` to opt out, and a second call **replaces** the
selection (safe from anywhere, including inside a test). `disableAngularDiagnostics()` turns the
group off and leaves the TestBed timing instrumentation alone. `assertNoShadowedProviders(Component, fixture)`
and `assertNoPendingRequests({ ignoreCancelled }?)` are the same checks on their own, for a spec that renders through a
helper of its own or wants the HTTP one mid-test — reading takes the requests, so the group will not
re-report what you inspected.

Nothing here imports `@angular/common/http/testing`: the token is read out of the spec's own
`provideHttpClientTesting()` / `HttpClientTestingModule` — including one reached through a nested
module, which is the usual `imports: [SharedTestingModule]` shape and used to make `pendingRequests`
inert without saying so — and a project using neither is genuinely inert. `ngModuleScopes` only fires
on a module that contributes **nothing at all** — a providers-only module is legitimately
scope-empty, so a stripped scope that still has providers passes silently; hand-call
`assertNgModuleScopes(...)` where you know what the module was supposed to bring. `deadSchemas` does
not fire when `declarations` is non-empty.

**`getTestBed()` is covered as well as `TestBed`.** The instrumentation sits on the TestBed
_instance_ every static delegates to, so the configuration inspectors, `shadowedProviders` and the
`overrideComponentProvider` verification all see `getTestBed().configureTestingModule(…)` and
`getTestBed().createComponent(…)` — the shape a setup helper of your own usually writes — and
`overrideTemplate` is counted with the rest of the overrides. A suite on `getTestBed()` used to get
silence from every one of these.

Two more things now judge what Angular ends up with rather than one call: `deadSchemas` tallies
`schemas` and `declarations` across **every** `configureTestingModule` of a test, because Angular
accumulates them — a schema added in a second call next to a component declared in the first is no
longer reported, and the reverse order is no longer silently passed — and a test that resets the
testing module twice reports the requests of every module it built, not only the last.

`enableAngularDiagnostics()` and `mockSignalProp()` both check once per worker that the Angular
internals they read are still there, and **throw** naming the installed `@angular/core` version when
one has moved. Nothing about that is fixable from a spec: the throw tells you which shape went and
what stopped working, and the repair is a release of this package.

### `httpResource()` and `HttpClient` in two lines — `vitest-auto-spy/angular-http`

```ts
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });

const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

await expectRequest('/api/products').flush([product]);

expect(products.value()).toEqual([product]); // no tick, no microtask, no detectChanges
```

`expectRequest` does the six steps a zoneless HTTP spec otherwise writes by hand: tick (an
`httpResource()` created in an injection context has issued **nothing** until something does), inject
the `HttpTestingController`, find the one matching request, flush it, let one microtask run so the
response reaches the resource, tick again so the view reading it is current. Miss the first and
`expectOne` reports a request that was never sent; miss the fifth and the assertion reads the
resource's **default** value and passes.

| Call | Does |
| --- | --- |
| `provideHttpTesting(opts?)` | `provideHttpClient()` + `provideHttpClientTesting()`; `{ verifyOnTeardown }` defaults to `true`, and takes `{ ignoreCancelled }` instead of `false` |
| `expectRequest(matcher, opts?)` | tick, then the one match — `.request`, `.flush(body, opts?)`, `.error(status, opts?)` |
| `expectNoRequest(matcher?, opts?)` | tick, then assert nothing matched; no argument means "nothing at all was requested" |
| `verifyNoPendingRequests(opts?)` | the teardown check by hand, for mid-test use or a suite with `verifyOnTeardown: false`; `{ ignoreCancelled: true }` forgives a request the code under test unsubscribed from |

`matcher` is a URL (matched against either `url` or `urlWithParams`), a `RegExp` over
`urlWithParams`, or a predicate `(request) => boolean`. `{ method }` is case-insensitive.
`flush()` and `error()` are `async` because settling requires letting a microtask run — `await` them,
and the next line reads the settled value.

Three things to know before reaching for it:

- **It does not re-export the core** — nor does `/angular-router`; every other subpath does. It is a
  companion to `vitest-auto-spy/angular`, which stays the import for spies, `TestBed` helpers and
  `settleResource`.
  Staying narrow is what keeps `@angular/common` — an **optional** peer — out of every other entry.
- **`settleResource` is unchanged and still the answer** whenever the wait is not tied to one
  request: a `resource()` with an async loader, an `rxResource`, a reload, anything not HTTP.
- **`enableAngularDiagnostics({ pendingRequests })` is unchanged and cooperates.** Both take the open
  requests with the one-shot `match(() => true)`, so an unanswered request is reported once. For a
  suite using `provideHttpTesting()` everywhere the diagnostic is redundant; keep it on while any
  file still configures HTTP testing by hand.

`provideHttpTesting({ verifyOnTeardown })` reads which test is running off the runner's own state,
and where that state is absent — `bun:test`, `node:test`, anything that is not Vitest — the
end-of-test check cannot arm. It now says so once per worker instead of checking nothing quietly;
call `verifyNoPendingRequests()` yourself there.

### `ActivatedRoute` from one record — `vitest-auto-spy/angular-router`

```ts
import { injectActivatedRoute, provideActivatedRoute } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({
  providers: [provideActivatedRoute({ params: { id: '7' }, queryParams: { tab: 'reviews' } })],
});

const fixture = TestBed.createComponent(ProductPage);

injectActivatedRoute().setParams({ id: '8' }); // params + paramMap emit; snapshot.params already agrees
fixture.detectChanges();
```

**Do not hand-write an `ActivatedRoute` double, and do not `provideAutoSpy(ActivatedRoute)`.** Its
streams and its snapshot are instance fields: the spy has neither, and a `useValue` has whichever half
its author thought of — `route.paramMap.pipe(…)` throws on the `{ snapshot }` one, `route.snapshot`
is `undefined` on the `{ params: of(…) }` one, and a spec that updates one half by hand tests a route
no navigation produces. `provideActivatedRoute(init)` provides **Angular's own `ActivatedRoute`**
built over one record, so every stream, both `ParamMap`s and `snapshot` read the same values.

| Call | Does |
| --- | --- |
| `provideActivatedRoute(init?)` | a `FactoryProvider` — a fresh route per injector; `init`: `params`, `queryParams`, `data`, `title`, `fragment`, `url`, `outlet`, `component`, `routeConfig`, `resolve` |
| `injectActivatedRoute(injector?)` | the handle: `.route`, `setParams`, `setQueryParams`, `setData`, `setFragment`, `setUrl`, `set({ … })` |
| `createActivatedRoute(init?)` | the same handle without a `TestBed` — for `new Page(route)`, or a guard given `route.snapshot` |

A setter behaves like the router after a navigation: it **replaces** (not merges) that part, builds
a new snapshot first, then emits only the streams whose value changed (router equality: same keys,
arrays as sorted sets), in the order `queryParams`, `fragment`, `params`, `url`, `data`. Setting
an equal value emits nothing; a string `url` is split on `/`.

Four things to know:

- **List it after `provideRouter()`** — the later provider of `ActivatedRoute` wins, and
  `injectActivatedRoute()` throws naming the one that did. With the real router present, the double
  still works as `relativeTo` for `router.createUrlTree`.
- **One node, no tree.** `root` is the route itself, `parent` / `firstChild` are `null`. For
  `route.parent.params` patch that member with `mockReadonlyProp`, or use `RouterTestingHarness`.
- **`title` is given, not resolved; no navigation, no input binding.** `provideActivatedRoute({
title: 'Product 7' })` answers `route.snapshot.title` — the double puts the string under the
  router's own `RouteTitleKey`, read off the installed router, and does not run a `title: () => …`
  resolver. `Router.navigate` does not move it (the setters do), and `withComponentInputBinding()`
  is the outlet's job (`fixture.componentRef.setInput`).
- **Its own entry, like `/angular-http`.** It does not re-export the core, imports no runner, and is
  the only file that reaches `@angular/router` — an optional peer. The `Location` double below wraps
  `@angular/common/testing`, which `@angular/router` itself depends on, so it adds no peer.

### `Router` from one URL — `vitest-auto-spy/angular-router`

```ts
import { injectRouterDouble, provideRouterDouble } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({ providers: [provideRouterDouble({ url: '/products/7' })] });

const router = injectRouterDouble();

router.emitNavigation('/products/8'); // events emits a NavigationEnd; router.url already reads it
expect(router.navigate).toHaveBeenCalledWith(['/checkout']);
```

**Do not hand-write `createAutoMock<Router>({ events: of(), url: '/' }, { returns: { navigate:
Promise.resolve(true) } })`** — the line 48 hand-rolled providers across two private suites all
converged on, and every part of it is a guess the component falls through: `of()` never emits again,
`url` is a string nobody updates, `routerState` is absent, `serializeUrl` throws on the first
redirect a guard builds. `provideRouterDouble(init)` keeps one URL and derives the rest.

| Call | Does |
| --- | --- |
| `provideRouterDouble(init?)` | a `FactoryProvider` for the `Router` token — a fresh router per injector; `init` is `{ url }`, default `'/'` |
| `injectRouterDouble(injector?)` | the handle: `.router`, `.navigate`, `.navigateByUrl`, `setUrl(url)`, `emitNavigation(event?)`, `setCurrentNavigation(navigation?)` |
| `createRouterDouble(init?)` | the same handle without a `TestBed` — for `new AuthGuard(router)` |
| `collectRouterEvents(events)` | the recording of what `router.events` emits, `expect([[Class, url], …])` in one line — Angular's own integration-spec idiom |

Unlike the route, this is **not** an instance of Angular's class: a real `Router` drags the whole
routing stack in. It is a structural double that answers `url` (serialized as the real router does),
`events` (a `BehaviorSubject` starting at the `NavigationEnd` that put it there), `navigate` and
`navigateByUrl` (spies resolving `true`), `serializeUrl` / `parseUrl` / `createUrlTree` (the
router's own URL work, via `DefaultUrlSerializer` and `createUrlTreeFromSnapshot`), `routerState`
(Angular's own, its `snapshot.url` the URL) and `currentNavigation` / `getCurrentNavigation()` (the
navigation in flight, `null` while the router stands still). **Every other member `Router` declares
throws by name** rather than reading `undefined` — and that holds for the instance fields too, which
is why a hand-rolled double needs `instanceMethodsToSpyOn: ['currentNavigation']` and this one does
not.

Five things to know:

- **It does not navigate.** `navigate()` records the call and resolves `true`; it does not move
  `url`. `setUrl()` and `emitNavigation()` move it; `RouterTestingHarness` over a real
  `provideRouter()` is what tests a navigation.
- **`emitNavigation()` takes what you have** — nothing, a URL string, or an event you built. A
  `NavigationEnd` moves the URL with it; any other event does not. It resolves once the event is
  delivered and a navigation it ended is back to `null` — the moment `navigate()` resolves in an
  application; the work is synchronous, so ignoring the promise changes nothing.
- **The navigation in flight follows the events, and a terminal event ends it _after_ delivering
  it.** `setCurrentNavigation({ extras: { state } })` puts one up and `setCurrentNavigation(null)`
  ends it; a `NavigationStart` pushed through `emitNavigation()` starts one with that event's id,
  URL and trigger, and a `NavigationEnd`, `NavigationCancel`, `NavigationError` or
  `NavigationSkipped` drops it back to `null` once its subscribers have run. Angular's doc comment
  — "the current navigation becomes to null after the NavigationEnd event is emitted" — means
  _after_ literally: the router emits the terminal event from a `tap` with the navigation still in
  flight and clears it in the `finalize` below, and `events` is a Subject, so a synchronous
  subscriber runs between the two. **A component that reads `currentNavigation()` while handling a
  `NavigationEnd` gets the navigation that just finished**, here and in production; it reads `null`
  only once `navigate()` has resolved. Probed against a real `provideRouter()` on Angular 22.
- **Ordering does not matter here.** `Router` is `providedIn: 'root'` and `provideRouter()` does not
  re-provide the token, so the double wins in either order — and a `TestBed` without it hands out a
  real router, which is what `injectRouterDouble()` says by name.
- **It builds spies**, so a runtime entry has to be imported in the suite (`vitest-auto-spy/angular`
  in the same file, or the setup file); the route double needs none.

### `Location` from Angular's own testing classes — `vitest-auto-spy/angular-router`

```ts
import { injectLocationDouble, provideLocationDouble } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

const location = injectLocationDouble();

location.go('/reports/7');
location.simulateUrlPop('/'); // the popstate no method call can cause
```

**A wrap, not a rival.** Angular ships the double — `SpyLocation` with a real history array, a
`urlChanges` journal for assertions, and `simulateUrlPop()` / `simulateHashChange()` for the
browser's half of the contract — and this entry puts it in the family shape of the route and the
router: one provider call, an `injectLocationDouble()` whose errors name the instance that won
(`Location` is `providedIn: 'root'`, so the quiet failure is the real `Location` nobody configured).
`createLocationDouble()` is the same without a `TestBed`. One asymmetry worth knowing: `back()` and
`forward()` wake the popstate subscribers but do not write `urlChanges` — the journal holds what the
app asked for, the subscribers carry what the browser did. And one deliberate difference from
Angular's `SpyLocation`: `path()` keeps the query of `go(path, query)` / `replaceState(path, query)`
(`/reports?tab=7`), as the real `Location.path()` does — `SpyLocation`'s own drops it.

### Signal forms — `vitest-auto-spy/signal-forms`

```ts
import { minLength, required } from '@angular/forms/signals';
import { createForm, registerFormMatchers } from 'vitest-auto-spy/signal-forms';

registerFormMatchers(); // once, in the setup file

const user = createForm({ email: '', name: '' }, (path) => {
  required(path.email, { message: 'Email is required' });
  minLength(path.name, 2);
});

expect(user.email).toHaveFieldErrors([{ kind: 'required', message: 'Email is required' }]);

user.email().value.set('ada@example.test');

expect(user.email).toHaveFieldErrors([]);
```

Signal forms are stable from Angular 22, and a spec that touches one meets the same two things every
time. **`form()` injects**, so a call in a `beforeEach` throws `NG0203: The Injector token injection
failed` — a message about `inject()` that never says "form", whose repair is
`{ injector: TestBed.inject(Injector) }` or a `TestBed.runInInjectionContext` around the call.
**`errors()` answers `RequiredValidationError` instances**, each carrying a `fieldTree`
back-reference, so `toEqual([{ kind: 'required' }])` fails on a property nobody wrote and every
suite falls back to `errors().some((error) => error.kind === 'required')` — which passes just as
happily when the field has three other errors nobody expected.

| Call | Does |
| --- | --- |
| `createForm(model, schema?, options?)` | Angular's own `form()`, built in the `TestBed`'s injection context |
| `createForm(initialValue, schema?, options?)` | the same, with the model signal made for you |
| `registerFormMatchers()` | adds `expect(field).toHaveFieldErrors(kinds)` — the whole set, order-free |

Four things to know:

- **What comes back is Angular's `FieldTree`**, not a double: the states, the validators and the
  write-through to the model are the framework's. A spec that passes its own `signal()` asserts on it
  directly; a plain value gets a signal made here, and `user().value()` reads it back either way.
- **A `computed()` is refused by name** — a form writes into its model, and without the check a
  derived signal would be wrapped as a value while every write vanished.
- **`options.injector` is for the validator that injects**: pass `fixture.debugElement.injector`
  when the service a schema reaches for lives in a component's own `providers`.
- **`toHaveFieldErrors` compares the whole set**, by `kind`, and by `message` only where the spec
  names one; `[]` is "no errors". A field tree and its state both read, so `expect(user.email)` and
  `expect(user.email())` are the same assertion.

**No `FieldTree` double is shipped, on purpose.** It would stand in for a form a component takes as
an input, and across the measured suites no component takes one: forms are built by the component
that owns them (assert through `component.form.tags()`), and custom controls — `FormValueControl<T>`,
`FormCheckboxControl` — are plain components whose contract is `value = model<T>()`, which is
`renderShallow` plus `setInputs`.

### `window` and `document` over the real ones — `provideWindowDouble` / `provideDocumentDouble`

```ts
import { provideDocumentDouble, provideWindowDouble } from 'vitest-auto-spy/angular/doubles';

TestBed.configureTestingModule({
  providers: [
    provideWindowDouble(WINDOW, { screen: { width: 1920, height: 1080 }, devicePixelRatio: 2 }),
    provideDocumentDouble({ visibilityState: 'hidden' }),
  ],
});
```

**Do not write `useValue: window`, and do not build a `mockDocument` from scratch.** These are the
two most hand-rolled providers in an Angular suite — 95 `window` ones and 70 `document` ones across
two private suites — and both hand-written shapes fail the same way. `useValue: window` isolates
nothing: what the test writes stays on the global for the rest of the worker. A double built from
scratch, whether a slice (`{ screen: { width: 1280, height: 720 } }`) or a `mockDocument` with one
hand-written `querySelector`, knows only the members its author thought of, so the component that
reads `screen.colorDepth` or calls `document.createElement` gets `undefined` and the spec fails
somewhere unrelated to what it was testing.

These two merge the overrides **over the real jsdom object** instead: everything the spec did not
name — `location.href`, `getComputedStyle`, `addEventListener`, `document.createElement` — still
answers the way jsdom answers it.

| Call | Does |
| --- | --- |
| `provideWindowDouble(token, overrides?)` | a `FactoryProvider` under the application's own window token |
| `provideDocumentDouble(overrides?, token?)` | the same under Angular's `DOCUMENT`, or under a token of your own |
| `createWindowDouble(overrides?)` / `createDocumentDouble(overrides?)` | the same doubles without a `TestBed` |

Five things to know:

- **The window helper needs your token.** Angular ships `DOCUMENT` (from `@angular/core` itself
  since v20) and has never shipped a `WINDOW`: every application declares its own
  `InjectionToken<Window>`. The helper is generic over the token's type, so an
  `InjectionToken<AppWindow>` has that interface's members checked in the overrides too.
- **A plain `{ … }` merges, anything else replaces.** `{ screen: { width: 1920 } }` keeps
  `screen.colorDepth`; a `vi.fn()`, an array, a `URL` or a stub instance becomes the member whole. The
  slice goes three levels down, the way the merge does — `{ document: { location: { href: '' } } }` is
  checked and merged member by member.
- **Nothing to restore.** The globals are never patched — the double is a view over them, and every
  write and delete lands on the view, which is also how a spec moves a value mid-test:
  `Object.assign(TestBed.inject(WINDOW), { scrollY: 40 })` (`Object.assign` because lib.dom declares
  most of `Window` `readonly`). There is no handle and no `restoreMockedProps()` in this recipe.
- **`provideDocumentDouble` hands the double to Angular as well** — the renderer injects `DOCUMENT`
  too, so replace `createElement` or `body` only where the spec means to.
- **`location` takes overrides like everything else**, though the platform declares its members
  unforgeable: `{ location: { reload: vi.fn() } }` — the shape most hand-written window mocks are —
  records the reload, leaves `location.href` real, and `win.location.href = '/next'` moves the
  double rather than the address bar. `mockValueProp(TestBed.inject(WINDOW), 'innerWidth', 800)` and
  its restore work on the double too, and neither touches the global.
- **Constructors come out unbound.** `win.Date`, `win.Promise`, `win.Object`, `win.Event` are handed
  back as themselves rather than through a binding that loses the statics, so `win.Date.now()`,
  `win.Promise.resolve()`, `win.Object.keys(x)` and `new win.Event('x')` work, and
  `win.Event === window.Event` holds — which is what `instanceof` in production code needs.

### The Material dialog trio — `provideMatDialogData` / `provideMatDialogRef`

```ts
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

**`@angular/material` is not a dependency of this package and must not become one** — it ships no
runtime dependencies at all. That is exactly why the token and the ref class are **arguments**:
`MatDialogRef` is the DI token, the shape the double is measured against and the type the result is
read off, so the spec's own Material import stays the only place it is named.

**Do not hand-roll `{ close: vi.fn() }`.** 36 of these across two private suites are the same three
shapes, and the ref one fails twice. `close` is the only member anybody writes, so a component that
subscribes to `afterClosed()` dies on "is not a function"; the repair written next to it,
`afterClosed: () => of('saved')`, answers before anything closed the dialog — the spec then passes
whether or not `close()` was ever called.

| Call | Does |
| --- | --- |
| `provideMatDialogData(token, data)` | a typed `{ provide, useValue }` — name the type argument and the data is checked against it |
| `provideMatDialogRef(RefClass, init?)` | a `FactoryProvider` — a fresh ref per injector; `init`: `closedWith`, `disableClose`, `componentInstance` |
| `injectMatDialogRef(RefClass, injector?)` | the handle: `.ref`, `.close` (the spy), `emitClose(result?)` |
| `createMatDialogRef(RefClass, init?)` | the same handle without a `TestBed` — and the ref a spied `MatDialog.open()` hands back |

`MatDialog` itself needs no helper of its own: `provideAutoSpy(MatDialog)` already spies it, and the
ref double is the thing its `open()` was missing.

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(MatDialog)] });

injectSpy(MatDialog).open.mockReturnValue(createMatDialogRef(MatDialogRef, { closedWith: 'saved' }).ref);
```

Six things to know:

- **`close` is the spy, and it is the same function the ref carries.** `expect(dialog.close)` and
  `expect(TestBed.inject(MatDialogRef).close)` are one assertion. `emitClose(result?)` is the other
  half — the user closing the dialog from outside, where the streams move and the spy records
  nothing, and the only way to close with `undefined` (a dismissal), which `closedWith` cannot say.
- **`afterClosed()` is replayed, where Material's is a plain `Subject`.** The deliberate departure:
  in a spec the assertion usually subscribes _after_ the component has closed the dialog, and a
  `Subject` has nothing left to say by then. `beforeClosed()` is the same stream — the double closes
  instantly, so there is no window between them, and `afterOpened()` has already emitted.
- **`MAT_DIALOG_DATA` is `InjectionToken<any>` in Material**, so a hand-written `useValue: null`
  compiles for a component that reads `data.name`. `provideMatDialogData<EditUserData>(…)` checks the
  object; a token of your own typed `InjectionToken<EditUserData>` checks it without naming anything.
  With the type argument named the token parameter is `InjectionToken<unknown>`, so the call passes
  `@typescript-eslint/no-unsafe-argument` — do not drop the type argument to silence that rule, it
  only turns the data back into `any`. The value is handed out as it is, so build it per test rather than hoisting it to a constant.
- **Name the ref type as a type argument, not as an instantiation expression.**
  `injectMatDialogRef(MatDialogRef<NameInputDialog, string>)` reads `Ref` off the class's `prototype`,
  which Material types `MatDialogRef<any, any>`, so the handle comes back `any`-typed and assigning it
  to a typed variable is `no-unsafe-assignment`. Write
  `injectMatDialogRef<MatDialogRef<NameInputDialog, string>>(MatDialogRef)` — the same for
  `createMatDialogRef` and `provideMatDialogRef`.
- **`componentInstance` is how the opener drives the dialog**, and it is the one member Material
  keeps off the prototype, so a double that did not have it would read `undefined` rather than
  fail. Hand the stand-in over and the opener works against it — checked, member by member, against
  the component the ref class names:

  ```ts
  const save = new EventEmitter<string>();
  const dialog = createMatDialogRef<MatDialogRef<NameInputDialog, string>>(MatDialogRef, {
    componentInstance: { save, isSaving: signal(false) },
  });

  injectSpy(MatDialog).open.mockReturnValue(dialog.ref);
  save.emit('Grace');

  expect(dialog.close).toHaveBeenCalledWith('Grace');
  ```

- **What it does not answer throws by name.** `backdropClick`, `keydownEvents`, `updateSize`,
  `updatePosition`, `getState`, `componentRef` and `id` are the dialog doing its own work; the
  double names them in the failure instead of reading `undefined`, and the real `MatDialogModule` is
  what answers them. A `componentInstance` nobody handed over says so by name too, and names the
  init field that fixes it.

### Which collaborators the code asked for — `trackInjections`

Do **not** reach for `vi.mock('@app/services')` to answer "was this collaborator used". Register the
collaborators as provider factories and read back which ones DI constructed; a factory runs exactly
when something injects its token, and DI is a seam the bundler cannot remove.

```ts
import { trackInjections } from 'vitest-auto-spy/angular';

// the same function on /nestjs

const collaborators = trackInjections([FeatureFlagService, ANALYTICS_TOKEN]);

TestBed.configureTestingModule({ providers: [CheckoutFacade, ...collaborators.providers] });
collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);

TestBed.inject(CheckoutFacade).start();

expect(collaborators.names()).toEqual(['FeatureFlagService']); // analytics was never asked for
```

`providers`, `injectedTokens()` (in factory-run order), `names()`, `wasInjected(token)`,
`get<D>(token)` → `Spy<D>`, `reset()` (the record only — the doubles survive). A class token gets a
class spy, anything else a `createAutoMock()`; pass `{ double: () => … }` when a collaborator has to
be a real object. Doubles are built eagerly, so stub before the entry point runs; a factory runs once
per injector, so a token appears once per injector, not once per injection site.

### Never mock `@angular/core` to control an `effect()`

Under the Angular unit-test builder the specs are bundled and `@angular/core` sits in a shared
chunk, so `vi.mock('@angular/core', …)` re-enters a chunk that is still initialising and fails with
`Cannot access '__vi_import_N__' before initialization`. The same applies to any module those shared
chunks depend on, and to `vi.mock()` with a relative path (`./`, `../`), which has no module
boundary left to replace once bundled.

Assert the effect's **result** instead — set the signals it reads, let it run, check what it
produced:

```ts
mockReadonlyProp(component, 'state', signal(State.Selected));

await stable(fixture);

expect(component.icon()).toBe('favouritesFilled');
```

When the effect will never become dirty on its own — because its trigger is now a static signal —
run that one effect directly:

```ts
import { runEffect } from 'vitest-auto-spy/angular';

runEffect(component.highlightEffect); // runs the body now, with the current signal values
```

`flushEffects()` runs everything currently dirty; `runEffect(ref)` runs one specific effect
regardless. It runs the previous run's cleanup first, the way Angular's own scheduler does, so an
`onCleanup` callback is observable and the node does not collect one closure per call. An effect
whose view has been torn down — or which was destroyed on its own — is refused rather than run:
after `fixture.destroy()` there is nothing production could still produce. Prefer asserting the
result where practical — `runEffect` reads Angular's reactive node, and throws with instructions if
a future version moves it.

### Counting recomputations and effect runs — `trackRecomputations` / `trackEffectRuns`

"The template read `total()` six times and the computation ran once" and "changing the filter did
not re-run the sync effect" are not observable from the outside: a `computed()` returns the same
value whether it was cached or recomputed. The usual workaround is a counter inside the computation,
which means editing production code to make a test possible.

```ts
import { trackEffectRuns, trackRecomputations } from 'vitest-auto-spy/angular';

const recomputed = trackRecomputations(component.total);
const synced = trackEffectRuns(component.syncEffect);

component.unrelatedFilter.set('open');
await stable(fixture);

expect(component.total()).toBe(42);
expect(recomputed.count).toBe(0); // memoised: nothing it reads changed
expect(synced.count).toBe(0);

recomputed.stop(); // and `restoreMockedProps()` — so `setupAutoSpy()` — takes both off anyway
```

Both return `{ count, stop() }`. `trackRecomputations` counts the **computation**, not the reads,
and takes a `computed()` or a `linkedSignal()` — a plain `signal()` has nothing to compute and is
refused by name. `trackEffectRuns` counts every run whoever asked for it: a flush, a `stable()`, a
`runEffect()` of the same effect. Both wrap one member of Angular's reactive node through
`mockValueProp`, so the undo is the journal every other stub in this package uses.

### ngrx `rxMethod`

An `rxMethod` is a function with a `destroy` property. A bare mock has no `destroy`, so the
component's cleanup throws:

```ts
const load = Object.assign(vi.fn(), { destroy: vi.fn() });
```

Under `strict`, a call whose ref nobody reads is configured with `returns: { load: undefined }`. When
the code does read the ref (it calls `destroy`), seed one from the method's own type — ngrx does not
export `RxMethodRef`: `returns: { load: createAutoMock<ReturnType<Store['load']>>() }`.

A `signalStore()` class keeps its methods and `rxMethod`s on the instance, not the prototype, so
discovery finds none of them. `provideAutoSpy(Store, { fillMissing: true, returns: { … } })` answers
every such member with a spy — `returns` and `strict` apply to them as to any method — instead of a
long `instanceMethodsToSpyOn` list.

```ts
// shallow rendering — configureTestingModule + NO_ERRORS_SCHEMA + overrideComponent, in one call
const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService)],
  inputs: { projectId: 42 }, // signal inputs take the VALUE, not the signal
});
// other options: imports, keepTemplate, keepModules, keepChildren, keepHostDirectives, template, beforeCreate, detectChanges
// COVERAGE: the override recompiles the component under JIT for the rest of the file (keepTemplate too),
// so its AOT template/host branches leave coverage — keep one real TestBed render first where they matter

// change an input after the first render — one setInput per key, then the wait, in one await
await setInputs(fixture, { projectId: 7 }); // a name the component does not declare is refused here
await setInputs(fixture, { projectId: 7 }, { label: 'the task list' }); // options go to stable()
// a fixture whose componentType carries no ɵcmp is refused by name too, not as a bare TypeError
// aliases resolve by CLASS FIELD name, and an input a hostDirectives entry exposes is accepted

// a typed element instead of Angular's `any` — never `fixture.nativeElement as HTMLElement`
const host = hostElement(fixture); // HTMLElement, checked with instanceof
queryElement(fixture, '.close').click(); // HTMLElement; throws naming the selector when nothing matches
queryElement(fixture.debugElement, 'input[name=q]', HTMLInputElement).value; // typed; wrong type throws
// also on /bun-angular; queryElement takes an element found earlier as its root too
// a null source (debugElement.query() that matched nothing) throws saying so, not 'Cannot read properties of null'
expect(queryElement(fixture, '.title').textContent.trim()).toBe('Orders'); // present: read through queryElement
expect(host.querySelector('.empty-state')).toBeNull(); // absent: querySelector on the typed host, no cast
// NOT host.querySelector('.title')?.textContent.trim() — a miss is undefined, which toBeFalsy() accepts

// build a class through DI, every unprovided token auto-spied
const { instance, spies } = createWithAutoSpies(CartService, {
  providers: [{ provide: TaxService, useValue: realTax }], // explicit providers win
});
spies.get(PricingService).total.mockReturnValue(100);
// NOTE: Injector.create() — it does NOT accept EnvironmentProviders (provideHttpClient() etc.)

// zoneless waiting
await stable(fixture); // flush effects, then await the fixture; fails at 2000 ms naming the cause
await stable(fixture, { timeout: 5000, label: 'the products fixture' });
flushEffects(); // the no-fixture half: services, stores, runInInjectionContext

// resources — one wait for httpResource(), resource() and rxResource()
flushEffects(); // an httpResource issues NO request until something ticks
httpTesting.expectOne('/api/products').flush([product]);
await settleResource(products, { label: 'the product resource' });
// a resource left 'idle' FAILS here — params() returned undefined and value() is still the default;
// { allowIdle: true } when that is the state under assertion, { turns } is spent exactly as reported

// on a component the resource is a FIELD and renderShallow is the injection context — nothing else changes
const { component } = renderShallow(ProductListComponent, { providers: [...provideHttpTesting()], keepTemplate: true });
await expectRequest('/api/products?q=').flush([product]); // both from /angular-http; renderShallow already ticked
expect(component.products).toHaveResourceValue([product]);
// after changing a signal the params() computation reads: flushEffects() before the next expectOne/expectRequest

// ...or skip the request entirely when it is not what the spec is about
const products = mockResourceProp(service, 'products', []); // { status: 'idle' } starts it unstarted
products.set([product]); // 'resolved'   products.loading()   products.fail('offline')   products.idle()
service.products.set([edited]); // the component's own optimistic write — status → 'local'
expect(products.reload).toHaveBeenCalled(); // reload is spied, answers true, and re-issues nothing

// signal assertions
registerSignalMatchers(); // once, in the setup file — /angular/matchers
expect(component.total).toHaveSignalValue(3);

// resource assertions — value AND status, which is the whole point
registerResourceMatchers(); // once, in the setup file — /angular/matchers
expect(component.products).toBeLoading();
expect(component.products).toHaveResourceValue([product]);
expect(component.products).toHaveResourceError(/503/);
```

**`renderShallow({ inputs })` and `setInputs` resolve a name the same way**, which they did not
before. Both read the compiled definition, so an input renamed with an alias
(`@Input('chart-series') series` or `series = input(…, { alias: 'chartSeries' })`) is set by its
**class-field** name as well as its public one; both accept an input a `hostDirectives` entry
exposes, which `setInputs` used to refuse with "It declares no inputs at all"; and both refuse a name
the component does not declare, at the call, listing the ones it does. Angular's own answer to an
undeclared name is an `NG0303` on the console and no change at all, so the spec used to fail several
assertions later, on state nothing moved.

Two zoneless traps:

- `fixture.detectChanges()` runs **one** change-detection pass and does **not** flush pending
  effects. Asserting right after it reads state that has not finished computing. Use `await stable(fixture)`.
- `expect(someSignal).toBeTruthy()` passes for **every** signal ever created — a signal is a
  function. Use `toHaveSignalValue`, which also rejects the missing-parentheses mistake — and a
  spy, which it refuses instead of calling.

And one resource trap, which is the same shape one level up: an `httpResource()` reports `loading`
with its **default** value until a tick _and_ a microtask after its response is flushed, so a spec
that asserts too early asserts the default and passes. `settleResource` fails instead of passing
emptily. Note the order — `flushEffects()` first (the request is issued there, not on creation),
then the flush, then the wait. The same trap wearing a different hat is a resource still `idle` when
the wait ends: its `params()` computation returned `undefined`, the loader never ran, and `value()`
is the default. `settleResource` refuses that too, naming the signal the computation reads;
`{ allowIdle: true }` is the opt-out for a spec whose subject is the idle state. Each round is a tick
plus a microtask, and from the third round an event-loop turn as well, so a loader on a real timer
settles rather than burning the budget in microseconds.

`toHaveResourceValue` is the matcher form of that trap and the reason to prefer it over
`expect(products.value()).toEqual(...)`: it **fails an unresolved resource even when the default
value matches**, and names the status it was in. And when the request is not what the spec is about
at all, do not arrange one — `mockResourceProp(service, 'products', [])` replaces the property with
a double whose `set` / `fail` / `loading` / `idle` move it directly, built from real `signal()`s so a
`computed()` downstream still recomputes. The double carries the whole of `ResourceRef`: `value` is
writable and a write through it lands in `'local'`, `set` / `update` / `asReadonly` / `destroy` /
`snapshot` behave as Angular's own do, and `hasValue()` is value-based rather than status-based —
`true` while the resource is loading over a value that is defined, which is what Angular has answered
since v20. Nothing is in flight, so there is nothing to await.

**The double is no more forgiving than the real thing, in two places that used to hide a defect.**
`value()` read after `fail(reason)` **throws** — a `ResourceValueError` carrying the reason on
`cause` and naming the property — exactly as a real `ResourceRef` does, so a spec that read the value
after arranging the error branch fails now instead of reading the last good value. Branch on
`hasValue()` / `status()` first, or assert with `toHaveResourceError()`. And `reload()` answers
`false` while the resource is `'idle'` or `'loading'`, as Angular's does, rather than a constant
`true` — `expect(products.reload).toHaveBeenCalled()` is still the assertion to write; the return
value is only for code that branches on it.

**The resource, focus and directive matchers throw on an argument of the wrong type.** They used to
report `{ pass: false }`, which `.not` turns into a pass — so
`expect(products.value()).not.toBeLoading()` (the value, not the resource),
`expect(missingEl).not.toHaveFocus()` (a query that found nothing) and
`expect(undefined).not.toHaveDirectiveApplied(X)` were three green assertions about nothing. Each
now throws, naming what it received.

Per-file timing, to find which specs actually pay for `TestBed`:

```ts
import { enableTestBedDiagnostics } from 'vitest-auto-spy/angular/diagnostics';

if (process.env['SPEC_TIMING']) {
  enableTestBedDiagnostics();
}
```

### Angular under `bun test`

`vitest-auto-spy/bun-angular` is a **preload**, not a normal import — it installs a DOM, inlines
`templateUrl` / `styleUrls` through a `Bun.plugin` hook and boots a zoneless TestBed:

```toml
# bunfig.toml
[test]
preload = ["vitest-auto-spy/bun-angular"]
```

The preload imports `provideZonelessChangeDetection` and `platformBrowserTesting` as values, so it
wants **Angular >= 20** and a declared `@angular/platform-browser`; on 18 or 19 it throws while
loading, because the zoneless provider was still called
`provideExperimentalZonelessChangeDetection` there.

It exports the core, `provideAutoSpy` / `injectSpy`, `renderShallow`, `createWithAutoSpies`,
`setInputs`, `runEffect`, `settleResource`, `trackEffectRuns` / `trackRecomputations` and
`stable` / `flushEffects` — nothing else from this section. The matcher registrars
(`registerSignalMatchers`, `registerDirectiveMatchers`, `registerResourceMatchers`) need the runner's
`expect.extend` and the TestBed diagnostics its suite-level hooks; the overrides, `extendWithAutoSpies`,
`provideAutoSpyForToken`, `trackInjections`, `setupAngularTestEnv`, the stub factories and the
`mock*Prop`, platform and dialog doubles are simply not routed to Bun. Import them from `/angular`
under Vitest, and the registrars, doubles and diagnostics from their companion entries
(`/angular/matchers`, `/angular/doubles`, `/angular/diagnostics`).

---

### Zone and zoneless spec files in one worker

`TestBed.initTestEnvironment` may be called once per platform, and under `isolate: false` the
platform lives for the whole worker — so a repository migrating to zoneless gradually cannot express
itself in setup files: the second file the worker picks up in the other mode fails with `Cannot set
base providers because it has already been called`, naming neither file. `test.projects` does not
help; nothing promises a worker serves files of one project.

```ts
setupAngularTestEnv({
  zoneless: (testPath) => testPath.includes('/libs/widgets/'),
  initZone: setupZoneTestEnv,
  initZoneless: setupZonelessTestEnv,
});
```

It resets the environment only when the mode actually changes, and the initialisers stay yours —
which platform and which providers is not this library's decision. The mode is remembered **per
worker**, so under `isolate: false` a run of files all in one mode initialises once: before, every
spec file reset the environment and re-ran your initialiser.

---

### A dependency behind an `InjectionToken`

```ts
providers: [provideAutoSpyForToken(PASSCODE_SERVICE_TOKEN)];
const passcode = injectSpy(PASSCODE_SERVICE_TOKEN); // Spy<PasscodeService>
```

A token typed with an interface has no class to read, so the habit is a `…Mock` class written in the
spec — after which `Spy<Mock>` and `Spy<Interface>` disagree and somebody casts. Do not write
`TestBed.inject<any>(TOKEN)`; both of these accept a token. And it is `provideAutoSpyForToken`, not
`provideAutoSpy`: the latter reads a class prototype, which a token does not have.

**The second argument is not optional as often as it looks.** A spy answers `undefined` until it is
told otherwise, and that is fatal the moment the code under test _chains_ off it — a constructor
doing `inject(LOGGER).channel('auth').debug('…')` dies on the `.debug` of `undefined` before the
spec's first line runs, because nothing in production wrote `?.` there. Name the link:

```ts
provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] });
```

`channel` stays a spy (assertable, and configured under `strict`) and answers the double itself.
When every file wants it, register it once — `registerAutoSpyDefaults(LOGGER, { selfReturning:
['channel'] })` from `vitest-auto-spy/angular` (§5) — and the provider is `provideAutoSpyForToken(LOGGER)`.

For a chain more than one link long, `mockDeep<T>()` is the double that answers every level (§2).

### A host for a directive under test

```ts
const Host = createDirectiveHost({
  template: `<div [appTruncate]="enabled"></div>`,
  scope: [DirectivesModule], // the component's imports, NOT the TestBed's
  props: { enabled: false },
});

TestBed.configureTestingModule({ imports: [Host] });
```

The two halves of Angular disagree about where `imports` is resolved: on a `@Component` the AOT
compiler resolves it at build time and bakes the flat list into `ɵcmp`, so an NgModule there works;
on `TestBed.configureTestingModule` it is resolved at runtime from `ɵmod`, and `ɵɵsetNgModuleScope`
is not emitted into a test bundle, so the same line contributes nothing. A host written
`standalone: false` inside a spec is compiled outside any scope at all — no `NgClass`, no
`AsyncPipe`, nothing.

`registerDirectiveMatchers()` adds `expect(fixture).toHaveDirectiveApplied(Directive, 'div')`, which
asserts the fact Angular reports three wrong ways (`NG0303` points at the module where the directive
_is_ declared; `NG0304` calls a missing directive a missing component; a bare attribute reports
nothing at all). `schemas: [NO_ERRORS_SCHEMA]` next to a standalone component is a dead entry —
schemas apply to a testing module's `declarations` only.

### A stand-in for a child — `createComponentStub`

Do not hand-write `class MockChartComponent` with a copied selector: nothing checks the copy, so a
renamed input leaves the parent's binding pointing at nothing and the spec green. Build the stub
from the real class's compiled definition instead:

```ts
import { createComponentStub } from 'vitest-auto-spy/angular';

const ChartStub = createComponentStub(ChartComponent); // also a directive or a pipe

TestBed.configureTestingModule({ imports: [DashboardComponent] });
TestBed.overrideComponent(DashboardComponent, { remove: { imports: [ChartComponent] }, add: { imports: [ChartStub] } });

const chart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance;
expect(chart.series()).toEqual([1, 2, 3]); // a signal input stays a signal input
chart.pointSelected.emit(2); // outputs are EventEmitters; a model() stays a model
```

Copied from `ɵcmp` / `ɵdir` / `ɵpipe`: the selector, every input under its public name (transforms
included), every output, `exportAs`, a pipe's name and purity. Not copied: the template (the stub
renders one `<ng-content>` per slot the real one projects — `{ template }` in the third argument
replaces it), host bindings, providers, lifecycle hooks, queries, and **`hostDirectives`** — so an
input the real component exposes through one is not on the stub, even though `setInputs` accepts that
name on the real thing. The second argument seeds members per instance — a method the parent calls
through `viewChild`, a pipe's `transform` (identity by default). With `renderShallow`:
`renderShallow(Parent, { keepTemplate: true, keepChildren: [ChartStub] })` — the real child is
dropped as a component import and the stub is the one child left.

### Patching a property of a spy

`mockReadonlyProp` / `mockValueProp` / `mockSignalProp` accept the `Spy<T>` that `injectSpy` returns,
and type the value against the member's **own** type. For a signal-valued member prefer
`mockSignalProp(service, 'state', initial)` over `gettersToSpyOn`: a spied getter returns `undefined`
until configured, a real signal keeps everything downstream reactive.

**A spec importing `@ngneat/spectator`** is on a package whose repository is a 404 and which does not
resolve on Angular 22 (it imports `@angular/platform-browser-dynamic/testing` without declaring it).
`createSpyObject` → `createSpyFromClass`, `mockProvider` → `provideAutoSpy`, `spectator.inject` →
`injectSpy`, `SpyObject<T>` → `Spy<T>`, `createComponentFactory` → `renderShallow`. There is no
replacement here for `spectator.query`, the event helpers or the DOM matchers — leave those on
`@testing-library/angular` rather than inventing an equivalent. Full mapping:
[Migrating from @ngneat/spectator](https://asdalexey.github.io/vitest-auto-spy/migrating-spectator).

A suite coming off [`@suites/unit`](https://github.com/suites-dev/suites) maps one to one:
`TestBed.solitary(S).compile()` → `createNestUnit(S)`, `TestBed.sociable(S).expose(D).compile()` →
`createNestUnit(S, { expose: [D] })`, `unitRef.get` → `spies.get`, `.final(v)` →
`{ provide, useValue }`, and the `await` goes away because the graph is built synchronously. The one
thing to check by hand after the swap: Suites' double answers every property name, so a spec that
stubbed a since-renamed method was passing over nothing and will now fail. Full mapping:
<https://asdalexey.github.io/vitest-auto-spy/migrating-suites>.

**A spec importing `@testing-library/angular` usually keeps it.** `render`, `screen` and the query
set are a different discipline and have no twin here. What overlaps is the secondary
`@testing-library/angular/vitest-utils` entry alone — 52 lines, four exports:
`createMock` → `createSpyFromClass`, `createMockWithValues` → `createSpyFromClass(X, { overrides })`,
`provideMock` → `provideAutoSpy`, `provideMockWithValues` → `provideAutoSpy(X, { overrides })` —
`overrides` and not `returns`, because those values replace the member rather than configure it. Its
walk assigns a mock only where `typeof descriptor?.value === 'function'`, so accessors are dropped
silently while its `Mock<T>` still types them callable, and it recurses past `Object.prototype`, so
`hasOwnProperty` and `toString` end up as `vi.fn()`. Full mapping, verified against the 19.4.2
tarball: <https://asdalexey.github.io/vitest-auto-spy/migrating-testing-library-angular>.

- **`renderShallow` has no single speed number, and quoting one is a bug.** This repository commits
  no harness for the helper, so no surface publishes a ratio for it and none may be invented.
  Describe the shape instead: `renderShallow` is flat in the number of children because it never
  builds the subtree, while `TestBed.createComponent` scales linearly with it — so the win is
  however much markup the component under test happens to own, nothing on a leaf component and a
  great deal on a table or a dashboard. A per-render ratio would in any case be the upper bound on
  what a spec file can gain rather than a prediction of it, because a file also pays for imports,
  the `TestBed` module and the assertions. Link to
  `/core/performance#_2-rendering-the-child-subtree`. A speed figure for the helper also sits in
  `PRIORITIES.md`, backed by nothing in this repository — do not publish it until someone produces
  the measurement.
- **Competitor defects are quoted from the published tarball, with a file, a line and a date.** The
  `@testing-library/angular` `createMock` claims in `docs-site/comparison.md` are pinned to
  `fesm2022/testing-library-angular-vitest-utils.mjs` lines 14 and 18 at 19.4.2. Re-`npm pack` and
  re-read before restating them against a new version; the "Where the numbers come from" box records
  each re-verification date rather than replacing the previous one.
- **Head-to-head benchmark numbers are quoted from the measurement, not from memory.** `npm run
bench:vs` and `npm run bench:suite` (see `CONTRIBUTING.md` for setup) back the claims in
  `core/performance.md`; point at that page rather than retyping a figure here, so it lives in one
  place. Micro-benchmark ratios do not transfer to suite scale: double construction is on the order
  of 1% of a test's cost, and an advantage that looks like several times faster per double can be
  gone, or reversed, once a whole suite runs. Suite-scale wall-clock is noisy between invocations;
  peak RSS reproduces far more tightly and is the safer claim. Never state a magnitude the source
  marks as not established.

`node:test` keeps every `mock.fn()` in one process-wide `MockTracker` for the life of the process.
On a long suite that is real memory — 20 000 spies of a 10-method class retained 124.5 MB on
Node v24.19.0. `trackNodeMocks()` puts this library's spies on a tracker it owns and replaces it per
test: 5.9 MB for the same run, against a 5.4 MB baseline.

\```ts
import { before } from 'node:test';
import { trackNodeMocks } from 'vitest-auto-spy/node';

before(() => trackNodeMocks()); // opt-in, idempotent, returns the undo

// by hand, for a concurrent suite: pruneNodeMocks() → how many were dropped; countNodeMocks() → how many are held
\```

It never calls `mock.reset()` — that would restore and forget the `mock.fn()` the spec made itself —
and it never throws: the class is reached through the undocumented `mock.constructor`, so the
constructed tracker is probed first and any failure leaves spies on `node:test`'s own tracker.
Spies created **before** the call stay there too. `mock.reset()` in `afterEach` is the fallback.

**A `node:test` spy now prints under its method name.** `mock.fn()` takes no name and has no
`mockName()`, so a spy inherited the library's internal dispatcher and read back as
`[Function: dispatch]` everywhere. The adapter names the _implementation_ at creation and lets
`mock.fn()` carry that name onto the mock, which is where a `node:test` mock takes its `name` from;
`displayName` is set on the mock alongside it. The name survives `mock.reset()`, `mock.restore()`,
`resetCalls()` and a `mockImplementation()` swap, and it is what `node:assert` diffs, what
`util.inspect()` prints and what this package's own messages read. Do not "simplify" this into
`Object.defineProperty(mock, 'name', …)`: redefining `name` drops the function out of V8's fast map
and costs +206 B per mock against +65 B for naming at creation, measured over 200 000 mocks. `getMockName()` still does not exist there: read `spy.method.name`. Nothing labels a
mock in `node:test`'s reporter output on its own. Full account:
<https://asdalexey.github.io/vitest-auto-spy/runtimes/node#spy-names>.

### Rstest

`vitest-auto-spy/rstest` drives the same core through `rstest.fn()` / `rstest.spyOn()`. Rstest
implements the Jest/Vitest mock surface, so **none of the `node:test` differences above apply**:
`spy.method.mock.calls[0]` is a bare argument array, the `mockReturnValue` family is native, and
`gettersToSpyOn` / `settersToSpyOn` go through `rstest.spyOn(obj, 'prop', 'get' | 'set')` rather than
the redefinition fallback. `rstest.clearAllMocks()`, `rstest.resetAllMocks()` and the
`clearMocks: true` / `resetMocks: true` config keys reach spies built by `createSpyFromClass` — the
entry plants one sentinel mock for it, and there is nothing to enable.

Two things are not there. `vitest-auto-spy/setup` is wired to Vitest's hooks, so `setupAutoSpy()` and
the fake-timer helpers are Vitest-only — on Rstest, import `vitest-auto-spy/rstest` once in the setup
file, which is the part a setup file is for. `trackNodeMocks()` is `node:test`-only and is not needed:
Rstest drops its mock registry between files, like Vitest and Bun.

Rstest is 0.x. Vitest stays the zero-config default; reach for this entry when the suite already runs
on Rstest, which is typically an Rspack project reusing its bundler config for tests. Full account:
<https://asdalexey.github.io/vitest-auto-spy/runtimes/rstest>.
