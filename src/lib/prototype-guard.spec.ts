/**
 * The detection is driven directly rather than through the hooks: a guard installed as an
 * `afterEach` fails the very test it would be asserting about. The watched object is a throwaway
 * for a second reason — a key on the real `Object.prototype` is exactly what stops a worker from
 * collecting, and a suite proving that must not be the one that causes it.
 */
import { describe, expect, it, vi } from 'vitest';

import { mockValueProp } from './prop-mock';
import { type PrototypeSnapshot, checkPrototypePollution, guardPrototypePollution, snapshotPrototypes } from './prototype-guard';

const LEAKED = 'ngOnDestroy';

/** A stand-in for `Object.prototype`, snapshotted while still clean. */
function watchedPrototype(): PrototypeSnapshot {
  const object = {};

  return { name: 'Object.prototype', object, keys: new Set(Object.keys(object)) };
}

describe('guardPrototypePollution', () => {
  it('names the file, the prototype and the key that broke collection', () => {
    const snapshot = watchedPrototype();

    // Exactly the accidental write the guard exists for: patching what `getPrototypeOf` handed back
    // when the instance was a plain object.
    Object.assign(snapshot.object, { [LEAKED]: () => undefined });

    let message = '';

    try {
      checkPrototypePollution([snapshot], 'throw');
    } catch (error) {
      message = String(error);
    }

    expect(message).toMatch(/left "ngOnDestroy" on Object\.prototype as an own enumerable property/);
    expect(message).toMatch(/fails to collect/);
    expect(message).toMatch(/prototype-guard\.spec\.ts/);
  });

  it('takes the key back off, so the rest of the worker still collects', () => {
    const snapshot = watchedPrototype();

    Object.assign(snapshot.object, { [LEAKED]: () => undefined });

    expect(() => checkPrototypePollution([snapshot], 'throw')).toThrow();
    expect(Object.keys(snapshot.object)).toEqual([]);
  });

  it('blames the test that made the write, not every test after it', () => {
    const snapshot = watchedPrototype();

    Object.assign(snapshot.object, { [LEAKED]: () => undefined });

    expect(() => checkPrototypePollution([snapshot], 'throw')).toThrow(/ngOnDestroy/);
    // The key is gone rather than inherited, so the next test starts from a clean prototype.
    expect(() => checkPrototypePollution([snapshot], 'throw')).not.toThrow();
  });

  it('reports a key it could not remove exactly once', () => {
    const snapshot = watchedPrototype();

    // Non-configurable, so `delete` fails: the leftover has to join the baseline instead, or every
    // test after this one would report it again and bury the file that is to blame.
    Object.defineProperty(snapshot.object, LEAKED, { value: () => undefined, enumerable: true });

    expect(() => checkPrototypePollution([snapshot], 'throw')).toThrow(/ngOnDestroy/);
    expect(() => checkPrototypePollution([snapshot], 'throw')).not.toThrow();
  });

  it('ignores what the environment already carried', () => {
    const object = { legacy: 1 };
    const snapshot: PrototypeSnapshot = { name: 'Object.prototype', object, keys: new Set(Object.keys(object)) };

    // A polyfill that ships an enumerable prototype member is a project's own business; removing it
    // would break every test after the first far more loudly than the leak this module is about.
    expect(() => checkPrototypePollution([snapshot], 'throw')).not.toThrow();
    expect(object.legacy).toBe(1);
  });

  it('says nothing about a non-enumerable addition', () => {
    const snapshot = watchedPrototype();

    // `for…in` never sees it, so the runner keeps working and this is not the guard's business.
    Object.defineProperty(snapshot.object, LEAKED, { value: () => undefined, configurable: true });

    expect(() => checkPrototypePollution([snapshot], 'throw')).not.toThrow();
  });

  it('reports without failing the run when asked to warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const snapshot = watchedPrototype();

    Object.assign(snapshot.object, { [LEAKED]: () => undefined });
    checkPrototypePollution([snapshot], 'warn');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(Object.keys(snapshot.object)).toEqual([]);

    warn.mockRestore();
  });

  it('says "this file" when the runner reports no path', () => {
    const snapshot = watchedPrototype();

    Object.assign(snapshot.object, { [LEAKED]: () => undefined });

    const key: PropertyKey = 'getState';
    const restore = mockValueProp(expect, key, () => ({}));
    let message = '';

    try {
      checkPrototypePollution([snapshot], 'throw');
    } catch (error) {
      message = String(error);
    }

    restore();

    expect(message).toContain('this file left "ngOnDestroy" on Object.prototype');
  });

  it('watches the three prototypes ordinary code walks', () => {
    const watched = snapshotPrototypes().map((snapshot) => snapshot.name);

    expect(watched).toEqual(['Object.prototype', 'Array.prototype', 'Function.prototype']);
  });

  it('starts from a clean realm', () => {
    // The assertion the whole module rests on: nothing in this environment enumerates on the
    // prototypes it watches, so an addition is always somebody's bug.
    expect(snapshotPrototypes().flatMap((snapshot) => [...snapshot.keys])).toEqual([]);
  });

  it('registers nothing when it is off', () => {
    expect(() => guardPrototypePollution('off')).not.toThrow();
  });
});

describe('guardPrototypePollution, wired into the run', () => {
  guardPrototypePollution('warn');

  it('lets a test that writes nothing through', () => {
    expect(Object.keys(Object.prototype)).toEqual([]);
  });

  it('sweeps a real leak before the next test sees it', () => {
    // The spy outlives the test on purpose: the guard reports from an `afterEach`, so restoring
    // here would send its warning to the real console instead of to the assertion below.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    Object.assign(Object.prototype, { [LEAKED]: () => undefined });
  });

  it('starts from a prototype the previous test left clean', () => {
    expect(Object.keys(Object.prototype)).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(1);

    vi.mocked(console.warn).mockRestore();
  });
});
