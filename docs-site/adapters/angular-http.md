---
title: Angular HTTP
description: provideHttpTesting and expectRequest — httpResource() and HttpClient answered in two lines, with the settling that a zoneless spec would otherwise have to rediscover.
---

# Angular HTTP

```ts
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });

const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

await expectRequest('/api/products').flush([product]);

expect(products.value()).toEqual([product]); // no tick, no microtask, no detectChanges
```

`httpResource()` is Angular's flagship data primitive and nothing in the testing ecosystem has an
answer for it: no `ng-mocks` helper, no `Spectator` helper, no
`@testing-library/angular` helper. What a spec has instead is a six-step dance whose order is not
guessable, and every step that is missed fails in a way that does not name the step.

| Step                  | What happens without it                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| tick                  | an `httpResource()` has issued nothing yet, so `expectOne` reports no request         |
| inject the controller | `TestBed.inject(HttpTestingController)` — one more line of ceremony per spec          |
| `expectOne(url)`      | a failure that names the token, not the URL that was actually requested               |
| `flush(body)`         | the resource stays `loading` forever and the fixture never stabilises                 |
| let one microtask run | the assertion reads the resource's **default** value — a green test asserting nothing |
| tick again            | the view that renders the resource is one frame behind the value                      |

`expectRequest(url).flush(body)` is all six.

## `provideHttpTesting()`

```ts
TestBed.configureTestingModule({
  providers: [...provideHttpTesting(), provideAutoSpy(Analytics)],
});
```

It is `provideHttpClient()` + `provideHttpClientTesting()` in one spread, plus — unless
`verifyOnTeardown` is `false` — the environment initializer that arms the end-of-test check. A suite
whose interceptors are the thing under test keeps its own `provideHttpClient(withInterceptors([...]))`
and adds `provideHttpClientTesting()` after it — this helper is for the case that is every other
spec, and a module built without it is not checked on teardown.

### `verifyOnTeardown`

Defaults to `true`. A test that ends holding a request nothing answered fails **that** test, naming
the request:

```
[vitest-auto-spy] provideHttpTesting({ verifyOnTeardown }): the test ended with 1 unanswered
request(s): GET /api/products.
```

Two things go wrong when it is left alone. The code under test is still waiting on a response it
never received, so every assertion after that call is about a state the test never reached — and the
request leaks, so the _next_ test's `expectRequest` matches a request the previous one made.

Turn it off for a suite that asserts requests some other way:

```ts
TestBed.configureTestingModule({ providers: [...provideHttpTesting({ verifyOnTeardown: false })] });
```

::: tip The module arms the check, not the import
Every module built from these providers arms the check for the test that built it, through an
environment initializer — so it reaches every spec file of a worker under `isolate: false`, a
provider list hoisted to a constant, and a spread made twice (which arms it once). It used to be an
`afterEach` registered when the entry was imported, and under `isolate: false` the entry is imported
once per worker: only the first spec file that imported it was ever checked.

The check runs in `onTestFinished`, after every `afterEach` — so after Angular's teardown and
after a suite's own `getTestBed().resetTestingModule()`, whatever `sequence.hooks` says. It still
sees what was open, because a reset of the `TestBed` instance during that test takes the open
requests first,
and it never asks a reset `TestBed` for its controller: that would build a fresh module, and the
next test's `configureTestingModule` would refuse to run.

A module built in `beforeAll` has no test to fail, so it arms nothing — take its requests with
`verifyNoPendingRequests()` if they matter.
:::

## `expectRequest(matcher, options?)`

```ts
await expectRequest('/api/products').flush([product]); // by URL
await expectRequest('/api/products', { method: 'POST' }).flush({}); // by URL and verb
await expectRequest(/\/api\/products\?page=\d+/).flush([]); // by pattern
await expectRequest((request) => request.body?.id === 7).flush({}); // by anything else
```

A string matches either `request.url` or `request.urlWithParams`, so a spec may name the endpoint
without repeating its query string — or name the query string when that is what tells two requests
apart. `{ method }` is case-insensitive.

It **ticks before it looks**, which is the step that makes an `httpResource()` testable at all.

What comes back is small on purpose:

| Member                    | What it does                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `request`                 | the `HttpRequest` as the code under test sent it — URL, method, headers, body           |
| `flush(body, options?)`   | answer it, then settle; `options` is `{ headers, status, statusText }`                  |
| `error(status, options?)` | fail it with a status, then settle the same way; `options` is `{ headers, statusText }` |

