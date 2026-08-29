/**
 * The handler slot is the only observable part of this feature, so the stand-in below is a
 * miniature of zone.js: a `Zone` *class* carrying `__symbol__`, and a `fire` that does what
 * `handleUnhandledRejection` does after its `console.error` — call whatever sits in the slot with
 * zone's own wrapper object.
 *
 * Nothing here loads zone.js, deliberately. This repository's main suite is zoneless, which is what
 * the module under test has to cope with anyway: it reads a global it never imports.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockValueProp } from './prop-mock';
import { type RejectionHost, type ZoneStatic, countStrayRejections, flushStrayRejections, trackStrayRejections } from './stray-rejections';

const HANDLER_SLOT = 'unhandledPromiseRejectionHandler';

/** zone.js publishes `Zone` as a class, so the stub is a function too — an object would be too easy. */
function createZone(): ZoneStatic {
  return Object.assign(() => undefined, { __symbol__: (name: string): string => `__zone_symbol__${name}` });
}

function createHost(): { host: RejectionHost; zone: ZoneStatic } {
  const zone = createZone();

  return { host: { Promise, Zone: zone }, zone };
}

/** Zone's own wrapper around the rejection, as the handler receives it. */
function wrap(rejection: unknown): object {
  return { rejection, zone: { name: 'ProxyZone' }, task: { source: 'Promise.then' } };
}

/** Call the claimed handler. Left unguarded: a slot with nothing in it should fail the test loudly. */
function fire(zone: ZoneStatic, error: unknown): void {
  const handler = Reflect.get(zone, zone.__symbol__(HANDLER_SLOT));

  handler(error);
}

describe('stray rejections', () => {
  const stops: (() => void)[] = [];

  const track = (host: RejectionHost): (() => void) => {
    const stop = trackStrayRejections(host);
    stops.push(stop);

    return stop;
  };

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
  });

  it("captures the reason out of zone's wrapper, with the test it surfaced in", () => {
    const { host, zone } = createHost();
    const reason = new Error('nobody awaited me');

    track(host);
    fire(zone, wrap(reason));

    expect(countStrayRejections(host)).toBe(1);
    expect(flushStrayRejections(host)).toEqual([{ reason, assertion: false, testName: expect.getState().currentTestName }]);
  });

  it('takes zone at its word when it hands over the bare reason instead', () => {
    const { host, zone } = createHost();

    track(host);
    fire(zone, 'rejected with a string');

    expect(flushStrayRejections(host)[0]?.reason).toBe('rejected with a string');
  });

  it('flags a failed matcher, so the report can say the assertion never got to fail its test', () => {
    const { host, zone } = createHost();
    const matcherFailure = Object.assign(new Error('expected 1 to be 2'), { matcherResult: { pass: false } });
    const chaiFailure = Object.assign(new Error('expected true to be false'), { name: 'AssertionError' });

    track(host);
    fire(zone, wrap(matcherFailure));
    fire(zone, wrap(chaiFailure));
    fire(zone, wrap(new TypeError('Cannot read properties of undefined')));

    expect(flushStrayRejections(host).map((rejection) => rejection.assertion)).toEqual([true, true, false]);
  });

  it('records no test name for a rejection that surfaced between tests', () => {
    const { host, zone } = createHost();
    // `PropertyKey` rather than the literal, to reach the escape-hatch overload: `getState` is a
    // real member of `expect`, and the typed overload would demand its full state object back.
    const stateKey: PropertyKey = 'getState';

    track(host);

    const restore = mockValueProp(expect, stateKey, () => ({}));

    fire(zone, wrap(new Error('surfaced after the file was over')));
    // Restored before asserting: a matcher whose runner state is a stub fails for reasons of its own.
    restore();

    expect(flushStrayRejections(host)[0]?.testName).toBe('');
  });

  it('chains to the handler zone.js installed for itself', () => {
    const { host, zone } = createHost();
    const previous = vi.fn();
    const wrapper = wrap(new Error('forwarded to the window listener'));

    Reflect.set(zone, zone.__symbol__(HANDLER_SLOT), previous);
    track(host);
    fire(zone, wrapper);

    expect(previous).toHaveBeenCalledWith(wrapper);
    expect(countStrayRejections(host)).toBe(1);
  });

  it('is idempotent — a second call returns the first stop and chains nothing onto it', () => {
    const { host, zone } = createHost();
    const stop = track(host);
    const claimed: unknown = Reflect.get(zone, zone.__symbol__(HANDLER_SLOT));

    expect(trackStrayRejections(host)).toBe(stop);
    expect(Reflect.get(zone, zone.__symbol__(HANDLER_SLOT))).toBe(claimed);
  });

  it('puts the previous handler back, and takes the slot away again when there was none', () => {
    const { host, zone } = createHost();
    const slot = zone.__symbol__(HANDLER_SLOT);

    trackStrayRejections(host)();

    expect(Reflect.has(zone, slot)).toBe(false);

    const previous = vi.fn();

    Reflect.set(zone, slot, previous);
    trackStrayRejections(host)();

    expect(Reflect.get(zone, slot)).toBe(previous);
    expect(() => countStrayRejections(host)).toThrow(/needs trackStrayRejections\(\) to have run first/);
  });

  it('hands over what was captured and starts again from empty', () => {
    const { host, zone } = createHost();

    track(host);
    fire(zone, wrap(new Error('first and only')));

    expect(flushStrayRejections(host)).toHaveLength(1);
    expect(flushStrayRejections(host)).toEqual([]);
    expect(countStrayRejections(host)).toBe(0);
  });

  it('flushing an untracked host is a no-op rather than an error', () => {
    expect(flushStrayRejections(createHost().host)).toEqual([]);
  });

  it('counting an untracked host says what is missing', () => {
    expect(() => countStrayRejections(createHost().host)).toThrow(/needs trackStrayRejections\(\) to have run first/);
  });

  it('refuses a host with no zone.js, and says why that is better than doing nothing', () => {
    expect(() => trackStrayRejections({ Promise })).toThrow(/found no zone\.js on the host[\s\S]*Vitest already reports/);
  });

  it('refuses a global that merely happens to be called Zone', () => {
    const impostor = (): undefined => undefined;

    expect(() => trackStrayRejections({ Promise, Zone: impostor as unknown as ZoneStatic })).toThrow(/found no zone\.js on the host/);
  });

  it('defaults to the real globals', () => {
    // This suite is zoneless, so the global the module reaches for has to be put there first.
    const zone = createZone();
    const restore = mockValueProp(globalThis, 'Zone', zone);
    const stop = trackStrayRejections();

    try {
      fire(zone, wrap(new Error('on the real globals')));

      expect(countStrayRejections()).toBe(1);
    } finally {
      stop();
      restore();
    }

    expect(() => countStrayRejections()).toThrow();
  });
});
