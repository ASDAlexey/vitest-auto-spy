/**
 * `provideRouterDouble()` + `injectRouterDouble()` — a `Router` whose URL, `routerState` and
 * `events` cannot disagree, with `navigate()` and `navigateByUrl()` already spied.
 *
 * After `ActivatedRoute`, `Router` is the provider suites write by hand most often, and they all
 * write the same one: `createAutoMock<Router>({ events: of(), url: '/' }, { returns: { navigate:
 * Promise.resolve(true) } })`. Every part of that is a guess a component can fall through — `of()`
 * never emits a second time, `url` is a string nobody updates, `routerState` is missing, and
 * `serializeUrl` throws the moment a guard builds a redirect.
 *
 * So the double keeps one URL and derives the rest of it: `url` is that URL serialized the way the
 * real router serializes it, `routerState` is Angular's own `RouterState` over a root route holding
 * its query parameters and fragment, `events` is a `BehaviorSubject` that starts at the
 * `NavigationEnd` which put the router there, `currentNavigation()` is `null` because a router
 * standing at a URL is idle, and `createUrlTree` / `serializeUrl` / `parseUrl` are the router's real
 * URL work rather than stubs.
 *
 * Navigation itself stays a spy, because a navigation in an application is asynchronous, runs
 * guards and can be cancelled: a double that moved its own URL on `navigate()` would be testing the
 * double. `setUrl()` and `emitNavigation()` are how the spec moves it.
 *
 * Lives behind `vitest-auto-spy/angular-router` with the `ActivatedRoute` double, for the same
 * reason: `@angular/router` is an optional peer, paid for by the suites that import this entry.
 */
import { type FactoryProvider, type Injector, type Signal, type WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DefaultUrlSerializer,
  type Navigation,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  type Params,
  Router,
  type Event as RouterNavigationEvent,
  RouterState,
  RouterStateSnapshot,
  type UrlCreationOptions,
  type UrlTree,
  createUrlTreeFromSnapshot,
} from '@angular/router';
import { BehaviorSubject, type Observable } from 'rxjs';

import { createActivatedRoute } from './angular-router';
import { DOCS_LINKS, withDocs } from './docs-links';
import { createFunctionSpy } from './function-spy';
import type { AddSpyMethodsByReturnTypes } from './types';

/** What a spec names about the navigation in flight; every other field is derived from where the router stands. */
export type NavigationInit = Partial<Navigation>;

/** Where the router starts: the URL it stands at, and whether a navigation is running. */
export interface RouterDoubleInit {
  /** The URL the router reports until the spec moves it. Serialized as the router would. Default `'/'`. */
  url?: string;
  /**
   * The navigation `currentNavigation()` and `getCurrentNavigation()` answer with. Default `null` —
   * a router standing at a URL is idle, which is what the real one answers between navigations.
   * Named here rather than only on the handle because a component reads it in a field initializer.
   */
  currentNavigation?: NavigationInit | null;
}

/** The handle a spec drives the router through. */
export interface RouterDouble {
  /** The value every injector in the test hands out for `Router`. */
  readonly router: Router;
  /** The spied `navigate()` — resolves `true` until the spec configures it otherwise. */
  readonly navigate: AddSpyMethodsByReturnTypes<Router['navigate']>;
  /** The spied `navigateByUrl()` — resolves `true` until the spec configures it otherwise. */
  readonly navigateByUrl: AddSpyMethodsByReturnTypes<Router['navigateByUrl']>;
  /** Put the router at a URL: `url`, `routerState` and the root route move together. */
  setUrl(url: string): void;
  /**
   * Put a navigation in flight, or end it with `null`. What the spec names is kept; `id`,
   * `initialUrl` and `extractedUrl` come from where the router stands, `trigger` is `'imperative'`
   * and `extras` is empty.
   */
  setCurrentNavigation(navigation?: NavigationInit | null): void;
  /** Push an event through `router.events`. A `NavigationEnd`, or a URL, moves the URL with it. */
  emitNavigation(event?: RouterNavigationEvent | string): void;
}

