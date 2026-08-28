import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubAbortController } from './abort-controller-stub';
import { restoreMockedProps } from './prop-mock';

describe('stubAbortController', () => {
  afterEach(() => {
    restoreMockedProps();
  });

  it('gives a signal the DOM will accept as an EventTarget', () => {
    stubAbortController();

    const controller = new AbortController();

    // The failing call in a real suite: zone.js registers the abort listener through the DOM's own
    // `addEventListener` with the signal as receiver, and Node's AbortSignal is rejected there.
    expect(() => Element.prototype.addEventListener.call(controller.signal, 'abort', () => undefined)).not.toThrow();
  });

  it('detaches a listener registered with { signal }', () => {
    stubAbortController();

    const controller = new AbortController();
    const element = document.createElement('button');
    const handler = vi.fn();

    element.addEventListener('click', handler, { signal: controller.signal });
    element.dispatchEvent(new Event('click'));
    controller.abort();
    element.dispatchEvent(new Event('click'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires abort once, on both listener shapes', () => {
    stubAbortController();

    const controller = new AbortController();
    const viaProperty = vi.fn();
    const viaListener = vi.fn();

    controller.signal.onabort = viaProperty;
    controller.signal.addEventListener('abort', viaListener);

    controller.abort('gone');
    controller.abort('gone again');

    expect(viaProperty).toHaveBeenCalledTimes(1);
    expect(viaListener).toHaveBeenCalledTimes(1);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe('gone');
  });

  it('defaults the reason and rethrows it from throwIfAborted', () => {
    stubAbortController();

    const controller = new AbortController();

    expect(() => controller.signal.throwIfAborted()).not.toThrow();

    controller.abort();

    expect(() => controller.signal.throwIfAborted()).toThrow('AbortError');
  });

  it('puts the platform implementation back through restoreMockedProps', () => {
    const real = globalThis.AbortController;

    stubAbortController();

    expect(globalThis.AbortController).not.toBe(real);

    restoreMockedProps();

    expect(globalThis.AbortController).toBe(real);
  });
});
