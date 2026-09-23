/**
 * Taking a spy off a Web Storage method when the runner cannot.
 *
 * `vi.spyOn(localStorage, 'setItem')` puts the mock on the storage as an own property, and taking
 * it off again is the inverse: the real method lives on `Storage.prototype`, so restore deletes the
 * own property (`Reflect.deleteProperty`) and lets the prototype's method show through once more.
 * Under happy-dom that delete never lands. Its `Storage` constructor hands each instance out
 * wrapped in a `Proxy` whose `deleteProperty` trap knows one thing — stored items. A key in the
 * data map is removed; anything else makes the trap answer `false`, which `Reflect.deleteProperty`
 * reports as "not deleted" while nothing throws. `mockRestore()`, and `vi.restoreAllMocks()`
 * walking the same path, come back green having done nothing: the spy is still the own property,
 * still recording into the same `.mock`, and it answers for every file that follows in the worker.
 * A later spec's own `vi.spyOn(localStorage, 'setItem')` is even handed that same mock with the
 * previous file's calls in it, so "not to have been called" fails every other run. Debugging it by
 * hand sends the search the wrong way — running `vi.restoreAllMocks()` to clear the leftover probes
 * green and appears to rule the mock out.
 *
 * The trap is on deletion only. `Object.defineProperty` passes through to the real instance — it is
 * how the spy got on in the first place — so writing the prototype method back over it is the one
 * route out. That asymmetry, define goes through and delete does not, is this whole module.
 *
 * jsdom, for completeness, breaks the other half of the same contract: its `Storage` is a proxy
 * too, and the `defineProperty` trap turns a define of a method the wrapper does not own into a
 * stored item — `vi.spyOn(localStorage, 'setItem')` hands back a mock that was never installed.
 * Either way the gate below stays honest: it repairs a method that really is a mock, and leaves
 * everything else — a clean storage, a spec's deliberate replacement, jsdom's junk item — alone.
 *
 * Like `global-patch-guard.ts`, this is a `/setup`-surface module: it imports `vi` from Vitest at
 * the top because it only ever loads inside a Vitest run, where the spy state it reads exists.
 */
import { vi } from 'vitest';

/** The methods a spec can put a spy on, in the order the interface declares them. */
const STORAGE_METHODS = ['clear', 'getItem', 'key', 'removeItem', 'setItem'] as const;

/** The two storages this module repairs, in the order repairs are reported. */
const STORAGE_KEYS = ['localStorage', 'sessionStorage'] as const;

/** One of the two. */
export type StorageSpyKey = (typeof STORAGE_KEYS)[number];

/**
 * Write `Storage.prototype`'s own methods back over the spies the runner could not take off.
 *
 * Only replaces state that is already broken: `vi.isMockFunction` decides, so a clean storage, a
 * spec's deliberate replacement, and a spy the runner took off by itself are all left exactly as
 * they are. `setupAutoSpy()` calls this at each file boundary by default for the same reason it
 * calls `restoreWebStorage()` — under `isolate: false` the file that follows inherits whatever this
 * one could not remove. The boundary, not the test, is the line: a spy a `beforeAll` installed for
 * its whole file is still standing when the file's tests run, and only the next file is protected.
 *
 * @returns The storages it had to repair, in declaration order, each listed once however many of
 *   its methods were still mocked.
 */
export function restoreStorageSpies(): readonly StorageSpyKey[] {
  const prototype = storagePrototype();

  if (!prototype) {
    return [];
  }

  const repaired: StorageSpyKey[] = [];

  for (const key of STORAGE_KEYS) {
    const storage = Reflect.get(globalThis, key);
    // `Object()` rather than a presence check: a storage this environment does not have and one of
    // the wrong shape are one path — neither carries a method worth reading.
    const host: object = Object(storage);
    const mocked = STORAGE_METHODS.filter((method) => vi.isMockFunction(Reflect.get(host, method)));

    mocked.forEach((method) =>
      Object.defineProperty(storage, method, {
        value: Reflect.get(prototype, method),
        writable: true,
        configurable: true,
      }),
    );

    if (mocked.length > 0) {
      repaired.push(key);
    }
  }

  return repaired;
}

/**
 * `Storage.prototype`, or nothing where the environment declares no `Storage`.
 *
 * Read off `globalThis` with `Reflect`, not referenced directly, because `setupAutoSpy()` calls the
 * repair whatever environment a project runs in and a `node` one has neither the storages nor the
 * class. With no prototype there is nothing to write the methods back from, so the repair reports
 * nothing rather than invent values.
 */
function storagePrototype(): object | null {
  const Storage = Reflect.get(globalThis, 'Storage');

  if (typeof Storage !== 'function') {
    return null;
  }

  return Object(Reflect.get(Storage, 'prototype'));
}
