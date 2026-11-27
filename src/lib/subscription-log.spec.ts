import { NEVER, Observable, Subject, firstValueFrom, mergeMap, of, switchMap, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { createSubscriptionLog } from '../rxjs';

describe('createSubscriptionLog', () => {
  it.each([
    ['switchMap', ['subscribe:A', 'unsubscribe:A', 'subscribe:B']],
    ['mergeMap', ['subscribe:A', 'subscribe:B']],
  ] as const)('records %s cancellation before the consumer is destroyed', (operator, expected) => {
    const log = createSubscriptionLog();
    const input = new Subject<string>();
    const load = vi.fn((key: string) => log.track(key, NEVER));
    const consumer = input.pipe(operator === 'switchMap' ? switchMap(load) : mergeMap(load)).subscribe();

    input.next('A');
    input.next('B');

    expect(log.events.map(({ type, key }) => `${type}:${key}`)).toEqual(expected);
    consumer.unsubscribe();
    expect(log.events.at(-1)).toEqual({ type: 'unsubscribe', key: 'B', subscription: 2 });
  });

  it('opens the source once per subscriber and pairs teardown with the right subscription', () => {
    const close = vi.fn();
    const open = vi.fn(() => close);
    const log = createSubscriptionLog();
    const stream = log.track('shared', new Observable(open));

    expect(open).not.toHaveBeenCalled();
    expect(log.events).toEqual([]);
    const first = stream.subscribe();
    const second = stream.subscribe();
    second.unsubscribe();
    first.unsubscribe();
    first.unsubscribe();

    expect(open).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
    expect(log.events.map(({ type, subscription }) => [type, subscription])).toEqual([
      ['subscribe', 1],
      ['subscribe', 2],
      ['unsubscribe', 2],
      ['unsubscribe', 1],
    ]);
  });

  it('forwards values and errors and records synchronous termination', async () => {
    const log = createSubscriptionLog();
    const values: number[] = [];
    log.track('success', of(3, 4)).subscribe((value) => values.push(value));
    const reason = new Error('offline');
    await expect(
      firstValueFrom(
        log.track(
          'failure',
          throwError(() => reason),
        ),
      ),
    ).rejects.toBe(reason);

    expect(values).toEqual([3, 4]);
    expect(log.events.map(({ type, key }) => [type, key])).toEqual([
      ['subscribe', 'success'],
      ['unsubscribe', 'success'],
      ['subscribe', 'failure'],
      ['unsubscribe', 'failure'],
    ]);
  });
});
