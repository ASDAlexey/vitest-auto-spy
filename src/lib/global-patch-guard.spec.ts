/**
 * The detection is driven directly rather than through the hooks: a guard installed as an
 * `afterEach` fails the very test it would be asserting about. The watched object is a throwaway
 * here for the same reason the guard exists — a non-configurable property put on the real
 * `document` could not be taken off again, and this suite runs with `isolate: false` too.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type GlobalSnapshot, checkSealedAdditions, guardGlobalPatches, snapshotWatchedGlobals } from './global-patch-guard';
import { mockValueProp } from './prop-mock';

const SEALED = 'cookie';

/** A stand-in for `document`, snapshotted while still empty. */
function watchedObject(): GlobalSnapshot {
  const object = {};

  return { name: 'document', object, names: new Set(Object.getOwnPropertyNames(object)) };
}

describe('guardGlobalPatches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the file, the object and the property that can no longer be restored', () => {
    const snapshot = watchedObject();

    // Exactly the Jest-era patch the guard exists for: `configurable` left at its `false` default.
    Object.defineProperty(snapshot.object, SEALED, { value: 'a=1', writable: true });

    // One check, three assertions about its message: the check advances the snapshot to what the
    // test left behind, so asking it again is asking about a property that is no longer new.
    let message = '';

    try {
      checkSealedAdditions([snapshot], 'throw');
    } catch (error) {
      message = String(error);
    }

    expect(message).toMatch(/redefined document\.cookie as a non-configurable own property/);
    expect(message).toMatch(/mockValueProp\(document, 'cookie', value\)/);
    expect(message).toMatch(/global-patch-guard\.spec\.ts/);
  });

  it('blames the test that made the patch, not every test after it', () => {
    const snapshot = watchedObject();

    Object.defineProperty(snapshot.object, SEALED, { value: 'a=1' });

    expect(() => checkSealedAdditions([snapshot], 'throw')).toThrow(/redefined document\.cookie/);
    // The leftover is now part of the baseline: the next test inherited it and did not make it.
    expect(() => checkSealedAdditions([snapshot], 'throw')).not.toThrow();
  });

  it('has nothing to report about a property added and taken off again within one test', () => {
    const snapshot = watchedObject();

    Object.defineProperty(snapshot.object, SEALED, { value: 'a=1', configurable: true });
    Reflect.deleteProperty(snapshot.object, SEALED);

    expect(() => checkSealedAdditions([snapshot], 'throw')).not.toThrow();
    expect(snapshot.names.size).toBe(0);
  });

  it('follows a deletion, so the baseline keeps describing what is actually there', () => {
    const object: Record<string, unknown> = { legacy: 1 };
    const snapshot: GlobalSnapshot = { name: 'document', object, names: new Set(Object.getOwnPropertyNames(object)) };

    // One name gone and another arrived: the counts alone cannot tell that apart from "nothing
    // happened", which is the case the baseline has to be rebuilt for.
    Reflect.deleteProperty(object, 'legacy');
    Object.defineProperty(object, SEALED, { value: 'a=1', configurable: true });

    expect(() => checkSealedAdditions([snapshot], 'throw')).not.toThrow();
    expect([...snapshot.names]).toEqual([SEALED]);
  });

  it('reports without failing the run when asked to warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const snapshot = watchedObject();

    Object.defineProperty(snapshot.object, SEALED, { value: 'a=1' });
    checkSealedAdditions([snapshot], 'warn');

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('ignores a property that can be put back', () => {
    const snapshot = watchedObject();

    Object.defineProperty(snapshot.object, SEALED, { value: 'a=1', configurable: true });

    expect(() => checkSealedAdditions([snapshot], 'throw')).not.toThrow();
  });

  it('watches only the objects the environment actually has', () => {
    const watched = snapshotWatchedGlobals().map((snapshot) => snapshot.name);

    // jsdom has all three; a Node environment has one, and the guard must not look for the others.
    expect(watched).toContain('globalThis');
    expect(watched).toContain('document');
  });

  it('says "this file" when the runner reports no path', () => {
    const snapshot = watchedObject();

    Object.defineProperty(snapshot.object, SEALED, { value: 'a=1' });

    // Restored before the assertion: a matcher that cannot read the runner state fails for reasons
    // of its own, which would say nothing about the message being checked here.
    const key: PropertyKey = 'getState';
    const restore = mockValueProp(expect, key, () => ({}));
    let message = '';

    try {
      checkSealedAdditions([snapshot], 'throw');
    } catch (error) {
      message = String(error);
    }

    restore();

    expect(message).toContain('this file redefined document.cookie');
  });

  it('skips an object this environment does not have', () => {
    // The Node / Bun case: the setup entry loads the guard whatever environment a project runs in,
    // and looking `document` up on a runtime without one must not be an error.
    expect(snapshotWatchedGlobals([{ name: 'document', object: undefined }])).toEqual([]);
  });

  it('registers nothing when it is off', () => {
    expect(() => guardGlobalPatches('off')).not.toThrow();
  });
});

describe('guardGlobalPatches, wired into the run', () => {
  const LEFTOVER = '__vitestAutoSpyGuardProbe__';

  guardGlobalPatches('warn');

  it('lets a test that patches nothing through', () => {
    expect(snapshotWatchedGlobals().length).toBeGreaterThan(0);

    // Restorable, so the guard has nothing to say about it — and it is here for the next test, which
    // takes it off again: together the two exercise both ways the baseline follows a file.
    Object.defineProperty(globalThis, LEFTOVER, { value: 1, configurable: true });
  });

  it('carries the baseline from the previous test of the same file', () => {
    Reflect.deleteProperty(globalThis, LEFTOVER);

    expect(Reflect.has(globalThis, LEFTOVER)).toBe(false);
  });
});