/** The double's one piece of state, and the parts of Angular's own shape kept in step with it. */
interface UrlState {
  /** Angular's `RouterState`; its snapshot is replaced on every move, the way a navigation replaces it. */
  readonly routerState: RouterState;
  /** The current URL, serialized the way the real router serializes its own. */
  url(): string;
  /** That URL parsed — what `createUrlTree()` takes preserved query parameters and fragments from. */
  tree(): UrlTree;
  /** Put the router at a URL. */
  set(next: string): void;
}

/** The members the double answers. Everything else Angular's `Router` declares throws by name. */
const COVERED =
  'url, events, navigate, navigateByUrl, createUrlTree, serializeUrl, parseUrl, routerState, currentNavigation and getCurrentNavigation';

/**
 * The public fields Angular's `Router` declares. A field lives on the instance, so
 * `getOwnPropertyNames(Router.prototype)` cannot see one, and the guard below then treats a member
 * the double lacks as "not a Router member" and hands back `undefined` — the failure it exists to
 * prevent. `currentNavigation` is the one that costs: it is a signal, so `undefined` surfaces as
 * "router.currentNavigation is not a function" wherever the component happened to call it, and the
 * suites that meet it go back to hand-rolling the whole router.
 */
const DECLARED_FIELDS = [
  'navigated',
  'routeReuseStrategy',
  'onSameUrlNavigation',
  'config',
  'componentInputBindingEnabled',
  'currentNavigation',
];

/** Methods and getters of Angular's own `Router` — what the double is measured against. */
const DECLARED: ReadonlySet<string> = new Set([...Object.getOwnPropertyNames(Router.prototype), ...DECLARED_FIELDS]);

const doubles = new WeakMap<object, RouterDouble>();

const serializer = new DefaultUrlSerializer();

/** A snapshot tree of one node — the shape a router state has before any route is activated. */
function stateSnapshot(url: string, root: RouterState['root']['snapshot']): RouterStateSnapshot {
  return Reflect.construct(RouterStateSnapshot, [url, { value: root, children: [] }]);
}

function queryParamsOf(current: UrlTree, extras: UrlCreationOptions): Params | null {
  if (extras.queryParamsHandling === 'preserve') {
    return current.queryParams;
  }

  if (extras.queryParamsHandling === 'merge') {
    return { ...current.queryParams, ...extras.queryParams };
  }

  return extras.queryParams ?? null;
}

function fragmentOf(current: UrlTree, extras: UrlCreationOptions): string | null {
  return extras.preserveFragment === true ? current.fragment : (extras.fragment ?? null);
}

/**
 * Throw by name when the code under test reaches for a `Router` member the double does not have,
 * rather than hand it `undefined` and fail three frames later on a property of it.
 */
function guardMissingMembers(double: object): Router {
  const guarded = new Proxy(double, {
    get(target, key, receiver): unknown {
      if (typeof key === 'string' && !(key in target) && DECLARED.has(key)) {
        throw new Error(
          withDocs(
            `[vitest-auto-spy] provideRouterDouble: the Router double has no ${key}. It answers ${COVERED} — ` +
              'anything past that is a real navigation, which is provideRouter([]) plus RouterTestingHarness.',
            DOCS_LINKS.angularRouter,
          ),
        );
      }

      return Reflect.get(target, key, receiver);
    },
  });

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the token's type is what the code under test sees, and TypeScript cannot say "a Router minus the members nobody calls in a test"; the members that are missing throw by name above rather than reading `undefined`.
  return guarded as Router;
}

/**
 * The one piece of state a router double has, and the three things that have to agree with it.
 *
 * The root `ActivatedRoute` is the double's own — `createUrlTree()` resolves relative commands
 * against its snapshot the way the real router resolves them against `routerState.snapshot.root`,
 * so it holds the URL's query parameters and fragment and, like a real root route, no segments.
 */
function createUrlState(initial: string): UrlState {
  let tree = serializer.parse(initial);
  let url = serializer.serialize(tree);
  const root = createActivatedRoute({ queryParams: tree.queryParams, fragment: tree.fragment });
  const routerState: RouterState = Reflect.construct(RouterState, [
    { value: root.route, children: [] },
    stateSnapshot(url, root.route.snapshot),
  ]);

  return {
    routerState,
    url: () => url,
    tree: () => tree,
    set: (next: string): void => {
      tree = serializer.parse(next);
      url = serializer.serialize(tree);
      root.set({ queryParams: tree.queryParams, fragment: tree.fragment });
      routerState.snapshot = stateSnapshot(url, root.route.snapshot);
    },
  };
}

