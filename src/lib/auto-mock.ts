/**
 * `createAutoMock` — a Proxy-based auto-spy that needs NO class.
 *
 * Where {@link createSpyFromClass} reads a class's prototype to discover which
 * methods to spy on, `createAutoMock<T>()` works from a *type/interface alone*.
 * There is no runtime class to inspect, so every method spy is materialized
 * lazily, on first access, via the very same {@link createFunctionSpy} factory
 * used by the class-based path. That means every type-mocked method gets the
 * identical typed control helpers (`calledWith`, `mockReturnValue`,
 * `resolveWith`, `nextWith`, …) — no logic is duplicated here.
 *
 * Access semantics:
 *  - Reading any not-yet-seen key returns a freshly-created, decorated function
 *    spy, cached so repeated access returns the *same* reference.
 *  - Pass `overrides` to seed concrete values or implementations for specific
 *    keys (methods or plain properties). A seeded key is returned verbatim and
 *    is never turned into a spy.
 *  - Assigning to a key (`mock.foo = …`) stores that value and shadows any spy.
 *  - Reading a plain (non-seeded, non-assigned) property returns a function spy
 *    too — this is unavoidable because, with only a type and no runtime class,
 *    method keys and property keys are indistinguishable at runtime. Seed plain
 *    properties through `overrides` (or assign them) when you need real values.
 */
import { DOCS_LINKS, withDocs } from './docs-links';
import { createFunctionSpy } from './function-spy';
import { getMockAdapter } from './mock-adapter';
import { requireObservableSupport } from './observable-support';
import {
  NOT_STORED,
  type ProxyPropStore,
  createProxyPropStore,
  describeStoredProp,
  dropStoredProp,
  hasStoredProp,
  isDeletedProp,
  isProtocolKey,
  readStoredAccessor,
  storeDefinedProp,
  writeStoredAccessor,
  writeStoredValue,
} from './proxy-props';
import { AUTO_SPY_MARK } from './spy-mark';
import type { DeepPartial, Func, MethodReturns, OnlyObservablePropsOf, Spy, SpyOptions } from './types';

/**
 * Create a fully-typed auto-mock of `T` from its type alone (no class).
 *
 * @param overrides Optional partial seed of concrete values/implementations, checked against `T` at
 *   every depth. Seeded keys are returned as-is and are not converted into spies — including a
 *   nested object, which is stored exactly as written rather than being auto-mocked further.
 *
 * @returns A {@link Spy} of `T`: every accessed method key lazily becomes a
 *   decorated function spy (same helpers as `createSpyFromClass`), cached by key.
 *
 * @example
 * ```ts
 * const users = createAutoMock<UserService>();
 *
 * users.getName.calledWith(1).mockReturnValue('Ada');
 * users.load.resolveWith({ id: 1 });
 * ```
 */
export function createAutoMock<T, Options extends SpyOptions = SpyOptions>(
  overrides?: DeepPartial<T>,
  config?: AutoMockConfiguration<T>,
): Spy<T, Options> {
  // The Proxy assembles `T`'s spy surface lazily from runtime-accessed keys, so
  // its concrete `Spy<T>` shape only exists structurally, not statically.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the auto-mock is built dynamically from runtime-accessed keys; its `Spy<T>` shape cannot be expressed before access.
  const mock = new Proxy<Record<PropertyKey, unknown>>({}, createAutoMockHandler(overrides ?? {})) as Spy<T, Options>;

  applyObservableProps(mock, config?.observablePropsToSpyOn);
  applyMockReturns(mock, config?.returns);

  return mock;
}

/**
 * Replace the named members with observable property spies.
 *
 * Without this the double answers an Observable member with a *function* spy, because with only a
 * type at runtime a method key and a property key are indistinguishable — so the code under test
 * subscribes to a function and the failure lands somewhere else entirely.
 */
