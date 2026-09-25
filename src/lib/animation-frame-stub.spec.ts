import { afterEach, describe, expect, it, vi } from 'vitest';

import '../index';
import { stubAnimationFrame } from './animation-frame-stub';
import { restoreMockedProps } from './prop-mock';

describe('stubAnimationFrame', () => {
  afterEach(() => {
    restoreMockedProps();
  });

  it('runs a frame before requestAnimationFrame returns, with a fresh handle each time', () => {
    const frames = stubAnimationFrame();
    const callback = vi.fn();

    const first = requestAnimationFrame(callback);
    const second = requestAnimationFrame(callback);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[0]?.[0]).toEqual(expect.any(Number));
    expect(second).toBeGreaterThan(first);
    expect(frames.pending).toBe(0);
    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('holds a frame requested from inside a frame until the next flush, so a loop cannot recurse', () => {
    const frames = stubAnimationFrame();
    const steps: number[] = [];
    const step = (timestamp: number): void => {
      steps.push(timestamp);
      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);

    expect(steps).toHaveLength(1);
    expect(frames.pending).toBe(1);

    frames.flush(32);

    expect(steps.at(-1)).toBe(32);
    expect(frames.pending).toBe(1);
  });

  it('queues frames until flush, and runs them as one frame with one timestamp', () => {
    const frames = stubAnimationFrame({ mode: 'queued' });
    const first = vi.fn();
    const second = vi.fn();

    requestAnimationFrame(first);
    requestAnimationFrame(second);

    expect(first).not.toHaveBeenCalled();
    expect(frames.pending).toBe(2);

    frames.flush(16);

    expect(first).toHaveBeenCalledWith(16);
    expect(second).toHaveBeenCalledWith(16);
    expect(frames.pending).toBe(0);
  });

  it('defaults the flush timestamp to performance.now()', () => {
    const frames = stubAnimationFrame({ mode: 'queued' });
    const callback = vi.fn();

    vi.spyOn(performance, 'now').mockReturnValue(1234);
    requestAnimationFrame(callback);
    frames.flush();

    expect(callback).toHaveBeenCalledWith(1234);
  });

  it('drops a cancelled frame, including one cancelled by an earlier callback of the same frame', () => {
    const frames = stubAnimationFrame({ mode: 'queued' });
    const cancelled = vi.fn();
    const skipped = vi.fn();

    cancelAnimationFrame(requestAnimationFrame(cancelled));
    requestAnimationFrame(() => cancelAnimationFrame(handle));
    const handle = requestAnimationFrame(skipped);

    frames.flush();

    expect(cancelled).not.toHaveBeenCalled();
    expect(skipped).not.toHaveBeenCalled();
    expect(frames.cancelAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('keeps the frames after a throwing one pending, and still accepts new frames', () => {
    const frames = stubAnimationFrame({ mode: 'queued' });
    const later = vi.fn();

    requestAnimationFrame(() => {
      throw new Error('boom');
    });
    requestAnimationFrame(later);

    expect(() => frames.flush()).toThrow('boom');
    expect(frames.pending).toBe(1);

    frames.flush();

    expect(later).toHaveBeenCalledTimes(1);
  });

  it('puts the previous globals back on restore() and drops what is pending', () => {
    const original = globalThis.requestAnimationFrame;
    const frames = stubAnimationFrame({ mode: 'queued' });

    requestAnimationFrame(vi.fn());
    frames.restore();

    expect(globalThis.requestAnimationFrame).toBe(original);
    expect(frames.pending).toBe(0);
  });

  it('is taken off by restoreMockedProps()', () => {
    const original = globalThis.cancelAnimationFrame;

    stubAnimationFrame();
    restoreMockedProps();

    expect(globalThis.cancelAnimationFrame).toBe(original);
  });

  it('installs on a separate window too, and on globalThis alone when told there is none', () => {
    const view: Record<string, unknown> = {};
    const frames = stubAnimationFrame({ view });

    expect(view['requestAnimationFrame']).toBe(frames.requestAnimationFrame);
    expect(view['cancelAnimationFrame']).toBe(frames.cancelAnimationFrame);

    frames.restore();

    expect('requestAnimationFrame' in view).toBe(false);

    const bare = stubAnimationFrame({ view: null });

    expect(globalThis.requestAnimationFrame).toBe(bare.requestAnimationFrame);
  });
});
