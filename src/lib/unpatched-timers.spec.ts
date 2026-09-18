import { describe, expect, it } from 'vitest';

import { unpatchedTimer } from './unpatched-timers';

describe('unpatchedTimer', () => {
  it('prefers the timer zone.js parked aside to the one it installed', () => {
    const parked = (): number => 0;

    Reflect.set(globalThis, '__zone_symbol__setTimeout', parked);

    try {
      // Inside `fakeAsync` the patched `setTimeout` is virtual, so a watchdog on it joins the clock
      // the spec is driving and rejects the stream `tick()` was about to advance into.
      const resolved = unpatchedTimer('setTimeout', globalThis.setTimeout);

      expect(resolved).not.toBe(globalThis.setTimeout);
      expect(resolved(() => undefined, 5)).toBe(0);
    } finally {
      Reflect.deleteProperty(globalThis, '__zone_symbol__setTimeout');
    }
  });

  it('keeps the global one where no zone has been loaded', () => {
    const fallback = globalThis.setTimeout;

    expect(unpatchedTimer('setTimeout', fallback)).toBe(fallback);
    expect(unpatchedTimer('clearTimeout', fallback)).toBe(fallback);
  });
});
