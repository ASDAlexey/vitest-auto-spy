/**
 * The property store both Proxy-backed doubles answer from — `createAutoMock` and every `mockDeep`
 * node.
 *
 * It exists because of a defect the two shared. A Proxy only sees the operations its handler traps:
 * both had `get` and `set`, neither had `defineProperty` — and all four `mock*Prop` helpers are
 * built on `Object.defineProperty`. The patch therefore landed on the Proxy's own target, which
 * `get` never reads, so the property was not replaced, nothing threw, and the test carried on
 * against the old value. That silently broke the composition of two things this library recommends
 * in the same breath: `no-object-define-property` sends people to `mock*Prop`, and the factory
 * decision tree sends them to `createAutoMock`. Put together they produced a double that ignored
 * the patch.
 *
 * Two maps rather than one, because a patched property can be an **accessor**: `mockReadonlyProp`
 * installs `{ get: () => value }` and `mockAccessorsProp` a `{ get, set }` pair, and answering
 * either from a value map would hand the getter function back instead of calling it.
 */

/** Values and accessor descriptors one Proxy-backed double answers from. */
export interface ProxyPropStore {
  /** Seeded values, assigned values, and (for `createAutoMock`) the spies materialised on read. */
  values: Map<string | symbol, unknown>;
  /** Descriptors installed through `Object.defineProperty` that carry a `get` and/or a `set`. */
  accessors: Map<string | symbol, PropertyDescriptor>;
  /**
   * Keys a spec has **deleted** — the one thing these doubles cannot express by forgetting.
   *
   * On a Proxy that materialises members on demand, dropping a key from the maps is not deletion:
   * the very next read makes a fresh spy, so `delete mock.optionalMethod` left the member present
   * and truthy, and a test built on it — "the optional method is missing, and we do not crash" —
   * went green having exercised the path where the method *is* there. A tombstone is what makes the
   * absence stick; any write revives the key, as it would on a real object.
   */
  deleted: Set<string | symbol>;
}

/**
 * A store seeded from an `overrides` object, key for key — **descriptor for descriptor**, which is
 * the part that matters.
 *
 * A seed used to be read with `Reflect.get`, so a getter in the overrides ran while the double was
 * being assembled rather than when the code under test reached the member. The reported case is the
 * one worth keeping in mind: a spec seeded a member that *throws* — "this global is missing on this
 * platform" — and the throw came out of the provider literal, failing the TestBed configuration
 * instead of the branch the test was written for. Kept as a descriptor, the accessor is answered by
 * `readStoredAccessor` / `writeStoredAccessor` exactly like one installed by `mockAccessorsProp`:
 * on read, on write, once per access, with the double as `this`.
 */
// Shared until the first write: an accessor patch and a `delete` are both rare, and the two empty
// collections were ~336 B of every auto-mock and every `mockDeep` node. Every write goes through the two below.
const NO_ACCESSORS = new Map<string | symbol, PropertyDescriptor>();
const NO_DELETED = new Set<string | symbol>();

function ownAccessors(store: ProxyPropStore): Map<string | symbol, PropertyDescriptor> {
  if (store.accessors === NO_ACCESSORS) {
    store.accessors = new Map();
  }

  return store.accessors;
}

function ownDeleted(store: ProxyPropStore): Set<string | symbol> {
  if (store.deleted === NO_DELETED) {
    store.deleted = new Set();
  }

  return store.deleted;
}

export function createProxyPropStore(seed: object): ProxyPropStore {
  const store: ProxyPropStore = { values: new Map(), accessors: NO_ACCESSORS, deleted: NO_DELETED };

  for (const key of Reflect.ownKeys(seed)) {
    // Copied rather than read through a nullable binding: an own key always has a descriptor, and
    // spreading keeps that true for the type checker without a branch no seed can take.
    const descriptor: PropertyDescriptor = { ...Reflect.getOwnPropertyDescriptor(seed, key) };

    // `??` and not `||`, for the reason `storeDefinedProp` states: a write-only `{ set }` seed is an
    // accessor too, and it has no `get` to test.
    if ((descriptor.get ?? descriptor.set) !== undefined) {
      ownAccessors(store).set(key, descriptor);

      continue;
    }

    store.values.set(key, descriptor.value);
  }

  return store;
}

/** Whether a spec deleted this key, so a read must answer `undefined` rather than make a spy. */
export function isDeletedProp(store: ProxyPropStore, key: string | symbol): boolean {
  return store.deleted.has(key);
}

/** Store a plain value, reviving a key a previous `delete` tombstoned. */
export function writeStoredValue(store: ProxyPropStore, key: string | symbol, value: unknown): void {
  store.deleted.delete(key);
  store.values.set(key, value);
}

/** Whether the store answers this key at all — either map counts. */
export function hasStoredProp(store: ProxyPropStore, key: string | symbol): boolean {
  return store.values.has(key) || store.accessors.has(key);
}

