import { afterEach, describe, expect, it } from 'vitest';

// Registers the Vitest mock adapter, which the constructor double is built on.
import '../index';
import { mockConstructor, stubConstructor } from './constructor-spy';
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
    const Client = mockConstructor<TrackingPixel>(() => ({ src: '' }), 'MTSPay');

    expect(() => Client()).toThrow(/MTSPay is a constructor double and was called without `new`/);
  });

  it('refuses a factory that produces a primitive, which `new` would discard', () => {
    const Broken = mockConstructor<number>(() => 42, 'Broken');

    expect(() => new Broken()).toThrow(/the factory returned number/);
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
