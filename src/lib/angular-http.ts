/**
 * `provideHttpTesting()` + `expectRequest()` — the `httpResource()` and `HttpClient` dance in two
 * lines.
 *
 * Answering one request from a zoneless spec takes six steps today, and the order of them is not
 * guessable: tick (an `httpResource()` issues *nothing* until something does), inject the
 * `HttpTestingController`, `expectOne`, `flush`, let one microtask run so the response reaches the
 * resource, tick again so what read it is up to date. Miss the first tick and `expectOne` finds no
 * request; miss the microtask and the assertion reads the resource's *default* value — a green test
 * that asserts nothing until the day the default changes.
 *
 * ```ts
 * TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
 *
 * const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));
 *
 * await expectRequest('/api/products').flush([product]);
 *
 * expect(products.value()).toEqual([product]); // no tick, no microtask, no detectChanges
 * ```
 *
 * **This module is why `vitest-auto-spy/angular-http` is its own entry.** It is the only file in
 * the package that imports `@angular/common`, and `vitest-auto-spy/angular` has to keep loading in
 * a project that has `@angular/core` and not `@angular/common` — the same invariant that keeps
 * rxjs behind `vitest-auto-spy/rxjs`. The optional peer is paid for by the suites that import this
 * entry and by nobody else.
 *
 * It cooperates with `enableAngularDiagnostics({ pendingRequests })` rather than competing: both
 * take the open requests with `match(() => true)`, which is one-shot, so whichever looks first
 * owns them and one unanswered request is never reported twice.
 */