/**
 * The `defineProperty` trap body.
 *
 * Always reports success. The Proxy invariant that could bite — defining a property the target does
 * not have — only throws when the target is non-extensible or the descriptor asks for
 * `configurable: false`, and neither is true of a helper patching a double: the targets here are a
 * fresh `{}` and a fresh spy, and every `mock*Prop` descriptor carries `configurable: true`.
 */
export function storeDefinedProp(store: ProxyPropStore, key: string | symbol, descriptor: PropertyDescriptor): boolean {
  // Defining a property is a write: it revives a key a previous `delete` tombstoned.
  store.deleted.delete(key);

  const existing = store.accessors.get(key);

  // `??` and not `||`: a descriptor is an accessor one when it carries *either* half, and a
  // write-only `{ set }` has no `get` to test.
  if ((descriptor.get ?? descriptor.set) !== undefined) {
    // Merged as the language merges a redefinition: `{ get }` alone keeps the setter already there.
    ownAccessors(store).set(key, existing ? { ...existing, ...descriptor } : descriptor);
    store.values.delete(key);

    return true;
  }

  // A descriptor with no `value` (`{ enumerable: false }`) keeps what the key already held.
  if (!('value' in descriptor) && (store.values.has(key) || (existing && !('writable' in descriptor)))) {
    return true;
  }

  store.values.set(key, descriptor.value);
  store.accessors.delete(key);

  return true;
}

/**
 * The `deleteProperty` trap body: forget the key *and* remember that it is gone.
 *
 * It serves two callers with the same operation. A spec writing `delete mock.optionalMethod` means
 * "this member does not exist here", and on a double that materialises members on demand only a
 * tombstone can say that. `restoreMockedProps()` reaches it too — undoing a patch on a key the
 * double had never materialised is recorded as *absence* and put back by deleting — and lands on
 * the same answer: after the restore the member reads `undefined`, which is what "it was never
 * there" means. Without any trap at all the deletion hit the Proxy's target and did nothing.
 */
export function dropStoredProp(store: ProxyPropStore, key: string | symbol): boolean {
  store.values.delete(key);
  store.accessors.delete(key);
  ownDeleted(store).add(key);

  return true;
}

/**
 * The `getOwnPropertyDescriptor` trap body, or `undefined` when the store does not answer the key.
 *
 * An accessor is handed back as it was installed, because this is exactly what `rememberProp`
 * records in order to put it back later — flattening it to a value would turn a restored getter
 * into a frozen field.
 */
export function describeStoredProp(store: ProxyPropStore, key: string | symbol): PropertyDescriptor | undefined {
  const accessor = store.accessors.get(key);

  if (accessor) {
    return { ...accessor, configurable: true, enumerable: true };
  }

  if (!store.values.has(key)) {
    return undefined;
  }

  return { configurable: true, enumerable: true, value: store.values.get(key), writable: true };
}

/**
 * Run a patched setter if one is installed, and say whether it took the write.
 *
 * A patched accessor pair owns it: `mockAccessorsProp(mock, 'x', { get, set })` exists so the setter
 * runs, and dropping the value into the value map instead would shadow the getter with it and make
 * the pair read as a plain field from the next read on.
 */
export function writeStoredAccessor(store: ProxyPropStore, key: string | symbol, value: unknown, receiver: unknown): boolean {
  const accessor = store.accessors.get(key);

  if (!accessor?.set) {
    return false;
  }

  accessor.set.call(receiver, value);

  return true;
}

/**
 * Read a patched accessor, or {@link NOT_STORED} when there is none.
 *
 * A sentinel rather than `undefined`, because a getter that legitimately returns `undefined` —
 * `mockValueProp(mock, 'x', undefined)`, the documented way to say "this member has no value here"
 * — must not read as "no accessor installed".
 */
export function readStoredAccessor(store: ProxyPropStore, key: string | symbol, receiver: unknown): unknown {
  const accessor = store.accessors.get(key);

  if (!accessor) {
    return NOT_STORED;
  }

  // `receiver`, not the raw target: a getter installed by `mockReadonlyProp` closes over its value,
  // but one written by hand may read another member off `this`, and `this` must be the double.
  return accessor.get?.call(receiver);
}

/** Returned by {@link readStoredAccessor} when the key has no patched accessor. */
export const NOT_STORED = Symbol('vitest-auto-spy.notStored');

