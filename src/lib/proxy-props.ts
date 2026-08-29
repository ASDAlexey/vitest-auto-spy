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

/** A store seeded from an `overrides` object, key for key. */
export function createProxyPropStore(seed: object): ProxyPropStore {
  const store: ProxyPropStore = { values: new Map(), accessors: new Map(), deleted: new Set() };

  for (const key of Reflect.ownKeys(seed)) {
    store.values.set(key, Reflect.get(seed, key));
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

  // `??` and not `||`: a descriptor is an accessor one when it carries *either* half, and a
  // write-only `{ set }` has no `get` to test.
  if ((descriptor.get ?? descriptor.set) !== undefined) {
    store.accessors.set(key, descriptor);
    store.values.delete(key);

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
  store.deleted.add(key);

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
