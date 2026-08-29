/**
 * The patch is exercised against a **fake** `Zone`, deliberately: this suite is zoneless and must
 * stay that way, and every property worth asserting here — that the wrapper declares no parameters,
 * reports the original source, keeps the original arity, and that `it.each(table)(…)` still reaches
 * the collector with its receiver — is about the wrapper, not about zone.js. A real `zone.js` +
 * `fakeAsync` run lives in its own project (`npm run test:zone`), where a real zone is loaded.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockValueProp, restoreMockedProps } from './prop-mock';
import { installProxyZonePatch } from './proxy-zone';

/** A stand-in for `Zone`, recording that the callback really ran through `fork(...).run(...)`. */
function fakeZone(): { install: () => void; forks: number } {
  const state = { forks: 0, install: (): void => undefined };

  state.install = (): void => {
    const key: PropertyKey = 'Zone';

    // A *class*, as zone.js publishes it: `Zone` is a function, and a patch that only accepts an
    // object rejects a perfectly loaded zone.js.
    mockValueProp(
      globalThis,
      key,
      Object.assign(function ZoneStub(): void {}, {
        ProxyZoneSpec: class {},
        current: {
          fork: (): unknown => {
            state.forks += 1;

            return { run: (callback: (...args: unknown[]) => unknown, thisArg: unknown, args: unknown[]) => callback.apply(thisArg, args) };
          },
        },
      }),
    );
  };

  return state;
}

/** Install fake runner globals, so the real `it` / `beforeEach` of this run are never replaced. */
function fakeGlobals(): { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const collector = {
    it(...args: unknown[]): unknown {
      calls.push(args);

      return undefined;
    },
  };

  const definer = (...args: unknown[]): unknown => collector.it(...args);

  // `each` reads `this`, which is the member that breaks first when a patch copies instead of proxying.
  Object.assign(definer, {
    each(this: typeof definer, table: unknown[]) {
      return (name: string, body: (...args: unknown[]) => unknown): unknown => this(name, body, table);
    },
    skip: (...args: unknown[]): unknown => collector.it(...args),
    concurrent: true,
  });

  const itKey: PropertyKey = 'it';
  const beforeEachKey: PropertyKey = 'beforeEach';

  mockValueProp(globalThis, itKey, definer);
  mockValueProp(globalThis, beforeEachKey, definer);

  return { calls };
}

/** Run every test body the fake collector has recorded so far, and forget them. */
function runRecorded(globals: { calls: unknown[][] }): void {
  for (const call of globals.calls.splice(0)) {
    const wrapped = call[1];

    if (typeof wrapped === 'function') {
      wrapped();
    }
  }
}