function applyObservableProps(mock: object, names: readonly string[] | undefined): void {
  if (!names?.length) {
    // Nothing to do, and nothing to ask the registry for: a double with no observable members must
    // stay buildable in a suite that never imports `vitest-auto-spy/rxjs`.
    return;
  }

  const support = requireObservableSupport();

  for (const name of names) {
    // A seeded key wins, exactly as it does on the class-based factory: `overrides` is the more
    // specific statement, and it is the documented way to hand the double a real `Subject` the spec
    // drives itself.
    if (name in mock) {
      continue;
    }

    Reflect.set(mock, name, support.createPropSpy());
  }
}

/** What a type-driven double can be configured with beyond its seeded values. */
export interface AutoMockConfiguration<T> {
  /**
   * Members to build as **observable property spies** (`nextWith`, `throwWith`, `returnSubject`, …)
   * rather than as function spies.
   *
   * The same option `createSpyFromClass` takes, and it matters more here, not less: a class tells
   * the factory which members are methods, a type does not. Every unseeded key of a type-driven
   * double is therefore a function spy — so an Observable member is one too, the code under test
   * subscribes to a function, and the failure surfaces far from the double.
   *
   * ```ts
   * provideAutoSpyForToken(FAVORITES, undefined, { observablePropsToSpyOn: ['favorites$'] });
   * // …
   * injectSpy(FAVORITES).favorites$.nextWith([{ id: 1 }]);
   * ```
   *
   * A member also named in `overrides` keeps its seed: hand the double a real `Subject` there when
   * the spec drives the stream itself, and name it here when `nextWith` is what the spec wants.
   *
   * Requires the `vitest-auto-spy/rxjs` entry, which is what registers the observable helpers; a
   * double that names none of these stays buildable without it.
   */
  observablePropsToSpyOn?: OnlyObservablePropsOf<T>[];
  /**
   * What each named method returns, applied as the mock is built — the same field
   * `createSpyFromClass` takes, and the half `overrides` cannot express.
   *
   * A seeded override is stored verbatim, so `{ getProducts: () => of([]) }` puts a plain function
   * where the double should have a spy, and the assertion on it is gone. Naming the method here
   * keeps it a spy and configures what it answers:
   *
   * ```ts
   * provideAutoSpyForToken(PRODUCTS, undefined, { returns: { getProducts: of([]), getById: of(null) } });
   * ```
   *
   * Without it the three-line provider literal a migration replaces turns into a provider plus a
   * `mockReturnValue` per method, moving the seed away from the declaration — which is the same
   * argument `ClassSpyConfiguration.returns` was added for.
   */
  returns?: MethodReturns<T>;
}

/** Narrow an unknown member to the callable the adapter needs, without an assertion. */
function isCallable(value: unknown): value is Func {
  return typeof value === 'function';
}

/** Install the configured return values on a type-driven mock. */
function applyMockReturns(mock: object, returns: MethodReturns<never> | undefined): void {
  if (!returns) {
    return;
  }

  const adapter = getMockAdapter();

  for (const [name, value] of Object.entries(returns)) {
    // Reading materialises the spy for that key, which is what has to happen before it can be
    // configured; `restoreImplementation` rather than `mockReturnValue` because the latter is not on
    // every runner's mock (`node:test` has no such method) — the adapter is that seam.
    const spy: unknown = Reflect.get(mock, name);

    if (!isCallable(spy)) {
      // Reachable for exactly the keys the proxy refuses to make a spy of — `then` and
      // `constructor`, held back so an auto-mock is not mistaken for a Promise. Silently dropping
      // the configuration is the one thing not to do: the value would simply never be returned.
      // eslint-disable-next-line no-console -- intentional dev-time misconfiguration warning; console.warn is allowed per CLAUDE.md.
      console.warn(
        withDocs(
          `[vitest-auto-spy] createAutoMock: returns names '${name}', which this double never turns into a spy — ` +
            "'then' and 'constructor' are held back so the mock is not treated as a Promise. Rename the member, or " +
            'seed it through the overrides argument instead.',
          DOCS_LINKS.createSpyFromClass,
        ),
      );

      continue;
    }

    adapter.restoreImplementation(spy, () => value);
  }
}

