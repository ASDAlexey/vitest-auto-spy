/**
 * `lazySpies: 'proxy'` — one `Proxy` in place of N accessor placeholders.
 *
 * The default lazy path installs an `Object.defineProperty` accessor per method, and on a wide
 * class that placeholder *is* the memory: 74–97 % of what an untouched double retains. This mode
 * holds the un-materialised names in a single `Set` of strings the prototype already owns, so what
 * a double retains stops scaling with the width of the class — the number that ends CI jobs under
 * `isolate: false`.
 *
 * It is opt-in, and has to be: a `Proxy` cannot remove itself, so every read and every call pays a
 * trap for the life of the double. Both halves are measured in `docs-site/core/performance.md`.
 *
 * The traps below exist to make the double indistinguishable from the accessor path, not merely
 * usable. Two of them are load-bearing in ways that are easy to get wrong:
 *
 * - `getOwnPropertyDescriptor` deliberately does **not** materialise. `Object.keys`, a spread and
 *   `resetAutoSpy` all read descriptors for every key, so materialising here would build every spy
 *   on the first teardown and hand back exactly the memory this mode exists to save. It reports the
 *   accessor descriptor the placeholder path would have installed instead, which is also why
 *   `collectOwnMocks` keeps skipping an untouched method rather than clearing a spy with no calls.
 * - `preventExtensions` materialises everything first. A proxy may not report an own key that a
 *   non-extensible target does not have, so `Object.freeze(spy)` has to resolve the names before
 *   the target is sealed or `ownKeys` starts throwing.
 */
import { type UnstubbedGuard, createFunctionSpy } from './function-spy';
import type { Func } from './types';

const hasOwn = (target: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(target, key);

/** Write the materialised spy over the name, as a plain data property — the shape the accessor path ends at. */
function defineSpy(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, writable: true, value });
}

/**
 * Wrap an assembled record so that `methodNames` become function spies on first touch, with nothing
 * defined for them up front.
 *
 * @param autoSpy The record `createSpyFromClass` assembled — observable props, accessor spies and
 *   the dispose symbol are already on it, and stay on it.
 * @param methodNames The prototype methods to answer lazily, in declaration order.
 * @param unstubbed The strict-mode guard the record's other spies were given.
 * @returns A double with the same observable behaviour as the accessor path.
 */
/** Everything the traps share: which names are still un-materialised, and the order to report them in. */
interface LazyState {
  readonly names: Set<string>;
  readonly deleted: Set<string>;
  readonly preKeys: string[];
  readonly preSet: Set<string>;
  readonly unstubbed: UnstubbedGuard | undefined;
  isPending(key: PropertyKey): key is string;
}

/** Build the spy for `key` and write it over the name, so every later read is an ordinary lookup. */
function materialize(target: Record<string, unknown>, state: LazyState, key: string): unknown {
  const spy = createFunctionSpy<Func>(key, state.unstubbed);
  defineSpy(target, key, spy);

  return spy;
}

/**
 * The accessor descriptor the placeholder path would have installed.
 *
 * Reporting one instead of materialising is what keeps `Object.keys`, a spread and `resetAutoSpy`
 * cheap: all three read a descriptor per key, and all three would otherwise build the whole class.
 */
function pendingDescriptor(target: Record<string, unknown>, state: LazyState, key: string): PropertyDescriptor {
  return {
    configurable: true,
    enumerable: true,
    get: (): unknown => materialize(target, state, key),
    set: (value: unknown): void => defineSpy(target, key, value),
  };
}

/**
 * Own keys in the order the accessor path produces them: whatever the record already had, then the
 * methods in declaration order, then anything the caller added, then the symbols.
 *
 * Computed from live state rather than cached, so a materialised method keeps its declared position
 * and a deleted one disappears.
 */
function orderedKeys(target: Record<string, unknown>, state: LazyState): (string | symbol)[] {
  const own = Reflect.ownKeys(target);

  if (!Reflect.isExtensible(target)) {
    return own;
  }

  const ownStrings = own.filter((key): key is string => typeof key === 'string');
  const present = new Set(ownStrings);

  return [
    ...state.preKeys.filter((key) => present.has(key)),
    ...[...state.names].filter((key) => state.isPending(key) || present.has(key)),
    ...ownStrings.filter((key) => !state.preSet.has(key) && !state.names.has(key)),
    ...own.filter((key): key is symbol => typeof key === 'symbol'),
  ];
}

export function createLazySpyProxy(
  autoSpy: Record<string, unknown>,
  methodNames: string[],
  unstubbed: UnstubbedGuard | undefined,
): Record<string, unknown> {
  const preKeys = Reflect.ownKeys(autoSpy).filter((key): key is string => typeof key === 'string');
  const state: LazyState = {
    // Insertion order doubles as declaration order for `ownKeys`, so no second array is retained.
    names: new Set(methodNames),
    // Only ever holds a name a caller explicitly deleted: without it, `delete spy.method` would leave
    // the name pending again and the next read would resurrect it.
    deleted: new Set<string>(),
    preKeys,
    preSet: new Set(preKeys),
    unstubbed,
    isPending: (key: PropertyKey): key is string =>
      typeof key === 'string' && state.names.has(key) && !state.deleted.has(key) && !hasOwn(autoSpy, key),
  };

  return new Proxy(autoSpy, {
    get(target: Record<string, unknown>, key: PropertyKey): unknown {
      // Without the receiver on purpose: an accessor spy must see the record as `this`, exactly as
      // it does when no proxy is in the way.
      return state.isPending(key) ? materialize(target, state, key) : Reflect.get(target, key);
    },

    set(target: Record<string, unknown>, key: PropertyKey, value: unknown): boolean {
      if (state.isPending(key)) {
        defineSpy(target, key, value);

        return true;
      }

      return Reflect.set(target, key, value);
    },

    has(target: Record<string, unknown>, key: PropertyKey): boolean {
      return state.isPending(key) || Reflect.has(target, key);
    },

    getOwnPropertyDescriptor(target: Record<string, unknown>, key: PropertyKey): PropertyDescriptor | undefined {
      return state.isPending(key) ? pendingDescriptor(target, state, key) : Reflect.getOwnPropertyDescriptor(target, key);
    },

    deleteProperty(target: Record<string, unknown>, key: PropertyKey): boolean {
      // Read the state before recording the deletion: `deleted` is one of the inputs to `isPending`,
      // so marking first would make an un-materialised name look like an ordinary missing key.
      const wasPending = state.isPending(key);

      if (typeof key === 'string' && state.names.has(key)) {
        state.deleted.add(key);
      }

      return wasPending || Reflect.deleteProperty(target, key);
    },

    ownKeys: (target: Record<string, unknown>): ArrayLike<string | symbol> => orderedKeys(target, state),

    preventExtensions(target: Record<string, unknown>): boolean {
      state.names.forEach((key) => {
        if (state.isPending(key)) {
          materialize(target, state, key);
        }
      });

      return Reflect.preventExtensions(target);
    },
  });
}
