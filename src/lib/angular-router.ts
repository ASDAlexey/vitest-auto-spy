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
  type ResolveData,
  type Route,
  RouterState,
  RouterStateSnapshot,
  UrlSegment,
  VERSION,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { describeInstance } from './angular-instance-name';
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';

/** What a navigation moves. Each field is a stream on the route and a field of its snapshot. */
export interface ActivatedRouteChange {
  /** The route's own parameters — `params`, `paramMap`, `snapshot.params`, `snapshot.paramMap`. */
  params?: Params;
  /** The query parameters — `queryParams`, `queryParamMap` and their snapshot twins. */
  queryParams?: Params;
  /** Static and resolved data — `data` and `snapshot.data`. */
  data?: Data;
  /** The route's title — `route.title` and `snapshot.title`. Angular carries it inside `data`; so does the double. */
  title?: string;
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
  /** The resolve record — the snapshot's own `_resolve`, kept apart from `data` as Angular keeps it. */
  resolve?: ResolveData;
  /** Child routes, each a double of its own: `route.children`, `firstChild` and a child's `parent` answer them. */
  children?: readonly ActivatedRouteInit[];
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
  /** The doubles of the `children` it was built with, in order — to navigate a child. */
  readonly children: readonly ActivatedRouteDouble[];
}

export interface RouteState {
  params: Params;
  queryParams: Params;
  /** The data the route exposes — the title, when there is one, already inside it. */
  data: Data;
  /** The title on its own, for the wiring check; `data` above is what the route answers with. */
  title: string | undefined;
  resolve: ResolveData;
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

/** Angular's `TreeNode` shape, which its `RouterState` and `RouterStateSnapshot` walk. */
interface RouteNode<T> {
  value: T;
  children: RouteNode<T>[];
}

/** Where a route sits in the tree, so a parent can adopt it and a child's navigation reaches the root's snapshot. */
interface Subtree {
  node: RouteNode<ActivatedRoute>;
  snapshotNode: () => RouteNode<ActivatedRouteSnapshot>;
  retree: () => void;
}

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
    data: withTitle(init.data ?? {}, init.title, routeTitleKey()),
    title: init.title,
    resolve: init.resolve ?? {},
    fragment: init.fragment === undefined ? null : init.fragment,
    url: toSegments(init.url ?? []),
  };
}