describe('installProxyZonePatch', () => {
  afterEach(restoreMockedProps);

  it('says what is missing when zone.js was never loaded', () => {
    const key: PropertyKey = 'Zone';
    mockValueProp(globalThis, key, undefined);

    expect(() => installProxyZonePatch()).toThrow(/globalThis.Zone is not there/);
  });

  it('says which half is missing when only zone.js/testing was skipped', () => {
    const key: PropertyKey = 'Zone';
    mockValueProp(globalThis, key, { current: {} });

    expect(() => installProxyZonePatch()).toThrow(/Zone.ProxyZoneSpec is not/);
  });

  it('says so when the runner globals are not there to wrap', () => {
    fakeZone().install();
    ['it', 'test', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'].forEach((name) => {
      const key: PropertyKey = name;
      mockValueProp(globalThis, key, undefined);
    });

    expect(() => installProxyZonePatch()).toThrow(/needs `test: \{ globals: true \}`/);
  });

  it('runs a test body inside a forked proxy zone, and puts the globals back', () => {
    const zone = fakeZone();
    zone.install();

    const globals = fakeGlobals();
    const undo = installProxyZonePatch();
    const body = vi.fn();
    const patchedIt: (...args: unknown[]) => unknown = Reflect.get(globalThis, 'it');

    patchedIt('runs', body);

    const wrapped = globals.calls[0]?.[1];

    expect(typeof wrapped).toBe('function');

    if (typeof wrapped === 'function') {
      wrapped();
    }

    expect(zone.forks).toBe(1);
    expect(body).toHaveBeenCalledTimes(1);

    undo();

    expect(Reflect.get(globalThis, 'it')).toBe(Reflect.get(globalThis, 'beforeEach'));
  });

  it('forks a proxy zone per callback when asked to, instead of sharing one', () => {
    const zone = fakeZone();
    zone.install();

    const globals = fakeGlobals();
    const undo = installProxyZonePatch({ scope: 'callback' });
    const patchedIt: (...args: unknown[]) => unknown = Reflect.get(globalThis, 'it');

    patchedIt('first', vi.fn());
    patchedIt('second', vi.fn());

    for (const call of globals.calls) {
      const wrapped = call[1];

      if (typeof wrapped === 'function') {
        wrapped();
      }
    }

    // The whole of the difference between the two scopes: `'shared'` memoises one fork for the run,
    // `'callback'` does not. Counting forks is the only observable that separates them, and it is what
    // `test.concurrent` depends on — two callbacks in flight must not swap one `ProxyZoneSpec` delegate
    // under one another.
    expect(zone.forks).toBe(2);

    undo();
  });

  it('keeps the callback’s arity and source, which is how the runner finds its fixtures', () => {
    fakeZone().install();

    const globals = fakeGlobals();
    const undo = installProxyZonePatch();
    const patchedIt: (...args: unknown[]) => unknown = Reflect.get(globalThis, 'it');
    const body = ({ task }: { task: unknown }): unknown => task;

    patchedIt('uses a fixture', body);

    const wrapped = globals.calls[0]?.[1];

    expect(typeof wrapped === 'function' && wrapped.length).toBe(1);
    expect(String(wrapped)).toBe(String(body));

    undo();
  });

  it('keeps it.each working, receiver and all', () => {
    const zone = fakeZone();
    zone.install();

    const globals = fakeGlobals();
    const undo = installProxyZonePatch();
    const patchedIt: { each(table: unknown[]): (name: string, body: () => void) => unknown } = Reflect.get(globalThis, 'it');
    const body = vi.fn();

    // Detached from its receiver this returns `undefined` and the next line explodes — the failure
    // that took 41 files with it when the patch was written by hand.
    patchedIt.each([1, 2])('case %s', body);

    const wrapped = globals.calls[0]?.[1];

    if (typeof wrapped === 'function') {
      wrapped();
    }

    expect(body).toHaveBeenCalledTimes(1);
    expect(zone.forks).toBe(1);

    undo();
  });

  it('hands back the same view of a member every time, so identity survives', () => {
    fakeZone().install();
    fakeGlobals();

    const undo = installProxyZonePatch();
    const patchedIt: { each: unknown; skip: unknown } = Reflect.get(globalThis, 'it');

    // A fresh Proxy per property read makes `it.skip !== it.skip`, and every comparison by identity
    // or `WeakMap` keyed by a member of the runner API quietly changes meaning under the patch.
    expect(patchedIt.skip).toBe(patchedIt.skip);
    expect(patchedIt.each).toBe(patchedIt.each);

    undo();
  });

  it('drops its cached views with the shared fork, so the next installation gets its own scope', () => {
    const zone = fakeZone();
    zone.install();

    // One and the same `it` is patched twice here — which is exactly what a cache keyed by the
    // target would hand back, scope and all, if the undo did not empty it.
    const globals = fakeGlobals();
    const undoShared = installProxyZonePatch();
    const sharedIt: (...args: unknown[]) => unknown = Reflect.get(globalThis, 'it');

    sharedIt('first', vi.fn());
    runRecorded(globals);
    undoShared();

    const undoPerCallback = installProxyZonePatch({ scope: 'callback' });
    const perCallbackIt: (...args: unknown[]) => unknown = Reflect.get(globalThis, 'it');

    perCallbackIt('second', vi.fn());
    perCallbackIt('third', vi.fn());
    runRecorded(globals);

    // One fork for the shared installation and one per callback for the second: a view left over
    // from the first would still be sharing a single zone, and this would be 2.
    expect(zone.forks).toBe(3);

    undoPerCallback();
  });

  it('passes a non-callable member through untouched', () => {
    fakeZone().install();
    fakeGlobals();

    const undo = installProxyZonePatch();
    const patchedIt: { concurrent: unknown } = Reflect.get(globalThis, 'it');

    expect(patchedIt.concurrent).toBe(true);

    undo();
  });
});
