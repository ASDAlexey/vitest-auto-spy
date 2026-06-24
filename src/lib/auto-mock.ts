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
import type { Func, Spy } from './types';

/**
 * Create a fully-typed auto-mock of `T` from its type alone (no class).
 *
 * @param overrides Optional partial seed of concrete values/implementations.
 *   Seeded keys are returned as-is and are not converted into spies.
 *
 * @returns A {@link Spy} of `T`: every accessed method key lazily becomes a
 *   decorated function spy (same helpers as `createSpyFromClass`), cached by key.
 */
export function createAutoMock<T>(overrides: Partial<T> = {}): Spy<T> {
  // Backing store: seeded overrides up-front, lazily-created spies thereafter.
  // Keyed by `string | symbol` (never numeric) so `ownKeys` can return it as-is.
  const cache = new Map<string | symbol, unknown>();

  for (const key of Reflect.ownKeys(overrides)) {
    cache.set(key, Reflect.get(overrides, key));
  }

  const handler: ProxyHandler<Record<PropertyKey, unknown>> = {
    get(_target, key): unknown {
      if (cache.has(key)) {
        return cache.get(key);
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
      return cache.has(key);
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
  return new Proxy<Record<PropertyKey, unknown>>({}, handler) as Spy<T>;
}