function nextState(current: RouteState, change: ActivatedRouteChange): RouteState {
  const title = change.title ?? current.title;
  const data =
    current.title !== undefined || title !== undefined || change.data !== undefined
      ? withTitle(change.data ?? current.data, title, routeTitleKey())
      : current.data;

  return {
    params: change.params ?? current.params,
    queryParams: change.queryParams ?? current.queryParams,
    data,
    title,
    resolve: current.resolve,
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

let titleKey: symbol | null | undefined;

/**
 * Read the symbol a title getter takes off `data`, by handing it a record that answers every read
 * with `undefined` and remembers the symbol keys it was asked for.
 *
 * Angular keeps a route's title inside its `data` under `RouteTitleKey`, a symbol the router never
 * exports, and a fresh `Symbol('RouteTitle')` would not answer — symbols compare by identity. So
 * the key is learned from the getter itself, once, and the title is stored under the key Angular
 * will read. `null` means the getter read no symbol: a router that stopped carrying the title in
 * `data`, which the wiring error in {@link withTitle} names.
 *
 * The getter is a parameter so a spec can drive both halves: one that reads a symbol, one that
 * reads nothing.
 */
export function readTitleKey(readTitle: (data: Data) => unknown): symbol | null {
  let seen: symbol | undefined;
  const recording: Data = new Proxy(
    {},
    {
      get: (_target: object, key: string | symbol): unknown => {
        if (typeof key === 'symbol') {
          seen = key;
        }

        return undefined;
      },
    },
  );

  readTitle(recording);

  return seen ?? null;
}

function routeTitleKey(): symbol | null {
  if (titleKey === undefined) {
    const probe: ActivatedRouteSnapshot = Object.create(ActivatedRouteSnapshot.prototype);

    titleKey = readTitleKey((data: Data) => {
      probe.data = data;

      return probe.title;
    });
  }

  return titleKey;
}

/**
 * The data record with a title in it, where the router's own resolver leaves it — so `snapshot.title`,
 * `route.title` (which maps `data` through the same key) and a real `TitleStrategy` all read the title
 * this record carries, the same way they read one a navigation produced.
 */
export function withTitle(data: Data, title: string | undefined, key: symbol | null): Data {
  if (title === undefined) {
    return data;
  }

  if (key === null) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] provideActivatedRoute({ title }): @angular/router ${VERSION.full} keeps the route title under a ` +
          'key this helper could not find, so snapshot.title cannot carry the title passed in.\n' +
          'Leave `title` out of the init for now, and report the @angular/router version.',
        DOCS_LINKS.angularRouteWiring,
      ),
    );
  }

  return { ...data, [key]: title };
}

/** A snapshot of `state`; the tree it is placed in is built by the route that owns the tree's root. */
function buildSnapshot(state: RouteState, fixed: FixedParts): ActivatedRouteSnapshot {
  const args = [
    state.url,
    state.params,
    state.queryParams,
    state.fragment,
    state.data,
    fixed.outlet,
    fixed.component,
    fixed.routeConfig,
    state.resolve,
  ];
  return Reflect.construct(ActivatedRouteSnapshot, args);
}

/** The one failure this file reports: a member Angular's own wiring did not put the double's value into. */
function routeWiringError(member: string): Error {
  return new Error(
    withDocs(
      `[vitest-auto-spy] provideActivatedRoute: @angular/router ${VERSION.full} does not wire ActivatedRoute the way ` +
        `20 to 22 do — ${member} does not hold what the double passed in.\n` +
        'Provide the route by hand for now, and report the @angular/router version.',
      DOCS_LINKS.angularRouteWiring,
    ),
  );
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
    ['snapshot.title', route.snapshot.title, state.title],
    ['snapshot._resolve', Reflect.get(route.snapshot, '_resolve'), state.resolve],
    ['snapshot.fragment', route.snapshot.fragment, state.fragment],
    ['snapshot.url', route.snapshot.url, state.url],
    ['snapshot.root', route.snapshot.root, route.snapshot],
    ['root', route.root, route],
  ];
  const broken = expected.find(([, actual, wanted]) => actual !== wanted);

  if (broken !== undefined) {
    throw routeWiringError(`route.${broken[0]}`);
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
  return buildActivatedRoute(init).double;
}

function streamsOf(state: RouteState): Streams {
  return {
    params: new BehaviorSubject(state.params),
    queryParams: new BehaviorSubject(state.queryParams),
    data: new BehaviorSubject(state.data),
    fragment: new BehaviorSubject(state.fragment),
    url: new BehaviorSubject(state.url),
  };
}

function constructRoute(streams: Streams, fixed: FixedParts, snapshot: ActivatedRouteSnapshot): ActivatedRoute {
  const route: ActivatedRoute = Reflect.construct(ActivatedRoute, [
    streams.url,
    streams.params,
    streams.queryParams,
    streams.fragment,
    streams.data,
    fixed.outlet,
    fixed.component,
    snapshot,
  ]);

  route.snapshot = snapshot;

  return route;
}

function buildActivatedRoute(init: ActivatedRouteInit): { double: ActivatedRouteDouble; subtree: Subtree } {
  const fixed: FixedParts = {
    outlet: init.outlet ?? PRIMARY_OUTLET,
    component: init.component ?? null,
    routeConfig: init.routeConfig ?? null,
  };
  let state = initialState(init);
  const streams = streamsOf(state);
  const built = (init.children ?? []).map(buildActivatedRoute);
  const children = built.map((child) => child.subtree);
  const route = constructRoute(streams, fixed, buildSnapshot(state, fixed));
  const subtree: Subtree = {
    node: { value: route, children: children.map((child) => child.node) },
    snapshotNode: () => ({ value: route.snapshot, children: children.map((child) => child.snapshotNode()) }),
    retree: () => {
      routerState.snapshot = snapshotTree();
    },
  };
  const snapshotTree = (): RouterStateSnapshot =>
    Reflect.construct(RouterStateSnapshot, [`/${state.url.map((segment) => segment.path).join('/')}`, subtree.snapshotNode()]);

  const routerState: RouterState = Reflect.construct(RouterState, [subtree.node, snapshotTree()]);

  assertRouteWiring(route, streams, state, fixed);
  children.forEach((child) => {
    child.retree = (): void => subtree.retree();
  });

  const set = (change: ActivatedRouteChange): void => {
    const previous = state;

    state = nextState(previous, change);
    route.snapshot = buildSnapshot(state, fixed);
    subtree.retree();
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
    children: built.map((child) => child.double),
  };

  doubles.set(route, double);

  return { double, subtree };
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
        DOCS_LINKS.angularRouteDouble,
      ),
    );
  }

  const double = doubles.get(route);

  if (double === undefined) {
    throw new Error(
      withDocs(
        `${caller}: the ActivatedRoute here is ${describeInstance(route)}, not one provideActivatedRoute() built. ` +
          'A later provider of ActivatedRoute (provideRouter(), RouterModule, a useValue, provideAutoSpy) won over it — ' +
          'list provideActivatedRoute() last, or drop the other one.',
        DOCS_LINKS.angularRouteDouble,
      ),
    );
  }

  return double;
}
