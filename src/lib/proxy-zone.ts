/**
 * `fakeAsync` on Vitest — the patch `zone.js/testing` does not ship.
 *
 * `zone.js/testing` patches three runners: jasmine, mocha and jest. Vitest is not among them, so in
 * an Angular project on Vitest **every** `fakeAsync` fails with
 * `Expected to be running in 'ProxyZone', but it was not found` — a message about a zone, in a test
 * that never mentions one. Exactly one package does something about it today
 * (`@analogjs/vitest-angular`, as a side effect of importing `…/setup-zone`), which means a project
 * moving to the native `@angular/build:unit-test` builder loses the patch along with Analog.
 *
 * What `fakeAsync` needs is narrow: the callback it wraps must be running inside a zone that has a
 * `ProxyZoneSpec`, because that is the spec it swaps its own `FakeAsyncTestZoneSpec` into. So the
 * patch is "run every test and hook body inside a forked proxy zone", and the whole difficulty is
 * doing that without disturbing the runner:
 *
 *  - **The wrapper must declare no parameters.** Vitest reads `fn.toString()` to discover fixtures,
 *    and a `function (...args)` makes it fail with `FixtureParseError: The 1st argument inside a
 *    fixture must use object destructuring pattern` — in every file, about code the author did not
 *    write. Here the wrapper takes nothing and forwards `arguments`, and reports the *original*
 *    source from `toString`, so fixtures keep working exactly as they did.
 *  - **`fn.length` has to survive.** The runner reads it to decide how to call the callback; a
 *    wrapper of arity 0 silently changes that decision.
 *  - **`it.each(table)(…)` must keep its receiver.** `each` is a method that reads `this`; called
 *    detached it returns `undefined` and the next line fails. A Proxy is what preserves it, and it
 *    also means `it.skip`, `it.only`, `test.each` and the rest are covered without naming them.
 *
 * Nothing here imports zone.js. The patch reads `globalThis.Zone`, which the consumer has already
 * loaded (the Angular builder loads `zone.js/testing` from its own entry point, before any setup
 * file runs) — and says so when it has not.
 */

/** The sliver of zone.js this module needs, declared locally so nothing imports it. */
interface ZoneLike {
  fork(spec: object): ZoneLike;
  run<T>(callback: (...args: unknown[]) => T, applyThis?: unknown, applyArgs?: unknown[]): T;
}

/** Callables that carry the runner's sub-APIs (`it.each`, `it.skip`) as properties. */
type Callable = (...args: unknown[]) => unknown;

/** Brands a wrapper, so a callback that travels through the proxy twice is only wrapped once. */
const ALREADY_WRAPPED = Symbol.for('vitest-auto-spy.proxy-zone');

/**
 * How many proxy zones a spec gets.
 *
 * - `'shared'` — one, for every callback of the run. This is what Angular's own jasmine patch does,
 *   and what the ecosystem is written against: a component built in `beforeEach` schedules from its
 *   constructor, and `tick()` inside a `fakeAsync` test has to see those timers.
 * - `'callback'` — a fresh fork per callback. Correct in the abstract and required by
 *   `test.concurrent`, where two callbacks are in flight at once and would otherwise swap the same
 *   `ProxyZoneSpec` delegate under one another.
 */
export type ProxyZoneScope = 'callback' | 'shared';

/** Options for {@link installProxyZonePatch}. */
export interface ProxyZonePatchOptions {
  /** @default 'shared' */
  scope?: ProxyZoneScope;
}

/**
 * The one zone of `scope: 'shared'`, forked on first use rather than at install time.
 *
 * Lazily, because the patch is installed from a setup file and `Zone.current` at that moment is not
 * necessarily the zone the runner will call the callbacks in.
 */
let sharedProxyZone: ZoneLike | undefined;