/**
 * The navigation in flight follows the events, because that is where the real one comes from and
 * where it goes: Angular puts one up on a `NavigationStart` and drops it once the navigation has
 * ended — "the current navigation becomes null after the NavigationEnd event is emitted". A
 * component that reads it while handling a `NavigationEnd` gets `null` in production too, and a
 * double that kept the navigation would hide exactly that.
 *
 * @returns the id the event carried, when it started a navigation.
 */
function followEvent(
  event: RouterNavigationEvent,
  inFlight: WritableSignal<Navigation | null>,
  navigationOf: (named: NavigationInit) => Navigation,
): number | undefined {
  if (event instanceof NavigationStart) {
    inFlight.set(
      navigationOf({
        id: event.id,
        initialUrl: serializer.parse(event.url),
        extractedUrl: serializer.parse(event.url),
        trigger: event.navigationTrigger ?? 'imperative',
      }),
    );

    return event.id;
  }

  if (
    event instanceof NavigationEnd ||
    event instanceof NavigationCancel ||
    event instanceof NavigationError ||
    event instanceof NavigationSkipped
  ) {
    inFlight.set(null);
  }

  return undefined;
}

/** What the spec did not name comes from where the router stands, the way a real navigation starts. */
function buildNavigation(state: UrlState, id: number, named: NavigationInit): Navigation {
  return {
    id,
    initialUrl: state.tree(),
    extractedUrl: state.tree(),
    trigger: 'imperative',
    extras: {},
    previousNavigation: null,
    // A no-op rather than a spy: a spec that asserts the abort passes its own, and every other spec
    // would be carrying a spy nothing reads.
    abort: (): void => undefined,
    ...named,
  };
}

/** The spies and the signal a router double is assembled around; the rest of it comes from the URL. */
interface RouterParts {
  readonly navigate: AddSpyMethodsByReturnTypes<Router['navigate']>;
  readonly navigateByUrl: AddSpyMethodsByReturnTypes<Router['navigateByUrl']>;
  readonly currentNavigation: Signal<Navigation | null>;
}

/** Every member the double answers, over the one piece of state behind it. */
function buildRouter(state: UrlState, stream: Observable<RouterNavigationEvent>, parts: RouterParts): Router {
  return guardMissingMembers({
    get url(): string {
      return state.url();
    },
    get events(): Observable<RouterNavigationEvent> {
      return stream;
    },
    get routerState(): RouterState {
      return state.routerState;
    },
    navigate: parts.navigate,
    navigateByUrl: parts.navigateByUrl,
    createUrlTree: (commands: readonly unknown[], extras: UrlCreationOptions = {}): UrlTree =>
      createUrlTreeFromSnapshot(
        (extras.relativeTo ?? state.routerState.root).snapshot,
        commands,
        queryParamsOf(state.tree(), extras),
        fragmentOf(state.tree(), extras),
      ),
    serializeUrl: (target: UrlTree): string => serializer.serialize(target),
    parseUrl: (target: string): UrlTree => serializer.parse(target),
    get currentNavigation(): Signal<Navigation | null> {
      return parts.currentNavigation;
    },
    getCurrentNavigation: (): Navigation | null => parts.currentNavigation(),
    // Inert, and present rather than guarded: Angular's injector reads `ngOnDestroy` off every
    // value it builds, so a double that threw on it would throw on `TestBed.resetTestingModule()`.
    ngOnDestroy: (): void => undefined,
    dispose: (): void => undefined,
  });
}

/**
 * Build a `Router` double without a `TestBed` — for a class constructed with `new`, or a functional
 * guard that takes the router from its own injector in the spec.
 *
 * ```ts
 * const { router, navigate } = createRouterDouble({ url: '/products/7' });
 * const guard = new AuthGuard(router);
 *
 * expect(navigate).toHaveBeenCalledWith(['/login']);
 * ```
 */
