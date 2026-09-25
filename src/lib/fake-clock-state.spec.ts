import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakeClockAdvice, fakeClockBacklog } from './fake-clock-state';

describe('fakeClockBacklog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is undefined while the timers are real', () => {
    expect(fakeClockBacklog()).toBeUndefined();
  });

  it('counts the callbacks queued on a fake clock', () => {
    vi.useFakeTimers();
    setTimeout(() => undefined, 10);
    setInterval(() => undefined, 10);

    expect(fakeClockBacklog()).toBe(2);
  });

  it('reads a host whose setTimeout carries no clock as real', () => {
    expect(fakeClockBacklog({ setTimeout: () => undefined })).toBeUndefined();
    expect(fakeClockBacklog({})).toBeUndefined();
  });

  it('advises advancing only while the clock is fake, with the right verb for the count', () => {
    expect(fakeClockAdvice()).toBe('');
    vi.useFakeTimers();
    expect(fakeClockAdvice()).toContain(' Timers are fake: advance them inside the wait');
    setTimeout(() => undefined, 10);
    expect(fakeClockAdvice()).toContain('and 1 callback waits on it');
    setTimeout(() => undefined, 10);
    expect(fakeClockAdvice()).toContain('and 2 callbacks wait on it');
  });
});
