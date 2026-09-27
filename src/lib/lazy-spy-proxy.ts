/**
 * `lazySpies: 'proxy'` — one `Proxy` in place of N accessor placeholders. The default on a class of
 * `PROXY_MIN_METHODS` methods or more.
 *
 * The accessor path installs an `Object.defineProperty` placeholder per method, and the first read
 * of any of them drops the double into dictionary mode — a property dictionary sized by the width
 * of the class, not by what the test touched. This mode defines nothing for the methods: the traps
 * answer them from one `Set` of names per class, so what a double retains stops scaling with the
 * width of the class, touched or not.
 *
 * The price is that a `Proxy` cannot remove itself, so every read of the double pays a trap for its
 * life. Both halves are measured in `docs-site/core/performance.md`.
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

// Keyed by the per-prototype array `getAllMethodNames` caches, so every double of a class shares one
// `Set`; insertion order doubles as declaration order for `ownKeys`.
const sharedNameSets = new WeakMap<readonly PropertyKey[], ReadonlySet<string>>();

function stringNames(methodNames: readonly PropertyKey[]): Set<string> {
  return new Set(methodNames.filter((name): name is string => typeof name === 'string'));
}

function sharedNameSet(methodNames: readonly PropertyKey[]): ReadonlySet<string> {
  let names = sharedNameSets.get(methodNames);

  if (!names) {
    names = stringNames(methodNames);
    sharedNameSets.set(methodNames, names);
  }

  return names;
}

const NO_DELETED: ReadonlySet<string> = new Set<string>();
const ONLY_ACCESSOR_BAG: readonly string[] = ['accessorSpies'];

/** The traps and everything they share, as one object per double rather than seven closures. */
class LazySpyHandler implements ProxyHandler<Record<string, unknown>> {
  // Only ever holds a name a caller explicitly deleted: without it, `delete spy.method` would leave
  // the name pending again and the next read would resurrect it.
  #deleted: ReadonlySet<string> = NO_DELETED;
  readonly #target: Record<string, unknown>;
  readonly #names: ReadonlySet<string>;
  readonly #preKeys: readonly string[];
  readonly #unstubbed: UnstubbedGuard | undefined;

  constructor(
    target: Record<string, unknown>,
    names: ReadonlySet<string>,
    preKeys: readonly string[],
    unstubbed: UnstubbedGuard | undefined,
  ) {
    this.#target = target;
    this.#names = names;
    this.#preKeys = preKeys;
    this.#unstubbed = unstubbed;
  }

  get(target: Record<string, unknown>, key: PropertyKey): unknown {
    // Without the receiver on purpose: an accessor spy must see the record as `this`, exactly as
    // it does when no proxy is in the way.
    return this.#isPending(key) ? this.#materialize(target, key) : Reflect.get(target, key);
  }

  set(target: Record<string, unknown>, key: PropertyKey, value: unknown): boolean {
    if (this.#isPending(key)) {
      defineSpy(target, key, value);

      return true;
    }

    return Reflect.set(target, key, value);
  }

  has(target: Record<string, unknown>, key: PropertyKey): boolean {
    return this.#isPending(key) || Reflect.has(target, key);
  }

  getOwnPropertyDescriptor(target: Record<string, unknown>, key: PropertyKey): PropertyDescriptor | undefined {
    if (!this.#isPending(key)) {
      return Reflect.getOwnPropertyDescriptor(target, key);
    }

    return {
      configurable: true,
      enumerable: true,
      get: (): unknown => this.#materialize(target, key),
      set: (value: unknown): void => defineSpy(target, key, value),
    };
  }

  deleteProperty(target: Record<string, unknown>, key: PropertyKey): boolean {
    // Read the state before recording the deletion: `deleted` is one of the inputs to `isPending`,
    // so marking first would make an un-materialised name look like an ordinary missing key.
    const wasPending = this.#isPending(key);

    if (typeof key === 'string' && this.#names.has(key)) {
      this.#deleted = new Set([...this.#deleted, key]);
    }

    return wasPending || Reflect.deleteProperty(target, key);
  }

  /**
   * Own keys in the order the accessor path produces them: whatever the record already had, then the
   * methods in declaration order, then anything the caller added, then the symbols. Computed from live
   * state, so a materialised method keeps its declared position and a deleted one disappears.
   */
  ownKeys(target: Record<string, unknown>): ArrayLike<string | symbol> {
    const own = Reflect.ownKeys(target);

    if (!Reflect.isExtensible(target)) {
      return own;
    }

    const ownStrings = own.filter((key): key is string => typeof key === 'string');
    const present = new Set(ownStrings);
    const preSet = new Set(this.#preKeys);

    return [
      ...this.#preKeys.filter((key) => present.has(key)),
      ...[...this.#names].filter((key) => this.#isPending(key) || present.has(key)),
      ...ownStrings.filter((key) => !preSet.has(key) && !this.#names.has(key)),
      ...own.filter((key): key is symbol => typeof key === 'symbol'),
    ];
  }

  preventExtensions(target: Record<string, unknown>): boolean {
    this.#names.forEach((key) => {
      if (this.#isPending(key)) {
        this.#materialize(target, key);
      }
    });

    return Reflect.preventExtensions(target);
  }

  #isPending(key: PropertyKey): key is string {
    return typeof key === 'string' && this.#names.has(key) && !this.#deleted.has(key) && !hasOwn(this.#target, key);
  }

  /** Build the spy for `key` and write it over the name, so every later read is an ordinary lookup. */
  #materialize(target: Record<string, unknown>, key: string): unknown {
    const spy = createFunctionSpy<Func>(key, this.#unstubbed);
    defineSpy(target, key, spy);

    return spy;
  }
}

/**
 * Wrap an assembled record so that `methodNames` become function spies on first touch, with nothing
 * defined for them up front.
 *
 * @param autoSpy The record `createSpyFromClass` assembled — observable props, accessor spies and
 *   the dispose symbol are already on it, and stay on it.
 * @param methodNames The methods to answer lazily, in declaration order; symbol keys are skipped.
 * @param unstubbed The strict-mode guard the record's other spies were given.
 * @param shared Whether `methodNames` is a per-class array that is never mutated, so its name set
 *   can be shared by every double of the class.
 * @returns A double with the same observable behaviour as the accessor path.
 */
export function createLazySpyProxy(
  autoSpy: Record<string, unknown>,
  methodNames: readonly PropertyKey[],
  unstubbed: UnstubbedGuard | undefined,
  shared: boolean,
): Record<string, unknown> {
  const own = Reflect.ownKeys(autoSpy).filter((key): key is string => typeof key === 'string');
  // The record of a class without observable props or accessors: share its key list instead of holding one per double.
  const preKeys = own.length === 1 && own[0] === 'accessorSpies' ? ONLY_ACCESSOR_BAG : own;
  const names = shared ? sharedNameSet(methodNames) : stringNames(methodNames);

  return new Proxy(autoSpy, new LazySpyHandler(autoSpy, names, preKeys, unstubbed));
}
