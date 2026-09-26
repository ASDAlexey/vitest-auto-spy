/**
 * The detection is driven directly rather than through the hooks: a guard installed as an
 * `afterEach` fails the very test it would be asserting about. The watched object is a throwaway
 * here for the same reason the guard exists — a non-configurable property put on the real
 * `document` could not be taken off again, and this suite runs with `isolate: false` too.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type GlobalSnapshot,
  checkSealedAdditions,
  createGlobalPatchWatch,
  guardGlobalPatches,
  snapshotWatchedGlobals,
} from './global-patch-guard';
import { mockValueProp } from './prop-mock';

const SEALED = 'cookie';

/** A stand-in for `document`, snapshotted while still empty. */
function watchedObject(): GlobalSnapshot {
  const object = {};

  return { name: 'document', object, names: new Set(Reflect.ownKeys(object)) };
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

    expect(message).toContain(
      '[vitest-auto-spy] "guardGlobalPatches > names the file, the object and the property that can no longer be restored" ' +
        '(src/lib/global-patch-guard.spec.ts) redefined document.cookie as non-configurable ' +
        '(Object.defineProperty defaults configurable to false), so no later file can put it back.\n' +
        "Patch it with mockValueProp(document, 'cookie', value) instead: it records what it replaced and undoes it after the test.\n" +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_7-naming-the-file-that-sealed-a-global',
    );
  });

  it('picks the helper that fits a getter, and one that fits a getter with a setter', () => {
    const snapshot = watchedObject();

    Object.defineProperty(snapshot.object, 'cookie', { get: () => 'a=1' });
    Object.defineProperty(snapshot.object, 'title', { get: () => 'x', set: () => undefined });

    expect(() => checkSealedAdditions([snapshot], 'throw')).toThrow(
      "Patch it with mockReadonlyPropGetter(document, 'cookie', () => value), mockAccessorsProp(document, 'title', { get, set }) instead",
    );
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
    const snapshot: GlobalSnapshot = { name: 'document', object, names: new Set(Reflect.ownKeys(object)) };

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

  it('watches the DOM prototypes a Jest-era stub is written against', () => {
    const watched = snapshotWatchedGlobals().map((snapshot) => snapshot.name);

    // `Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn() })` is the
    // patch this list exists for: jsdom implements no such member, so it is a new non-configurable
    // property, and the next file's `mockValueProp` fails on it with nothing naming the writer.
    expect(watched).toContain('HTMLElement.prototype');
    expect(watched).toContain('HTMLCanvasElement.prototype');
    expect(watched).toContain('Element.prototype');
  });

  it('sees a symbol key as well as a name', () => {
    const snapshot = watchedObject();
    const key = Symbol('sealedBySymbol');

    Object.defineProperty(snapshot.object, key, { value: 1 });

    expect(() => checkSealedAdditions([snapshot], 'throw')).toThrow(/redefined document\.Symbol\(sealedBySymbol\)/);
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

describe('createGlobalPatchWatch', () => {
  const { defineProperty, defineProperties } = Object;
  const reflectDefine = Reflect.defineProperty;

  /** A watch over one throwaway object, standing in for `document`. */
  function watchOver(target: object): ReturnType<typeof createGlobalPatchWatch> {
    return createGlobalPatchWatch('throw', () => [{ name: 'document', object: target }]);
  }

  afterEach(() => {
    Object.defineProperty = defineProperty;
    Object.defineProperties = defineProperties;
    Reflect.defineProperty = reflectDefine;
  });

  it('checks, per test, only an object a sealing definition reached', () => {
    const target = {};
    const watch = watchOver(target);

    watch.openFile();
    Object.defineProperty(target, SEALED, { value: 'a=1' });

    expect(() => watch.checkTest()).toThrow(/"createGlobalPatchWatch > checks, per test, .*" \(.*\) redefined document\.cookie/);
    expect(() => watch.checkTest()).not.toThrow();
    watch.closeFile();
  });

  it('leaves the object untouched for a definition that can be undone, and for an object nobody watches', () => {
    const target = {};
    const watch = watchOver(target);

    watch.openFile();
    Object.defineProperty(target, SEALED, { value: 'a=1', configurable: true });
    Object.defineProperty({}, SEALED, { value: 'a=1' });
    Reflect.defineProperty({}, SEALED, { value: 'a=1' });

    expect(() => watch.checkTest()).not.toThrow();
    watch.closeFile();
  });

  it('sees Object.defineProperties and Reflect.defineProperty as well', () => {
    const target = {};
    const other = {};
    const watch = createGlobalPatchWatch('throw', () => [
      { name: 'document', object: target },
      { name: 'navigator', object: other },
    ]);

    watch.openFile();
    Object.defineProperties(target, { cookie: { value: 'a=1' } });

    expect(() => watch.checkTest()).toThrow(/redefined document\.cookie/);

    expect(Reflect.defineProperty(other, 'userAgent', { value: 'x' })).toBe(true);

    expect(() => watch.checkTest()).toThrow(/redefined navigator\.userAgent/);
    watch.closeFile();
  });

  it('notes nothing for a Reflect.defineProperty the object refused', () => {
    const target = Object.preventExtensions({});
    const watch = watchOver(target);

    watch.openFile();

    expect(Reflect.defineProperty(target, SEALED, { value: 'a=1' })).toBe(false);
    expect(() => watch.checkTest()).not.toThrow();
    watch.closeFile();
  });

  it('leaves a definition that went around the definers to the file-end pass', () => {
    const target = {};
    const watch = watchOver(target);

    watch.openFile();
    // Captured before the guard armed, the way a bundled module keeps its own `defineProperty`.
    defineProperty(target, SEALED, { value: 'a=1' });

    expect(() => watch.checkTest()).not.toThrow();
    expect(() => watch.closeFile()).toThrow(/redefined document\.cookie/);
  });

  it('puts the originals back at the file end, and a wrapper kept past it notes nothing', () => {
    const target = {};
    const watch = watchOver(target);

    watch.openFile();
    const kept = Object.defineProperty;

    expect(kept).not.toBe(defineProperty);
    expect(kept.name).toBe('defineProperty');
    expect(kept.length).toBe(3);

    watch.closeFile();

    expect(Object.defineProperty).toBe(defineProperty);
    expect(Object.defineProperties).toBe(defineProperties);
    expect(Reflect.defineProperty).toBe(reflectDefine);

    kept(target, SEALED, { value: 'a=1' });

    expect(() => watch.checkTest()).not.toThrow();
  });

  it('arms once per file, and keeps a definer someone else installed on top of it', () => {
    const watch = watchOver({});
    const other = (): void => undefined;

    watch.openFile();
    watch.openFile();
    Reflect.set(Object, 'defineProperty', other);
    watch.closeFile();

    expect(Reflect.get(Object, 'defineProperty')).toBe(other);
    expect(Object.defineProperties).toBe(defineProperties);
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
