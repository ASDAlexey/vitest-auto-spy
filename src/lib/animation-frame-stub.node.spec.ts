// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import '../index';
import { stubAnimationFrame } from './animation-frame-stub';
import { restoreMockedProps } from './prop-mock';

describe('stubAnimationFrame in a node environment', () => {
  it('installs frames where the runtime has none, and takes them away again', () => {
    const frames = stubAnimationFrame({ mode: 'queued' });
    const callback = vi.fn();

    Reflect.apply(Reflect.get(globalThis, 'requestAnimationFrame'), globalThis, [callback]);
    frames.flush(0);

    expect(callback).toHaveBeenCalledWith(0);

    restoreMockedProps();

    expect(Reflect.get(globalThis, 'requestAnimationFrame')).toBeUndefined();
    expect(Reflect.get(globalThis, 'cancelAnimationFrame')).toBeUndefined();
  });
});
