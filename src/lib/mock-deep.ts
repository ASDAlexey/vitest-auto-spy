/**
 * `mockDeep` — a recursive, class-free auto-mock (the deep counterpart of
 * {@link createAutoMock}).
 *
 * Every node is a function spy (same {@link createFunctionSpy} factory, so it
 * carries the identical `calledWith` / `mockReturnValue` / `resolveWith` helpers)
 * AND a Proxy: accessing an unknown key returns a *nested* deep node, cached per
 * key. That makes `mock.repo.user.find()` work with no manual seeding — each hop
 * is itself a callable, deeply-chainable spy.
 *
 * Access semantics mirror {@link createAutoMock}:
 *  - A key that exists on the underlying spy (`calledWith`, `mock`, `mockReturnValue`,
 *    …) resolves to that helper, so the spy API keeps working at every depth.
 *  - `then` and symbol keys never spawn children (so a node is not thenable and
 *    JS-internal protocols see `undefined`).
 *  - `overrides` seed concrete values on the root node; assigning (`mock.x = …`)
 *    seeds/updates a value that shadows the child for that key.
 */
import { createFunctionSpy } from './function-spy';
import type { DeepMockProxy, Func } from './types';

/**
 * Every key reachable on `value`, own and inherited. The prototype chain is what makes this
 * correct across runtimes: Vitest assigns its mock helpers as own properties of the mock, while
 * Bun's `mock()` puts `mockReturnValue` and friends on `Mock.prototype`. An own-keys-only reading
 * therefore misses the whole spy API on Bun, and every deep node's `mockReturnValue` materialises
 * as a child spy instead of configuring the node.
 */
function collectKeys(value: object): Set<PropertyKey> {
  const keys = new Set<PropertyKey>();

  for (let current: object | null = value; current !== null; current = Object.getPrototypeOf(current)) {
    for (const key of Reflect.ownKeys(current)) {
      keys.add(key);
    }
  }

  return keys;
}

/**
 * The property names any function carries by itself — `length`, `name`, `prototype`, plus
 * everything on `Function.prototype` and `Object.prototype`. Read off a function for the same
 * reason the spy surface below is read off a spy: so nothing here is a list that can quietly go out
 * of date. `mockDeep` is as good a sample function as any, and costs no extra allocation.
 */
const BARE_FUNCTION_KEYS = collectKeys(mockDeep);

let spySurfaceKeys: Set<PropertyKey> | undefined;

/**
 * The keys a real function spy carries — every helper the spy factory and the active
 * {@link MockAdapter} put on it, own or inherited — minus the ones (`length`, `name`, `prototype`,
 * `call`, `bind`, …) that any function carries regardless.
 *
 * Read off a live probe spy instead of listed by hand: the surface differs per adapter (Vitest,
 * Bun, `node:test`) and grows with every helper the factory attaches, so a hand-written list would
 * drift from all three at once. The subtraction is the part that fixes the bug — those three are
 * own properties of *every* function, so keeping them made `mockDeep<Api>().name` answer with the
 * mock's name rather than materialise the `name` member of the mocked API.
 *
 * Derived on first property access rather than at import: building a spy needs a registered mock
 * adapter, and an entry registers one while this module is still being imported.
 */
function getSpySurfaceKeys(): Set<PropertyKey> {
  spySurfaceKeys ??= new Set([...collectKeys(createFunctionSpy<Func>('mockDeep.probe'))].filter((key) => !BARE_FUNCTION_KEYS.has(key)));

  return spySurfaceKeys;
}

/** Build one deep-mock node: a function spy wrapped in a child-materializing Proxy. */
function createDeepNode(name: string, overrides: object): unknown {
  const spy = createFunctionSpy<Func>(name);
  const children = new Map<PropertyKey, unknown>();
  const seeded = new Map<PropertyKey, unknown>();
  const boundSpyMethods = new Map<PropertyKey, Func>();

  for (const key of Reflect.ownKeys(overrides)) {
    seeded.set(key, Reflect.get(overrides, key));
  }

  const handler: ProxyHandler<Func> = {
    get(target, key, receiver): unknown {
      if (seeded.has(key)) {
        return seeded.get(key);
      }

      // Not thenable: awaiting a node must not treat it as a Promise.
      if (key === 'then') {
        return undefined;
      }

      // Real spy surface (calledWith / mock / mockReturnValue / …) wins over a child — and nothing
      // beyond it. The test used to be `key in target`, which also covers everything a function
      // carries anyway, so a mocked member named `name`, `length`, `call`, `bind`, `apply`,
      // `constructor` or `toString` never materialised at all.
      if (getSpySurfaceKeys().has(key)) {
        const value: unknown = Reflect.get(target, key, receiver);

        if (typeof value !== 'function') {
          return value;
        }

        // A method is bound to the spy itself rather than handed back with `this` pointing at the
        // Proxy: Bun's `mock()` asserts `this instanceof Mock` inside `mockReturnValue` and
        // friends, so an unbound read would make every deep node unusable on `bun:test`. Cached,
        // because binding per read allocates a function per property access — and made
        // `api.log.info !== api.log.info`.
        const cached = boundSpyMethods.get(key);

        if (cached) {
          return cached;
        }

        const bound: Func = value.bind(target);
        boundSpyMethods.set(key, bound);

        return bound;
      }

      // Never spawn children for JS-internal symbol protocols.
      if (typeof key === 'symbol') {
        return undefined;
      }

      if (!children.has(key)) {
        children.set(key, createDeepNode(`${name}.${String(key)}`, {}));
      }

      return children.get(key);
    },

    set(_target, key, value): boolean {
      seeded.set(key, value);

      return true;
    },
  };

  return new Proxy(spy, handler);
}

/**
 * Create a recursively-mocked `T` from its type alone (no class). Nested object
 * access auto-creates chainable spies; seed concrete values via `overrides`.
 *
 * @example
 * ```ts
 * const api = mockDeep<Api>();
 *
 * api.repo.user.find.calledWith(1).resolveWith({ id: 1 });
 * await expect(api.repo.user.find(1)).resolves.toEqual({ id: 1 });
 * ```
 */
export function mockDeep<T>(overrides: Partial<T> = {}): DeepMockProxy<T> {
  // The proxy tree assembles `T`'s deep spy surface lazily from runtime-accessed
  // keys, so its concrete `DeepMockProxy<T>` shape only exists structurally.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the deep mock is built dynamically from runtime-accessed keys; its `DeepMockProxy<T>` shape cannot be expressed before access.
  return createDeepNode('mockDeep', overrides) as DeepMockProxy<T>;
}
