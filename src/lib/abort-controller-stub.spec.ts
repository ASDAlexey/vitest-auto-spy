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

    // The idiom the stub exists to keep working: `catch (e) { if (e.name === 'AbortError') … }` and
    // `e instanceof DOMException` — both failed against the old plain `Error('AbortError')`.
    expect(controller.signal.reason).toBeInstanceOf(DOMException);
    expect(controller.signal.reason).toHaveProperty('name', 'AbortError');
    expect(controller.signal.reason).toHaveProperty('message', 'This operation was aborted');
    expect(() => controller.signal.throwIfAborted()).toThrow(DOMException);
  });

  it('gives AbortSignal the static factories real code calls', () => {
    stubAbortController();

    const aborted = AbortSignal.abort('nope');

    expect(aborted.aborted).toBe(true);
    expect(aborted.reason).toBe('nope');

    const fresh = new AbortController().signal;
    const any = AbortSignal.any([fresh, AbortSignal.abort('first')]);

    expect(any.aborted).toBe(true);
    expect(any.reason).toBe('first');

    const controller = new AbortController();
    const later = AbortSignal.any([controller.signal]);

    expect(later.aborted).toBe(false);

    controller.abort('from source');

    expect(later.aborted).toBe(true);
    expect(later.reason).toBe('from source');
  });

  it('drives AbortSignal.timeout from the clock', () => {
    vi.useFakeTimers();
    stubAbortController();

    const timed = AbortSignal.timeout(1_000);

    expect(timed.aborted).toBe(false);

    vi.advanceTimersByTime(1_000);

    expect(timed.aborted).toBe(true);
    expect(timed.reason).toHaveProperty('name', 'TimeoutError');

    vi.useRealTimers();
  });

  it('puts the platform implementation back through restoreMockedProps', () => {
    const real = globalThis.AbortController;

    stubAbortController();

    expect(globalThis.AbortController).not.toBe(real);

    restoreMockedProps();

    expect(globalThis.AbortController).toBe(real);
  });
});