`flush()` and `error()` are `async` because settling requires letting a microtask run, and no
synchronous call can do that. `await` them, and the line after reads the settled value.

```ts
const created = expectRequest('/api/products', { method: 'POST' });

expect(created.request.body).toEqual({ title: 'Chair' });

await created.flush({ id: 9 });
```

## `expectNoRequest(matcher?, options?)`

```ts
component.filter.set('open');
expectNoRequest('/api/products'); // the cache answered; nothing went out
```

Ticks first, like `expectRequest` — a request that has simply not been issued _yet_ is not the same
claim, and the assertion would otherwise pass for the wrong reason. With no argument it means
"nothing at all was requested".

## `verifyNoPendingRequests()`

The teardown check, callable by hand. Worth it mid-test — after the arrange step, before the
assertions that depend on it — and in the two specs of a suite that turned `verifyOnTeardown` off:

```ts
await expectRequest('/api/products').flush([]);
verifyNoPendingRequests(); // nothing else went out
```

A no-op when the test configured no HTTP testing at all, and when the testing module has already
been reset — except for the requests that reset took, which it reports.

## What each failure says

| Message contains                              | Cause                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `no request matched …` + the ones that were   | the URL, verb or predicate does not describe anything that was sent      |
| `No request was made at all.`                 | the resource never started, or nothing subscribed to the Observable      |
| `N requests matched …`                        | more than one match; narrow with `{ method }`, a full URL or a predicate |
| `this TestBed has no HttpTestingController`   | `provideHttpTesting()` is missing from `providers`                       |
| `the test ended with N unanswered request(s)` | `verifyOnTeardown` found what the spec forgot                            |

The list of requests that _were_ made is the whole reason the first message is worth more than
`expectOne`'s. "Expected one matching request, found none" sends a reader back to re-read their own
spec; "the only request made was `GET /api/product`, and you asked for `/api/products`" ends the
search on the spot.

## Its own entry, and an optional second peer

`vitest-auto-spy/angular-http` is the only part of the package that imports `@angular/common`.

`vitest-auto-spy/angular` must keep loading in a project that has `@angular/core` and not
`@angular/common`, and a static import inside `dist/angular.js` would break that for everyone —
including the majority of suites that never test an HTTP call. The package already had this exact
situation once, and solved it the same way: rxjs lives behind `vitest-auto-spy/rxjs` and no other
entry reaches it. So `@angular/common` is an **optional** peer, and the cost lands on the suites
that import this entry and on nobody else.

Two consequences worth stating plainly:

- Unlike every other subpath, this one does **not** re-export the core. It is a companion to
  `vitest-auto-spy/angular`, which stays the import for spies, `TestBed` helpers and
  `settleResource`.
- The entry weighs **2.5 kB min+gzip** (2459 B, measured the way the README badge is: esbuild
  bundle, minified, gzipped, peers external).

## How it relates to what was already here

**[`settleResource`](/adapters/angular#resources-httpresource-and-resource)** stays exactly as it is, and is still the
answer whenever the wait is not tied to one request — a `resource()` with an async loader, an
`rxResource`, a reload, a resource driven by something other than HTTP. `expectRequest().flush()`
does the settling for the request it just answered; `settleResource` waits on a resource whoever
started it.

**[`enableAngularDiagnostics({ pendingRequests })`](/adapters/angular-diagnostics#pendingrequests)**
keeps working unchanged, including in suites that never adopt this entry — it reads the controller
token structurally out of your own `configureTestingModule`, which is what let it avoid a peer
dependency in the first place. The two cooperate rather than compete: both take the open requests
with `match(() => true)`, which is one-shot, so one unanswered request is reported once, by whichever
looked first.

For a suite that uses `provideHttpTesting()` everywhere, `pendingRequests` is redundant — the
per-suite check is the same check, arriving from the providers instead of from a setup file. Keep
the diagnostic on if any file still configures HTTP testing by hand; there is no harm in both.

## Zoneless, and zones

The tick this entry takes is `TestBed.tick()` (`flushEffects()` under the hood), which is the
correct one in both worlds — it runs pending effects and change detection synchronously, and
refreshes fixture views that were never attached to the `ApplicationRef`. Under `fakeAsync` from
[`vitest-auto-spy/zone`](/utilities/zone) the same call still works; what changes is that a loader
resolving on a _timer_ needs `tick()`/`advanceTimers()` from the zone layer, which no amount of
microtask draining replaces.
