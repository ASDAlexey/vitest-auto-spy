/**
 * `provideActivatedRoute()` + `injectActivatedRoute()` — an `ActivatedRoute` whose streams and
 * snapshot cannot disagree.
 *
 * `ActivatedRoute` keeps `snapshot`, `params`, `queryParams`, `data` and `fragment` in instance
 * fields, so `provideAutoSpy(ActivatedRoute)` has none of them, and a hand-written `useValue` knows
 * the stream half or the snapshot half — whichever the spec's author read first. The component that
 * reads the other half gets `undefined`, and the spec that set `snapshot.params` and never updated
 * `params` tests a route no navigation can produce.
 *
 * So the double is not a look-alike. It is Angular's own `ActivatedRoute`, built over one state
 * record: every stream is a `BehaviorSubject` of one of its fields, the snapshot is Angular's own
 * `ActivatedRouteSnapshot` of the same record, and a change rebuilds the snapshot and then emits the
 * streams it moved — in the order, and with the equality, the router uses after a navigation.
 *
 * **Why this is its own entry.** It is the only file of the package that imports `@angular/router`,
 * which stays an optional peer paid for by the suites that import `vitest-auto-spy/angular-router`.
 */
import type { FactoryProvider, Injector, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  type Data,
  PRIMARY_OUTLET,
  type Params,
  type Route,
  RouterState,
  RouterStateSnapshot,
  UrlSegment,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { DOCS_LINKS, withDocs } from './docs-links';

/** What a navigation moves. Each field is a stream on the route and a field of its snapshot. */
export interface ActivatedRouteChange {
  /** The route's own parameters — `params`, `paramMap`, `snapshot.params`, `snapshot.paramMap`. */
  params?: Params;
  /** The query parameters — `queryParams`, `queryParamMap` and their snapshot twins. */
  queryParams?: Params;
  /** Static and resolved data — `data` and `snapshot.data`. */
  data?: Data;
  /** The URL fragment — `fragment` and `snapshot.fragment`. */
  fragment?: string | null;
  /** The matched URL segments. A string is split on `/`; pass `UrlSegment`s for matrix parameters. */
  url?: UrlSegment[] | string;
}

/** The route a spec starts from: what a navigation moves, plus what stays fixed for the route's life. */
export interface ActivatedRouteInit extends ActivatedRouteChange {
  /** The outlet the route is rendered into. Default `'primary'`. */
  outlet?: string;
  /** The routed component. Default `null`. */
  component?: Type<unknown> | null;
  /** The `Route` it matched — `routeConfig` and `snapshot.routeConfig`. Default `null`. */
  routeConfig?: Route | null;
}

/** The handle a spec drives the route through. The route itself stays exactly Angular's shape. */
export interface ActivatedRouteDouble {
  /** The `ActivatedRoute` every injector in the test hands out — a real instance of Angular's class. */
  readonly route: ActivatedRoute;
  /** Move several parts in one navigation: one new snapshot, then each changed stream emits once. */
  set(change: ActivatedRouteChange): void;
  /** Replace the params. Not a merge — spread `route.snapshot.params` to keep the old ones. */
  setParams(params: Params): void;
  /** Replace the query params. Not a merge, for the same reason. */
  setQueryParams(queryParams: Params): void;
  /** Replace the data. */
  setData(data: Data): void;
  /** Replace the fragment. */
  setFragment(fragment: string | null): void;
  /** Replace the URL segments. */
  setUrl(url: UrlSegment[] | string): void;
}

export interface RouteState {
  params: Params;
  queryParams: Params;
  data: Data;
  fragment: string | null;
  url: UrlSegment[];
}

export interface FixedParts {
  outlet: string;
  component: Type<unknown> | null;
  routeConfig: Route | null;
}

export interface Streams {
  params: BehaviorSubject<Params>;
  queryParams: BehaviorSubject<Params>;
  data: BehaviorSubject<Data>;
  fragment: BehaviorSubject<string | null>;
  url: BehaviorSubject<UrlSegment[]>;
}

const doubles = new WeakMap<ActivatedRoute, ActivatedRouteDouble>();

function toSegments(url: UrlSegment[] | string): UrlSegment[] {
  return typeof url === 'string'
    ? url
        .split('/')
        .filter((path) => path !== '')
        .map((path) => new UrlSegment(path, {}))
    : url;
}

function initialState(init: ActivatedRouteInit): RouteState {
  return {
    params: init.params ?? {},
    queryParams: init.queryParams ?? {},
    data: init.data ?? {},
    fragment: init.fragment === undefined ? null : init.fragment,
    url: toSegments(init.url ?? []),
  };
}

function nextState(current: RouteState, change: ActivatedRouteChange): RouteState {
  return {
    params: change.params ?? current.params,
    queryParams: change.queryParams ?? current.queryParams,
    data: change.data ?? current.data,
    fragment: change.fragment === undefined ? current.fragment : change.fragment,
    url: change.url === undefined ? current.url : toSegments(change.url),
  };
}

// The router's own equality (`shallowEqual` in @angular/router), so a change emits exactly when a
// navigation would: same keys, symbol keys included, and arrays compared as sorted sets.
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    const left = [...a].sort();
    const right = [...b].sort();

    return left.length === right.length && left.every((item, index) => item === right[index]);
  }

  return a === b;
}

