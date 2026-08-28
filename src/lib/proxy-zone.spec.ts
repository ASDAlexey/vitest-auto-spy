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
    concurrent: true,
  });

  const itKey: PropertyKey = 'it';
  const beforeEachKey: PropertyKey = 'beforeEach';

  mockValueProp(globalThis, itKey, definer);
  mockValueProp(globalThis, beforeEachKey, definer);

  return { calls };
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

  it('passes a non-callable member through untouched', () => {
    fakeZone().install();
    fakeGlobals();

    const undo = installProxyZonePatch();
    const patchedIt: { concurrent: unknown } = Reflect.get(globalThis, 'it');

    expect(patchedIt.concurrent).toBe(true);

    undo();
  });
});
