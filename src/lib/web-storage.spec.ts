import { afterEach, describe, expect, it } from 'vitest';

import { restoreWebStorage } from './web-storage';

/**
 * Under Vitest's DOM environments `document.defaultView`, `window` and `globalThis` are the *same
 * object*, so a broken global copy is also a broken window copy and the fallback is what runs. The
 * separate-window case is real elsewhere — a Bun preload builds its window with
 * `copyWindowGlobals()`, and the source window it copies from is a different object — so those
 * cases inject a stand-in view rather than pretending the runner has one.
 */
const STORAGE_KEYS = ['localStorage', 'sessionStorage'] as const;

/** The descriptors this file is allowed to break, captured before it breaks any of them. */
const original = STORAGE_KEYS.map((key) => ({ key, descriptor: Object.getOwnPropertyDescriptor(globalThis, key) }));

/** Whatever a test did to a storage slot, undone. */
function restoreGlobals(): void {
  for (const { key, descriptor } of original) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
}

/** Replace one storage slot on one host, the way a broken runtime leaves it. */
function put(host: object, key: (typeof STORAGE_KEYS)[number], value: unknown): void {
  Object.defineProperty(host, key, { value, writable: true, configurable: true });
}

/** A storage that works, for the window a broken global is repaired from. */
function workingStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length(): number {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => items.delete(key) as unknown as void,
    setItem: (key: string, value: string) => items.set(key, value) as unknown as void,
  };
}

describe('restoreWebStorage', () => {
  afterEach(restoreGlobals);

  it('leaves a working storage exactly as it was', () => {
    const before = globalThis.localStorage;

    globalThis.localStorage.setItem('kept', 'value');

    expect(restoreWebStorage()).toEqual([]);
    expect(globalThis.localStorage).toBe(before);
    expect(globalThis.localStorage.getItem('kept')).toBe('value');

    globalThis.localStorage.removeItem('kept');
  });

  it('leaves nothing behind in a storage it only probed', () => {
    restoreWebStorage();

    expect(globalThis.localStorage.length).toBe(0);
  });

  it('takes the window own storage when only the global copy is broken', () => {
    const fromView = workingStorage();

    put(globalThis, 'localStorage', undefined);

    expect(restoreWebStorage({ view: { localStorage: fromView } })).toEqual(['localStorage']);
    expect(globalThis.localStorage).toBe(fromView);
  });

  it('repairs a storage that is missing a method it needs', () => {
    put(globalThis, 'localStorage', { setItem: () => undefined });

    expect(restoreWebStorage()).toEqual(['localStorage']);
    expect(roundTrips(globalThis.localStorage)).toBe(true);
  });

  it('repairs a storage whose methods are there and throw', () => {
    // Node 25's shape: every method exists, and using one raises unless the process was started
    // with a storage file.
    put(globalThis, 'localStorage', {
      setItem: () => {
        throw new Error('SecurityError');
      },
      getItem: () => null,
      removeItem: () => undefined,
    });

    expect(restoreWebStorage()).toEqual(['localStorage']);
    expect(roundTrips(globalThis.localStorage)).toBe(true);
  });

  it('repairs a storage that accepts a write and forgets it', () => {
    put(globalThis, 'localStorage', { setItem: () => undefined, getItem: () => null, removeItem: () => undefined });

    expect(restoreWebStorage()).toEqual(['localStorage']);
    expect(roundTrips(globalThis.localStorage)).toBe(true);
  });

  it('repairs both slots when both are gone', () => {
    put(globalThis, 'localStorage', undefined);
    put(globalThis, 'sessionStorage', undefined);

    expect(restoreWebStorage()).toEqual(['localStorage', 'sessionStorage']);
    expect(globalThis.sessionStorage).not.toBe(globalThis.localStorage);
  });

  it('does nothing where there is no window', () => {
    put(globalThis, 'localStorage', undefined);

    expect(restoreWebStorage({ view: null })).toEqual([]);
    expect(globalThis.localStorage).toBeUndefined();
  });

  it('repairs the window as well when it is a separate object', () => {
    const view: Record<string, unknown> = {};

    put(globalThis, 'localStorage', undefined);
    restoreWebStorage({ view });

    expect(view['localStorage']).toBe(globalThis.localStorage);
  });

  describe('the stand-in it installs when nothing else works', () => {
    /** Install it, and hand back the one that ended up on the global. */
    function installed(): Storage {
      put(globalThis, 'localStorage', undefined);
      restoreWebStorage({ view: globalThis });

      return globalThis.localStorage;
    }

    it('stores, reads, counts and removes like the real one', () => {
      const storage = installed();

      storage.setItem('a', 'first');
      storage.setItem('b', 'second');

      expect(storage.length).toBe(2);
      expect(storage.getItem('a')).toBe('first');
      expect(storage.getItem('missing')).toBeNull();
      expect(storage.key(1)).toBe('b');
      expect(storage.key(7)).toBeNull();

      storage.removeItem('a');

      expect(storage.getItem('a')).toBeNull();
      expect(storage.length).toBe(1);

      storage.clear();

      expect(storage.length).toBe(0);
    });

    it('stores a value as the string the real one would', () => {
      const storage = installed();

      storage.setItem('n', 42 as unknown as string);

      expect(storage.getItem('n')).toBe('42');
    });
  });
});

/** Whether a storage keeps what it is given — the same question the repair asks. */
function roundTrips(storage: Storage): boolean {
  storage.setItem('probe', 'value');

  const stored = storage.getItem('probe');

  storage.removeItem('probe');

  return stored === 'value';
}