function sameRecord(a: object, b: object): boolean {
  const keys = [...Object.keys(a), ...Object.getOwnPropertySymbols(a)];

  return (
    keys.length === Object.keys(b).length + Object.getOwnPropertySymbols(b).length &&
    keys.every((key) => sameValue(Reflect.get(a, key), Reflect.get(b, key)))
  );
}

function sameSegments(a: UrlSegment[], b: UrlSegment[]): boolean {
  return a.length === b.length && a.every((segment, index) => sameRecord(segment, Object(b[index])));
}

/** A snapshot of `state`, placed in a one-node tree so `root`, `parent`, `children` answer instead of throwing. */
function buildSnapshot(state: RouteState, fixed: FixedParts): { snapshot: ActivatedRouteSnapshot; tree: RouterStateSnapshot } {
  const args = [
    state.url,
    state.params,
    state.queryParams,
    state.fragment,
    state.data,
    fixed.outlet,
    fixed.component,
    fixed.routeConfig,
    {},
  ];
  const snapshot: ActivatedRouteSnapshot = Reflect.construct(ActivatedRouteSnapshot, args);
  const path = `/${state.url.map((segment) => segment.path).join('/')}`;
  const tree: RouterStateSnapshot = Reflect.construct(RouterStateSnapshot, [path, { value: snapshot, children: [] }]);

  return { snapshot, tree };
}

/**
 * Throw when `@angular/router` stopped wiring its classes the way this helper builds them.
 *
 * The constructors are Angular's internal ones, unchanged from 20 through 22. A major that reorders
 * them would otherwise produce a route that quietly reads the wrong field.
 */
