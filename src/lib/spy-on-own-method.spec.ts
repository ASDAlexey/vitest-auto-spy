/**
 * `spyOnOwnMethod` is the packed form of a `createSpyFromInstance` call every call-through spec
 * wrote by hand, so what is pinned here is that the packing changes nothing: one member spied, the
 * rest of the object real, the real method running until the test says otherwise.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { restoreSpiedInstance } from './create-spy-from-instance';
import { registerMockAdapter } from './mock-adapter';
import { spyOnOwnMethod } from './spy-on-own-method';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

class Player {
  private track = 0;

  seek(position: number): number {
    this.track = position;

    return this.track;
  }

  pause(): void {}

  title(): string {
    return 'real';
  }
}

const spied: object[] = [];

function track<T extends object>(instance: T): T {
  spied.push(instance);

  return instance;
}

afterEach(() => {
  spied.splice(0).forEach(restoreSpiedInstance);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('spyOnOwnMethod', () => {
  it('returns the spy of the one named method', () => {
    const player = track(new Player());

    const seek = spyOnOwnMethod(player, 'seek');

    player.seek(1000);

    expect(seek).toHaveBeenCalledWith(1000);
  });

  it('runs the real method by default', () => {
    const player = track(new Player());

    const seek = spyOnOwnMethod(player, 'seek');

    expect(player.seek(500)).toBe(500);
    expect(seek).toHaveBeenCalledTimes(1);
  });

  it('stops calling through once the test configures the spy', () => {
    const player = track(new Player());

    const seek = spyOnOwnMethod(player, 'seek');
    seek.mockReturnValue(-1);

    expect(player.seek(500)).toBe(-1);
    expect(player.seek(700)).toBe(-1);
    expect(seek).toHaveBeenCalledTimes(2);
  });

  it('leaves every other member the real one', () => {
    const player = track(new Player());

    spyOnOwnMethod(player, 'seek');

    expect(player.title()).toBe('real');
    expect(vi.isMockFunction(player.title)).toBe(false);
    expect(vi.isMockFunction(player.pause)).toBe(false);
  });

  it('is restored by restoreSpiedInstance like the factory it wraps', () => {
    const player = track(new Player());

    const seek = spyOnOwnMethod(player, 'seek');
    player.seek(1);

    restoreSpiedInstance(player);

    expect(vi.isMockFunction(player.seek)).toBe(false);
    expect(player.seek(2)).toBe(2);
    expect(seek).toHaveBeenCalledTimes(1);
  });
});
