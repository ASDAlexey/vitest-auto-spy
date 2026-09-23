import { describe, expect, it } from 'vitest';

import { captureGlobalBaseline, restoreGlobals } from './global-restore';
import { markOwnedPatch } from './owned-patch';

/**
 * Give `host` an accessor pair over `key` forwarding to `view` — the shape a DOM environment gives
 * its window's globals on `globalThis`, and the reason a restore needs a write-back leg at all.
 */
function forwardToView(host: Record<PropertyKey, unknown>, key: string, view: Record<string, unknown>): void {
  Object.defineProperty(host, key, {
    configurable: true,
    enumerable: true,
    get: () => view[key],
    set: (value: unknown) => {
      view[key] = value;
    },
  });
}

describe('captureGlobalBaseline', () => {
  it('keeps the first snapshot — a second capture adopts nothing', () => {
    const host: Record<string, unknown> = { fetch: 'real' };

    captureGlobalBaseline(host);

    host['fetch'] = 'first';

    captureGlobalBaseline(host);

    host['fetch'] = 'second';

    expect(restoreGlobals(host)).toEqual(['fetch']);
    expect(host['fetch']).toBe('real');
  });

  it('leaves the identity globals out of the snapshot entirely', () => {
    const host: Record<string, unknown> = {
      ResizeObserver: 'real',
      document: 'first-document',
      frames: 'first-frames',
      global: 'first-global',
      location: 'first-location',
      parent: 'first-parent',
      self: 'first-self',
      top: 'first-top',
      window: 'first-window',
    };

    captureGlobalBaseline(host);

    for (const key of Object.keys(host)) {
      host[key] = `stubbed-${key}`;
    }

    expect(restoreGlobals(host)).toEqual(['ResizeObserver']);
    expect(host['location']).toBe('stubbed-location');
    expect(host['window']).toBe('stubbed-window');
    expect(host['document']).toBe('stubbed-document');
    expect(host['self']).toBe('stubbed-self');
  });

  it('drops __vitest-prefixed string keys but keeps symbol keys', () => {
    const exported = Symbol('exported');
    const host: Record<PropertyKey, unknown> = { __vitest_worker__: 'bookkeeping', [exported]: 'real' };

    captureGlobalBaseline(host);

    host['__vitest_worker__'] = 'changed';
    host[exported] = 'stub';

    expect(restoreGlobals(host)).toEqual([exported]);
    expect(host['__vitest_worker__']).toBe('changed');
    expect(host[exported]).toBe('real');
  });

  it('skips a key that ownKeys reports but no descriptor backs', () => {
    const standIn = { real: 'real' };
    const host = new Proxy(standIn, {
      ownKeys: () => [...Reflect.ownKeys(standIn), 'ghost'],
      getOwnPropertyDescriptor: (target, key) => (key === 'ghost' ? undefined : Reflect.getOwnPropertyDescriptor(target, key)),
    });

    captureGlobalBaseline(host);

    expect(restoreGlobals(host)).toEqual([]);
  });

  it('survives a getter that throws at capture time', () => {
    const host: Record<PropertyKey, unknown> = {};

    Object.defineProperty(host, 'unreadable', {
      configurable: true,
      enumerable: true,
      get: () => {
        throw new Error('broken before capture');
      },
    });

    captureGlobalBaseline(host);

    expect(restoreGlobals(host)).toEqual([]);
  });
});