/** Build the handler that gives an auto-mock its behaviour. */
function createAutoMockHandler(seed: object): ProxyHandler<Record<PropertyKey, unknown>> {
  const store = createProxyPropStore(seed);

  return {
    get: (_target, key, receiver): unknown => readKey(store, key, receiver),

    set(_target, key, value, receiver): boolean {
      if (!writeStoredAccessor(store, key, value, receiver)) {
        writeStoredValue(store, key, value);
      }

      return true;
    },

    defineProperty: (_target, key, descriptor): boolean => storeDefinedProp(store, key, descriptor),

    deleteProperty: (_target, key): boolean => dropStoredProp(store, key),

    has(_target, key): boolean {
      return key === AUTO_SPY_MARK || hasStoredProp(store, key);
    },

    ownKeys(): (string | symbol)[] {
      return [...new Set([...store.values.keys(), ...store.accessors.keys()])];
    },

    getOwnPropertyDescriptor: (_target, key): PropertyDescriptor | undefined => describeStoredProp(store, key),
  };
}

/** Answer one property read: a patched accessor, a known value, the brand, or a freshly-made spy. */
function readKey(store: ProxyPropStore, key: string | symbol, receiver: unknown): unknown {
  const patched = readStoredAccessor(store, key, receiver);

  if (patched !== NOT_STORED) {
    return patched;
  }

  if (store.values.has(key)) {
    return store.values.get(key);
  }

  // Answered outside the store so the brand stays out of `ownKeys`: a spread or a snapshot of
  // the mock must not carry it. It is what lets `injectSpy` tell a provided double apart from
  // the real instance the injector hands back when nobody registered one.
  if (key === AUTO_SPY_MARK) {
    return true;
  }

  // Never materialize a spy for runtime/JS-internal lookups (symbols such as the
  // iteration/`toPrimitive` protocols, thenable `then` checks, or `constructor`), nor for the
  // protocol keys a library probes to decide what it was handed — see `isProtocolKey`, which is
  // where the reasoning for that list lives. A key a spec deleted is answered the same way: on a
  // double that makes members on demand, that tombstone is the only thing standing between
  // `delete mock.m` and a brand-new spy.
  if (typeof key === 'symbol' || key === 'then' || key === 'constructor' || isProtocolKey(key) || isDeletedProp(store, key)) {
    return undefined;
  }

  const spy = createFunctionSpy<Func>(String(key));
  store.values.set(key, spy);

  return spy;
}

/**
 * The same auto-mock, typed as `T` *and* as its spy surface.
 *
 * {@link createAutoMock} returns `Spy<T>`, which is right when the double is handed to a DI
 * container and read back through assertions. It is awkward for the other shape — an interface of
 * uniform methods (`Logger`, `Reporter`, a telemetry client, a `ConsoleLike`) that the code under
 * test takes as a *parameter* rather than injecting. There the same object has to satisfy `T` at
 * the call site and expose the spy helpers at the assertion, and threading `asInstance` /
 * `asSpy` through both reads worse than the eight `vi.fn()` lines it replaced.
 *
 * ```ts
 * const logger = autoMocked<LogMethods>();
 *
 * detectVpnClient(url, logger);                       // accepted as LogMethods
 * expect(logger.err).toHaveBeenCalledWith('VPN detection failed', expect.any(Error));
 * ```
 *
 * Use {@link createAutoMock} when the double only ever travels as a spy; the intersection is
 * strictly wider, and a wider type is worth asking for only when both halves are used.
 */
export function autoMocked<T>(overrides?: DeepPartial<T>): Spy<T> & T {
  const mock = createAutoMock<T>(overrides);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- one object, two views, exactly as in `asInstance` / `asSpy`: the proxy answers every key of `T` and every key `Spy<T>` adds, and the intersection is what lets a spec pass it as `T` and assert on it as a spy without a bridge call at each site.
  return mock as Spy<T> & T;
}
