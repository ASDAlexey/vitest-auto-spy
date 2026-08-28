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
import { createFunctionSpy } from './function-spy';
import { AUTO_SPY_MARK } from './spy-mark';
import type { DeepPartial, Func, Spy, SpyOptions } from './types';

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
export function createAutoMock<T, Options extends SpyOptions = SpyOptions>(overrides?: DeepPartial<T>): Spy<T, Options> {
  // Backing store: seeded overrides up-front, lazily-created spies thereafter.
  // Keyed by `string | symbol` (never numeric) so `ownKeys` can return it as-is.
  const cache = new Map<string | symbol, unknown>();

  const seed = overrides ?? {};

  for (const key of Reflect.ownKeys(seed)) {
    cache.set(key, Reflect.get(seed, key));
  }

  const handler: ProxyHandler<Record<PropertyKey, unknown>> = {
    get(_target, key): unknown {
      if (cache.has(key)) {
        return cache.get(key);
      }

      // Answered outside the cache so the brand stays out of `ownKeys`: a spread or a snapshot of
      // the mock must not carry it. It is what lets `injectSpy` tell a provided double apart from
      // the real instance the injector hands back when nobody registered one.
      if (key === AUTO_SPY_MARK) {
        return true;
      }

      // Never materialize a spy for runtime/JS-internal lookups (symbols such
      // as the iteration/`toPrimitive` protocols, thenable `then` checks, or
      // `constructor`) — doing so would, e.g., make the mock look like a Promise.
      if (typeof key === 'symbol' || key === 'then' || key === 'constructor') {
        return undefined;
      }

      const spy = createFunctionSpy<Func>(String(key));
      cache.set(key, spy);

      return spy;
    },

    set(_target, key, value): boolean {
      cache.set(key, value);

      return true;
    },

    has(_target, key): boolean {
      return key === AUTO_SPY_MARK || cache.has(key);
    },

    ownKeys(): (string | symbol)[] {
      return [...cache.keys()];
    },

    getOwnPropertyDescriptor(_target, key): PropertyDescriptor | undefined {
      if (!cache.has(key)) {
        return undefined;
      }

      return { configurable: true, enumerable: true, value: cache.get(key), writable: true };
    },
  };

  // The Proxy assembles `T`'s spy surface lazily from runtime-accessed keys, so
  // its concrete `Spy<T>` shape only exists structurally, not statically.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the auto-mock is built dynamically from runtime-accessed keys; its `Spy<T>` shape cannot be expressed before access.
  return new Proxy<Record<PropertyKey, unknown>>({}, handler) as Spy<T, Options>;
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
