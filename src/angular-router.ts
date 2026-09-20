/**
 * `vitest-auto-spy/angular-router` — an `ActivatedRoute` whose streams and snapshot agree, a
 * `Router` whose URL, `routerState` and `events` agree with each other, and Angular's own `Location`
 * double in the same family shape.
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
 * **Its own entry, and a narrow one: the URL family of an Angular suite.** The route and the router
 * double the classes of `@angular/router`, and the location wraps the ones `@angular/common/testing`
 * ships — `@angular/router` itself depends on `@angular/common`, so a suite importing this entry
 * already has both, while `vitest-auto-spy/angular` keeps loading in a project without them. Both
 * stay *optional* peers, paid for by the suites that import this entry.
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
export {
  collectRouterEvents,
  createRouterDouble,
  injectRouterDouble,
  provideRouterDouble,
  type NavigationInit,
  type RouterDouble,
  type RouterDoubleInit,
  type RouterEventPair,
  type RouterEventsHandle,
} from './lib/router-double';
export { createLocationDouble, injectLocationDouble, provideLocationDouble, type LocationDouble } from './lib/location-double';
