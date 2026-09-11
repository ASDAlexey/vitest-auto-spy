/**
 * Putting `localStorage` / `sessionStorage` back after the runner drops them.
 *
 * Vitest copies a DOM environment's globals onto `globalThis` behind one filter — `if (k in global)
 * return KEYS.includes(k)` — and neither storage is in `KEYS`. While Node put neither on
 * `globalThis` the first half was false and both were copied; Node's own Web Storage made the key
 * exist, so the filter now answers "no" and the environment's storage never arrives. Measured with
 * one spec, under jsdom and happy-dom alike, because the filter runs before either:
 *
 * ```text
 * Node 24.19  localStorage works
 * Node 25.9   localStorage.setItem is not a function
 * Node 26.7   localStorage is undefined
 * ```
 *
 * A suite stays green with this broken — only the specs that touch storage fail — so it usually
 * arrives as "CI moved to a new Node and eleven unrelated specs died".
 *
 * {@link stubWebStorage} is the other direction: not a repair of the environment but a storage a
 * spec installs for itself, empty or seeded, and takes back with `restoreMockedProps()`.
 */
import { mockValueProp } from './prop-mock';

/** The two globals this module repairs. */
const STORAGE_KEYS = ['localStorage', 'sessionStorage'] as const;

/** One of the two. */
export type WebStorageKey = (typeof STORAGE_KEYS)[number];

/** Namespaced: the probe also runs against a working storage, and must leave no trace in one. */
const PROBE_KEY = '__vitest_auto_spy_probe__';

/** The three methods the probe uses; `key` and `length` are never called on a candidate. */
const PROBE_METHODS = ['setItem', 'getItem', 'removeItem'] as const;

/**
 * Web Storage backed by a `Map`, for an environment that offers none that works, and for
 * {@link stubWebStorage}.
 *
 * Not `new Storage()`: jsdom and happy-dom both declare `Storage` globally and refuse to construct
 * it, while a `Map` behaves the same on every runtime. Keys and values are coerced to strings the way
 * the platform coerces them, and `key()` converts its index as an `unsigned long` does.
 */
class MapBackedStorage implements Storage {
  readonly #items = new Map<string, string>();

