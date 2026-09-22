---
title: Angular router
description: provideActivatedRoute, provideRouterDouble and provideLocationDouble — Angular's own ActivatedRoute over one record, a Router whose URL, routerState and events cannot disagree with navigate already spied, and the SpyLocation wrap for where either lands.
---

# Angular router

Three doubles live here: the `ActivatedRoute` a component reads, the [`Router`](#the-router-double)
it navigates with, and Angular's own [`Location`](#the-location-double) for where either of them
lands. None needs the others, and a spec that needs several lists several.

```ts
import { injectActivatedRoute, provideActivatedRoute } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({
  providers: [provideActivatedRoute({ params: { id: '7' }, queryParams: { tab: 'reviews' } })],
});

const fixture = TestBed.createComponent(ProductPage);

injectActivatedRoute().setParams({ id: '8' });
fixture.detectChanges(); // params and paramMap emitted; snapshot.params already reads { id: '8' }
```

`ActivatedRoute` keeps everything a component reads — `snapshot`, `params`, `queryParams`, `data`,
`fragment`, `url` — in instance fields. Each of the usual doubles has only part of it, and the part
it lacks fails a long way from the provider:

| Double                                                            | What the code that reads the other half gets                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `provideAutoSpy(ActivatedRoute)`                                  | no `snapshot`, no `params`: they are instance fields, and a spy is built from the prototype          |
| `{ provide: ActivatedRoute, useValue: { snapshot: { params } } }` | `route.paramMap` is `undefined`, so `route.paramMap.pipe(…)` throws inside the component             |
| `{ provide: ActivatedRoute, useValue: { params: of({ id }) } }`   | `snapshot` is `undefined`, and the stream never moves again — the second navigation cannot be tested |
| both halves, written by hand                                      | they agree until the first spec that updates one and forgets the other                               |

The double here is not a look-alike. It is Angular's own `ActivatedRoute`, built over one record:
every stream is a `BehaviorSubject` of one of its fields, the snapshot is Angular's own
`ActivatedRouteSnapshot` of the same record, and both `ParamMap`s are the ones Angular derives from
them. There is no second copy to fall out of step.

## `provideActivatedRoute(init?)`

```ts
TestBed.configureTestingModule({
  providers: [
    provideActivatedRoute({
      params: { id: '7' },
      queryParams: { tab: 'reviews' },
      data: { product: chair },
      fragment: 'specs',
      url: 'products/7',
    }),
  ],
});
```

| `init` member | Reaches                                                                                                                                               | Default     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `params`      | `params`, `paramMap`, `snapshot.params`, `snapshot.paramMap`                                                                                          | `{}`        |
| `queryParams` | `queryParams`, `queryParamMap` and their snapshot twins                                                                                               | `{}`        |
| `data`        | `data`, `snapshot.data`                                                                                                                               | `{}`        |
| `title`       | `route.title`, `snapshot.title` — stored under the router's own `RouteTitleKey`, which the double reads off the installed router rather than guessing | `undefined` |
| `fragment`    | `fragment`, `snapshot.fragment`                                                                                                                       | `null`      |
| `url`         | `url`, `snapshot.url` — a string is split on `/`                                                                                                      | `[]`        |
| `outlet`      | `outlet`, `snapshot.outlet`                                                                                                                           | `'primary'` |
| `component`   | `component`, `snapshot.component`                                                                                                                     | `null`      |
| `routeConfig` | `routeConfig`, `snapshot.routeConfig`                                                                                                                 | `null`      |
| `resolve`     | `snapshot`'s resolved-data record, kept apart from `data` as Angular keeps it                                                                         | `{}`        |

A string `url` gives segments without matrix parameters; pass `UrlSegment`s
(`[new UrlSegment('products', { color: 'red' })]`) when the code reads them.

It returns one `FactoryProvider`, so it goes into `providers` as it is, and **every injector that
builds it gets a route of its own**: a provider list hoisted to a module constant and reused across
tests never carries one test's navigation into the next.

::: warning List it after `provideRouter()`
A spec that also calls `provideRouter()` (or imports `RouterModule`) has two providers of
`ActivatedRoute`, and the later one wins. Put `provideActivatedRoute()` last — `injectActivatedRoute()`
says so by name if it finds the router's own route instead.
:::

## `injectActivatedRoute(injector?)`

```ts
const route = injectActivatedRoute();

route.setQueryParams({ tab: 'specs' });
route.set({ params: { id: '9' }, fragment: null });
```

The handle of the route `provideActivatedRoute()` put in the test's injector. It reads the `TestBed`;
pass `fixture.debugElement.injector` when the route is in a component's own `providers`.

| Member                   | What it does                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `route`                  | the `ActivatedRoute` every injector in the test hands out                          |
| `setParams(params)`      | replace the params                                                                 |
| `setQueryParams(params)` | replace the query params                                                           |
| `setData(data)`          | replace the data                                                                   |
| `setFragment(fragment)`  | replace the fragment; `null` for none                                              |
| `setUrl(url)`            | replace the URL segments; a string or `UrlSegment[]`                               |
| `set(change)`            | several of the above in one navigation: one new snapshot, each stream at most once |

Every change behaves the way the router's own update after a navigation does, so a spec cannot see
something the application never would:

- **The snapshot moves first.** A subscriber to `params` that reads `route.snapshot` inside its
  callback already sees the new values. The snapshot is a **new object** each time, as it is after a
  navigation — a reference kept from before still holds the old state.
- **Streams emit in the router's order** — `queryParams`, `fragment`, `params`, `url`, `data`.
- **An equal value emits nothing.** Equality is the router's: the same keys, symbol keys included,
  each value `===`, arrays compared as sorted sets. A string `url` builds new segments, and new
  segments are a change, exactly as when the router re-parses a URL.
- **A setter replaces, it does not merge** — the params after a navigation are the whole set. Spread
  the old ones to keep them: `route.setQueryParams({ ...route.route.snapshot.queryParams, page: '2' })`.

## `createActivatedRoute(init?)`

The same double without a `TestBed` — for a class built with `new`, or a functional guard or
resolver that takes the snapshot as an argument:

```ts
import { createActivatedRoute } from 'vitest-auto-spy/angular-router';

const { route, setParams } = createActivatedRoute({ params: { id: '7' } });
const page = new ProductPage(route);

setParams({ id: '8' });

expect(page.productId()).toBe('8');
```

The setters are plain functions over the route they were built with, so destructuring them is safe.

## Angular's own route, checked against Angular

- `route instanceof ActivatedRoute` and `route.snapshot instanceof ActivatedRouteSnapshot` hold, and
  the specs compare the double's own keys with those of `new ActivatedRoute()` and
  `new ActivatedRouteSnapshot()` — a member a future Angular adds is on the double the day it ships,
  and a change in how the classes are built fails the suite instead of shipping.
- The route sits in a one-node tree, so the tree getters answer rather than throw: `root` is the
  route itself, `parent` and `firstChild` are `null`, `children` is empty, `pathFromRoot` is
  `[route]` — and the same for the snapshot.
- It is a real route to the real `Router`:

  ```ts
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideActivatedRoute({ url: 'products/12' })] });

  const router = TestBed.inject(Router);

  router.serializeUrl(router.createUrlTree(['reviews'], { relativeTo: injectActivatedRoute().route }));
  // '/products/12/reviews'
  ```

The route is built with the router's own constructors, which are internal — unchanged from Angular 20
through 22, and verified as the double is built. A major that reorders them fails on the first
`provideActivatedRoute()` with a message naming the member that came out wrong, not with a route
that quietly reads the wrong field; the package's CI builds the double on every Angular major it
supports.

## What it deliberately does not do

- **No parent or child routes.** A component that reads `route.parent.params` or
  `route.firstChild` needs a tree; patch the one member with
  [`mockReadonlyProp`](/adapters/angular#signal-readonly-property-mocking) or navigate a real router
  with `RouterTestingHarness` when the tree is what is under test.
- **`title` is the record's, not a resolver's.** `provideActivatedRoute({ title: 'Product 7' })`
  answers `route.snapshot.title` — the router reads a title out of `data` under a symbol it never
  exports, and the double puts yours there, learning the symbol from the installed router. What it
  does not do is _resolve_ a `title: () => …` on the `routeConfig`; give the finished string.
- **No navigation.** `Router.navigate()` does not move this route; the setters do. When the
  navigation itself is under test, that is `RouterTestingHarness`'s job.
- **No input binding.** `withComponentInputBinding()` is the outlet's work; set the input with
  `fixture.componentRef.setInput('id', '7')`.

## What each failure says

| Message contains                                                     | Cause                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `injectActivatedRoute(): nothing provides ActivatedRoute here`       | no provider at all — add `provideActivatedRoute({ … })` to `providers`                                       |
| `the ActivatedRoute here is … not one provideActivatedRoute() built` | a later provider won: `provideRouter()`, `RouterModule`, a `useValue`, `provideAutoSpy` — list this one last |
| `the installed @angular/router does not wire ActivatedRoute …`       | a router major builds its classes differently; report it with the version                                    |

## The Router double

### `provideRouterDouble(init?)`

```ts
import { injectRouterDouble, provideRouterDouble } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({ providers: [provideRouterDouble({ url: '/products/7' })] });

const fixture = TestBed.createComponent(ProductPage);
const router = injectRouterDouble();

await fixture.componentInstance.checkout();
expect(router.navigate).toHaveBeenCalledWith(['/checkout']);

router.emitNavigation('/products/8'); // events emits a NavigationEnd; router.url already reads it
fixture.detectChanges();
```

After the route, `Router` is the provider real suites write by hand most often — 48 of them across
two private suites, and all 48 are the same line:
`createAutoMock<Router>({ events: of(), url: '/' }, { returns: { navigate: Promise.resolve(true) } })`.
Every part of it is a guess the component can fall through: `of()` never emits a second time, `url`
is a string nobody updates, `routerState` is absent, and `serializeUrl` throws the first time a
guard builds a redirect.

This double keeps one URL and derives the rest of it. It is **not** an instance of Angular's class —
a real `Router` drags the whole routing stack in, and a unit test has nothing to do with it — so it
is a structural stand-in provided for the `Router` token:

| Member                      | What it is                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `url`                       | the URL, serialized the way the real router serializes its own: `setUrl('products/7')` reads back `/products/7`   |
| `events`                    | a `BehaviorSubject`, starting at the `NavigationEnd` that put the router where it is                              |
| `navigate`, `navigateByUrl` | spies resolving `true`, which record the call and leave the URL alone                                             |
| `serializeUrl`, `parseUrl`  | the router's own `DefaultUrlSerializer`, not a pair of stubs                                                      |
| `createUrlTree`             | Angular's `createUrlTreeFromSnapshot`, so `relativeTo`, `queryParamsHandling` and `preserveFragment` behave       |
| `routerState`               | Angular's own `RouterState`: `snapshot.url` is the URL, and `root` a route carrying its query params and fragment |
| `currentNavigation`         | the signal Angular 20.2+ declares: the navigation in flight, `null` while the router stands still                 |
| `getCurrentNavigation()`    | the same answer through the deprecated method, so a component reading either one sees one truth                   |

Anything else Angular's `Router` declares — `isActive`, `resetConfig`, `lastSuccessfulNavigation` —
is **not** `undefined`: reading it throws, naming the member and what the double covers. A member
that answers a call nobody should be making in a unit test is how a wrong test survives a run. That
holds for the fields as well as for the methods: `currentNavigation`, `config` and `navigated` live
on the instance rather than on `Router.prototype`, so a guard built from the prototype alone would
have handed back `undefined` and let `router.currentNavigation()` fail as "is not a function"
wherever the component happened to call it.

`init` takes `url` — everything else about where a router stands follows from it, and it defaults to
`'/'` — and `currentNavigation`, for the component that reads the navigation in a field
initializer, before a test body could set one.

### `injectRouterDouble(injector?)`

```ts
const router = injectRouterDouble();

router.setUrl('/products/8?tab=reviews');
router.navigate.resolveWith(false);
```

The handle of the router `provideRouterDouble()` put in the test's injector. It reads the `TestBed`;
pass `fixture.debugElement.injector` when the router is in a component's own `providers`.

| Member                              | What it does                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `router`                            | the value every injector in the test hands out for `Router`                              |
| `navigate`                          | the spied `navigate()` — assert on it, or answer with `resolveWith(false)`               |
| `navigateByUrl`                     | the spied `navigateByUrl()`, the same way                                                |
| `setUrl(url)`                       | put the router at a URL: `url`, `routerState` and the root route move together, silently |
| `emitNavigation(event?)`            | push an event through `router.events`; resolves once the router has settled after it     |
| `setCurrentNavigation(navigation?)` | put a navigation in flight, or end it with `null`                                        |

`emitNavigation()` takes what the spec has: nothing (re-announce the current URL), a URL string (a
`NavigationEnd` for it, built for you), or an event you built — `new NavigationEnd(1, '/a', '/a')`,
`new NavigationStart(1, '/a')`, anything in the union. A `NavigationEnd` moves the URL with it, the
way the real router's does; every other event leaves it where it was.

It also **returns a promise**, resolved once the event has been delivered and a navigation it ended
is back to `null` — the moment `navigate()` resolves in an application. The work is synchronous, so
a caller that ignores the promise sees the same state on the next line; a spec that `await`s it
reads a settled router without guessing how many ticks that takes.

Two things follow from `events` being a `BehaviorSubject` rather than the `Subject` a real router
exposes:

- **A late subscriber sees the last navigation.** Whether `emitNavigation()` runs before or after
  `fixture.detectChanges()` stops deciding whether the component saw it — the flake that hand-rolled
  `Subject` doubles are made of.
- **The first thing a subscriber sees is a `NavigationEnd` for the starting URL**, because that is
  the navigation that put the router there. A component counting navigations starts at one, not
  zero.

### The navigation in flight

```ts
const router = injectRouterDouble();

router.setCurrentNavigation({ extras: { state: { from: 'the card' } } });
expect(component.origin()).toBe('the card');
```

`currentNavigation()` is what a component reads to find out where a navigation came from — the
`extras.state` an opener passed, or the `trigger` that tells a `'popstate'` apart from a click. It
is a signal on the instance, which is why a hand-rolled double usually spells it
`instanceMethodsToSpyOn: ['currentNavigation']`: it is not on the prototype, so nothing reads it off
the class.

The double answers `null` until the spec says otherwise, because a router standing at a URL is idle
and that is the real answer between navigations. What `setCurrentNavigation()` is given is kept and
the rest is derived from where the router stands: `id`, `initialUrl` and `extractedUrl` from the
current URL, `trigger` `'imperative'`, `extras` empty, `previousNavigation` `null`. Pass `abort`
yourself when the spec asserts one — the default is a no-op rather than a spy nothing reads.

It also follows the events, the way the real one does:

- `emitNavigation(new NavigationStart(4, '/products/8', 'popstate'))` puts a navigation in flight
  with that id, URL and trigger.
- a `NavigationEnd`, `NavigationCancel`, `NavigationError` or `NavigationSkipped` ends it — but
  **after** the event has been delivered. Angular's doc comment reads "the current navigation
  becomes to null after the NavigationEnd event is emitted", and _after_ is literal: the router
  emits the terminal event from a `tap` with the navigation still in flight and clears it in the
  `finalize` below it, while `cancelNavigationTransition` never clears it at all. `events` is a
  Subject, so a synchronous subscriber runs between the two — a component that reads
  `currentNavigation()` while handling a `NavigationEnd` gets the navigation that just finished,
  here and in production, and `null` only once `navigate()` has resolved. Probed against a real
  `provideRouter()` on Angular 22. A double that cleared it before the emit would turn the working
  production pattern "read the navigation state when the navigation lands" into a test that only
  passes while nothing uses it.

### `createRouterDouble(init?)`

The same double without a `TestBed` — for a guard or a class built with `new`:

```ts
import { createRouterDouble } from 'vitest-auto-spy/angular-router';

const { router, navigate } = createRouterDouble({ url: '/admin' });

expect(new AuthGuard(router).canActivate()).toBe(false);
expect(navigate).toHaveBeenCalledWith(['/login']);
```

### What the Router double does not do

- **It does not navigate.** `navigate()` and `navigateByUrl()` record the call and resolve `true`;
  they do not move `url`. A navigation in an application is asynchronous, runs guards and can be
  cancelled — a double that moved its own URL on the call would be testing the double. `setUrl()`
  and `emitNavigation()` are how the spec moves it, and `RouterTestingHarness` over a real
  `provideRouter()` is how the navigation itself gets tested.
- **It is the `Router` token and nothing else.** No routes, no outlet, no `RouterLinkActive`. A
  `routerLink` in the template does resolve — its `href` comes out of `createUrlTree` and
  `serializeUrl`, which are the router's own — but the moment a spec is about routing rather than
  about a component, the real router is the shorter path.
- **It does not replace `provideActivatedRoute()`.** `routerState.root` is a root route: it carries
  the URL's query parameters and fragment and, like a real root, no segments and no params. The
  route a component injects is still the other helper on this page; the two sit side by side.

Unlike the route double, this one builds spies, so the entry that registers the mock adapter — any
`vitest-auto-spy` import in the suite, usually `vitest-auto-spy/angular` in the same file or the
setup file — has to be loaded. Without it the first `provideRouterDouble()` says
`No mock adapter registered` and names the import.

### What each Router failure says

| Message contains                                                        | Cause                                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `the Router double has no …`                                            | the code under test reached for a `Router` member the double does not cover                                            |
| `the Router here is Angular's own, not one provideRouterDouble() built` | `Router` is `providedIn: 'root'`, so a `TestBed` without the double hands out a real one — add `provideRouterDouble()` |
| `the Router here is a value written by hand …`                          | a `useValue` or `provideAutoSpy(Router)` won over it — list `provideRouterDouble()` last                               |
| `nothing provides Router in the injector given`                         | an injector built by hand with no `Router` at all                                                                      |

Unlike the route, the double does not need to be listed after `provideRouter()`: `Router` is
`providedIn: 'root'`, and `provideRouter()` does not re-provide the token, so an explicit provider
wins in either order.

## `collectRouterEvents(events)`

```ts
import { NavigationEnd, NavigationStart } from '@angular/router';
import { collectRouterEvents, injectRouterDouble } from 'vitest-auto-spy/angular-router';

const router = injectRouterDouble();
const events = collectRouterEvents(router.router.events);

await router.emitNavigation(new NavigationStart(2, '/checkout'));
await router.emitNavigation('/checkout');

events.expect([
  [NavigationStart, '/checkout'],
  [NavigationEnd, '/checkout'],
]);
```

What a component does with the router often depends on the _sequence_ of events, and a hand-rolled
collector — an array, a subscription, a pile of `instanceof` checks — says nothing until it is read
back. This is Angular's own integration-spec idiom in one call: the recording starts empty (the
`BehaviorSubject`'s seed is where the router stands, not something it emitted), ends with the test
that started it, and `expect()` takes one `[class, url?]` pair per event in order — a mismatch fails
naming the event and the URL that was there instead.

The handle's `events` array is the recording itself, for the assertions that are not a plain
sequence.

## The Location double

```ts
import { injectLocationDouble, provideLocationDouble } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

const location = injectLocationDouble();

location.go('/reports/7');
expect(location.urlChanges).toEqual(['/reports/7']);

location.simulateUrlPop('/'); // the popstate no method call can cause
```

Where the route and the router stop, `Location` is what answers: where a redirect landed, what the
back button did. The hand-rolled `{ provide: Location, useValue: { path: vi.fn() } }` has the hole
every hand-rolled double has — it answers the members its author thought of — and the quiet variant
is worse: `Location` is `providedIn: 'root'`, so a spec that forgot the provider gets the platform's
real one and nothing a test does to it lands anywhere. `injectLocationDouble()` names that failure
by instance, the way `injectActivatedRoute()` does.

**This is a wrap, not a rival.** Angular ships the double: `SpyLocation` keeps a real history array
with an index, `urlChanges` is the journal of every move for the assertion, and
`simulateUrlPop()` / `simulateHashChange()` are the browser's half of the contract — the events no
test can cause by calling methods, because in an application the browser causes them.
`provideLocationDouble()` provides it with `MockLocationStrategy` in one line;
`createLocationDouble()` is the same without a `TestBed`.

`go()`, `back()` and `historyGo()` move the history; `path()` and `getState()` read it back. Note
the one asymmetry that surprises a first read: `back()` and `forward()` fire the popstate
subscribers but do **not** write `urlChanges` — the journal holds what the app asked for, the
subscribers carry what the browser did.

**One member answers differently from Angular's `SpyLocation`, on purpose.** `SpyLocation.path()`
returns the path alone and keeps the query of `go(path, query)` / `replaceState(path, query)` in a
field it never reads back; the real `Location.path()` answers both. So the double's `path()` answers
`/reports?tab=7` after `go('/reports', 'tab=7')`, the way production code that splits `path()` on `?`
expects — and `isCurrentPathEqualTo(path, query)` and the popstate `url` agree with it. The
instance is still a `SpyLocation`, and a query the router folds into the path reads the same either
way.

## Its own entry, and an optional peer

`vitest-auto-spy/angular-router` is the only part of the package that imports `@angular/router`, so
`@angular/router` is an **optional** peer, paid for by the suites that import this entry — the same
reason [`vitest-auto-spy/angular-http`](/adapters/angular-http) holds `@angular/common` on its own.
The `Location` double adds no peer of its own: it wraps the classes of `@angular/common/testing`,
and `@angular/router` already depends on `@angular/common`.

- Like `/angular-http` it does **not** re-export the core; it is a companion to
  `vitest-auto-spy/angular`.
- It registers no hooks and no mock adapter and imports nothing from a test runner, so it works the
  same under [`bun test`](/runtimes/bun-angular).
- The entry weighs **9.05 kB min+gzip** (9048 B, measured the way the README badge is: esbuild
  bundle, minified, gzipped, peers external).
