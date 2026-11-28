---
title: Angular HTTP
description: Answer httpResource() and HttpClient requests in an Angular test with one line - provideHttpTesting, expectRequest and a check for requests nobody answered.
---

# Angular HTTP

Use `vitest-auto-spy/angular-http` to test code that loads data with `httpResource()` or `HttpClient` without calling a server. Add `provideHttpTesting()` to `TestBed`, then answer the request with `expectRequest().flush()`.

```ts
import { httpResource } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

it('loads the user', async () => {
  TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
  const user = TestBed.runInInjectionContext(() => httpResource<{ name: string }>(() => '/api/user'));

  await expectRequest('/api/user').flush({ name: 'Ada' });

  expect(user.value()).toEqual({ name: 'Ada' });
});
```

`expectRequest()` runs change detection before matching. `flush()` updates the view after the response, so await it before asserting. In Vitest, [unanswered requests fail the test](#verifyonteardown).

If your project does not have Angular tests yet, [set up Angular testing](/core/installation) first.

To check what a component displays, create it before answering the request:

```ts
import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

@Component({
  selector: 'app-profile',
  template: `@if (user.hasValue()) {
    <h1>{{ user.value().name }}</h1>
  }`,
})
class ProfileComponent {
  readonly user = httpResource<{ name: string }>(() => '/api/user');
}

it('shows the user name', async () => {
  TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [...provideHttpTesting()] });
  const fixture = TestBed.createComponent(ProfileComponent);

  await expectRequest('/api/user').flush({ name: 'Ada' });

  expect(fixture.nativeElement.textContent).toContain('Ada');
});
```

## What to import

| Import                         | What it gives                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `vitest-auto-spy/angular-http` | `provideHttpTesting`, `expectRequest`, `expectNoRequest`, `verifyNoPendingRequests`, `injectHttpTesting`   |
| `vitest-auto-spy/angular`      | Spies and `TestBed` helpers such as `provideAutoSpy` and `settleResource`. Import it only if you use them. |

This package lists `@angular/common` as an optional peer. Install it to use `/angular-http`. See [Optional peers](/core/compatibility#optional-peers).

## `provideHttpTesting()`

Spread `provideHttpTesting()` into `providers` in each `TestBed` setup that makes HTTP requests. You can use it alongside other providers:

```ts
import { TestBed } from '@angular/core/testing';
import { provideAutoSpy } from 'vitest-auto-spy/angular';
import { provideHttpTesting } from 'vitest-auto-spy/angular-http';

TestBed.configureTestingModule({
  providers: [...provideHttpTesting(), provideAutoSpy(AnalyticsService)],
});
```

| Option             | Type                                       | Default | Meaning                                                |
| ------------------ | ------------------------------------------ | ------- | ------------------------------------------------------ |
| `interceptors`     | `HttpInterceptorFn[]`                      | none    | Functional interceptors passed to `withInterceptors()` |
| `features`         | `HttpFeature[]`                            | none    | Other features passed to `provideHttpClient()`         |
| `verifyOnTeardown` | `boolean \| { ignoreCancelled?: boolean }` | `true`  | Fail the test if a request remains unanswered          |

The helper registers `provideHttpClient(...)`, then `provideHttpClientTesting()` to replace the real backend. Finally, it adds the end-of-test check unless you turn it off.

**Common mistake:** adding `provideHttpClient()` or `provideHttpClientTesting()` yourself. The helper already adds both. If you use only Angular's providers, you don't get this helper's end-of-test check.

### `interceptors` and `features`

Pass the interceptor you're testing to `provideHttpTesting()`. You keep the end-of-test check.

```ts
import { HttpClient, type HttpInterceptorFn } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
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

`expectRequest` sees the request after the interceptors run. If an interceptor changes the URL, match the new URL. If an interceptor transforms an `error(status)` response, your code receives the transformed result.

Pass other `provideHttpClient()` features in `features`. Examples include `withInterceptorsFromDi()` for class-based interceptors, `withXsrfConfiguration()`, and `withJsonpSupport()`.

```ts
import { HTTP_INTERCEPTORS, withInterceptorsFromDi } from '@angular/common/http';

TestBed.configureTestingModule({
  providers: [
    ...provideHttpTesting({ interceptors: [authInterceptor], features: [withInterceptorsFromDi()] }),
    { provide: HTTP_INTERCEPTORS, useClass: LegacyInterceptor, multi: true },
  ],
});
```

- Both options go into one `provideHttpClient()` call, so Angular can detect conflicting features.
- Interceptors in `interceptors` run first, in array order. Then the interceptors from `features` run in their own order.
- `provideHttpClientTesting()` replaces the backend after both options are applied. Even `withXhr()` doesn't send requests over the network.

### `verifyOnTeardown`

In Vitest, the check is on by default. If a request remains unanswered, the test fails and the message tells you how to answer it:

```text
[vitest-auto-spy] GET /api/products was never answered (end of "products > shows the list").
The code under test is still waiting on it, so nothing after that call ran; left open, the next test would match it.
Answer it in the spec: await expectRequest('/api/products').flush(body).
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-http#verifyonteardown
```

While a request waits for a response, your test can assert against the wrong state. An open request can also match a later test's `expectRequest`.

Turn off the automatic check only if you check requests another way:

```ts
TestBed.configureTestingModule({ providers: [...provideHttpTesting({ verifyOnTeardown: false })] });
```

**Common mistake:** setting up the module in `beforeAll`. No test owns that module, so the check doesn't run. Set it up in `beforeEach` or in the test, or call [`verifyNoPendingRequests()`](#verifynopendingrequests-options) yourself.

**Other runners.** The automatic check relies on Vitest to identify the current test. Under `bun:test`, `node:test`, or another runner, the helper warns once per worker:

```text
[vitest-auto-spy] provideHttpTesting(): globalThis.__vitest_worker__ is not there, so the runner
does not say which test is running and the end-of-test check cannot arm. Call
`verifyNoPendingRequests()` yourself, or report the runner and version — under bun:test and
node:test this entry has no hook to use.
```

The other helpers still work. Call `verifyNoPendingRequests()` at the end of each test to run the check yourself.

### `ignoreCancelled`

Use this option when your code deliberately unsubscribes before a response arrives. For example, an `httpResource()` input changes or `switchMap` drops an earlier request.

```ts
TestBed.configureTestingModule({
  providers: [...provideHttpTesting({ verifyOnTeardown: { ignoreCancelled: true } })],
});
```

The check still fails for requests waiting for a response. `ignoreCancelled` defaults to `false`, so cancelled requests fail the check too. The option works like Angular's `HttpTestingController.verify({ ignoreCancelled })`.

**Common mistake:** disabling the check for a whole file because one test cancels a request. Use `ignoreCancelled` instead.

## `expectRequest(matcher, options?)`

Finds exactly one matching request. You can inspect what your code sent before answering:

```ts
import { expectRequest } from 'vitest-auto-spy/angular-http';

const created = expectRequest('/api/products', { method: 'POST' });
expect(created.request.body).toEqual({ title: 'Chair' });
await created.flush({ id: 9 });
```

By default, `expectRequest` runs change detection before it looks for the request. That lets `httpResource()` send its request. Await `flush()` or `error()` before you assert on the updated value or view.

Calling `expectRequest()` alone leaves the request pending. If you don't answer it with `flush()` or `error()`, both the [end-of-test check](#verifyonteardown) and [`verifyNoPendingRequests()`](#verifynopendingrequests-options) can report it.

| Matcher  | What it checks                              | Example                                          |
| -------- | ------------------------------------------- | ------------------------------------------------ |
| String   | `request.url` or `request.urlWithParams`    | `'/api/products'`                                |
| `RegExp` | `request.urlWithParams`                     | `/\/api\/products\?page=\d+/`                    |
| Function | Returns `true` for a matching `HttpRequest` | `(request) => request.headers.has('X-Trace-Id')` |

Match the path alone unless you need the query string to tell requests apart.

| Option   | Type      | Default | Meaning                                                                            |
| -------- | --------- | ------- | ---------------------------------------------------------------------------------- |
| `method` | `string`  | any     | HTTP method to match, case-insensitive                                             |
| `tick`   | `boolean` | `true`  | [`false`](#tick-false) skips change detection before lookup and after the response |

| Member                    | What it does                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `request`                 | The `HttpRequest`, including its URL, method, headers, and body                                     |
| `flush(body, options?)`   | Responds with `body`, then updates the app. Options: `{ headers, status, statusText }`.             |
| `error(status, options?)` | Simulates a failure with `status`, then updates the app. Options: `{ headers, statusText, error }`. |

### Error responses

Use `error(status)` to test a failure when you don't need a response body:

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

| What happens                                      | Call                                                                | What `HttpErrorResponse` contains            |
| ------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| The server returns an error status without a body | `error(500)`                                                        | `status: 500`                                |
| The server returns an error status with a body    | `flush({ code: 'taken' }, { status: 409, statusText: 'Conflict' })` | `status: 409` and the body in `error`        |
| No response reaches the client                    | `error(0)`                                                          | `status: 0` and a `ProgressEvent` in `error` |

When the failure reaches `httpResource()`, its status becomes `'error'` and `resource.error()` holds the `HttpErrorResponse`. Check `error()` or `hasValue()` before reading `value()` in the template. Angular throws if you read `value()` in the error state.

The `error` option sets `HttpErrorResponse.error`. It defaults to `new ProgressEvent('error')`, as in Angular's `TestRequest.error()`.

**Common mistake:** using `error()` for a JSON response body. Use `flush(body, { status, statusText })` to put that body in `HttpErrorResponse.error`.

### Network failures: `error(0)`

Use `error(0)` when the server is down, the client is offline, or the request is blocked. If your test checks the event, pass your own `ProgressEvent`:

```ts
import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

it('reports a network failure', async () => {
  TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
  const http = TestBed.inject(HttpClient);
  const offline = new ProgressEvent('error');
  let failure: HttpErrorResponse | undefined;

  http.get('/api/products').subscribe({ error: (error: HttpErrorResponse) => (failure = error) });
  await expectRequest('/api/products').error(0, { error: offline });

  expect(failure?.error).toBe(offline);
});
```

### `{ tick: false }`

Use this only when a hand-written `DOCUMENT` replacement breaks Angular's change detection. If change detection fails with a partial document (for example, `inject(...).body?.querySelector is not a function`), the helper names the `DOCUMENT` replacement and suggests `{ tick: false }`.

```ts
it('sends the token request', () => {
  TestBed.inject(TokenService).refresh();

  expectRequest('/api/token', { tick: false }).flush('t');
});
```

- With `{ tick: false }`, the helper skips the change detection that starts `httpResource()` requests. Use this option for requests already sent, such as an active `HttpClient` subscription.
- `flush()` and `error()` run synchronously and return `void`. `await` still works, but `@typescript-eslint/await-thenable` flags it.
- `expectNoRequest` also accepts `{ tick: false }`.
- With `provideDocumentDouble()` from `vitest-auto-spy/angular`, change detection can read the real document's properties. Leave ticking on. If your app throws an error, the helper rethrows it unchanged.

## `expectNoRequest(matcher?, options?)`

Checks that no matching request was sent. Omit the matcher to check that no requests were sent at all.

```ts
import { expectNoRequest } from 'vitest-auto-spy/angular-http';

component.filter.set('open');
expectNoRequest('/api/products');
```

Like `expectRequest`, it runs change detection first, so the check doesn't pass just because the request hasn't gone out yet. It takes the same matcher and options.

## `verifyNoPendingRequests(options?)`

Run the unanswered-request check yourself. The helper clears open requests even if it reports a failure.

```ts
import { expectRequest, verifyNoPendingRequests } from 'vitest-auto-spy/angular-http';

await expectRequest('/api/products').flush([]);
verifyNoPendingRequests();
```

Use it between steps, when `verifyOnTeardown` is off, or on [runners without the automatic check](#verifyonteardown).

| Option            | Type      | Default | Meaning                                   |
| ----------------- | --------- | ------- | ----------------------------------------- |
| `ignoreCancelled` | `boolean` | `false` | Skip requests your code unsubscribed from |

It does nothing if the test didn't set up HTTP testing. If the test already reset `TestBed`, it still reports requests that were open at the reset.

## `injectHttpTesting()`

Returns Angular's `HttpTestingController`. Use it if you prefer `expectOne`, `match`, or `expectNone`. An `HttpClient` Observable sends the request on subscription, so you can match and answer it synchronously.

```ts
import { injectHttpTesting } from 'vitest-auto-spy/angular-http';

const received: Item[][] = [];
service.load().subscribe((items) => received.push(items));
injectHttpTesting().expectOne('/api/items').flush([]);

expect(received).toEqual([[]]);
```

The end-of-test check stays on by default. If `providers` has no `provideHttpTesting()`, you get the same `this TestBed has no HttpTestingController` message as with `expectRequest`.

## What each failure says

| Message contains                            | Cause and fix                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `no request matched … Made instead: …`      | No match. Compare the URL, method, or predicate with the requests listed in the error.           |
| `no POST … — but GET … was made`            | Only the method differs. Match the method your code sends.                                       |
| `… was made; the query differs`             | The path and method match. Use the actual query string or match the path alone.                  |
| `nothing was requested at all`              | Check that the resource started or that something subscribed to the Observable.                  |
| `N requests matched …`                      | Narrow the match with `{ method }`, the full URL, or a predicate.                                |
| `this TestBed has no HttpTestingController` | Add `provideHttpTesting()` to `providers`.                                                       |
| `… was never answered (end of "…")`         | The check found an open request. The message names the test and shows how to answer the request. |

## Related helpers

- **[`settleResource`](/adapters/angular#resources-httpresource-and-resource)** from `vitest-auto-spy/angular` waits for a resource update that isn't tied to a particular request. Use it for a `resource()` with an async loader, an `rxResource`, or a reload. `expectRequest().flush()` waits only for the update after the request it answers.
- **[`enableAngularDiagnostics({ pendingRequests })`](/adapters/angular-diagnostics#pendingrequests)** reports unanswered requests from a setup file, including tests that use Angular's providers directly. Keep it on if some tests still configure HTTP testing by hand. If all tests use `provideHttpTesting()`, you don't need it. Each unanswered request is reported only once.

## Zoneless and `fakeAsync`

Request lookup, `flush()`, and `error()` use `TestBed.tick()`. It runs pending effects and change detection synchronously, with or without Zone.js. It also updates fixtures that aren't attached to `ApplicationRef`.

The helpers work the same way inside `fakeAsync` from [`vitest-auto-spy/zone`](/utilities/zone). If a loader resolves on a timer, advance it with `tick()` or `advanceTimers()` from that entry. Running microtasks alone won't advance a timer.

## In depth

### What `expectRequest(url).flush(body)` replaces

The helper does these six steps in order:

| Step                           | Why it matters                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| Inject `HttpTestingController` | Gets the controller without another line in your test          |
| Run `TestBed.tick()`           | Lets `httpResource()` send its request before lookup           |
| Match the request              | Lists the requests that went out if none matches               |
| Flush the body                 | Lets the resource finish loading and the fixture become stable |
| Let one microtask run          | Lets the resource publish the result before you read its value |
| Run `TestBed.tick()` again     | Updates the view to show the new value                         |

### When the end-of-test check runs

Each `provideHttpTesting()` module registers a check for the test that builds it. The check still runs once if you spread the providers twice. It also works with a shared provider array or with `isolate: false`.

The check uses `onTestFinished`, after all `afterEach` hooks, regardless of `sequence.hooks`. That includes Angular's teardown and your own `getTestBed().resetTestingModule()`. When a reset happens first, the helper saves the open requests. It doesn't read the controller after reset: that would create a new module and block the next `configureTestingModule()`.

### How it works with `pendingRequests`

Both checks collect requests still held by Angular with `match(() => true)`. That call removes the requests it returns, so only the first check to collect them can report them. The `/angular-http` check also tracks unanswered requests already matched by `expectRequest()`.
