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
 *
 * **Depth is built on property access, not on calls** — and the difference is the one thing to
 * understand before reaching for this factory. `mock.repo.user.find()` chains because every hop
 * before the last is a property *read*; a node that is **called** returns whatever it was
 * configured to return, and by default that is `undefined`. So the fluent shape —
 * `logger.channel('app').info('x')` — is a `TypeError` at the second call, even though
 * `DeepMockProxy<T>` types it perfectly. Pass `{ selfReturning: true }` for that shape.
 */
import { createFunctionSpy } from './function-spy';
import {
  NOT_STORED,
  createProxyPropStore,
  describeStoredProp,
  dropStoredProp,
  isDeletedProp,
  readStoredAccessor,
  storeDefinedProp,
  writeStoredAccessor,
  writeStoredValue,
} from './proxy-props';
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

/**
 * Read one member of the underlying spy (`calledWith`, `mock`, `mockReturnValue`, …), bound and
 * cached.
 *
 * A method is bound to the spy itself rather than handed back with `this` pointing at the Proxy:
 * Bun's `mock()` asserts `this instanceof Mock` inside `mockReturnValue` and friends, so an unbound
 * read would make every deep node unusable on `bun:test`. Cached, because binding per read
 * allocates a function per property access — and made `api.log.info !== api.log.info`.
 */
function readSpyMember(target: Func, key: PropertyKey, receiver: unknown, boundSpyMethods: Map<PropertyKey, Func>): unknown {
  const value: unknown = Reflect.get(target, key, receiver);

  if (typeof value !== 'function') {
    return value;
  }

  const cached = boundSpyMethods.get(key);

  if (cached) {
    return cached;
  }

  const bound: Func = value.bind(target);
  boundSpyMethods.set(key, bound);

  return bound;
}

/** Build one deep-mock node: a function spy wrapped in a child-materializing Proxy. */
function createDeepNode(name: string, overrides: object, selfReturning: boolean): unknown {
  const spy = createFunctionSpy<Func>(name);
  const children = new Map<PropertyKey, unknown>();
  const boundSpyMethods = new Map<PropertyKey, Func>();
  const store = createProxyPropStore(overrides);

  const handler: ProxyHandler<Func> = {
    get(target, key, receiver): unknown {
      // Seeds and `mock*Prop` patches win over everything, including the spy surface: a spec that
      // patched a member has said what that member is.
      const patched = readStoredAccessor(store, key, receiver);

      if (patched !== NOT_STORED) {
        return patched;
      }

      if (store.values.has(key)) {
        return store.values.get(key);
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
        return readSpyMember(target, key, receiver, boundSpyMethods);
      }

      // Never spawn children for JS-internal symbol protocols, nor for a key a spec deleted —
      // without that tombstone `delete node.m` would be undone by the very next read.
      if (typeof key === 'symbol' || isDeletedProp(store, key)) {
        return undefined;
      }

      if (!children.has(key)) {
        children.set(key, createDeepNode(`${name}.${String(key)}`, {}, selfReturning));
      }

      return children.get(key);
    },

    set(_target, key, value, receiver): boolean {
      if (!writeStoredAccessor(store, key, value, receiver)) {
        writeStoredValue(store, key, value);
      }

      return true;
    },

    // The three traps that make `mockValueProp` / `mockReadonlyProp` / `mockAccessorsProp` reach a
    // node at all — see `proxy-props.ts` for why their absence was silent rather than loud.
    defineProperty: (_target, key, descriptor): boolean => storeDefinedProp(store, key, descriptor),

    deleteProperty: (_target, key): boolean => dropStoredProp(store, key),

    getOwnPropertyDescriptor(target, key): PropertyDescriptor | undefined {
      // Falls through to the spy itself for everything the store does not answer, and that is not
      // optional: the target is a function, `prototype` and `length` are its own properties, and a
      // trap that hid a non-configurable one would make the Proxy throw on `Object.keys`.
      return describeStoredProp(store, key) ?? Reflect.getOwnPropertyDescriptor(target, key);
    },

    apply(target, thisArg, args): unknown {
      // The spy runs first, always: it records the call and answers whatever `mockReturnValue` /
      // `calledWith(...)` configured, so `selfReturning` never takes configuration away.
      const returned: unknown = Reflect.apply(target, thisArg, args);

      // `undefined` is what an unconfigured spy returns, and under `selfReturning` it is also the
      // only thing a fluent API can never have meant — `a.b()` exists to be chained from. Handing
      // the node back turns `logger.channel('app').info('x')` into a call on `logger.channel.info`,
      // the same node the next property read would have produced.
      //
      // The cost is exact and worth stating: a node deliberately configured to return `undefined`
      // returns the node instead. That is why this is opt-in rather than the default.
      if (selfReturning && returned === undefined) {
        return node;
      }

      return returned;
    },
  };

  // Declared after the handler that closes over it; only `apply` reads it, and a node cannot be
  // called before it exists.
  const node: unknown = new Proxy(spy, handler);

  return node;
}

/** Behaviour switches for {@link mockDeep}. */
export interface MockDeepOptions {
  /**
   * Make a **called** node hand itself back, so a fluent API chains through calls as well as
   * through property reads.
   *
   * Off by default, because it changes what an unconfigured call returns: `undefined` becomes the
   * node. Turn it on for the shape it exists for — a builder, a channel factory, a query chain:
   *
   * ```ts
   * const logger = mockDeep<AppLogger>({}, { selfReturning: true });
   *
   * logger.channel('app').info('started');                     // used to be `undefined.info(...)`
   * expect(logger.channel('app').info).toHaveBeenCalledWith('started');
   * ```
   *
   * A node still answers with whatever it was told to answer with — `mockReturnValue`,
   * `calledWith(...).mockReturnValue(...)`, `resolveWith` all win — so this only fills the gap
   * where nothing was configured. The one case it gets wrong is a node deliberately configured to
   * return `undefined`; assert on the spy's calls rather than on its return value there.
   *
   * What a call hands back is typed as the *declared* return type, not as a spy — the object is a
   * node either way, so bridge it the same way an injected double is bridged when the helpers are
   * needed:
   *
   * ```ts
   * asSpy<QueryBuilder>(query.where('id')).limit.mockReturnValue(query);
   * ```
   */
  selfReturning?: boolean;
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
 *
 * Note which hops are property reads and which are calls: the chain above works because
 * `repo` and `user` are *read*. A chain that goes through a **call** — `api.repo('users').find()` —
 * needs `{ selfReturning: true }`, otherwise the call returns `undefined` and the next hop throws.
 * See {@link MockDeepOptions.selfReturning}.
 */
export function mockDeep<T>(overrides: Partial<T> = {}, options: MockDeepOptions = {}): DeepMockProxy<T> {
  // The proxy tree assembles `T`'s deep spy surface lazily from runtime-accessed
  // keys, so its concrete `DeepMockProxy<T>` shape only exists structurally.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the deep mock is built dynamically from runtime-accessed keys; its `DeepMockProxy<T>` shape cannot be expressed before access.
  return createDeepNode('mockDeep', overrides, options.selfReturning ?? false) as DeepMockProxy<T>;
}
