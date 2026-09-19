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
import { DISPOSE } from './dispose-symbol';
import { type UnstubbedGuard, createFunctionSpy } from './function-spy';
import {
  NOT_STORED,
  type ProxyPropStore,
  createProxyPropStore,
  describeStoredProp,
  hasStoredProp,
  isDeletedProp,
  isProtocolKey,
  readStoredAccessor,
  storeWriteTraps,
  writeStoredValue,
} from './proxy-props';
import { disposeAutoSpy } from './reset-auto-spy';
import { DEEP_CHILDREN } from './spy-mark';
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

/**
 * Whether `key` is part of the spy's own surface — a helper the spy factory or the active
 * {@link MockAdapter} put on the node's spy, own or inherited — rather than a member of the type
 * being mocked.
 *
 * Asked of the node's own spy on each read, and deliberately not cached from a probe spy built
 * once. The surface **grows during a run**: `/rxjs` and `/jasmine` add their helpers when they are
 * imported, and `setSpyEngine` swaps the whole prototype — so a set captured at the first property
 * access of the first `mockDeep` in the worker was wrong for every double built after a later
 * import, and wrong silently. `deep.feed.items.nextWith(1)` became a *child node*: callable,
 * recorded, emitting nothing. Under `isolate: false` all it takes is one spec file that reads a
 * deep mock before another file imports `/rxjs`.
 *
 * The subtraction is what keeps a mocked member from being swallowed: `length`, `name`,
 * `prototype`, `call`, `bind`, `constructor`, `toString` are own or inherited properties of *every*
 * function, so without it `mockDeep<Api>().name` answered with the mock's name instead of
 * materialising the `name` member of the mocked API.
 */
function isSpySurfaceKey(spy: Func, key: PropertyKey): boolean {
  return !BARE_FUNCTION_KEYS.has(key) && key in spy;
}

/**
 * Read one member of the underlying spy (`calledWith`, `mock`, `mockReturnValue`, …), bound and
 * cached.
 *
 * Read with the spy as the receiver, never the node: the fast engine's `mock` is a getter that
 * lazily writes its call state onto `this`, and a write through the Proxy lands in the node's
 * property store — state the raw spy's own calls never reach, so a `.mock` read before the first
 * call detached the calls from every later assertion.
 *
 * A method is bound to the spy itself rather than handed back with `this` pointing at the Proxy:
 * Bun's `mock()` asserts `this instanceof Mock` inside `mockReturnValue` and friends, so an unbound
 * read would make every deep node unusable on `bun:test`. Cached, because binding per read
 * allocates a function per property access — and made `api.log.info !== api.log.info`.
 */
