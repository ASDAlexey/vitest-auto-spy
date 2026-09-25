import { count } from './message-text';

/**
 * Whether the global clock is faked, read without importing a runner.
 *
 * `@sinonjs/fake-timers` — behind `vi.useFakeTimers()` and the Jest-compatible clocks — tags every
 * function it installs with `.clock`, and the clock counts its own queue. A runtime that fakes
 * timers some other way reads as real, so a message only ever omits the fake-clock advice.
 */
export function fakeClockBacklog(host: object = globalThis): number | undefined {
  const clock: unknown = Reflect.get(Object(Reflect.get(host, 'setTimeout')), 'clock');
  const countTimers: unknown = Reflect.get(Object(clock), 'countTimers');

  return typeof countTimers === 'function' ? Number(countTimers.call(clock)) : undefined;
}

/** The fake-clock sentence, only when a fake clock is what can explain a real-time wait running out. */
export function fakeClockAdvice(): string {
  const pending = fakeClockBacklog();

  if (pending === undefined) {
    return '';
  }

  const queued = pending > 0 ? ` and ${count(pending, 'callback')} ${pending === 1 ? 'waits' : 'wait'} on it` : '';

  return (
    ` Timers are fake${queued}: advance them inside the wait, ` +
    '`{ advance: () => vi.advanceTimersByTime(ms) }` — this watchdog runs on real time and never advances them.'
  );
}