export function createRouterDouble(init: RouterDoubleInit = {}): RouterDouble {
  const state = createUrlState(init.url ?? '/');
  const events = new BehaviorSubject<RouterNavigationEvent>(new NavigationEnd(1, state.url(), state.url()));
  const stream = events.asObservable();
  let navigationId = 1;

  const navigationOf = (named: NavigationInit): Navigation => buildNavigation(state, navigationId, named);
  const inFlight = signal<Navigation | null>(init.currentNavigation ? navigationOf(init.currentNavigation) : null);
  const currentNavigation = inFlight.asReadonly();

  const navigate = createFunctionSpy<Router['navigate']>('Router.navigate');
  const navigateByUrl = createFunctionSpy<Router['navigateByUrl']>('Router.navigateByUrl');

  navigate.resolveWith(true);
  navigateByUrl.resolveWith(true);

  const router = buildRouter(state, stream, { navigate, navigateByUrl, currentNavigation });

  const double: RouterDouble = {
    router,
    navigate,
    navigateByUrl,
    setUrl: state.set,
    setCurrentNavigation: (navigation?: NavigationInit | null): void => {
      inFlight.set(navigation === null ? null : navigationOf(navigation ?? {}));
    },
    emitNavigation: (event?: RouterNavigationEvent | string): void => {
      const next = typeof event === 'object' ? event : new NavigationEnd(++navigationId, event ?? state.url(), event ?? state.url());

      if (next instanceof NavigationEnd) {
        state.set(next.urlAfterRedirects);
      }

      navigationId = followEvent(next, inFlight, navigationOf) ?? navigationId;
      events.next(next);
    },
  };

  doubles.set(router, double);

  return double;
}

/**
 * The `Router` provider, for `TestBed.configureTestingModule` or a component's `providers`.
 *
 * ```ts
 * TestBed.configureTestingModule({ providers: [provideRouterDouble({ url: '/products/7' })] });
 * ```
 *
 * A factory, so every injector that builds it gets a router of its own: a provider list hoisted to
 * a module constant never carries one test's navigation into the next. It provides nothing but the
 * `Router` token — `provideRouter([])` is still the answer when the routing itself is under test.
 */
export function provideRouterDouble(init: RouterDoubleInit = {}): FactoryProvider {
  return { provide: Router, useFactory: (): Router => createRouterDouble(init).router };
}

/**
 * Which Router turned up instead — the two have different fixes, and `Router` being `providedIn:
 * 'root'` makes the first one the common case: a `TestBed` hands out a real router rather than
 * nothing at all when the double is missing from the providers.
 */
function describeStranger(router: object): string {
  return router instanceof Router
    ? "the Router here is Angular's own, not one provideRouterDouble() built. Router is providedIn 'root', so a TestBed " +
        'builds a real one whenever the double is not in the providers — add provideRouterDouble() to them.'
    : 'the Router here is a value written by hand, not one provideRouterDouble() built. A later provider of Router (a ' +
        'useValue, provideAutoSpy) won over it — list provideRouterDouble() last, or drop the other one.';
}

/**
 * The handle of the router `provideRouterDouble()` put in the test's injector.
 *
 * ```ts
 * const router = injectRouterDouble();
 *
 * router.emitNavigation('/products/8'); // events emits a NavigationEnd; router.url already agrees
 * expect(router.navigate).toHaveBeenCalledWith(['/checkout']);
 * ```
 *
 * Reads the `TestBed` by default; pass `fixture.debugElement.injector` when the router is in a
 * component's own `providers`.
 */
export function injectRouterDouble(injector?: Injector): RouterDouble {
  const caller = '[vitest-auto-spy] injectRouterDouble()';
  const router = injector === undefined ? TestBed.inject(Router, null, { optional: true }) : injector.get(Router, null, { optional: true });

  if (router === null) {
    throw new Error(
      withDocs(
        `${caller}: nothing provides Router in the injector given. Add provideRouterDouble({ … }) to its providers.`,
        DOCS_LINKS.angularRouter,
      ),
    );
  }

  const double = doubles.get(router);

  if (double === undefined) {
    throw new Error(withDocs(`${caller}: ${describeStranger(router)}`, DOCS_LINKS.angularRouter));
  }

  return double;
}
