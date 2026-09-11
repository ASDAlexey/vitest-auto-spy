/**
 * `vitest-auto-spy/angular-router` — an `ActivatedRoute` whose streams and snapshot agree.
 *
 * ```ts
 * import { injectActivatedRoute, provideActivatedRoute } from 'vitest-auto-spy/angular-router';
 *
 * TestBed.configureTestingModule({ providers: [provideActivatedRoute({ params: { id: '7' } })] });
 *
 * const route = injectActivatedRoute();
 *
 * route.setParams({ id: '8' }); // params emits, snapshot.params and paramMap already agree
 * ```
 *
 * **Its own entry, and a narrow one: this is the only file of the package that reaches
 * `@angular/router`.** `vitest-auto-spy/angular` has to keep loading in a project without the
 * router, so `@angular/router` is an *optional* peer paid for by the suites that import this entry —
 * the same reason `@angular/common` lives behind `vitest-auto-spy/angular-http`.
 *
 * Like `/angular-http` it does **not** re-export the core: it is a companion to
 * `vitest-auto-spy/angular`. It registers no hooks and no adapter, so importing it has no effect
 * until a helper is called.
 */
export {
  createActivatedRoute,
  injectActivatedRoute,
  provideActivatedRoute,
  type ActivatedRouteChange,
  type ActivatedRouteDouble,
  type ActivatedRouteInit,
} from './lib/angular-router';
