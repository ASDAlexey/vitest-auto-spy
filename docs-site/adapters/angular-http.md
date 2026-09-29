---
title: Angular HTTP
description: Answer httpResource() and HttpClient requests in an Angular test with one line - provideHttpTesting, expectRequest and a check for requests nobody answered.
---

# Angular HTTP

`vitest-auto-spy/angular-http` answers the HTTP requests your code makes in a `TestBed` test. Use it
when a component or service loads data with `httpResource()` or `HttpClient`. One `await` answers the
request, and the next line already sees the new value.

```ts
import { httpResource } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

interface User {
  id: number;
  name: string;
}

describe('user resource', () => {
  it('loads the user', async () => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
    const user = TestBed.runInInjectionContext(() => httpResource<User>(() => '/api/user'));

    await expectRequest('/api/user').flush({ id: 1, name: 'Ada' });

    expect(user.value()).toEqual({ id: 1, name: 'Ada' }); // no tick, no detectChanges
  });
});
```

The same works for a component: create it, answer the request, read the DOM.

```ts
import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

interface User {
  id: number;
  name: string;
}

@Component({
  selector: 'app-profile',
  template: `@if (user.hasValue()) {
    <h1>{{ user.value().name }}</h1>
  }`,
})
class ProfileComponent {
  readonly user = httpResource<User>(() => '/api/user');
}

it('shows the user name', async () => {
  TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [...provideHttpTesting()] });
  const fixture = TestBed.createComponent(ProfileComponent);

  await expectRequest('/api/user').flush({ id: 1, name: 'Ada' });

  expect(fixture.nativeElement.textContent).toContain('Ada'); // the view is already updated
});
```

