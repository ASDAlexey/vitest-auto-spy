/**
 * A captor has to work in the two places an asymmetric matcher is consulted — the runner's own
 * `toHaveBeenCalledWith` and this library's `calledWith` dispatch — and it has to fail usefully
 * when it is read before it has seen anything, which is the mistake its whole shape invites.
 */
import { describe, expect, it, vi } from 'vitest';

import '../index';
import { captureArg } from './capture-arg';
import { createSpyFromClass } from './create-spy-from-class';

class Notifier {
  subscribe(_topic: string, _handler: () => void): void {
    /* prototype method, so the auto-spy finds it */
  }

  send(_payload: { id: number }): boolean {
    return false;
  }
}

describe('captureArg', () => {
  it('matches any argument and hands back what the code under test passed', () => {
    const spy = createSpyFromClass(Notifier);
    const handler = captureArg<() => void>();
    let ran = false;

    spy.subscribe('ready', () => {
      ran = true;
    });

    expect(spy.subscribe).toHaveBeenCalledWith('ready', handler);

    handler.value();

    expect(ran).toBe(true);
  });

  it('collects one entry per matched call, oldest first', () => {
    const send = vi.fn();
    const payload = captureArg<{ id: number }>();

    send({ id: 1 });
    send({ id: 2 });

    expect(send).toHaveBeenNthCalledWith(1, payload);
    expect(send).toHaveBeenNthCalledWith(2, payload);

    expect(payload.values).toEqual([{ id: 1 }, { id: 2 }]);
    expect(payload.value).toEqual({ id: 2 });
  });

  it('captures an argument that is itself undefined, distinctly from never matching', () => {
    const send = vi.fn();
    const captor = captureArg<number | undefined>();

    send(undefined);

    expect(send).toHaveBeenCalledWith(captor);
    expect(captor.captured).toBe(true);
    expect(captor.value).toBeUndefined();
  });

  it('reports whether it captured, without throwing', () => {
    const captor = captureArg();

    expect(captor.captured).toBe(false);
    expect(captor.values).toEqual([]);
  });

  it('throws a message naming the mistake when read before it matched anything', () => {
    const captor = captureArg<string>();

    expect(() => captor.value).toThrow(/nothing was captured/);
    expect(() => captor.value).toThrow(/toHaveBeenCalledWith\(captor\)/);
  });

  it('reset() forgets what it saw, so one captor serves two phases', () => {
    const send = vi.fn();
    const payload = captureArg<{ id: number }>();

    send({ id: 1 });
    expect(send).toHaveBeenCalledWith(payload);

    payload.reset();

    expect(payload.captured).toBe(false);

    send({ id: 2 });
    expect(send).toHaveBeenLastCalledWith(payload);

    expect(payload.values).toEqual([{ id: 2 }]);
  });

  it('prints as itself in a diff rather than as a bare object', () => {
    const captor = captureArg<number>();

    expect(String(captor)).toBe('captureArg');
    expect(captor.toAsymmetricMatcher()).toBe('captureArg<0 captured>');

    expect(vi.fn()).not.toHaveBeenCalledWith(captor);
  });
});
