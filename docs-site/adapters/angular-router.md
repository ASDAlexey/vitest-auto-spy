---
title: Angular router
description: provideActivatedRoute and injectActivatedRoute — Angular's own ActivatedRoute over one record, so its streams, ParamMaps and snapshot cannot disagree, and a setter moves them together.
---

# Angular router

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

| Double                                                         | What the code that reads the other half gets                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `provideAutoSpy(ActivatedRoute)`                               | no `snapshot`, no `params`: they are instance fields, and a spy is built from the prototype          |
| `{ provide: ActivatedRoute, useValue: { snapshot: { params } } }` | `route.paramMap` is `undefined`, so `route.paramMap.pipe(…)` throws inside the component               |
| `{ provide: ActivatedRoute, useValue: { params: of({ id }) } }`   | `snapshot` is `undefined`, and the stream never moves again — the second navigation cannot be tested |
| both halves, written by hand                                   | they agree until the first spec that updates one and forgets the other                                |

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

| `init` member | Reaches                                                          | Default     |
| ------------- | ---------------------------------------------------------------- | ----------- |
| `params`      | `params`, `paramMap`, `snapshot.params`, `snapshot.paramMap`     | `{}`        |
| `queryParams` | `queryParams`, `queryParamMap` and their snapshot twins          | `{}`        |
| `data`        | `data`, `snapshot.data`                                          | `{}`        |
| `fragment`    | `fragment`, `snapshot.fragment`                                  | `null`      |
| `url`         | `url`, `snapshot.url` — a string is split on `/`                 | `[]`        |
| `outlet`      | `outlet`, `snapshot.outlet`                                      | `'primary'` |
| `component`   | `component`, `snapshot.component`                                | `null`      |
| `routeConfig` | `routeConfig`, `snapshot.routeConfig`                            | `null`      |

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

| Member                   | What it does                                                                     |
| ------------------------ | -------------------------------------------------------------------------------- |
| `route`                  | the `ActivatedRoute` every injector in the test hands out                        |
| `setParams(params)`      | replace the params                                                               |
| `setQueryParams(params)` | replace the query params                                                         |
| `setData(data)`          | replace the data                                                                 |
| `setFragment(fragment)`  | replace the fragment; `null` for none                                            |
| `setUrl(url)`            | replace the URL segments; a string or `UrlSegment[]`                             |
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
- **No `title`.** The router stores a resolved title in `data` under a private symbol, so `title`
  emits `undefined` here, as it does for a route nobody gave a title.
- **No navigation.** `Router.navigate()` does not move this route; the setters do. When the
  navigation itself is under test, that is `RouterTestingHarness`'s job.
- **No input binding.** `withComponentInputBinding()` is the outlet's work; set the input with
  `fixture.componentRef.setInput('id', '7')`.

## What each failure says

| Message contains                                                    | Cause                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `injectActivatedRoute(): nothing provides ActivatedRoute here`      | no provider at all — add `provideActivatedRoute({ … })` to `providers`                      |
| `the ActivatedRoute here is … not one provideActivatedRoute() built` | a later provider won: `provideRouter()`, `RouterModule`, a `useValue`, `provideAutoSpy` — list this one last |
| `the installed @angular/router does not wire ActivatedRoute …`      | a router major builds its classes differently; report it with the version                  |

## Its own entry, and an optional peer

`vitest-auto-spy/angular-router` is the only part of the package that imports `@angular/router`, so
`@angular/router` is an **optional** peer, paid for by the suites that import this entry — the same
reason [`vitest-auto-spy/angular-http`](/adapters/angular-http) holds `@angular/common` on its own.

- Like `/angular-http` it does **not** re-export the core; it is a companion to
  `vitest-auto-spy/angular`.
- It registers no hooks and no mock adapter and imports nothing from a test runner, so it works the
  same under [`bun test`](/runtimes/bun-angular).
- The entry weighs **2.1 kB min+gzip** (2063 B, measured the way the README badge is: esbuild
  bundle, minified, gzipped, peers external).