/** The runner globals whose callbacks have to run inside a proxy zone. */
const PATCHED_GLOBALS = ['it', 'test', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'] as const;

const MISSING_ZONE =
  '[vitest-auto-spy] vitest-auto-spy/zone: globalThis.Zone is not there, so there is nothing to patch. ' +
  'This entry deliberately does not import zone.js — a zoneless project must not pull it in — so the ' +
  "consumer loads it: `import 'zone.js'; import 'zone.js/testing';` at the top of the setup file, or, under " +
  '`@angular/build:unit-test`, the builder already does it from its own entry point.';

const MISSING_PROXY_ZONE_SPEC =
  '[vitest-auto-spy] vitest-auto-spy/zone: zone.js is loaded but Zone.ProxyZoneSpec is not. ' +
  "That spec comes from `zone.js/testing`, so the testing bundle is missing: add `import 'zone.js/testing';` after zone.js itself.";

const MISSING_GLOBALS =
  '[vitest-auto-spy] vitest-auto-spy/zone: the runner globals (it, beforeEach, …) are not on globalThis, ' +
  'so there is nothing to wrap. The patch works by replacing them, which needs `test: { globals: true }` in the ' +
  'Vitest config — an imported `it` is a module binding this (or any) patch cannot reach.';

function readZone(): { zone: ZoneLike; ProxyZoneSpec: new () => object } {
  // zone.js publishes `Zone` as a *class*, so this is a function rather than an object — and a
  // check for `typeof === 'object'` alone rejects a perfectly loaded zone.js.
  const zone: unknown = Reflect.get(globalThis, 'Zone');

  if ((typeof zone !== 'object' && typeof zone !== 'function') || zone === null) {
    throw new Error(MISSING_ZONE);
  }

  const ProxyZoneSpec: unknown = Reflect.get(zone, 'ProxyZoneSpec');
  const current: unknown = Reflect.get(zone, 'current');

  if (typeof ProxyZoneSpec !== 'function' || typeof current !== 'object' || current === null) {
    throw new Error(MISSING_PROXY_ZONE_SPEC);
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `Zone` is read off the global rather than imported (the whole point of this entry), so its shape is established by the two checks above and nowhere else.
  return { zone: current as ZoneLike, ProxyZoneSpec: ProxyZoneSpec as new () => object };
}

function isCallable(value: unknown): value is Callable {
  return typeof value === 'function';
}

/**
 * The callback, run inside a forked proxy zone — with the arity and the source text of the original.
 *
 * `arguments` rather than a rest parameter: a declared parameter of any kind is what breaks
 * Vitest's fixture parsing, and this is the one place where the difference between the two is
 * observable.
 */
function proxyZoneFor(scope: ProxyZoneScope): ZoneLike {
  const { zone, ProxyZoneSpec } = readZone();

  if (scope === 'callback') {
    return zone.fork(new ProxyZoneSpec());
  }

  sharedProxyZone ??= zone.fork(new ProxyZoneSpec());

  return sharedProxyZone;
}

function inProxyZone(callback: Callable, scope: ProxyZoneScope): Callable {
  // `it.each(table)(name, fn)` reaches the collector by calling back through the same proxied `it`,
  // so an unmarked wrapper would be wrapped a second time — two nested zones for one test body.
  if (Reflect.get(callback, ALREADY_WRAPPED) === true) {
    return callback;
  }

  const wrapped = function (this: unknown): unknown {
    // eslint-disable-next-line prefer-rest-params -- see above: a rest parameter would be a declared parameter, and Vitest reads the wrapper's source to decide how to call it.
    const args = [...arguments];

    return proxyZoneFor(scope).run(callback, this, args);
  };

  Object.defineProperty(wrapped, 'length', { value: callback.length, configurable: true });
  Object.defineProperty(wrapped, ALREADY_WRAPPED, { value: true, configurable: true });
  // The runner parses the callback's source for fixtures; it must see the one the author wrote.
  wrapped.toString = (): string => callback.toString();

  return wrapped;
}

/**
 * One view per target, so identity survives the patch.
 *
 * Without it every property read builds another Proxy and `it.skip !== it.skip`: a comparison by
 * identity, a `WeakMap` keyed by a member of the runner API, a memoised `it.each(table)` — all of
 * them start behaving differently under the patch than without it, and nothing points at the patch.
 * Keyed by the target alone: `scope` is fixed when the patch is installed, and the undo drops the
 * cache along with the shared fork, so a reinstall under the other scope starts from nothing.
 */
let proxyCache = new WeakMap<Callable, Callable>();

/**
 * A view of `target` whose calls run their callbacks in a proxy zone, and whose sub-APIs do too.
 *
 * A Proxy rather than a copy, because the runner's `it` is a callable object with a dozen members
 * (`each`, `skip`, `only`, `for`, `extend`, …), some of which return further callables, and every
 * one of them reads `this`. Replacing the global with a plain function loses them all; copying them
 * across detaches the receiver, which is how `it.each(table)(…)` comes to return `undefined`.
 */
function proxyCallable(target: Callable, scope: ProxyZoneScope): Callable {
  const cached = proxyCache.get(target);

  if (cached) {
    return cached;
  }

  const proxied = new Proxy(target, {
    apply(callee, thisArg, args): unknown {
      const result = Reflect.apply(
        callee,
        thisArg,
        args.map((arg) => (isCallable(arg) ? inProxyZone(arg, scope) : arg)),
      );

      // `it.each(table)` hands back the function that actually defines the test, so the wrapping has
      // to follow it one more hop.
      return isCallable(result) ? proxyCallable(result, scope) : result;
    },
    get(callee, property, receiver): unknown {
      const value: unknown = Reflect.get(callee, property, receiver);

      return isCallable(value) ? proxyCallable(value, scope) : value;
    },
  });

  proxyCache.set(target, proxied);

  return proxied;
}

/**
 * Make `fakeAsync` and `waitForAsync` work in this run.
 *
 * ```ts
 * // vitest.setup.ts — after zone.js is loaded, before the suites run
 * import 'vitest-auto-spy/zone';
 * ```
 *
 * Every test and hook body then runs inside a proxy zone — **one and the same zone**, which is what
 * Angular's own jasmine patch does and what the ecosystem is written against:
 *
 * ```ts
 * beforeEach(() => {
 *   fixture = TestBed.createComponent(GamificationComponent); // the constructor schedules
 * });
 *
 * it('loads', fakeAsync(() => {
 *   fixture.detectChanges();
 *   tick(200); // must see what `beforeEach` scheduled
 *   expect(component.levels()).toEqual(levels);
 * }));
 * ```
 *
 * With a fresh fork per callback that `tick` drives the clock of *its* zone, the timer scheduled in
 * `beforeEach` belongs to another, and the assertion fails with `expected [] to deeply equal […]` —
 * a message with no zone in it, in a spec that reads like every Angular spec ever written. Measured
 * on a suite of 1688 files: per-callback forking failed 7 tests in 2 files that pass under jasmine.
 *
 * `scope: 'callback'` restores the per-callback fork. It is the right choice for `test.concurrent`,
 * where two callbacks are in flight at once and would otherwise swap the same `ProxyZoneSpec`
 * delegate under one another.
 *
 * @returns The undo, which puts the untouched globals back. Mostly useful to this library's own
 *   tests; a run that installs the patch keeps it for the whole worker.
 */
export function installProxyZonePatch({ scope = 'shared' }: ProxyZonePatchOptions = {}): () => void {
  // Read once, up front, so a missing zone.js is reported from the setup file rather than from
  // inside the first test that happens to use `fakeAsync`.
  readZone();

  const originals = PATCHED_GLOBALS.map((name) => ({ name, value: Reflect.get(globalThis, name) }));
  // `flatMap` rather than `filter` so the callables are narrowed by the guard rather than re-checked
  // inside the loop, where the second check could never be false and could never be tested.
  const patchable = originals.flatMap(({ name, value }) => (isCallable(value) ? [{ name, value }] : []));

  if (patchable.length === 0) {
    throw new Error(MISSING_GLOBALS);
  }

  patchable.forEach(({ name, value }) => Reflect.set(globalThis, name, proxyCallable(value, scope)));

  return () => {
    originals.forEach(({ name, value }) => Reflect.set(globalThis, name, value));
    // The shared fork is derived from the globals that were just put back; keeping it would hand a
    // zone from the previous installation to the next one — and a cached view would hand it the
    // scope of that installation too.
    sharedProxyZone = undefined;
    proxyCache = new WeakMap();
  };
}