export function assertRouteWiring(route: ActivatedRoute, streams: Streams, state: RouteState, fixed: FixedParts): void {
  const expected: readonly [string, unknown, unknown][] = [
    ['params', route.params, streams.params],
    ['queryParams', route.queryParams, streams.queryParams],
    ['data', route.data, streams.data],
    ['fragment', route.fragment, streams.fragment],
    ['url', route.url, streams.url],
    ['outlet', route.outlet, fixed.outlet],
    ['component', route.component, fixed.component],
    ['routeConfig', route.routeConfig, fixed.routeConfig],
    ['snapshot.params', route.snapshot.params, state.params],
    ['snapshot.queryParams', route.snapshot.queryParams, state.queryParams],
    ['snapshot.data', route.snapshot.data, state.data],
    ['snapshot.fragment', route.snapshot.fragment, state.fragment],
    ['snapshot.url', route.snapshot.url, state.url],
    ['snapshot.root', route.snapshot.root, route.snapshot],
    ['root', route.root, route],
  ];
  const broken = expected.find(([, actual, wanted]) => actual !== wanted);

  if (broken !== undefined) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] provideActivatedRoute: the installed @angular/router does not wire ActivatedRoute the way ` +
          `Angular 20 to 22 does — route.${broken[0]} does not hold what the double passed in. ` +
          'Please report it with the @angular/router version; until then, provide the route by hand.',
        DOCS_LINKS.angularRouter,
      ),
    );
  }
}

function emitChanges(streams: Streams, previous: RouteState, next: RouteState): void {
  if (!sameRecord(previous.queryParams, next.queryParams)) {
    streams.queryParams.next(next.queryParams);
  }

  if (previous.fragment !== next.fragment) {
    streams.fragment.next(next.fragment);
  }

  if (!sameRecord(previous.params, next.params)) {
    streams.params.next(next.params);
  }

  if (!sameSegments(previous.url, next.url)) {
    streams.url.next(next.url);
  }

  if (!sameRecord(previous.data, next.data)) {
    streams.data.next(next.data);
  }
}

/**
 * Build an `ActivatedRoute` double without a `TestBed` — for a class constructed with `new`, or a
 * functional guard or resolver that takes `route.snapshot` as an argument.
 *
 * ```ts
 * const { route, setParams } = createActivatedRoute({ params: { id: '7' } });
 * const page = new ProductPage(route);
 *
 * setParams({ id: '8' });
 * ```
 */
export function createActivatedRoute(init: ActivatedRouteInit = {}): ActivatedRouteDouble {
  const fixed: FixedParts = {
    outlet: init.outlet ?? PRIMARY_OUTLET,
    component: init.component ?? null,
    routeConfig: init.routeConfig ?? null,
  };
  let state = initialState(init);
  const streams: Streams = {
    params: new BehaviorSubject(state.params),
    queryParams: new BehaviorSubject(state.queryParams),
    data: new BehaviorSubject(state.data),
    fragment: new BehaviorSubject(state.fragment),
    url: new BehaviorSubject(state.url),
  };
  const first = buildSnapshot(state, fixed);
  const route: ActivatedRoute = Reflect.construct(ActivatedRoute, [
    streams.url,
    streams.params,
    streams.queryParams,
    streams.fragment,
    streams.data,
    fixed.outlet,
    fixed.component,
    first.snapshot,
  ]);
  const routerState: RouterState = Reflect.construct(RouterState, [{ value: route, children: [] }, first.tree]);

  route.snapshot = first.snapshot;
  assertRouteWiring(route, streams, state, fixed);

  const set = (change: ActivatedRouteChange): void => {
    const previous = state;

    state = nextState(previous, change);

    const next = buildSnapshot(state, fixed);

    route.snapshot = next.snapshot;
    routerState.snapshot = next.tree;
    emitChanges(streams, previous, state);
  };

  const double: ActivatedRouteDouble = {
    route,
    set,
    setParams: (params) => set({ params }),
    setQueryParams: (queryParams) => set({ queryParams }),
    setData: (data) => set({ data }),
    setFragment: (fragment) => set({ fragment }),
    setUrl: (url) => set({ url }),
  };

  doubles.set(route, double);

  return double;
}

/**
 * The `ActivatedRoute` provider, for `TestBed.configureTestingModule` or a component's `providers`.
 *
 * ```ts
 * TestBed.configureTestingModule({
 *   providers: [provideActivatedRoute({ params: { id: '7' }, queryParams: { tab: 'reviews' } })],
 * });
 * ```
 *
 * A factory, so every injector that builds it gets a route of its own: a provider list hoisted to a
 * module constant never carries one test's navigation into the next. List it after `provideRouter()`
 * when a spec has both — the later provider of a token wins.
 */
export function provideActivatedRoute(init: ActivatedRouteInit = {}): FactoryProvider {
  return { provide: ActivatedRoute, useFactory: (): ActivatedRoute => createActivatedRoute(init).route };
}

function describeRoute(route: object): string {
  const prototype = Reflect.getPrototypeOf(route);
  const owner: unknown = prototype === null || prototype === Object.prototype ? undefined : Reflect.get(prototype, 'constructor');

  return typeof owner === 'function' ? `an instance of ${owner.name}` : 'a plain object';
}

/**
 * The handle of the route `provideActivatedRoute()` put in the test's injector.
 *
 * ```ts
 * const route = injectActivatedRoute();
 *
 * route.setQueryParams({ tab: 'specs' }); // queryParams emits, snapshot.queryParams already agrees
 * ```
 *
 * Reads the `TestBed` by default; pass `fixture.debugElement.injector` when the route is in a
 * component's own `providers`.
 */
export function injectActivatedRoute(injector?: Injector): ActivatedRouteDouble {
  const caller = '[vitest-auto-spy] injectActivatedRoute()';
  const route =
    injector === undefined
      ? TestBed.inject(ActivatedRoute, null, { optional: true })
      : injector.get(ActivatedRoute, null, { optional: true });

  if (route === null) {
    throw new Error(
      withDocs(
        `${caller}: nothing provides ActivatedRoute here. Add provideActivatedRoute({ … }) to the providers.`,
        DOCS_LINKS.angularRouter,
      ),
    );
  }

  const double = doubles.get(route);

  if (double === undefined) {
    throw new Error(
      withDocs(
        `${caller}: the ActivatedRoute here is ${describeRoute(route)}, not one provideActivatedRoute() built. ` +
          'A later provider of ActivatedRoute (provideRouter(), RouterModule, a useValue, provideAutoSpy) won over it — ' +
          'list provideActivatedRoute() last, or drop the other one.',
        DOCS_LINKS.angularRouter,
      ),
    );
  }

  return double;
}
