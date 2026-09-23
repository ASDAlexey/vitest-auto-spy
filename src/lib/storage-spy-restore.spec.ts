/**
 * Both DOM environments break spies on Web Storage methods, each in its own half, so the broken
 * state is staged here rather than reached through either runner path. happy-dom installs the spy
 * and cannot take it off — the trap this module exists for; the test that walks it branches on the
 * environment and runs for real in the happy-dom lane (`vitest.happy-dom.config.mts`, this same
 * file on the real thing). jsdom never lets the spy land at all: its `Storage` is a proxy whose
 * `defineProperty` trap turns a define of a method the wrapper does not own into a stored item, so
 * `vi.spyOn(localStorage, 'setItem')` returns a mock nothing answers with. A mock where a storage
 * method should be is therefore staged on a stand-in object put into the global slot — the state
 * the module repairs, without depending on which way the environment breaks.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { restoreStorageSpies } from './storage-spy-restore';

/** happy-dom names itself in the user agent; jsdom does the same, differently. */
const isHappyDom = navigator.userAgent.includes('HappyDOM');

/** The globals this file is allowed to break, captured before it breaks any of them. */
const realGlobals = {
  Storage: Reflect.get(globalThis, 'Storage'),
  localStorage: Reflect.get(globalThis, 'localStorage'),
  sessionStorage: Reflect.get(globalThis, 'sessionStorage'),
};

/** Put a stand-in where a storage global is, the way a broken environment leaves one. */
function put(key: 'localStorage' | 'sessionStorage', value: unknown): void {
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}

describe('restoreStorageSpies', () => {
  afterEach(() => {
    for (const [name, value] of Object.entries(realGlobals)) {
      Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    }

    // The runner's own restore first — it clears what it can on its own — then this module's, for
    // whatever that path could not reach in this environment.
    vi.restoreAllMocks();
    restoreStorageSpies();
  });

  it('reports nothing when both storages are clean', () => {
    expect(restoreStorageSpies()).toEqual([]);
  });

  it('repairs a mock that no spy registration tracks', () => {
    const standIn = { setItem: vi.fn() };

    put('localStorage', standIn);

    vi.restoreAllMocks();
    expect(vi.isMockFunction(standIn.setItem)).toBe(true);

    expect(restoreStorageSpies()).toEqual(['localStorage']);
    expect(standIn.setItem).toBe(Storage.prototype.setItem);
    expect(vi.isMockFunction(standIn.setItem)).toBe(false);
  });

  it('lists a storage once however many methods were mocked on it', () => {
    const local = { getItem: vi.fn(), key: vi.fn(), removeItem: vi.fn() };
    const session = { clear: vi.fn(), setItem: vi.fn() };

    put('localStorage', local);
    put('sessionStorage', session);

    expect(restoreStorageSpies()).toEqual(['localStorage', 'sessionStorage']);
    expect(local.getItem).toBe(Storage.prototype.getItem);
    expect(local.key).toBe(Storage.prototype.key);
    expect(session.setItem).toBe(Storage.prototype.setItem);
    expect(vi.isMockFunction(local.removeItem)).toBe(false);
  });

  it('skips storages this environment does not have', () => {
    put('localStorage', undefined);
    put('sessionStorage', null);

    expect(restoreStorageSpies()).toEqual([]);
  });

  it('does nothing where there is no Storage to take methods from', () => {
    Object.defineProperty(globalThis, 'Storage', { value: undefined, writable: true, configurable: true });

    expect(restoreStorageSpies()).toEqual([]);
  });

  it('takes off a spy that survived vi.restoreAllMocks()', () => {
    vi.spyOn(localStorage, 'setItem');

    vi.restoreAllMocks();

    if (isHappyDom) {
      // The trap, on the real thing: the spy did land as an own property, and restore deletes
      // through happy-dom's Storage proxy — which only ever deletes stored items — so it is
      // still installed.
      expect(vi.isMockFunction(localStorage.setItem)).toBe(true);

      expect(restoreStorageSpies()).toEqual(['localStorage']);
      expect(localStorage.setItem).toBe(Storage.prototype.setItem);
    } else {
      // jsdom's Storage is a proxy too, and its define trap turned the install into a stored
      // item: the mock never answered, so nothing survived to take off — only junk to drop.
      expect(vi.isMockFunction(localStorage.setItem)).toBe(false);
      localStorage.removeItem('setItem');

      expect(restoreStorageSpies()).toEqual([]);
    }

    expect(vi.isMockFunction(localStorage.setItem)).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});
