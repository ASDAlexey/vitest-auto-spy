/**
 * Alone in its file: jsdom starts the interval its frames run on only while no frame is queued yet,
 * and any earlier test that left one pending would keep that interval out of sight.
 */
import { expect, it } from 'vitest';

import { describeStrayTimers, trackStrayTimers } from './stray-timers';

it('counts one requestAnimationFrame of the real environment once, without the interval it runs on', () => {
  const stop = trackStrayTimers();

  try {
    requestAnimationFrame(() => undefined);

    expect(describeStrayTimers().map((stray) => stray.kind)).toEqual(['frame']);
  } finally {
    stop();
  }
});
