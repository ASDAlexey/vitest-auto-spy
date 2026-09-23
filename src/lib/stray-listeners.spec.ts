import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type TrackedListenerTarget,
  baselineStrayListeners,
  countStrayListeners,
  describeStrayListeners,
  removeStrayListeners,
  trackStrayListeners,
} from './stray-listeners';

/** A stand-in target: real `EventTarget` semantics — registration, removal, dispatch — under a name. */
function namedTarget(name: string): TrackedListenerTarget {
  return { name, target: new EventTarget() };
}

describe('stray listeners', () => {
  const stops: (() => void)[] = [];

  const track = (named: TrackedListenerTarget): (() => void) => {
    const stop = trackStrayListeners([named]);
    stops.push(stop);

    return stop;
  };

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
  });

  it('takes off what the file registered after the baseline, and the listener no longer fires', () => {
    const named = namedTarget('stand-in');
    const heard = vi.fn();

    track(named);
    baselineStrayListeners([named]);
    named.target.addEventListener('ping', heard);

    named.target.dispatchEvent(new Event('ping'));

    expect(heard).toHaveBeenCalledTimes(1);
    expect(countStrayListeners([named])).toBe(1);
    expect(removeStrayListeners([named])).toBe(1);
    expect(countStrayListeners([named])).toBe(0);

    named.target.dispatchEvent(new Event('ping'));

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('keeps what the baseline found — a registration from the module graph survives the sweep', () => {
    const named = namedTarget('stand-in');
    const framework = vi.fn();
    const own = vi.fn();

    track(named);
    named.target.addEventListener('framework-event', framework);
    baselineStrayListeners([named]);
    named.target.addEventListener('file-event', own);

    expect(removeStrayListeners([named])).toBe(1);
    expect(describeStrayListeners([named])).toEqual([]);

    named.target.dispatchEvent(new Event('framework-event'));

    expect(framework).toHaveBeenCalledTimes(1);
    expect(own).not.toHaveBeenCalled();
  });

  it('hands the registration to the real method with every argument, this and return value intact', () => {
    const target = new EventTarget();
    const received: { self: unknown; args: unknown[] }[] = [];

    target.addEventListener = function recordCall(this: unknown, ...args: unknown[]): unknown {
      received.push({ self: this, args });

      return 'handle';
    };

    const named: TrackedListenerTarget = { name: 'recording host', target };
    const heard = vi.fn();
    const options = { capture: true, passive: true };

    track(named);

    expect(named.target.addEventListener('resize', heard, options)).toBe('handle');
    expect(received).toEqual([{ self: target, args: ['resize', heard, options] }]);
  });

  it('does not wrap a target twice, and either undo puts the originals back', () => {
    const named = namedTarget('stand-in');
    const originalAdd = named.target.addEventListener;
    const originalRemove = named.target.removeEventListener;

    track(named);
    const wrapped = named.target.addEventListener;

    const second = trackStrayListeners([named]);

    expect(named.target.addEventListener).toBe(wrapped);

    second();

    expect(named.target.addEventListener).toBe(originalAdd);
    expect(named.target.removeEventListener).toBe(originalRemove);

    named.target.addEventListener('after the undo', () => undefined);

    expect(() => countStrayListeners([named])).toThrow(/needs trackStrayListeners\(\) to have run first/);
  });

  it('forgets a listener the code under test took off itself', () => {
    const named = namedTarget('stand-in');
    const heard = vi.fn();

    track(named);
    baselineStrayListeners([named]);
    named.target.addEventListener('resize', heard);
    named.target.removeEventListener('resize', heard);

    expect(countStrayListeners([named])).toBe(0);
  });

  it('keeps a capture-phase entry when the removal leaves the flag out, and drops it when it matches', () => {
    const named = namedTarget('stand-in');
    const heard = vi.fn();

    track(named);
    baselineStrayListeners([named]);
    named.target.addEventListener('keydown', heard, { capture: true });
    named.target.removeEventListener('keydown', heard);

    expect(countStrayListeners([named])).toBe(1);
    expect(describeStrayListeners([named])).toHaveLength(1);

    named.target.removeEventListener('keydown', heard, { capture: true });

    expect(countStrayListeners([named])).toBe(0);
  });

  it('records a repeat registration once, the way the platform ignores it', () => {
    const named = namedTarget('stand-in');
    const heard = vi.fn();

    track(named);
    baselineStrayListeners([named]);
    named.target.addEventListener('scroll', heard);
    named.target.addEventListener('scroll', heard);

    named.target.dispatchEvent(new Event('scroll'));

    expect(heard).toHaveBeenCalledTimes(1);
    expect(countStrayListeners([named])).toBe(1);

    const other = vi.fn();

    named.target.addEventListener('scroll', other);

    expect(countStrayListeners([named])).toBe(2);

    named.target.removeEventListener('scroll', heard);

    expect(countStrayListeners([named])).toBe(1);

    named.target.addEventListener('scroll', heard, true);

    expect(countStrayListeners([named])).toBe(2);
    expect(removeStrayListeners([named])).toBe(2);
    expect(countStrayListeners([named])).toBe(0);
  });

  it('reads the capture flag the way the platform normalises options', () => {
    const named = namedTarget('stand-in');
    const heard = vi.fn();

    track(named);
    baselineStrayListeners([named]);
    named.target.addEventListener('boolean-true', heard, true);
    named.target.addEventListener('boolean-false', heard, false);
    named.target.addEventListener('object-empty', heard, {});
    named.target.addEventListener('object-capture', heard, { capture: true });
    Reflect.apply(named.target.addEventListener, named.target, ['null-options', heard, null]);
    named.target.addEventListener('absent-options', heard);

    expect(countStrayListeners([named])).toBe(6);
    expect(removeStrayListeners([named])).toBe(6);
    expect(countStrayListeners([named])).toBe(0);
  });

  it('removes nothing and counts nothing before a baseline is drawn', () => {
    const named = namedTarget('stand-in');
    const heard = vi.fn();

    track(named);
    named.target.addEventListener('hover', heard);

    expect(countStrayListeners([named])).toBe(0);
    expect(removeStrayListeners([named])).toBe(0);
    expect(describeStrayListeners([named])).toEqual([]);

    named.target.dispatchEvent(new Event('hover'));

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('says what is missing when nothing tracks the target, and the rest stay quiet', () => {
    const named = namedTarget('untracked');

    expect(() => countStrayListeners([named])).toThrow(
      /countStrayListeners\(\) needs trackStrayListeners\(\) to have run first\.\nDocs: .*\/utilities\/setup$/,
    );
    expect(describeStrayListeners([named])).toEqual([]);
    expect(removeStrayListeners([named])).toBe(0);
    expect(baselineStrayListeners([named])).toBeUndefined();
  });

  it('keeps counting a fired one-shot until something removes it', () => {
    const named = namedTarget('stand-in');
    const heard = vi.fn();

    track(named);
    baselineStrayListeners([named]);
    named.target.addEventListener('tick', heard, { once: true });

    named.target.dispatchEvent(new Event('tick'));

    // happy-dom detaches a fired one-shot through the public removeEventListener, which the
    // wrapper sees; jsdom detaches it internally, which it cannot.
    const counted = navigator.userAgent.includes('HappyDOM') ? 0 : 1;

    expect(heard).toHaveBeenCalledTimes(1);
    expect(countStrayListeners([named])).toBe(counted);
    expect(removeStrayListeners([named])).toBe(counted);
    expect(countStrayListeners([named])).toBe(0);
  });

  it('names the target, the type, the spec file and the registration line', () => {
    const named = namedTarget('reports');

    track(named);
    baselineStrayListeners([named]);
    named.target.addEventListener('popstate', () => undefined);

    const [described] = describeStrayListeners([named]);

    expect(described?.target).toBe('reports');
    expect(described?.type).toBe('popstate');
    expect(described?.file).toMatch(/stray-listeners\.spec\.ts$/);
    expect(described?.frames.length ?? 0).toBeGreaterThan(0);
    expect(described?.frames[0]).toMatch(/stray-listeners\.spec\.ts:\d+:\d+/);
    expect(described?.frames.every((frame) => !/stray-listeners\.[jt]s/.test(frame))).toBe(true);
    expect(described?.frames.length ?? 0).toBeLessThanOrEqual(5);
  });

  it('leaves the file out when the runner reports none', () => {
    const named = namedTarget('stand-in');
    const worker: unknown = Reflect.get(globalThis, '__vitest_worker__');
    const ownFile: unknown = Reflect.get(Object(worker), 'filepath');

    track(named);
    baselineStrayListeners([named]);
    Reflect.set(Object(worker), 'filepath', undefined);

    try {
      named.target.addEventListener('popstate', () => undefined);
    } finally {
      Reflect.set(Object(worker), 'filepath', ownFile);
    }

    expect(describeStrayListeners([named])[0]?.file).toBeUndefined();
  });
});

describe('an installation that cannot be completed', () => {
  it('puts the finished wrapper back when the target refuses the second assignment', () => {
    const named = namedTarget('half hostile');
    const originalAdd = named.target.addEventListener;

    Object.defineProperty(named.target, 'removeEventListener', {
      configurable: true,
      get: () => EventTarget.prototype.removeEventListener,
    });

    expect(() => trackStrayListeners([named])).toThrow();
    expect(named.target.addEventListener).toBe(originalAdd);
    expect(() => countStrayListeners([named])).toThrow(/needs trackStrayListeners\(\) to have run first/);
  });

  it('rethrows untouched when the target refuses the first assignment', () => {
    const named = namedTarget('hostile from the start');

    Object.defineProperty(named.target, 'addEventListener', {
      configurable: true,
      get: () => EventTarget.prototype.addEventListener,
    });

    expect(() => trackStrayListeners([named])).toThrow();
    expect(() => countStrayListeners([named])).toThrow(/needs trackStrayListeners\(\) to have run first/);
  });

  it('unwraps the targets it had finished when a later one refuses', () => {
    const fine = namedTarget('fine');
    const hostile = namedTarget('hostile');
    const fineAdd = fine.target.addEventListener;

    Object.defineProperty(hostile.target, 'removeEventListener', {
      configurable: true,
      get: () => EventTarget.prototype.removeEventListener,
    });

    expect(() => trackStrayListeners([fine, hostile])).toThrow();
    expect(fine.target.addEventListener).toBe(fineAdd);
    expect(() => countStrayListeners([fine])).toThrow(/needs trackStrayListeners\(\) to have run first/);
  });
});

describe('the default targets', () => {
  const stops: (() => void)[] = [];

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
  });

  it('wraps globalThis and document, and the undo puts both back', () => {
    const globalAdd = globalThis.addEventListener;
    const globalRemove = globalThis.removeEventListener;
    const documentAdd = document.addEventListener;
    const documentRemove = document.removeEventListener;

    const stop = trackStrayListeners();

    stops.push(stop);

    expect(globalThis.addEventListener).not.toBe(globalAdd);
    expect(globalThis.removeEventListener).not.toBe(globalRemove);
    expect(document.addEventListener).not.toBe(documentAdd);
    expect(document.removeEventListener).not.toBe(documentRemove);

    stop();

    expect(globalThis.addEventListener).toBe(globalAdd);
    expect(globalThis.removeEventListener).toBe(globalRemove);
    expect(document.addEventListener).toBe(documentAdd);
    expect(document.removeEventListener).toBe(documentRemove);
  });

  it('sweeps both defaults as one run', () => {
    const globalAdd = globalThis.addEventListener;
    const documentAdd = document.addEventListener;
    const stop = trackStrayListeners();

    stops.push(stop);

    try {
      const heard = vi.fn();

      baselineStrayListeners();
      globalThis.addEventListener('vas-default-sweep', heard);
      document.addEventListener('vas-default-sweep', heard);

      expect(countStrayListeners()).toBe(2);
      expect(removeStrayListeners()).toBe(2);

      globalThis.dispatchEvent(new Event('vas-default-sweep'));
      document.dispatchEvent(new Event('vas-default-sweep'));

      expect(heard).not.toHaveBeenCalled();
    } finally {
      stop();
    }

    expect(globalThis.addEventListener).toBe(globalAdd);
    expect(document.addEventListener).toBe(documentAdd);
  });

  it('tracks globalThis alone where the environment has no document', () => {
    const realDocument: unknown = Reflect.get(globalThis, 'document');
    const globalAdd = globalThis.addEventListener;

    // jsdom's worker global keeps `document` behind a locked getter reading the window's `_document`
    // slot; the other environments forward it through a settable property. Whichever world this run
    // is in, hide the document for the length of the assertions and put it back afterwards.
    Reflect.set(globalThis, '_document', undefined);

    const slotHidesDocument = Reflect.get(globalThis, 'document') === undefined;

    if (!slotHidesDocument) {
      Reflect.set(globalThis, 'document', undefined);
    }

    expect(Reflect.get(globalThis, 'document')).toBeUndefined();

    let stop: (() => void) | undefined;

    try {
      stop = trackStrayListeners();

      baselineStrayListeners();
      globalThis.addEventListener('vas-no-document', () => undefined);

      expect(globalThis.addEventListener).not.toBe(globalAdd);
      expect(countStrayListeners()).toBe(1);
    } finally {
      stop?.();

      if (slotHidesDocument) {
        Reflect.set(globalThis, '_document', realDocument);
      } else {
        Reflect.deleteProperty(globalThis, '_document');
        Reflect.set(globalThis, 'document', realDocument);
      }
    }

    expect(globalThis.addEventListener).toBe(globalAdd);
    expect(Reflect.get(globalThis, 'document')).toBe(realDocument);
  });
});
