---
title: Angular router
description: Test stand-ins for ActivatedRoute, Router and Location. Set route params, move the URL, assert navigate() and check where the app went, without a real router.
---

# Angular router

`vitest-auto-spy/angular-router` gives you ready test stand-ins for the three router services a
component talks to: `ActivatedRoute`, [`Router`](#the-router-double) and
[`Location`](#the-location-double). A stand-in (test double) is an object your test provides in
place of the real service. Use this page when a component reads route params, calls
`router.navigate()`, or checks where the app went.

```ts
import { TestBed } from '@angular/core/testing';

import 'vitest-auto-spy/angular';

import { injectActivatedRoute, injectRouterDouble, provideActivatedRoute, provideRouterDouble } from 'vitest-auto-spy/angular-router';

import { ProfileComponent } from './profile.component';

it('opens the orders of the user in the route', () => {
  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [provideActivatedRoute({ params: { id: '7' } }), provideRouterDouble()],
  });
  const fixture = TestBed.createComponent(ProfileComponent);
  const router = injectRouterDouble();
  fixture.detectChanges(); // the component reads id '7' from paramMap

  fixture.componentInstance.openOrders();
  expect(router.navigate).toHaveBeenCalledWith(['/users', '7', 'orders']);

  injectActivatedRoute().setParams({ id: '8' }); // the route moves to user 8
  fixture.detectChanges(); // paramMap already emitted '8'; this re-renders

  fixture.componentInstance.openOrders();
  expect(router.navigate).toHaveBeenLastCalledWith(['/users', '8', 'orders']);
});
```

- `provideActivatedRoute()` sets what the component reads from the route. `injectActivatedRoute()`
  changes it later in the test.
- `provideRouterDouble()` replaces `Router`. Its `navigate()` is a spy: it records the call and
  resolves `true`, but it does not change the route.
- `import 'vitest-auto-spy/angular'` lets the library build Vitest spies. Without it,
  `provideRouterDouble()` throws `No mock adapter registered`. You can import it in the setup file
  instead; importing it in both places is harmless.
- Route params are strings, as in a real app.
- A component sees `setParams()` only if it subscribes to `params` or `paramMap`. A value it copied
  from `route.snapshot` once stays as it was.

Each helper is a separate provider. A component that only reads the route needs only
`provideActivatedRoute()`; one that also navigates needs both, as above.

| Your code uses                      | Provide                   | Drive it with                                                              |
| ----------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| `ActivatedRoute`                    | `provideActivatedRoute()` | [`injectActivatedRoute()`](#injectactivatedroute-injector)                 |
| `Router`                            | `provideRouterDouble()`   | [`injectRouterDouble()`](#injectrouterdouble-injector)                     |
| `Location`                          | `provideLocationDouble()` | [`injectLocationDouble()`](#the-location-double)                           |
| the order of router events          | —                         | [`collectRouterEvents()`](#collectrouterevents-events)                     |
| any of the above, without `TestBed` | —                         | `createActivatedRoute()`, `createRouterDouble()`, `createLocationDouble()` |

## Why not a hand-written `ActivatedRoute`

`ActivatedRoute` keeps what a component reads (`snapshot`, `params`, `queryParams`, `data`,
`fragment`, `url`) in instance fields. The usual hand-written mocks cover only part of it:

| Mock                                                              | What breaks                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `provideAutoSpy(ActivatedRoute)`                                  | no `snapshot`, no `params`: a spy is built from the prototype, not fields |
| `{ provide: ActivatedRoute, useValue: { snapshot: { params } } }` | `route.paramMap` is `undefined`, so `route.paramMap.pipe(…)` throws       |
| `{ provide: ActivatedRoute, useValue: { params: of({ id }) } }`   | `snapshot` is `undefined`, and a second navigation cannot be tested       |
| both halves, written by hand                                      | they drift apart as soon as a spec updates one and forgets the other      |

The stand-in here is a real Angular `ActivatedRoute`. Its streams and its snapshot come from one
record, so they always agree.

## `provideActivatedRoute(init?)`

Provides an `ActivatedRoute` with the values you pass. Use it in `providers` of the testing module.

```ts
TestBed.configureTestingModule({
  imports: [ProfileComponent],
  providers: [
    provideActivatedRoute({
      params: { id: '7' },
      queryParams: { tab: 'orders' },
      data: { user: ada },
      fragment: 'contacts',
      url: 'users/7',
    }),
  ],
});
```

| `init` member | Type                         | Default     | What it sets                                                              |
| ------------- | ---------------------------- | ----------- | ------------------------------------------------------------------------- |
| `params`      | `Params`                     | `{}`        | `params`, `paramMap`, `snapshot.params`, `snapshot.paramMap`              |
| `queryParams` | `Params`                     | `{}`        | `queryParams`, `queryParamMap` and their snapshot versions                |
| `data`        | `Data`                       | `{}`        | `data`, `snapshot.data`                                                   |
| `title`       | `string`                     | `undefined` | `route.title`, `snapshot.title`                                           |
| `fragment`    | `string \| null`             | `null`      | `fragment`, `snapshot.fragment`                                           |
| `url`         | `string \| UrlSegment[]`     | `[]`        | `url`, `snapshot.url`; a string is split on `/`                           |
| `outlet`      | `string`                     | `'primary'` | `outlet`, `snapshot.outlet`                                               |
| `component`   | `Type \| null`               | `null`      | `component`, `snapshot.component`                                         |
| `routeConfig` | `Route \| null`              | `null`      | `routeConfig`, `snapshot.routeConfig`                                     |
| `resolve`     | `ResolveData`                | `{}`        | the snapshot's resolve record, kept apart from `data` as Angular keeps it |
| `children`    | `ActivatedRouteInit[]`       | `[]`        | `children`, `firstChild`, and each child's `parent` and `root`            |
| `resources`   | the route's resources record | `undefined` | `resources`, `snapshot.resources`; Angular 22.2+ only (developer preview) |

**Child routes.** Each entry in `children` becomes a child route built from the same options. The
handle's `children` array has a setter handle for each child; change a child through it, and the
parent's snapshot tree updates too:

```ts
const { route, children } = createActivatedRoute({
  children: [{ outlet: 'aside', routeConfig: { path: 'map' } }],
});

children[0]?.setParams({ id: '8' }); // route.snapshot.firstChild.params is now { id: '8' }
```

**Resources.** For a component that reads `route.resources`, pass an empty record and install each
resource with [`mockResourceProp`](/adapters/angular#skipping-the-request-entirely-—-mockresourceprop).
The route and every snapshot share that one record. `restoreMockedProps()` removes the stand-in.

```ts
const resources = {};

TestBed.configureTestingModule({ providers: [provideActivatedRoute({ resources })] });

const user = mockResourceProp(resources, 'user', undefined as User | undefined, { status: 'loading' });
user.set({ name: 'Ada' });
```

**Matrix parameters.** A string `url` has none. Pass `UrlSegment`s when the code reads them:
`url: [new UrlSegment('users', { role: 'admin' })]`.

**Sharing providers between tests is safe.** Each test gets a fresh route, even when you keep the
provider list in a constant at the top of the file.

::: warning With Angular's real router, list it last
Angular's real `provideRouter()` and `RouterModule` also provide an `ActivatedRoute`, and the later
provider wins, so put `provideActivatedRoute()` after them. If you do not, `injectActivatedRoute()`
throws and says which route it found instead. `provideRouterDouble()` provides no `ActivatedRoute`,
so with the Router stand-in the order does not matter.
:::

## `injectActivatedRoute(injector?)`

Returns a handle: an object with the route and the setters that change it. By default it reads
from `TestBed`. If the
route is in the component's own `providers`, pass `fixture.debugElement.injector`.

```ts
const route = injectActivatedRoute();

route.setQueryParams({ tab: 'orders' });
route.set({ params: { id: '9' }, fragment: null }); // two changes, one navigation
```

| Member                   | What it does                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `route`                  | the `ActivatedRoute` every injector in the test hands out                                |
| `setParams(params)`      | replaces the params                                                                      |
| `setQueryParams(params)` | replaces the query params                                                                |
| `setData(data)`          | replaces the data                                                                        |
| `setFragment(fragment)`  | replaces the fragment; `null` means none                                                 |
| `setUrl(url)`            | replaces the URL segments; a string or `UrlSegment[]`                                    |
| `set(change)`            | several of the above as one navigation: one new snapshot, each stream emits at most once |
| `children`               | handles of the child routes from `init.children`, in order                               |

Each change behaves like the router's own update after a navigation:

- **The snapshot changes first.** A `params` subscriber that reads `route.snapshot` already sees the
  new values. Each change creates a new snapshot object, so a snapshot you saved earlier keeps the
  old values.
- **Streams emit in the router's order:** `queryParams`, `fragment`, `params`, `url`, `data`.
- **An equal value emits nothing.** Setting `{ id: '7' }` when the id is already `'7'` emits nothing.
  Equal means the same keys (symbol keys too) and `===` values; an array value (`?tag=a&tag=b`) is
  compared regardless of order. A string `url` always builds new segments, so it always emits.
- **A setter replaces, it does not merge.** To keep the old values, spread them from the handle's
  `route`:

  ```ts
  const { route, setQueryParams } = injectActivatedRoute();

  setQueryParams({ ...route.snapshot.queryParams, page: '2' });
  ```

## `createActivatedRoute(init?)`

The same route without `TestBed`. Use it for a class you create with `new`, or for a functional
guard or resolver that takes the route as an argument. It takes the same `init` as
`provideActivatedRoute()` and returns the same handle.

```ts
import { createActivatedRoute } from 'vitest-auto-spy/angular-router';

const { route, setParams } = createActivatedRoute({ params: { id: '7' } });
const page = new ProfilePage(route);

setParams({ id: '8' });

expect(page.userId()).toBe('8');
```

The setters are plain functions, so you can destructure them.

## Angular's own route, checked against Angular

- `route instanceof ActivatedRoute` and `route.snapshot instanceof ActivatedRouteSnapshot` are
  both true. The library's own tests compare its keys with a real `new ActivatedRoute()`, so a
  member that a future Angular adds is there too.
- Without `children`, the route sits in a tree of one node, so tree getters return values instead of throwing: `root`
  is the route itself, `parent` and `firstChild` are `null`, `children` is empty, and
  `pathFromRoot` is `[route]`. The snapshot answers the same way.
- The real `Router` accepts it as a real route:

  ```ts
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideActivatedRoute({ url: 'users/12' })] });

  const router = TestBed.inject(Router);

  router.serializeUrl(router.createUrlTree(['orders'], { relativeTo: injectActivatedRoute().route }));
  // → '/users/12/orders'
  ```

If a future Angular builds its routes differently, the first `provideActivatedRoute()` throws and
names the member that came out wrong.

## What it deliberately does not do

- **No parent route and no tree from a config.** The route you build is the root, so
  `route.parent` is `null`. If a component reads `route.parent.params`, patch that member with
  [`mockReadonlyProp`](/adapters/angular#signal-readonly-property-mocking), or use a real router
  with `RouterTestingHarness`. Child routes come only from `children`; a `routeConfig.children`
  array does not create routes.
- **`title` is a plain string.** `provideActivatedRoute({ title: 'User 7' })` sets
  `route.snapshot.title`. A `title: () => …` resolver on `routeConfig` is not run; pass the final
  string.
- **`resources` is a plain record.** A `resources: (ctx) => …` function on `routeConfig` is not
  run. Pass the record the component reads, and drive each resource with `mockResourceProp`. No
  setter changes it: the router keeps one record for the route's life.
- **`navigate()` does not move this route.** Assert the `navigate()` call on the
  [Router stand-in](#the-router-double) and move the route with the setters. To test real routing
  (guards, resolvers, redirects), use Angular's `RouterTestingHarness`.
- **No input binding.** `withComponentInputBinding()` is the outlet's job. Set the input yourself:
  `fixture.componentRef.setInput('id', '7')`.

## What each failure says

| Message contains                                                                                   | Cause and fix                                                                                                |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `injectActivatedRoute(): nothing provides ActivatedRoute here`                                     | no provider at all; add `provideActivatedRoute({ … })` to `providers`                                        |
| `the ActivatedRoute here is … not one provideActivatedRoute() built`                               | a later provider won (`provideRouter()`, `RouterModule`, a `useValue`, `provideAutoSpy`); list this one last |
| `@angular/router <version> does not wire ActivatedRoute …`                                         | this router version builds its classes differently; provide the route by hand and report the version         |
| `provideActivatedRoute({ title }): … keeps the route title under a key this helper could not find` | this router version stores the title elsewhere; leave `title` out and report the version                     |

## The Router double

### `provideRouterDouble(init?)`

Provides a `Router` stand-in. `navigate()` and `navigateByUrl()` are spies, and `url`,
`routerState` and `events` always agree with each other.

```ts
import { TestBed } from '@angular/core/testing';

import 'vitest-auto-spy/angular';

import { injectRouterDouble, provideRouterDouble } from 'vitest-auto-spy/angular-router';

import { ProfileComponent } from './profile.component';

it('goes to checkout', async () => {
  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [provideRouterDouble({ url: '/users/7' })],
  });
  const fixture = TestBed.createComponent(ProfileComponent);
  const router = injectRouterDouble();

  await fixture.componentInstance.checkout();
  expect(router.navigate).toHaveBeenCalledWith(['/checkout']);

  router.emitNavigation('/users/8'); // synchronous; events emits a NavigationEnd; router.url is '/users/8'
  fixture.detectChanges();
});
```

`navigate()` and `navigateByUrl()` are Vitest `vi.fn()` spies. To build them, the library needs
`import 'vitest-auto-spy/angular'` (or `'vitest-auto-spy'`) somewhere in the test run. Import it once, in the spec or in the setup
file. Without it, the first `provideRouterDouble()` throws `No mock adapter registered` and names the
import.

| `init` member       | Type                     | Default | What it sets                                                                 |
| ------------------- | ------------------------ | ------- | ---------------------------------------------------------------------------- |
| `url`               | `string`                 | `'/'`   | where the router stands; `routerState` and `events` follow from it           |
| `currentNavigation` | `NavigationInit \| null` | `null`  | a navigation in flight, for a component that reads it in a field initializer |
| `children`          | `ActivatedRouteInit[]`   | none    | routes under `routerState.root`, nested as deep as you need                  |

`children` is for code that walks `routerState.root.children` to find open outlets. `setUrl()` keeps
them:

```ts
provideRouterDouble({
  url: '/cards/7',
  children: [{ routeConfig: { path: 'cards' }, children: [{ outlet: 'report' }, { outlet: 'map' }] }],
});
```

What the stand-in's members are:

| Member                      | What it is                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `url`                       | the URL, serialized like the real router's: `setUrl('users/7')` reads back `/users/7`                     |
| `events`                    | a `BehaviorSubject` that starts with the `NavigationEnd` for the starting URL                             |
| `navigate`, `navigateByUrl` | spies that resolve `true` and record the call; they do not change the URL                                 |
| `serializeUrl`, `parseUrl`  | Angular's own `DefaultUrlSerializer`                                                                      |
| `createUrlTree`             | Angular's `createUrlTreeFromSnapshot`, so `relativeTo`, `queryParamsHandling` and `preserveFragment` work |
| `routerState`               | Angular's own `RouterState`: `snapshot.url` is the URL; `root` carries its query params and fragment      |
| `currentNavigation`         | the navigation in flight (Angular 20.2+ signal), `null` while the router is idle                          |
| `getCurrentNavigation()`    | the same answer through the deprecated method                                                             |

Any other `Router` member (`isActive`, `resetConfig`, `lastSuccessfulNavigation`, …) throws when
read. The error names the member and lists what the stand-in covers. You get a clear failure
instead of a silent `undefined`.

The stand-in is not an instance of Angular's `Router` class: a real `Router` pulls in the whole
routing stack. It is an object provided for the `Router` token.

**Common mistake:** the hand-written
`createAutoMock<Router>({ events: of(), url: '/' }, { returns: { navigate: Promise.resolve(true) } })`
breaks quietly. `of()` never emits again, `url` never changes, `routerState` is missing, and
`serializeUrl` throws when a guard builds a redirect. Use `provideRouterDouble()` instead.

### `injectRouterDouble(injector?)`

Returns the handle you use to drive the router in a test. By default it reads from `TestBed`. If the
router is in the component's own `providers`, pass `fixture.debugElement.injector`.

```ts
const router = injectRouterDouble();

router.setUrl('/users/8?tab=orders');
router.navigate.resolveWith(false); // the next navigate() resolves false
```

| Member                              | What it does                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `router`                            | the value every injector in the test hands out for `Router`                                       |
| `navigate`                          | the `navigate()` spy: assert on it, or answer with `resolveWith(false)`                           |
| `navigateByUrl`                     | the `navigateByUrl()` spy, the same way                                                           |
| `setUrl(url)`                       | moves the router to a URL; `url`, `routerState` and the root route change together, with no event |
| `emitNavigation(event?)`            | pushes an event through `router.events`; returns a promise                                        |
| `setCurrentNavigation(navigation?)` | puts a navigation in flight, or ends it with `null`                                               |

`emitNavigation()` accepts:

- nothing: announces the current URL again;
- a URL string: builds a `NavigationEnd` for it;
- any router event you build, such as `new NavigationEnd(1, '/a', '/a')` or
  `new NavigationStart(1, '/a')`.

A `NavigationEnd` moves the URL, as the real router's does. Other events leave the URL alone.

The work is synchronous, so a spec does not need `await`: the next line already sees the new state.
The promise exists for code under test that awaits a navigation. It resolves once the
event is delivered and any navigation it ended is cleared.

`events` is a `BehaviorSubject`, not a plain `Subject` like the real router's. Two things follow:

- **A late subscriber still sees the last navigation.** It no longer matters whether
  `emitNavigation()` runs before or after `fixture.detectChanges()`.
- **A subscriber first receives the `NavigationEnd` for the starting URL.** A component that counts
  navigations starts at one, not zero.

### The navigation in flight

Components read `currentNavigation()` to learn where a navigation came from: the `extras.state` the
caller passed, or the `trigger` (`'popstate'` versus a click). Set it with `setCurrentNavigation()`:

```ts
const router = injectRouterDouble();

router.setCurrentNavigation({ extras: { state: { from: 'the card' } } });
expect(fixture.componentInstance.origin()).toBe('the card');
```

- It answers `null` until you set it, as a real idle router does.
- What you pass is kept. The rest is filled from the current URL: `id`, `initialUrl`,
  `extractedUrl`; `trigger` is `'imperative'`, `extras` is empty, `previousNavigation` is `null`.
- `abort` defaults to a no-op. Pass your own when the spec asserts it.

It also follows the events, as the real router does:

- `emitNavigation(new NavigationStart(4, '/users/8', 'popstate'))` puts a navigation in flight with
  that id, URL and trigger.
- A `NavigationEnd`, `NavigationCancel`, `NavigationError` or `NavigationSkipped` ends it, **after**
  the event is delivered. A component that reads `currentNavigation()` while handling
  `NavigationEnd` still sees the finished navigation, as in production. See
  [In depth](#in-depth) for why.

### `createRouterDouble(init?)`

The same Router stand-in without `TestBed`, for a guard or a class you create with `new`:

```ts
import 'vitest-auto-spy/angular';

import { createRouterDouble } from 'vitest-auto-spy/angular-router';

const { router, navigate } = createRouterDouble({ url: '/admin' });

expect(new AuthGuard(router).canActivate()).toBe(false);
expect(navigate).toHaveBeenCalledWith(['/login']);
```

### What the Router double does not do

- **It does not navigate.** `navigate()` and `navigateByUrl()` record the call and resolve `true`;
  `url` stays where it was. Move it with `setUrl()` or `emitNavigation()`. To test the navigation
  itself (guards, cancellation), use `RouterTestingHarness` over a real `provideRouter()`.
- **It is only the `Router` token.** No routes, no outlet, no `RouterLinkActive`. A `routerLink` in
  the template still gets a correct `href`, because `createUrlTree` and `serializeUrl` are the
  router's own. When the spec is about routing rather than a component, use the real router.
- **It does not provide the component's `ActivatedRoute`.** A component that reads route params and
  calls `navigate()` needs both `provideActivatedRoute()` and `provideRouterDouble()`, in any order.
  The stand-in's `routerState.root` has the URL's query params and fragment, but no params.

### What each Router failure says

| Message contains                                                        | Cause and fix                                                                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `the Router double has no …`                                            | the code under test used a `Router` member the stand-in does not cover                                            |
| `the Router here is Angular's own, not one provideRouterDouble() built` | `Router` is `providedIn: 'root'`, so `TestBed` without the stand-in gives a real one; add `provideRouterDouble()` |
| `the Router here is a value written by hand …`                          | a `useValue` or `provideAutoSpy(Router)` won; list `provideRouterDouble()` last                                   |
| `nothing provides Router in the injector given`                         | an injector you built by hand has no `Router` at all                                                              |

The order of `provideRouterDouble()` and a real `provideRouter()` does not matter:
`provideRouter()` does not provide the `Router` token, so the stand-in always wins.

## `collectRouterEvents(events)`

Records every router event from now until the test ends, then checks the sequence in one call.

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

- The recording starts empty. The `NavigationEnd` a `BehaviorSubject` replays on subscribe is not
  recorded.
- `expect()` takes one `[EventClass, url?]` pair per event, in order, with nothing left over.
- `events.events` is the raw recording, for checks that are not a plain sequence.
- The recording ends with the test that started it, on Vitest and Bun.

A mismatch fails with one message: where the sequences first differ, then both in full.

```text
[vitest-auto-spy] collectRouterEvents().expect(): the events differ at #2: expected NavigationEnd /checkout, got NavigationCancel /checkout.
Expected: NavigationStart /checkout, NavigationEnd /checkout
Recorded: NavigationStart /checkout, NavigationCancel /checkout
```

## The Location double

Provides Angular's own `SpyLocation` for `Location`, so you can check where a redirect landed or
what the back button did.

```ts
import { TestBed } from '@angular/core/testing';
import { injectLocationDouble, provideLocationDouble } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

const location = injectLocationDouble();

location.go('/reports/7');
expect(location.urlChanges).toEqual(['/reports/7']);

location.simulateUrlPop('/'); // a browser back/forward, which no method call can cause
```

| Helper                            | What it does                                                          |
| --------------------------------- | --------------------------------------------------------------------- |
| `provideLocationDouble()`         | provides `SpyLocation` and `MockLocationStrategy` in one line         |
| `injectLocationDouble(injector?)` | returns that `SpyLocation`; throws if another `Location` provider won |
| `createLocationDouble()`          | the same `SpyLocation` without `TestBed`                              |

What `SpyLocation` gives you:

- `go()`, `back()` and `historyGo()` move a real history; `path()` and `getState()` read it back.
- `urlChanges` lists every move the app asked for.
- `simulateUrlPop()` and `simulateHashChange()` fire the events that only the browser causes.
- `back()` and `forward()` notify popstate subscribers but do **not** add to `urlChanges`. The list
  holds what the app asked for; subscribers get what the browser did.

**One difference from Angular's `SpyLocation`.** Angular's `SpyLocation.path()` drops the query.
The real `Location.path()` keeps it, and so does this one: after `go('/reports', 'tab=7')`, `path()`
returns `/reports?tab=7`. `isCurrentPathEqualTo(path, query)` and the popstate `url` agree with it.
The object is still a `SpyLocation`.

**Common mistake:** skipping the provider. `Location` is `providedIn: 'root'`, so a spec without
`provideLocationDouble()` gets the real platform `Location`, and nothing the test does is recorded.
A hand-written `{ provide: Location, useValue: { path: vi.fn() } }` has the opposite problem: it
answers only the members its author thought of.

| Message contains                                         | Cause and fix                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| `injectLocationDouble(): nothing provides Location here` | no provider; add `provideLocationDouble()` to `providers`            |
| `the Location here is … not the SpyLocation`             | a later `Location` provider won; list `provideLocationDouble()` last |

## Its own entry, and an optional peer

- `vitest-auto-spy/angular-router` is the only entry that imports `@angular/router`. So
  `@angular/router` is an **optional** peer dependency: you install it only if you import this
  entry. [`vitest-auto-spy/angular-http`](/adapters/angular-http) works the same way for
  `@angular/common`.
- The Location stand-in needs no extra package. It wraps `@angular/common/testing`, and
  `@angular/router` already depends on `@angular/common`.
- It does **not** re-export the core. Import it next to `vitest-auto-spy/angular`.
- It registers no hooks and no runner adapter. The Router stand-in's spies need
  `vitest-auto-spy/angular`, as described under [`provideRouterDouble()`](#providerouterdouble-init).
- It does not import `vitest`. `collectRouterEvents()` stops recording when its test finishes,
  through the runner's own `onTestFinished` (Vitest or Bun). On `node:test`, which has no per-test
  teardown, the recording lasts as long as the Router stand-in.
- Its type declarations do not name `vitest` either, so a Bun or `node:test` project type-checks it
  with `skipLibCheck: false` and no Vitest installed.

## In depth

**Why `currentNavigation` clears after the event, not before.** Angular's doc comment says "the
current navigation becomes to null after the NavigationEnd event is emitted". The router emits the
final event from a `tap` while the navigation is still in flight, and clears it in a `finalize`
after that (`cancelNavigationTransition` never clears it). `events` is a `Subject`, so a synchronous
subscriber runs between the two steps. It gets the finished navigation, and `null` only after
`navigate()` resolves. This was checked against a real `provideRouter()` on Angular 22. A stand-in
that cleared it first would break the common pattern "read the navigation state when the
navigation lands".

**Why unknown Router members throw.** `currentNavigation`, `config` and `navigated` live on the
`Router` instance, not on `Router.prototype`. A mock built from the prototype would return
`undefined` for them, and `router.currentNavigation()` would then fail as "is not a function"
far from the cause. The stand-in throws on read instead, with the member's name.

**Why `currentNavigation` is hard to mock by hand.** It is a signal on the instance, not on the
prototype, so nothing reads it off the class. A hand-written mock has to list it with
`instanceMethodsToSpyOn: ['currentNavigation']`.

**How the route is built.** Every stream is a `BehaviorSubject` over one field of a single record.
The snapshot is Angular's own `ActivatedRouteSnapshot` of the same record, and both `ParamMap`s are
the ones Angular derives from them. There is no second copy to fall out of step. The title goes into
`data` under the router's `RouteTitleKey`, a symbol the router does not export; the stand-in learns
it from the installed router. The package's CI builds the route on every Angular major it supports.