function readSpyMember(target: Func, key: PropertyKey, boundSpyMethods: Map<PropertyKey, Func>): unknown {
  const value: unknown = Reflect.get(target, key, target);

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

/** What every node of one tree shares — one object per `mockDeep` call, not one per node. */
interface DeepTree {
  selfReturning: boolean;
  fallback: UnstubbedGuard | undefined;
}

/** Where a node's array view goes once it turns out to be an array: the parent's store, or the array holding it. */
type NodeHome = ProxyPropStore | unknown[] | undefined;

/** Everything one deep-mock node owns, gathered so the `get` trap can be a function rather than a closure. */
interface DeepNodeState {
  name: string;
  tree: DeepTree;
  children: Map<PropertyKey, unknown>;
  boundSpyMethods: Map<PropertyKey, Func>;
  store: ProxyPropStore;
  home: NodeHome;
  key: string;
  /** Set right after the Proxy is built; `undefined` only while `createDeepNode` runs. */
  node: unknown;
  /** The real array this node became on its first numeric read, if it has had one. */
  elements: unknown[] | undefined;
}

const CANONICAL_INDEX = /^(?:0|[1-9]\d*)$/;
const MAX_ARRAY_INDEX = 2 ** 32 - 2;

/** Whether `key` is what the language treats as an array index: `'0'`, `'12'`, never `'01'` or `'-1'`. */
function isArrayIndex(key: string): boolean {
  const first = key.charCodeAt(0);

  // Most keys are member names; a char-code test keeps the regex off the hot path for them.
  if (first < 48 || first > 57) {
    return false;
  }

  return CANONICAL_INDEX.test(key) && Number(key) <= MAX_ARRAY_INDEX;
}

/**
 * Whether the place this node was read from still holds it, so its array view may replace it there.
 *
 * A spec that kept a handle and then assigned, deleted or replaced the member has said what the member
 * is; a later index read through the old handle must not overwrite that.
 */
function homeStillHolds(state: DeepNodeState, home: ProxyPropStore | unknown[]): boolean {
  if (Array.isArray(home)) {
    return home[Number(state.key)] === state.node;
  }

  return !hasStoredProp(home, state.key) && !isDeletedProp(home, state.key);
}

/**
 * The real array behind a node read with a numeric key, built on that first read.
 *
 * Written into the node's home, so the next read through the parent answers the array itself — with
 * `Array.isArray`, a real `length`, `Array.prototype` and iteration — while the node already handed
 * out keeps answering its indices from the same array.
 */
function elementsOf(state: DeepNodeState): unknown[] {
  if (state.elements !== undefined) {
    return state.elements;
  }

  const elements = createElementsView(state);
  const { home } = state;

  state.elements = elements;

  if (home !== undefined && homeStillHolds(state, home)) {
    if (Array.isArray(home)) {
      home[Number(state.key)] = elements;
    } else {
      writeStoredValue(home, state.key, elements);
    }
  }

  return elements;
}

/**
 * A Proxy over a plain array whose missing indices materialise as deep nodes on read.
 *
 * Every element is also kept among the owner's children, which is how `resetAutoSpy` and `using`
 * reach it: the reset walk descends `DEEP_CHILDREN`, and the owner node stays in its parent's.
 */
function createElementsView(owner: DeepNodeState): unknown[] {
  const raw: unknown[] = [];

  return new Proxy(raw, {
    get(target, key, receiver): unknown {
      if (key === DISPOSE) {
        return disposeAutoSpy;
      }

      if (typeof key === 'string' && isArrayIndex(key) && !Object.hasOwn(target, key)) {
        const element = createDeepNode(`${owner.name}[${key}]`, {}, owner.tree, target, key);

        owner.children.set(key, element);
        target[Number(key)] = element;
      }

      return Reflect.get(target, key, receiver);
    },

    // An index skipped on the way up is a slot waiting for its node, not a hole: `map` and
    // `forEach` ask `in` before they read, and a real hole would make them skip it.
    has: (target, key): boolean =>
      (typeof key === 'string' && isArrayIndex(key) && Number(key) < target.length) || Reflect.has(target, key),
  });
}

/** A member of the mocked type: an element when the key is an index, a cached child node otherwise. */
function readChild(state: DeepNodeState, key: string): unknown {
  if (isArrayIndex(key)) {
    return Reflect.get(elementsOf(state), key);
  }

  let child = state.children.get(key);

  if (child === undefined) {
    child = createDeepNode(`${state.name}.${key}`, {}, state.tree, state.store, key);
    state.children.set(key, child);
  }

  return child;
}

/** The `get` trap: seeds, then the reset seam, then the spy surface, then a materialised child. Order is the contract. */
function readNodeMember(state: DeepNodeState, target: Func, key: string | symbol, receiver: unknown): unknown {
  // Seeds and `mock*Prop` patches win over everything, including the spy surface: a spec that
  // patched a member has said what that member is.
  const patched = readStoredAccessor(state.store, key, receiver);

  if (patched !== NOT_STORED) {
    return patched;
  }

  if (state.store.values.has(key)) {
    return state.store.values.get(key);
  }

  // The reset helpers' way in. Answered before the protocol and symbol guards below, which would
  // otherwise hand back `undefined` like they do for every other symbol.
  if (key === DEEP_CHILDREN) {
    return state.children;
  }

  // `using api = mockDeep<Api>()`. Answered from the trap rather than defined on the node, for the
  // reason `attachDispose` states about the `createAutoMock` proxy: there is no record to define on
  // — a `defineProperty` here would land in the property store, where `describeStoredProp` reports
  // every key as enumerable, which is precisely what the non-enumerable definition exists to avoid.
  // Reached at every depth, not only at the root: `resetAutoSpy` walks `DEEP_CHILDREN` from
  // whichever node it is handed, so `using` on a sub-tree resets that sub-tree. A seed or an
  // assignment under the same key still wins, since both are read from the store above.
  if (key === DISPOSE) {
    return disposeAutoSpy;
  }

  // Not thenable, and not a scheduler / Observable either: awaiting a node must not treat it as
  // a Promise, and `of(node)` must not eat it as a scheduler. See `isProtocolKey`.
  if (key === 'then' || isProtocolKey(key)) {
    return undefined;
  }

  // Real spy surface (calledWith / mock / mockReturnValue / …) wins over a child — and nothing
  // beyond it. A bare `key in target` also covers everything a function carries anyway, so a mocked
  // member named `name`, `length`, `call`, `bind`, `apply`, `constructor` or `toString` never
  // materialised at all; see `isSpySurfaceKey`.
  if (isSpySurfaceKey(target, key)) {
    return readSpyMember(target, key, state.boundSpyMethods);
  }

  // Never spawn children for JS-internal symbol protocols, nor for a key a spec deleted —
  // without that tombstone `delete node.m` would be undone by the very next read.
  if (typeof key === 'symbol' || isDeletedProp(state.store, key)) {
    return undefined;
  }

  return readChild(state, key);
}

/**
 * The `has` trap, answering what `get` would: a key that reads as a member is `in` the node.
 *
 * `vi.spyOn(api.repo, 'find')` is the caller this exists for. It accepts a property it finds either
 * by descriptor or by `in`, and without the trap a node answered neither for a member nobody had
 * read, so spying failed with "The property is not defined on the function". The descriptor is left
 * alone on purpose: `mock*Prop` records it to decide whether an undo restores or deletes.
 */
function hasNodeMember(state: DeepNodeState, target: Func, key: string | symbol): boolean {
  if (hasStoredProp(state.store, key)) {
    return true;
  }

  if (typeof key === 'symbol') {
    return Reflect.has(target, key);
  }

  if (key === 'then' || isProtocolKey(key)) {
    return false;
  }

  return isSpySurfaceKey(target, key) || !isDeletedProp(state.store, key);
}

/** Build one deep-mock node: a function spy wrapped in a child-materializing Proxy. */
function createDeepNode(name: string, overrides: object, tree: DeepTree, home: NodeHome, key: string): unknown {
  const spy = createFunctionSpy<Func>(name, tree.fallback);
  const state: DeepNodeState = {
    name,
    tree,
    children: new Map<PropertyKey, unknown>(),
    boundSpyMethods: new Map<PropertyKey, Func>(),
    store: createProxyPropStore(overrides),
    home,
    key,
    node: undefined,
    elements: undefined,
  };
  const { store } = state;

  const handler: ProxyHandler<Func> = {
    get: (target, property, receiver): unknown => readNodeMember(state, target, property, receiver),

    has: (target, property): boolean => hasNodeMember(state, target, property),

    // The traps that make `mockValueProp` / `mockReadonlyProp` / `mockAccessorsProp` reach a node at
    // all — see `proxy-props.ts` for why their absence was silent rather than loud.
    ...storeWriteTraps<Func>(store),

    getOwnPropertyDescriptor(target, property): PropertyDescriptor | undefined {
      // Falls through to the spy itself for everything the store does not answer, and that is not
      // optional: the target is a function, `prototype` and `length` are its own properties, and a
      // trap that hid a non-configurable one would make the Proxy throw on `Object.keys`.
      return describeStoredProp(store, property) ?? Reflect.getOwnPropertyDescriptor(target, property);
    },

    apply(target, thisArg, args): unknown {
      // The spy runs first, always: it records the call and answers whatever `mockReturnValue` /
      // `calledWith(...)` configured — or, on a node nobody configured, the tree's fallback — so
      // `selfReturning` never takes configuration away.
      const returned: unknown = Reflect.apply(target, thisArg, args);

      // `undefined` is what an unconfigured spy returns, and under `selfReturning` it is also the
      // only thing a fluent API can never have meant — `a.b()` exists to be chained from. Handing
      // the node back turns `logger.channel('app').info('x')` into a call on `logger.channel.info`,
      // the same node the next property read would have produced.
      //
      // The cost is exact and worth stating: a node deliberately configured to return `undefined`
      // returns the node instead. That is why this is opt-in rather than the default.
      if (tree.selfReturning && returned === undefined) {
        return node;
      }

      return returned;
    },
  };

  // Declared after the handler that closes over it; only `apply` reads it, and a node cannot be
  // called before it exists.
  const node: unknown = new Proxy(spy, handler);

  state.node = node;

  return node;
}

/**
 * The guard `createFunctionSpy` consults on a call nobody configured, carrying the fallback.
 *
 * The strict-mode seam is reused because its question is exactly this option's: "did anything
 * configure this node". `setupAutoSpy({ strict })` is not consulted — see {@link MockDeepOptions}.
 */
function fallbackGuard(fallback: MockDeepOptions['fallbackMockImplementation']): UnstubbedGuard | undefined {
  if (fallback === undefined) {
    return undefined;
  }

  return { className: undefined, handle: (call) => fallback(...call.args) };
}

/**
 * Behaviour switches for {@link mockDeep}.
 *
 * There is deliberately **no `strict` / `onUnstubbedCall` here**, and the omission is the one worth
 * writing down, because a deep proxy answering every property read is exactly the "a typo never
 * fails" weakness this package holds against the proxy-per-property mocks.
 *
 * Strict mode cannot repair it. The guard fires on a *call* with nothing configured, and every hop
 * of a deep chain except the last is a property *read* — so `api.reop.user.find` still materialises
 * silently, and all a guard could change is what the final call returns. The half of the problem
 * that is worth solving is solved elsewhere and by a different mechanism: `createSpyFromClass` and
 * `createAutoMock<T>()` know the member set (from the prototype, or from `T` at the call site), so
 * a name outside it is either absent or refused. `mockDeep` is the factory you reach for when you
 * have chosen not to enumerate the surface.
 *
 * And a guard would not be inert here. {@link resolveUnstubbedGuard} consults the suite-wide
 * default `setupAutoSpy({ strict: true })` installs, so wiring one in would make that single line
 * throw on every unconfigured call in every existing deep tree in the suite — including the ones
 * {@link selfReturning} exists to answer, where "unconfigured call" is defined to mean "hand the
 * node back" and the guard would run first. A suite-wide switch silently disabling a per-mock
 * option is not a trade worth making for a check that cannot see the reads anyway.
 *
 * {@link fallbackMockImplementation} is the per-mock answer to the same wish, and it is per-mock for
 * that reason: nothing suite-wide reaches a deep tree, so no option here is ever overridden by one.
 */
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
   *
   * **A called node answers itself, not its receiver**, which is the difference between a factory
   * and a `return this` builder. `editor.chain().focus().insertContent('x')` therefore records
   * `insertContent` on `chain.focus`, while the `chain` handle the spec holds has no calls at all —
   * the obvious assertion reports nothing although the chain ran. Assert down the path the chain
   * walked, or build the object with `createAutoMock<T>(undefined, { selfReturning: ['focus', …] })`,
   * where the named methods answer one double, which is what an API of this shape does.
   */
  selfReturning?: boolean;

  /**
   * What a call answers on a node **nobody configured** — every node of the tree, at any depth.
   * The usual one throws, so an unmocked query fails at its call instead of handing `undefined` on:
   *
   * ```ts
   * const db = mockDeep<Db>({}, {
   *   fallbackMockImplementation: () => {
   *     throw new Error('not mocked');
   *   },
   * });
   * ```
   *
   * Precedence, first match wins: the node's own configuration (`mockReturnValue`, `resolveWith`,
   * `calledWith(...)`, `mustBeCalledWith(...)`), then this fallback, then `selfReturning` — which
   * still hands the node back when the fallback returned `undefined`, so the two compose.
   *
   * "Configured" is per node, not per call: a node with a `calledWith(1)` chain answers a call
   * with `2` with `undefined`, not with the fallback. Use `mustBeCalledWith` for "any other
   * arguments are a failure".
   */
  fallbackMockImplementation?(...args: unknown[]): unknown;
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
 *
 * A member read with a numeric key becomes a real array: `api.page.items[0].title = 'x'` makes
 * `api.page.items` an `Array` whose elements are deep nodes, with a real `length` and working
 * `map` / iteration. The handle read *before* the first index stays a node; read the member again.
 *
 * Every node carries `[Symbol.dispose]`, so `using api = mockDeep<Api>()` resets the whole tree —
 * children included — when the block ends, and the `afterEach` that existed only to reset one deep
 * mock can go.
 */
export function mockDeep<T>(overrides: Partial<T> = {}, options: MockDeepOptions = {}): DeepMockProxy<T> {
  const tree: DeepTree = {
    selfReturning: options.selfReturning ?? false,
    fallback: fallbackGuard(options.fallbackMockImplementation),
  };

  // The proxy tree assembles `T`'s deep spy surface lazily from runtime-accessed
  // keys, so its concrete `DeepMockProxy<T>` shape only exists structurally.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the deep mock is built dynamically from runtime-accessed keys; its `DeepMockProxy<T>` shape cannot be expressed before access.
  return createDeepNode('mockDeep', overrides, tree, undefined, '') as DeepMockProxy<T>;
}
