import { afterEach, describe, expect, it, vi } from 'vitest';

// Registers the Vitest mock adapter, which the constructor double is built on.
import '../index';
import { calledFrom, mockConstructor, stubConstructor } from './constructor-spy';
import { restoreMockedProps } from './prop-mock';

interface TrackingPixel {
  src: string;
}

/** Stands in for the code under test: constructs a global itself, keeps no reference to the class. */
function ping(url: string): void {
  const image = new Image();

  image.src = url;
}

describe('mockConstructor', () => {
  it('serves `new` and hands back what the factory produced', () => {
    const Client = mockConstructor<TrackingPixel>(() => ({ src: '' }));

    const instance = new Client();
    instance.src = 'https://tns.test/hit';

    expect(Client.instances).toEqual([{ src: 'https://tns.test/hit' }]);
    expect(Client.instances[0]).toBe(instance);
  });

  it('stays a runner mock, so the usual matchers apply', () => {
    const Syslog = mockConstructor<{ host: string }>((options: unknown) => ({ host: String(options) }));

    new Syslog('logs.test');

    expect(Syslog).toHaveBeenCalledTimes(1);
    expect(Syslog).toHaveBeenCalledWith('logs.test');

    Syslog.mockClear();

    expect(Syslog).not.toHaveBeenCalled();
  });

  it('passes the `new` arguments to the factory', () => {
    const Client = mockConstructor<{ args: unknown[] }, [string, number]>((...args) => ({ args }));

    new Client('a', 1);

    expect(Client.instances[0]?.args).toEqual(['a', 1]);
  });

  it('names the mistake when it is called without `new`', () => {
    const Client = mockConstructor<TrackingPixel>(() => ({ src: '' }), 'PaymentSdk');

    expect(() => Client()).toThrow(
      /^\[vitest-auto-spy\] PaymentSdk is a constructor double and was called without `new`, from src\/lib\/constructor-spy\.spec\.ts:\d+:\d+\. Put the `new` back/,
    );
    expect(() => Client()).toThrow(/\nDocs: \S+\/utilities\/constructor-doubles#mockconstructor-factory-name$/);
  });

  it('calls an unnamed double by its factory', () => {
    const Client = mockConstructor<TrackingPixel>(() => ({ src: '' }));

    expect(() => Client()).toThrow(/^\[vitest-auto-spy\] This mockConstructor\(\) double is a constructor double/);
  });

  it('leaves the call site out when the stack has no frame outside the library', () => {
    expect(calledFrom('Error\n    at x (/repo/node_modules/a.js:1:1)')).toBe('');
    expect(calledFrom(undefined)).toBe('');
    expect(calledFrom('Error\n    at x (file:///app/src/pay.ts:3:4)')).toBe(', from /app/src/pay.ts:3:4');
    expect(calledFrom('Error\n    at x (/lib/a.js:1:1)\n    at y (/app/b.ts:2:2)', '/lib/')).toBe(', from /app/b.ts:2:2');
    expect(calledFrom('Error\n    at x (/lib/a.js:1:1)', '')).toBe(', from /lib/a.js:1:1');
    expect(calledFrom('Error\n    at new Promise (<anonymous>)\n    at y (/app/b.ts:2:2)', '/lib/')).toBe(', from /app/b.ts:2:2');
  });

  it('refuses a factory that produces a primitive, which `new` would discard', () => {
    const Broken = mockConstructor<number>(() => 42, 'Broken');

    expect(() => new Broken()).toThrow(
      /the factory returned number[\s\S]*Return the instance from the factory: `mockConstructor\(\(\) => \(\{ … \}\)\)`/,
    );
  });

  it('refuses a factory that produces null', () => {
    const Broken = mockConstructor<null>(() => null, 'Broken');

    expect(() => new Broken()).toThrow(/the factory returned null/);
  });
});

describe('stubConstructor', () => {
  afterEach(() => {
    restoreMockedProps();
  });

  it('replaces a global the code under test constructs directly', () => {
    const image = stubConstructor<TrackingPixel>(globalThis, 'Image', () => ({ src: '' }));

    ping('https://tns.test/hit');

    expect(image).toHaveBeenCalledTimes(1);
    expect(image.instances[0]?.src).toBe('https://tns.test/hit');
  });

  it('puts the real constructor back through restoreMockedProps', () => {
    const real = globalThis.Image;

    stubConstructor<TrackingPixel>(globalThis, 'Image', () => ({ src: '' }));

    expect(globalThis.Image).not.toBe(real);

    restoreMockedProps();

    expect(globalThis.Image).toBe(real);
  });

  it('works on a plain object, not only on globals', () => {
    const sdk: { Widget?: unknown } = {};

    const widget = stubConstructor<{ render: () => void }>(sdk, 'Widget', () => ({ render: (): void => undefined }));
    const Widget = sdk.Widget;

    expect(Widget).toBe(widget);
    expect(widget.instances).toEqual([]);
  });
});

describe('ownDirectory', () => {
  it('reads the stack on first use rather than at import, once, and resolves to this directory', async () => {
    const original = Error.prepareStackTrace;
    let probes = 0;

    Error.prepareStackTrace = (error, frames) => {
      probes += error.message === 'probe' ? 1 : 0;

      return original === undefined
        ? [String(error), ...frames.map((frame) => `    at ${String(frame)}`)].join('\n')
        : original(error, frames);
    };

    try {
      vi.resetModules();

      const fresh = await import('./constructor-spy');

      expect(probes).toBe(0);

      const here = /((?:file:\/\/)?[^\s()]+):\d+:\d+\)?$/.exec(String(String(new Error().stack).split('\n')[1]))?.[1];

      expect(fresh.calledFrom(`Error\n    at x (${fresh.ownDirectory()}pay.ts:1:1)`)).toBe('');
      expect(fresh.ownDirectory()).toBe(String(here).replace(/[^/\\]*$/, ''));
      expect(fresh.ownDirectory()).toMatch(/[/\\]src[/\\]lib[/\\]$/);
      expect(probes).toBe(1);
    } finally {
      Error.prepareStackTrace = original;
    }
  });
});