  /** Static, so the installed object carries no member the platform's storage lacks. */
  static snapshot(storage: MapBackedStorage): Record<string, string> {
    return Object.fromEntries(storage.#items);
  }

  get length(): number {
    return this.#items.size;
  }

  clear(): void {
    this.#items.clear();
  }

  getItem(key: string): string | null {
    return this.#items.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return [...this.#items.keys()][Number(index) >>> 0] ?? null;
  }

  removeItem(key: string): void {
    this.#items.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.#items.set(String(key), String(value));
  }
}

/** How {@link restoreWebStorage} finds the window whose storage it trusts. */
export interface RestoreWebStorageOptions {
  /**
   * The window to take a working storage from, and to repair alongside `globalThis`.
   *
   * Defaults to `document.defaultView`, and to nothing where there is no document. Pass `null` to
   * say there is no window: the repair then does nothing, which is what a DOM-less runtime wants.
   */
  view?: object | null;
}

/**
 * Give `globalThis` a `localStorage` and a `sessionStorage` that work.
 *
 * Safe to call at any point and as often as you like, and a no-op in the ordinary case: a storage
 * that survives a write and a read back is left exactly as it is, so a spec's own stub survives
 * this. It is also a no-op where there is no window — a `node` environment is *supposed* to have no
 * Web Storage, and inventing one would hand the code under test an API the real runtime lacks.
 *
 * The window's own storage is preferred over the stand-in: the environment implements the real
 * thing, and under a runner whose window is a separate object (a Bun preload, say) only the copy to
 * `globalThis` failed. The `Map`-backed one is for when nothing else works — which, under Vitest,
 * is every time, because there `document.defaultView` *is* `globalThis`.
 *
 * ```ts
 * // vitest.setup.ts — or leave it to setupAutoSpy(), which calls this by default
 * import { restoreWebStorage } from 'vitest-auto-spy/setup';
 *
 * restoreWebStorage();
 * ```
 *
 * @returns The keys it had to repair — `[]` when the environment was already sound.
 */
export function restoreWebStorage(options: RestoreWebStorageOptions = {}): WebStorageKey[] {
  const view = options.view === undefined ? currentView() : options.view;

  if (!view) {
    return [];
  }

  const repaired: WebStorageKey[] = [];

  for (const key of STORAGE_KEYS) {
    if (works(read(globalThis, key))) {
      continue;
    }

    const fromView = read(view, key);

    install(view, key, works(fromView) ? fromView : new MapBackedStorage());
    repaired.push(key);
  }

  return repaired;
}

/** Options for {@link stubWebStorage}. */
export interface WebStorageStubOptions {
  /** What the storage holds when it is installed. Values go through `setItem`, so they are coerced. */
  items?: Readonly<Record<string, string>>;
  /**
   * The window to install it on as well, when that is a different object from `globalThis` — code
   * reads `window.localStorage` as often as the bare global. Defaults to `document.defaultView`;
   * `null` installs on `globalThis` alone.
   */
  view?: object | null;
}

/** What {@link stubWebStorage} hands back. */
export interface WebStorageStub {
  /** The storage now installed — the same object the global answers until it is restored. */
  readonly storage: Storage;
  /** A copy of what it holds, as a plain record: `expect(local.snapshot()).toEqual({ token: 'abc' })`. */
  snapshot(): Record<string, string>;
}

/**
 * Replace `localStorage` or `sessionStorage` with an in-memory `Storage` for this test, empty or seeded.
 *
 * ```ts
 * import { stubWebStorage, type WebStorageStub } from 'vitest-auto-spy/dom-stubs';
 *
 * let local: WebStorageStub;
 *
 * beforeEach(() => {
 *   local = stubWebStorage('localStorage', { items: { token: 'abc' } });
 * });
 *
 * it('forgets the token on logout', () => {
 *   session.logout();
 *   expect(local.snapshot()).toEqual({});
 * });
 * ```
 *
 * `getItem`, `setItem`, `removeItem`, `clear`, `key` and `length` behave as the platform's do,
 * string coercion included. Installed through `mockValueProp`, so `restoreMockedProps()` — and
 * therefore `setupAutoSpy()` between tests — puts back whatever the global held before. Install it
 * in `beforeEach`, like every other stub on this entry.
 *
 * Unlike {@link restoreWebStorage} it installs in a `node` environment too: the spec asked for it.
 */
export function stubWebStorage(key: WebStorageKey = 'localStorage', options: WebStorageStubOptions = {}): WebStorageStub {
  const storage = new MapBackedStorage();
  const view = options.view === undefined ? currentView() : options.view;

  Object.entries(options.items ?? {}).forEach(([name, value]) => storage.setItem(name, value));
  mockValueProp(globalThis, key, storage);

  if (view && view !== globalThis) {
    mockValueProp(view, key, storage);
  }

  return { storage, snapshot: () => MapBackedStorage.snapshot(storage) };
}

/**
 * The window the environment is running, or nothing in a DOM-less one.
 *
 * The `typeof` guard is what lets `setupAutoSpy()` call the repair unconditionally from a `node`
 * environment, where `document` is not merely undefined but undeclared.
 */
function currentView(): object | null {
  return typeof document === 'undefined' ? null : document.defaultView;
}

function read(host: object, key: WebStorageKey): unknown {
  return Reflect.get(host, key);
}

/** `Object(candidate)` rather than a null check: a missing value and a wrong shape are one path. */
function isStorageShaped(candidate: unknown): candidate is Storage {
  const host: object = Object(candidate);

  return PROBE_METHODS.every((method) => typeof Reflect.get(host, method) === 'function');
}

/**
 * Whether this really is a storage: write a key, read it back, take it out again.
 *
 * A round trip rather than a `typeof setItem` check, because Node 25 hands out the method and
 * throws from it, Node 26 hands out nothing, and the next runtime is free to invent a third shape.
 */
function works(candidate: unknown): candidate is Storage {
  if (!isStorageShaped(candidate)) {
    return false;
  }

  try {
    candidate.setItem(PROBE_KEY, PROBE_KEY);

    const stored = candidate.getItem(PROBE_KEY);

    candidate.removeItem(PROBE_KEY);

    return stored === PROBE_KEY;
  } catch {
    return false;
  }
}

/** Writable and configurable, so a spec can still replace it and `guardGlobalPatches()` stays quiet. */
function install(view: object, key: WebStorageKey, storage: Storage): void {
  const descriptor: PropertyDescriptor = { value: storage, writable: true, configurable: true };

  Object.defineProperty(globalThis, key, descriptor);

  if (view !== globalThis) {
    Object.defineProperty(view, key, descriptor);
  }
}