/**
 * Keys a library probes to decide **what kind of thing** it was handed, rather than to call.
 *
 * A double that answers every property answers these too, and then it is not a double of `T` any
 * more — it is whatever the probe was looking for. The reported case cost an afternoon and looked
 * nothing like its cause:
 *
 * ```ts
 * of(autoMocked<AnimationItem>()); // an Observable that never emits
 * ```
 *
 * `of(...)` calls `popScheduler(args)`, which treats the **last argument** as a scheduler when
 * `typeof x.schedule === 'function'`. The whole double was eaten as the scheduler, `of()` was left
 * with an empty argument list, and the emission was scheduled onto a spy that does nothing. The
 * component under test then kept its `null`, and the assertion that failed was three concerns away
 * — nothing in the failure mentions `of`.
 *
 * The three names here are the ones with a demonstrated mechanic, and each is unambiguously
 * protocol rather than API:
 *
 * | Key            | Probe                                          | What it made the double |
 * | -------------- | ---------------------------------------------- | ----------------------- |
 * | `schedule`     | `popScheduler` in `of` / `from` / `merge` / …  | a scheduler             |
 * | `lift`         | `isObservable` (with `subscribe`)              | an Observable           |
 * | `@@observable` | `isInteropObservable` in `innerFrom`           | an interop Observable   |
 * | `getReader`    | `isReadableStreamLike` in `innerFrom`          | a WHATWG ReadableStream |
 *
 * `then` and every symbol (`Symbol.iterator`, `Symbol.asyncIterator`, `Symbol.observable`) were
 * already answered with `undefined` for the same reason, which is why `await mock` returns the mock
 * and `from(mock)` does not iterate it.
 *
 * **`subscribe` is deliberately *not* here.** It is a perfectly ordinary method name — a store, an
 * Angular `OutputEmitterRef`, an event bus — and `expect(store.subscribe).toHaveBeenCalledWith(cb)`
 * is a real assertion this library exists to support. Denying `lift` already breaks rxjs's
 * `isObservable`, and denying `@@observable` breaks `innerFrom`, so `subscribe` on its own no longer
 * fools anything: `from(mock)` now fails with rxjs's own "You provided an invalid object where a
 * stream was expected". Loud, and in the right file.
 *
 * The list is deliberately short for that reason. A key goes in only with an observed mechanic
 * behind it, never because it sounds protocol-ish — every entry costs somebody the ability to mock
 * a member of that name without seeding it.
 */
const PROTOCOL_KEYS: ReadonlySet<string> = new Set(['schedule', 'lift', '@@observable', 'getReader']);

/**
 * Whether a key must be answered with `undefined` rather than a spy, so the double is not mistaken
 * for a scheduler, a promise or a stream.
 *
 * Consulted **after** the store, so it is not a hard rule: a spec that genuinely mocks a type with
 * a `schedule` method seeds it (`createAutoMock<Scheduler>({ schedule: vi.fn() })`) or assigns to
 * it, and gets it back. Without a seed the member is absent, and the failure is an immediate
 * `TypeError: … is not a function` at the call site — which is the trade this makes: a loud local
 * error instead of a silent remote one.
 */
export function isProtocolKey(key: string | symbol): boolean {
  return typeof key === 'string' && PROTOCOL_KEYS.has(key);
}

// Read by pretty-format's plugins, `JSON.stringify` and the runner's `equals`; keep in step with
// `fill-missing.ts`, which holds back the same keys on the class path.
const PRINTER_PROBE_KEYS: ReadonlySet<string> = new Set(['toJSON', '$$typeof', 'asymmetricMatch', 'nodeType', 'tagName', 'hasAttribute']);

/**
 * Keys a printer or a serializer reads to decide how to render a value. A spy there made a failure
 * diff print the double as `undefined` (`toJSON()` answered it) and left the probes in `ownKeys`.
 * Consulted after the store, so a seed or an assignment still wins.
 */
export function isPrinterProbeKey(key: string | symbol): boolean {
  return typeof key === 'string' && (PRINTER_PROBE_KEYS.has(key) || key.startsWith('@@__IMMUTABLE_'));
}

const WITHHELD_KEYS: ReadonlySet<string> = new Set(['then', ...PROTOCOL_KEYS, ...PRINTER_PROBE_KEYS]);

/** `then`, a protocol key or a printer probe in one lookup — a proxy double's hot read path. */
export function isWithheldKey(key: string): boolean {
  return WITHHELD_KEYS.has(key) || (key.charCodeAt(0) === 64 && key.startsWith('@@__IMMUTABLE_'));
}

const OBJECT_METHOD_KEYS: ReadonlySet<string> = new Set(['toString', 'valueOf']);

/**
 * Keys a string conversion or a logger reads on any object, answered with `Object.prototype`'s own
 * member rather than a fresh spy: a spy there landed in `ownKeys`, so printing the double changed
 * its snapshot, and `${double}` read `'undefined'`. A seed or an assignment still wins.
 */
export function isObjectMethodKey(key: string | symbol): boolean {
  return typeof key === 'string' && OBJECT_METHOD_KEYS.has(key);
}

/**
 * A double that makes members on first read cannot be frozen: the proxy would have to report every
 * future member as already present. Thrown in place of the engine's invariant error, which names no library.
 */
export function cannotFreeze(factory: string): TypeError {
  return new TypeError(
    `[vitest-auto-spy] A ${factory} double cannot be frozen, sealed or made non-extensible: it builds its members on first read. ` +
      'Freeze a copy instead ({ ...double }), or build the double with createSpyFromClass, which supports Object.freeze.',
  );
}
