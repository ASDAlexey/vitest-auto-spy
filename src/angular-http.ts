/**
 * `vitest-auto-spy/angular-http` — `httpResource()` and `HttpClient` in two lines.
 *
 * ```ts
 * import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';
 *
 * TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
 *
 * const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));
 *
 * await expectRequest('/api/products').flush([product]);
 *
 * expect(products.value()).toEqual([product]);
 * ```
 *
 * **Its own entry, and a narrow one: this is the only file of the package that reaches
 * `@angular/common`.** `vitest-auto-spy/angular` has to keep loading in a project that has
 * `@angular/core` and not `@angular/common`, so a static import of `@angular/common/http/testing`
 * cannot live there — the same invariant that keeps rxjs behind `vitest-auto-spy/rxjs`, and the
 * reason `@angular/common` is an *optional* peer that only the suites importing this entry pay for.
 *
 * Unlike the other subpaths this one does **not** re-export the core: it is a companion to
 * `vitest-auto-spy/angular`, which stays the import for spies, `TestBed` helpers and `settleResource`.
 *
 * Importing it registers one `afterEach` per spec file, which does nothing unless that test called
 * `provideHttpTesting()` — see `provideHttpTesting({ verifyOnTeardown })`.
 */
export {
  expectNoRequest,
  expectRequest,
  provideHttpTesting,
  verifyNoPendingRequests,
  type ExpectRequestOptions,
  type FlushOptions,
  type HttpTestingOptions,
  type RequestErrorOptions,
  type RequestExpectation,
  type RequestMatcher,
  type ResponseBody,
} from './lib/angular-http';