A test that ends with an unanswered request fails and names the request. See
[`verifyOnTeardown`](#verifyonteardown).

## What to import

| Import                         | What it gives                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `vitest-auto-spy/angular-http` | `provideHttpTesting`, `expectRequest`, `expectNoRequest`, `verifyNoPendingRequests`, `injectHttpTesting`             |
| `vitest-auto-spy/angular`      | spies and `TestBed` helpers such as `provideAutoSpy` and `settleResource`; import it too only if your spec uses them |

This entry needs `@angular/common` installed. It is an **optional** peer dependency of the package:
only projects that import `vitest-auto-spy/angular-http` need it. Why it is optional:
[Optional peers](/core/compatibility#optional-peers).

## `provideHttpTesting()`

Sets up HTTP testing in one spread. Put it in `providers` of every test that makes requests.

```ts
import { TestBed } from '@angular/core/testing';
import { provideAutoSpy } from 'vitest-auto-spy/angular';
import { provideHttpTesting } from 'vitest-auto-spy/angular-http';

TestBed.configureTestingModule({
  providers: [...provideHttpTesting(), provideAutoSpy(AnalyticsService)],
});
```

It adds three things, in the order Angular requires:

1. `provideHttpClient(...)` with your `interceptors` and `features`;
2. `provideHttpClientTesting()`, so no request reaches the network;
3. the check that fails a test with an unanswered request (unless `verifyOnTeardown` is `false`).

| Option             | Type                                       | Default | Meaning                                                     |
| ------------------ | ------------------------------------------ | ------- | ----------------------------------------------------------- |
| `interceptors`     | `HttpInterceptorFn[]`                      | none    | functional interceptors, passed to `withInterceptors()`     |
| `features`         | `HttpFeature[]`                            | none    | any other `provideHttpClient()` feature                     |
| `verifyOnTeardown` | `boolean \| { ignoreCancelled?: boolean }` | `true`  | fail the test if a request is still unanswered when it ends |

**Common mistake:** writing `provideHttpClient()` + `provideHttpClientTesting()` by hand next to it,
or instead of it. A module built without `provideHttpTesting()` gets no end-of-test check.

### `interceptors` and `features`

Pass your interceptor here when the interceptor is what you test. You keep the end-of-test check.

```ts
import { HttpClient, type HttpInterceptorFn } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

const authInterceptor: HttpInterceptorFn = (request, next) => next(request.clone({ setHeaders: { Authorization: 'Bearer token' } }));

it('adds the token', async () => {
  TestBed.configureTestingModule({ providers: [...provideHttpTesting({ interceptors: [authInterceptor] })] });

  TestBed.inject(HttpClient).get('/api/me').subscribe();
  const pending = expectRequest('/api/me');

  expect(pending.request.headers.get('Authorization')).toBe('Bearer token');
  await pending.flush({ id: 1 });
});
```

`expectRequest` sees the request after all interceptors ran. A header an interceptor added is on
`request.headers`. If an interceptor rewrote the URL, match the new URL. An `error(status)` answer
also passes back through your interceptors. If one of them turns the error into something else, your
code receives that.

`features` takes any other `provideHttpClient()` feature: `withInterceptorsFromDi()` for a class
interceptor, `withXsrfConfiguration()`, `withJsonpSupport()`.

```ts
import { HTTP_INTERCEPTORS, withInterceptorsFromDi } from '@angular/common/http';

TestBed.configureTestingModule({
  providers: [
    ...provideHttpTesting({ interceptors: [authInterceptor], features: [withInterceptorsFromDi()] }),
    { provide: HTTP_INTERCEPTORS, useClass: LegacyInterceptor, multi: true },
  ],
});
```

How the two options combine:

- Everything goes into **one** `provideHttpClient()` call. Angular reports a conflicting HTTP setup only
  when it sees all of it in one call.
- `interceptors` run first, in array order. Then the interceptors from `features` run, in theirs.
- `provideHttpClientTesting()` comes last. It replaces the real backend, so even `withXhr()` in
  `features` never reaches the network.

### `verifyOnTeardown`

On by default. A test that ends while a request is still unanswered fails, and the message names the
request:

```text
[vitest-auto-spy] GET /api/products was never answered (end of "products > shows the list").
The code under test is still waiting on it, so nothing after that call ran; left open, the next test would match it.
Answer it in the spec: await expectRequest('/api/products').flush(body).
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-http#verifyonteardown
```

Such a test gives a wrong result in two ways. The code is still waiting for the response, so your assertions
after that call check a state the code never reached. And the open request leaks: the next test's
`expectRequest` can match it.

Turn the check off only if your tests check requests some other way:

```ts
TestBed.configureTestingModule({ providers: [...provideHttpTesting({ verifyOnTeardown: false })] });
```

**Common mistake:** configuring the module in `beforeAll`. A module built there belongs to no single
test, so nothing is checked. Configure it in `beforeEach` or in the test, or call
[`verifyNoPendingRequests()`](#verifynopendingrequests-options) yourself.

**Other runners.** The automatic check needs Vitest to report which test is running. Under
`bun:test`, `node:test` or another runner it cannot turn on, and it says so once per worker:

```text
[vitest-auto-spy] provideHttpTesting(): globalThis.__vitest_worker__ is not there, so the runner
does not say which test is running and the end-of-test check cannot arm. Call
`verifyNoPendingRequests()` yourself, or report the runner and version — under bun:test and
node:test this entry has no hook to use.
```

Everything else on this page works on those runners. Call `verifyNoPendingRequests()` at the end of
the test to get the same check by hand.

### `ignoreCancelled`

Keeps the check on, but does not fail the test for **cancelled** requests. A request is cancelled
when your code unsubscribes before the response arrives. Two common cases: an `httpResource()` whose
input signal changed before the first response, and a `switchMap` that dropped its inner request.

```ts
TestBed.configureTestingModule({
  providers: [...provideHttpTesting({ verifyOnTeardown: { ignoreCancelled: true } })],
});
```

Requests that are still waiting still fail the test. `{ ignoreCancelled: false }` is the same as
the default: cancelled requests fail the test too. The option has the same meaning as in Angular's
`HttpTestingController.verify({ ignoreCancelled })`.

**Common mistake:** turning the whole check off because one test cancels a request. That stops the
check for every other test in the file too. Use `ignoreCancelled` instead.

## `expectRequest(matcher, options?)`

Finds the one request that matches, lets you look at it, and answers it. It runs change detection
before it looks, so an `httpResource()` has already sent its request. You do not call
`fixture.detectChanges()` yourself, before or after.

```ts
await expectRequest('/api/products').flush([product]); // by URL
await expectRequest('/api/products', { method: 'POST' }).flush({}); // by URL and method
await expectRequest(/\/api\/products\?page=\d+/).flush([]); // by pattern
await expectRequest((request) => request.body?.id === 7).flush({}); // by anything else
```

How a matcher matches:

- A **string** matches `request.url` or `request.urlWithParams`. Usually you name the endpoint
  without its query string. Add the query only when two requests differ just by it.
- A **RegExp** is tested against `request.urlWithParams`.
- A **function** gets the `HttpRequest` and returns `true` for a match.

| Option   | Type      | Default | Meaning                                                                           |
| -------- | --------- | ------- | --------------------------------------------------------------------------------- |
| `method` | `string`  | any     | HTTP method to match; case does not matter                                        |
| `tick`   | `boolean` | `true`  | `false` skips change detection before the lookup and after the answer (see below) |

`expectRequest` returns an object with three members:

| Member                    | What it does                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `request`                 | the `HttpRequest` as your code sent it: URL, method, headers, body                                   |
| `flush(body, options?)`   | answers with `body`, then updates the app; `options` is `{ headers, status, statusText }`            |
| `error(status, options?)` | fails the request with `status`, then updates the app; `options` is `{ headers, statusText, error }` |

Check what your code sent before you answer:

```ts
const created = expectRequest('/api/products', { method: 'POST' });

expect(created.request.body).toEqual({ title: 'Chair' });

await created.flush({ id: 9 });
```

**Always `await` `flush()` and `error()`.** After the `await`, the next line reads the updated value
and the updated view.

### Error responses

Pick the call by what the server does:

| The server…                                  | Call                                        | Your code gets an `HttpErrorResponse` with…  |
| -------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| answers 500 or another error status, no body | `error(500)`                                | `status: 500`                                |
| answers an error status with a body you read | `flush({ code: 'taken' }, { status: 409 })` | `status: 409` and the body in `error`        |
| never answers: server down, offline, blocked | `error(0)`                                  | `status: 0` and a `ProgressEvent` in `error` |

In every case an `httpResource()` moves to the `'error'` status, and `resource.error()` holds the
`HttpErrorResponse`. Check `error()` or `hasValue()` in the template before you read `value()`: in the
error state, Angular's `value()` throws.

```ts
import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

@Component({
  selector: 'app-profile',
  template: `@if (user.error()) {
    <p>Could not load the user</p>
  }`,
})
class ProfileComponent {
  readonly user = httpResource<{ name: string }>(() => '/api/user');
}

it('shows an error when the server fails', async () => {
  TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [...provideHttpTesting()] });
  const fixture = TestBed.createComponent(ProfileComponent);

  await expectRequest('/api/user').error(500);

  expect(fixture.componentInstance.user.status()).toBe('error');
  expect(fixture.nativeElement.textContent).toContain('Could not load the user');
});
```

The `options` of `error()` are `{ headers, statusText, error }`. `error` sets what
`HttpErrorResponse.error` holds. The default is `new ProgressEvent('error')`, as in Angular's
`TestRequest.error()`.

**Common mistake:** passing a JSON error body to `error()`. That option is not a response body. Use
`flush(body, { status })`, and your code finds the body in `HttpErrorResponse.error`.

### Network failures: `error(0)`

`error(0)` means no response reached the client, as when the server is down or the request was
blocked. Pass your own `ProgressEvent` in `error` if the test checks it:

```ts
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';

const http = TestBed.inject(HttpClient);
const offline = new ProgressEvent('error');
let failure: HttpErrorResponse | undefined;

http.get('/api/products').subscribe({ error: (error: HttpErrorResponse) => (failure = error) });
await expectRequest('/api/products').error(0, { error: offline });

expect(failure?.error).toBe(offline);
```

### `{ tick: false }`

Use it only when your test module replaces `DOCUMENT` with a hand-made object that lacks some of the
real document's properties. Angular reads those properties during change detection, so the tick fails
with
`inject(...).body?.querySelector is not a function`. `expectRequest` then throws an error that says
this `TestBed` provides its own `DOCUMENT` and suggests `{ tick: false }`.

```ts
it('sends the token request', () => {
  TestBed.inject(TokenService).refresh(); // an HttpClient call, the request is already out

  expectRequest('/api/token', { tick: false }).flush('t'); // synchronous, no await
});
```

- Without the tick an `httpResource()` sends nothing, so this suits `HttpClient` calls whose request
  is already out.
- `flush()` and `error()` answer synchronously and return `void`. An `await` left on them still
  works, but `@typescript-eslint/await-thenable` reports it.
- `expectNoRequest` takes the same option.
- If you replace the document with `provideDocumentDouble()` from `vitest-auto-spy/angular`, you do
  not need `{ tick: false }`. That replacement keeps every member of the real document, so change
  detection runs. An error your app throws under it is rethrown unchanged.

## `expectNoRequest(matcher?, options?)`

Checks that no matching request was sent. With no argument, it checks that nothing was requested at
all.

```ts
component.filter.set('open');
expectNoRequest('/api/products'); // the cache answered; nothing went out
```

It runs change detection first, like `expectRequest`. Otherwise it could pass only because the
request was not sent **yet**. It takes the same `matcher` and options as `expectRequest`.

## `verifyNoPendingRequests(options?)`

The end-of-test check, called by hand. It fails if a request is still unanswered, and clears the
open requests either way.

```ts
await expectRequest('/api/products').flush([]);
verifyNoPendingRequests(); // nothing else went out
verifyNoPendingRequests({ ignoreCancelled: true }); // except requests your code unsubscribed from
```

Use it:

- in the middle of a test, to prove that nothing else was requested before the next step;
- in the few tests that need it when `verifyOnTeardown` is `false`;
- on runners without the automatic check (see [Other runners](#verifyonteardown)).

| Option            | Type      | Default | Meaning                                              |
| ----------------- | --------- | ------- | ---------------------------------------------------- |
| `ignoreCancelled` | `boolean` | `false` | do not fail for requests your code unsubscribed from |

It does nothing if the test set up no HTTP testing. If the `TestBed` was already reset during the
test, it still reports the requests that were open at the reset.

## `injectHttpTesting()`

Returns the `HttpTestingController` that `provideHttpTesting()` installed. Use it if you prefer
Angular's own `expectOne`, `match` and `expectNone` for a service that returns an Observable: the
request is out as soon as you subscribe, so those methods answer synchronously.

```ts
import { injectHttpTesting } from 'vitest-auto-spy/angular-http';

const received: Item[][] = [];

service.load().subscribe((items) => received.push(items));
injectHttpTesting().expectOne('/api/items').flush([]);

expect(received).toEqual([[]]);
```

The end-of-test check stays on. Without `provideHttpTesting()` in `providers`, it throws the same
`this TestBed has no HttpTestingController` message as `expectRequest`.

## What each failure says

| Message contains                            | Cause and fix                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `no request matched … Made instead: …`      | the URL, method or predicate matches nothing that was sent; compare with the list of sent requests   |
| `no POST … — but GET … was made`            | only the method differs; pass the `{ method }` your code sends                                       |
| `… was made; the query differs`             | same path and method, another query string; name that query, or match the path alone                 |
| `nothing was requested at all`              | the resource never started, or nothing subscribed to the Observable                                  |
| `N requests matched …`                      | more than one match; narrow it with `{ method }`, the full URL or a predicate                        |
| `this TestBed has no HttpTestingController` | `provideHttpTesting()` is missing from `providers`                                                   |
| `… was never answered (end of "…")`         | `verifyOnTeardown` found an unanswered request; the message names the test and the line to answer it |

The first message lists every request that was sent. If you asked for `/api/products` and the only
request was `GET /api/product`, you see the typo right away.

## Related helpers

- **[`settleResource`](/adapters/angular#resources-httpresource-and-resource)** from
  `vitest-auto-spy/angular` waits for a resource no matter who started it. Use it when the wait is
  not tied to one request: a `resource()` with an async loader, an `rxResource`, a reload.
  `expectRequest().flush()` waits only for the update that follows the request it answered.
- **[`enableAngularDiagnostics({ pendingRequests })`](/adapters/angular-diagnostics#pendingrequests)**
  reports unanswered requests from a setup file, including in tests that configure HTTP testing by
  hand. If every test uses `provideHttpTesting()`, you do not need it. If some files still configure
  HTTP by hand, keep it on. An unanswered request is reported by one of the two checks, not by both.

## Zoneless and `fakeAsync`

`flush()`, `error()` and the request lookup update the app with `TestBed.tick()`. It runs pending
effects and change detection synchronously in both zoneless and zone-based tests. It also updates
fixtures that are not attached to the application (`ApplicationRef`).

Under `fakeAsync` from [`vitest-auto-spy/zone`](/utilities/zone) the helpers work the same way. One
exception: if a loader resolves on a **timer**, advance the timer with `tick()` or `advanceTimers()`
from the zone entry. Running microtasks does not replace that.

## In depth

### What `expectRequest(url).flush(body)` replaces

Without this entry, testing an `httpResource()` takes six steps in a fixed order. Each missed step
fails with a message that does not name the step.

| Step                  | What happens without it                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| tick                  | the `httpResource()` has sent nothing yet, so `expectOne` finds no request             |
| inject the controller | one more `TestBed.inject(HttpTestingController)` line in every test                    |
| `expectOne(url)`      | a failure names the token, not the URL that was actually requested                     |
| `flush(body)`         | the resource stays `loading` forever and the fixture never becomes stable              |
| let one microtask run | the assertion reads the resource's **default** value: a green test that checks nothing |
| tick again            | the view that shows the resource is one frame behind the value                         |

`expectRequest(url).flush(body)` does all six.

### When the end-of-test check runs

Each testing module built from `provideHttpTesting()` turns the check on for the test that built it.
That is why it also works when:

- Vitest runs several spec files in one worker (`isolate: false`);
- the provider list is stored in a shared constant;
- the providers are spread twice (the check still runs once).

The check runs in `onTestFinished`, after every `afterEach`. So it runs after Angular's own teardown
and after your own `getTestBed().resetTestingModule()`, whatever `sequence.hooks` says. A reset
during the test first stores the open requests, so the check still sees them. It never asks a reset
`TestBed` for its controller: that would build a new module, and the next test's
`configureTestingModule` would fail.

### How it works with `pendingRequests`

`provideHttpTesting()` and `enableAngularDiagnostics({ pendingRequests })` both take the open
requests with `match(() => true)`. That call removes what it returns, so each unanswered request is
reported once, by whichever check looks first.