describe('restoreGlobals', () => {
  it('returns an empty list when no baseline was ever taken', () => {
    expect(restoreGlobals({ fetch: 'real' })).toEqual([]);
  });

  it('puts an overwritten data property back and names the key', () => {
    const original = { tag: 'real' };
    const host: Record<string, unknown> = { ResizeObserver: original };

    captureGlobalBaseline(host);

    host['ResizeObserver'] = { tag: 'stub' };

    expect(restoreGlobals(host)).toEqual(['ResizeObserver']);
    expect(host['ResizeObserver']).toBe(original);
  });

  it('re-defines a key that was deleted after capture', () => {
    const original = { tag: 'real' };
    const host: Record<string, unknown> = { fetch: original };

    captureGlobalBaseline(host);

    delete host['fetch'];

    expect(restoreGlobals(host)).toEqual(['fetch']);
    expect(host['fetch']).toBe(original);
    expect(Object.getOwnPropertyDescriptor(host, 'fetch')).toMatchObject({ value: original, writable: true, configurable: true });
  });

  it('leaves registered $$jest symbols out, like the __vitest names', () => {
    const matchers = Symbol.for('$$jest-matchers-object');
    const host: Record<PropertyKey, unknown> = { [matchers]: 'state' };

    captureGlobalBaseline(host);

    host[matchers] = 'next state';

    expect(restoreGlobals(host)).toEqual([]);
    expect(host[matchers]).toBe('next state');
  });

  it('gives a getter that answers a fresh object per read only the descriptor leg', () => {
    const host: Record<PropertyKey, unknown> = {};
    let written = 0;

    Object.defineProperty(host, 'CSS', {
      configurable: true,
      get: () => ({}),
      set: () => {
        written += 1;
      },
    });

    captureGlobalBaseline(host);

    expect(restoreGlobals(host)).toEqual([]);
    expect(written).toBe(0);
  });

  it('writes the captured value back through a forwarding setter the descriptor never moved', () => {
    const view: Record<string, unknown> = { ResizeObserver: 'real' };
    const host: Record<PropertyKey, unknown> = {};

    forwardToView(host, 'ResizeObserver', view);

    captureGlobalBaseline(host);

    host['ResizeObserver'] = 'stub';

    expect(Object.getOwnPropertyDescriptor(host, 'ResizeObserver')?.get).toBeDefined();

    expect(restoreGlobals(host)).toEqual(['ResizeObserver']);
    expect(view['ResizeObserver']).toBe('real');
    expect(host['ResizeObserver']).toBe('real');
  });

  it('re-seats the value behind an accessor a data property replaced outright', () => {
    const view: Record<string, unknown> = { IntersectionObserver: 'real' };
    const host: Record<PropertyKey, unknown> = {};

    forwardToView(host, 'IntersectionObserver', view);

    captureGlobalBaseline(host);

    Object.defineProperty(host, 'IntersectionObserver', { configurable: true, enumerable: true, writable: true, value: 'stub' });

    expect(restoreGlobals(host)).toEqual(['IntersectionObserver']);
    expect(view['IntersectionObserver']).toBe('real');
    expect(host['IntersectionObserver']).toBe('real');
  });

  it('reads a getter that has started throwing as a change, and writes the captured value back', () => {
    const view: { broken: boolean; crypto: unknown } = { broken: false, crypto: 'real' };
    const host: Record<PropertyKey, unknown> = {};

    Object.defineProperty(host, 'crypto', {
      configurable: true,
      enumerable: true,
      get: () => {
        if (view.broken) {
          throw new Error('broken since capture');
        }

        return view.crypto;
      },
      set: (value: unknown) => {
        view.crypto = value;
      },
    });

    captureGlobalBaseline(host);

    view.broken = true;
    view.crypto = 'stub';

    expect(restoreGlobals(host)).toEqual(['crypto']);
    expect(view.crypto).toBe('real');
  });

  it('steps around a wrapper the library owns — data property or forwarding setter', () => {
    const wrapper = (): void => undefined;

    markOwnedPatch(wrapper);

    const asData: Record<string, unknown> = { setTimeout: (): void => undefined };

    captureGlobalBaseline(asData);

    asData['setTimeout'] = wrapper;

    expect(restoreGlobals(asData)).toEqual([]);
    expect(asData['setTimeout']).toBe(wrapper);

    const view: Record<string, unknown> = { addEventListener: (): void => undefined };
    const throughSetter: Record<PropertyKey, unknown> = {};

    forwardToView(throughSetter, 'addEventListener', view);

    captureGlobalBaseline(throughSetter);

    throughSetter['addEventListener'] = wrapper;

    expect(restoreGlobals(throughSetter)).toEqual([]);
    expect(throughSetter['addEventListener']).toBe(wrapper);
    expect(view['addEventListener']).toBe(wrapper);
  });

  it('leaves a non-configurable replacement exactly as it is', () => {
    const host: Record<PropertyKey, unknown> = {};

    Object.defineProperty(host, 'navigator', { configurable: true, enumerable: true, writable: true, value: 'real' });

    captureGlobalBaseline(host);

    Object.defineProperty(host, 'navigator', { configurable: false, enumerable: true, writable: true, value: 'stub' });

    expect(restoreGlobals(host)).toEqual([]);
    expect(host['navigator']).toBe('stub');
  });

  it('leaves an accessor whose setter refuses exactly as it is', () => {
    const view: Record<string, unknown> = { crypto: 'real' };
    const host: Record<PropertyKey, unknown> = {};

    Object.defineProperty(host, 'crypto', {
      configurable: true,
      enumerable: true,
      get: () => view['crypto'],
      set: () => {
        throw new Error('refused');
      },
    });

    captureGlobalBaseline(host);

    view['crypto'] = 'stub';

    expect(restoreGlobals(host)).toEqual([]);
    expect(view['crypto']).toBe('stub');
    expect(host['crypto']).toBe('stub');
  });

  it('leaves a read-only accessor exactly as it is', () => {
    const view: Record<string, unknown> = { devicePixelRatio: 1 };
    const host: Record<PropertyKey, unknown> = {};

    Object.defineProperty(host, 'devicePixelRatio', { configurable: true, enumerable: true, get: () => view['devicePixelRatio'] });

    captureGlobalBaseline(host);

    view['devicePixelRatio'] = 2;

    expect(restoreGlobals(host)).toEqual([]);
    expect(host['devicePixelRatio']).toBe(2);
  });

  it('reports nothing when nothing moved', () => {
    const view: Record<string, unknown> = { ResizeObserver: 'real' };
    const host: Record<PropertyKey, unknown> = { fetch: 'real' };

    forwardToView(host, 'ResizeObserver', view);

    captureGlobalBaseline(host);

    expect(restoreGlobals(host)).toEqual([]);
    expect(host['fetch']).toBe('real');
    expect(host['ResizeObserver']).toBe('real');
  });

  it('against the real globals, an immediate restore reports nothing', () => {
    captureGlobalBaseline();

    expect(restoreGlobals()).toEqual([]);
  });
});