import { type HttpRequest, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, type TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';
import { flushEffects } from './zoneless';

/** How a request is named: a URL, a pattern, or a question asked of the request itself. */
export type RequestMatcher = RegExp | string | ((request: HttpRequest<unknown>) => boolean);

/** Options for {@link expectRequest} and {@link expectNoRequest}. */
export interface ExpectRequestOptions {
  /** Narrow to one verb, for a URL that is both read and written in the same test. Case-insensitive. */
  method?: string;
}

/** Options for {@link provideHttpTesting}. */
export interface HttpTestingOptions {
  /**
   * Fail a test that ends holding a request nothing answered. Default `true`.
   *
   * A request nobody flushed is a spec whose code under test is still waiting on a response — every
   * assertion after that call is about a state the test never reached. Left alone it also leaks:
   * the next test's `expectRequest` matches a request the previous one made.
   */
  verifyOnTeardown?: boolean;
}

/** The body types `TestRequest#flush` takes, read off Angular rather than restated here. */
export type ResponseBody = Parameters<TestRequest['flush']>[0];

/** `headers` / `status` / `statusText`, exactly as `TestRequest#flush` takes them. */
export type FlushOptions = NonNullable<Parameters<TestRequest['flush']>[1]>;

/** `headers` / `statusText` for {@link RequestExpectation.error} — the status is its first argument. */
export type RequestErrorOptions = Omit<NonNullable<Parameters<TestRequest['error']>[1]>, 'status'>;

/** The one request {@link expectRequest} found, and the two ways to answer it. */
export interface RequestExpectation {
  /** The request as the code under test sent it — URL, method, headers, body. */
  readonly request: HttpRequest<unknown>;
  /**
   * Answer the request, then settle: on the next line the resource has its value and the view that
   * reads it has been ticked.
   */
  flush(body: ResponseBody, options?: FlushOptions): Promise<void>;
  /** Fail the request with an HTTP status, then settle the same way {@link RequestExpectation.flush} does. */
  error(status: number, options?: RequestErrorOptions): Promise<void>;
}

/**
 * Rounds of "let a microtask run, then tick" spent after an answer is delivered.
 *
 * Measured against Angular 21.2.17 on a zoneless TestBed: an `httpResource()` needs exactly one —
 * the response reaches the resource on the microtask, and the tick is what the view reading it
 * needs. The second round is margin for a loader with one more `await` in it, and costs an
 * already-clean tick.
 */
const SETTLE_ROUNDS = 2;

/** `true` while a test that called {@link provideHttpTesting} has not been checked yet. */
let verifyArmed = false;

/**
 * Everything `TestBed.configureTestingModule` needs for HTTP testing, in one spread.
 *
 * ```ts
 * TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAutoSpy(Analytics)] });
 * ```
 *
 * It is `provideHttpClient()` + `provideHttpClientTesting()` and deliberately nothing more: a suite
 * whose interceptors are the thing under test keeps its own `provideHttpClient(withInterceptors([…]))`
 * and adds `provideHttpClientTesting()` after it.
 */
export function provideHttpTesting(options: HttpTestingOptions = {}): (EnvironmentProviders | Provider)[] {
  verifyArmed = options.verifyOnTeardown ?? true;

  return [provideHttpClient(), provideHttpClientTesting()];
}

/**
 * `GET /api/products?page=2`, as it reads in a failure.
 *
 * `urlWithParams` rather than `url`: two requests to the same endpoint differing only in their
 * query are the pair a reader is trying to tell apart.
 */
function describeRequest(request: HttpRequest<unknown>): string {
  return `${request.method} ${request.urlWithParams}`;
}

/** How the failure quotes what was being looked for. */
function describeMatcher(matcher: RequestMatcher, options: ExpectRequestOptions): string {
  const method = options.method === undefined ? '' : `${options.method.toUpperCase()} `;

  if (typeof matcher === 'string') {
    return `${method}${matcher}`;
  }

  if (typeof matcher === 'function') {
    return `${method}a predicate`;
  }

  return `${method}${String(matcher)}`;
}

/** A URL matches by either form, so a spec may name the endpoint without repeating its query string. */
function matchesUrl(request: HttpRequest<unknown>, matcher: RequestMatcher): boolean {
  if (typeof matcher === 'string') {
    return request.url === matcher || request.urlWithParams === matcher;
  }

  if (typeof matcher === 'function') {
    return matcher(request);
  }

  return matcher.test(request.urlWithParams);
}

function toPredicate(matcher: RequestMatcher, options: ExpectRequestOptions): (request: HttpRequest<unknown>) => boolean {
  const method = options.method?.toUpperCase();

  return (request) => (method === undefined || request.method.toUpperCase() === method) && matchesUrl(request, matcher);
}

/**
 * The controller, or the error that names why there is none.
 *
 * The failure is worth its own message: `TestBed.inject(HttpTestingController)` on a module that
 * never got `provideHttpClientTesting()` reports a missing provider for a token the spec never
 * mentions, and the fix — one spread in `providers` — is nowhere in it.
 */
function readController(caller: string): HttpTestingController {
  const controller = TestBed.inject(HttpTestingController, null);

  if (controller === null) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] ${caller}: this TestBed has no HttpTestingController, so there is nothing holding the request.\n` +
          'Add the providers: `TestBed.configureTestingModule({ providers: [...provideHttpTesting()] })` — that is ' +
          '`provideHttpClient()` and `provideHttpClientTesting()` together.\n' +
          'A real `HttpClient` with no testing backend does not queue anything: the request went to the network, and no ' +
          'assertion here can reach it.',
        DOCS_LINKS.angularHttp,
      ),
    );
  }

  return controller;
}

/**
 * Nothing matched — so say what *was* requested.
 *
 * The list is the whole value of this message. "Expected one matching request, found none" sends a
 * reader to re-read the URL in their own spec; "the only request made was `GET /api/product` and
 * you asked for `/api/products`" ends the search on the spot. Taking the requests here is
 * deliberate: the test is failing anyway, and it stops the teardown check from adding a second
 * failure about the same requests.
 */
function noMatch(controller: HttpTestingController, matcher: RequestMatcher, options: ExpectRequestOptions): Error {
  const made = controller.match(() => true).map((open) => describeRequest(open.request));
  const listed = made.length === 0 ? 'No request was made at all.' : `Requests that were made: ${made.join(', ')}.`;

  return new Error(
    withDocs(
      `[vitest-auto-spy] expectRequest: no request matched ${describeMatcher(matcher, options)}.\n${listed}\n` +
        'The tick that issues a pending `httpResource()` request has already been taken here, so a resource that still ' +
        'sent nothing never started: its `request()` computation reads a signal the test never set, returns `undefined`, ' +
        'or the injection context it was created in was discarded. For an `HttpClient` call, nothing subscribed — an ' +
        'Observable nobody subscribes to makes no request.',
      DOCS_LINKS.angularHttp,
    ),
  );
}

/** More than one match: the ambiguity has to be resolved by the spec, not guessed at here. */
function tooMany(matched: TestRequest[], matcher: RequestMatcher, options: ExpectRequestOptions): Error {
  const listed = matched.map((open) => describeRequest(open.request)).join(', ');

  return new Error(
    withDocs(
      `[vitest-auto-spy] expectRequest: ${matched.length} requests matched ${describeMatcher(matcher, options)}: ${listed}.\n` +
        'Answering one of several is not something this helper will pick for you — the one it picked would decide the ' +
        "test's outcome.\n" +
        'Narrow it: `expectRequest(url, { method: "POST" })`, name the full `urlWithParams` including the query string, ' +
        'or pass a predicate — `expectRequest((request) => request.body?.id === 7)`.',
      DOCS_LINKS.angularHttp,
    ),
  );
}

/**
 * Take delivery of an answer that has already been given.
 *
 * One `await Promise.resolve()` is the hand-off a tick alone does not cover — the response's
 * promise continuation runs there, and it is what moves a resource off `loading`. The tick after it
 * is what the view reading the resource needs. Both, in that order, are the two steps this helper
 * exists to stop people rediscovering.
 */
async function settle(): Promise<void> {
  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    await Promise.resolve();
    flushEffects();
  }
}

/**
 * Find the one request that matches, and hand back the two ways to answer it.
 *
 * ```ts
 * await expectRequest('/api/products').flush([product]);          // by URL
 * await expectRequest('/api/products', { method: 'POST' }).flush({});  // by URL and verb
 * await expectRequest(/\/api\/products\?page=\d+/).flush([]);      // by pattern
 * await expectRequest((request) => request.body?.id === 7).flush({}); // by anything else
 * ```
 *
 * It ticks before it looks, because an `httpResource()` created in an injection context has issued
 * nothing until something does — that is the step whose absence makes `expectOne` report a request
 * that was never sent rather than one that was sent wrongly.
 *
 * @param matcher The URL, a pattern for it, or a predicate over the request.
 * @param options `{ method }`, for a URL that is both read and written in the same test.
 */
export function expectRequest(matcher: RequestMatcher, options: ExpectRequestOptions = {}): RequestExpectation {
  const controller = readController('expectRequest');

  flushEffects();

  const [first, ...rest] = controller.match(toPredicate(matcher, options));

  if (first === undefined) {
    throw noMatch(controller, matcher, options);
  }

  if (rest.length > 0) {
    throw tooMany([first, ...rest], matcher, options);
  }

  return {
    request: first.request,
    flush: async (body: ResponseBody, flushOptions?: FlushOptions): Promise<void> => {
      first.flush(body, flushOptions);

      await settle();
    },
    error: async (status: number, errorOptions?: RequestErrorOptions): Promise<void> => {
      first.error(new ProgressEvent('error'), { ...errorOptions, status });

      await settle();
    },
  };
}

/**
 * Assert that nothing was requested — of one endpoint, or at all.
 *
 * ```ts
 * component.filter.set('open');
 * expectNoRequest('/api/products'); // the cache answered; nothing went out
 * ```
 *
 * Ticks first, like {@link expectRequest}: a request that has not been issued *yet* is not the
 * same claim, and this helper would otherwise pass for the wrong reason.
 */
export function expectNoRequest(matcher: RequestMatcher = () => true, options: ExpectRequestOptions = {}): void {
  const controller = readController('expectNoRequest');

  flushEffects();

  const matched = controller.match(toPredicate(matcher, options));

  if (matched.length === 0) {
    return;
  }

  throw new Error(
    withDocs(
      `[vitest-auto-spy] expectNoRequest: ${matched.length} request(s) matched ${describeMatcher(matcher, options)}: ` +
        `${matched.map((open) => describeRequest(open.request)).join(', ')}.\n` +
        'Something the test did asked for data it was asserted not to need — a resource whose `request()` recomputed, an ' +
        'effect that reloaded, or a cache that missed.',
      DOCS_LINKS.angularHttp,
    ),
  );
}

/**
 * Fail if the `HttpTestingController` is still holding requests, and take them either way.
 *
 * `provideHttpTesting()` runs this after every test on its own; it is exported because the same
 * question is worth asking mid-test — after the arrange step, before the assertions that depend on
 * it — and because a suite that turned `verifyOnTeardown` off still wants it in the two specs where
 * it matters.
 *
 * A no-op when the test configured no HTTP testing at all.
 */
export function verifyNoPendingRequests(): void {
  const controller = TestBed.inject(HttpTestingController, null);

  if (controller === null) {
    return;
  }

  const open = controller.match(() => true);

  if (open.length === 0) {
    return;
  }

  throw new Error(
    withDocs(
      `[vitest-auto-spy] provideHttpTesting({ verifyOnTeardown }): the test ended with ${open.length} unanswered ` +
        `request(s): ${open.map((request) => describeRequest(request.request)).join(', ')}.\n` +
        'The code under test is still waiting on a response it never received, so everything the spec expected to happen ' +
        'after that call did not happen here — and the request would otherwise be matched by the next test.\n' +
        "Answer it (`await expectRequest('/url').flush(body)`), assert it is absent (`expectNoRequest('/url')`), or turn " +
        'the check off for this suite with `provideHttpTesting({ verifyOnTeardown: false })`.',
      DOCS_LINKS.angularHttp,
    ),
  );
}

// Registered here, while the spec file that imports this entry is being loaded, and deliberately
// not from inside `provideHttpTesting()`. Measured on Vitest 4.1: `afterEach()` called from a
// running `beforeEach` is accepted and then never runs — the suite it would join has finished
// collecting — and `onTestFinished()`, which *is* legal there, runs after every `afterEach`, by
// which point Angular's teardown has destroyed the injector and there is no controller left to ask.
// A hook registered at import time is the one that runs while the testing module is still alive:
// `afterEach` hooks run in reverse registration order, so this one goes before the framework
// teardown registered by the setup file.
afterEach(() => {
  if (!verifyArmed) {
    return;
  }

  verifyArmed = false;

  verifyNoPendingRequests();
});
