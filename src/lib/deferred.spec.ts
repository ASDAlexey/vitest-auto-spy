import { describe, expect, it } from 'vitest';

import { createDeferred } from '../index';

describe('createDeferred', () => {
  it('stays pending until resolved, then resumes the waiting operation', async () => {
    const { promise, resolve } = createDeferred<boolean>();
    const events: string[] = [];
    const operation = promise.then((value) => {
      events.push('finished');
      return value;
    });

    await Promise.resolve();
    expect(events).toEqual([]);
    resolve(true);
    await expect(operation).resolves.toBe(true);
    expect(events).toEqual(['finished']);
  });

  it('rejects with the original reason and ignores later settlements', async () => {
    const deferred = createDeferred<number>();
    const reason = new Error('navigation failed');
    const outcome = expect(deferred.promise).rejects.toBe(reason);

    deferred.reject(reason);
    deferred.resolve(1);
    deferred.reject(new Error('later'));

    await outcome;
  });

  it('keeps instances independent, adopts promise values and defaults to void', async () => {
    const first = createDeferred<number>();
    const second = createDeferred<number>();
    const done = createDeferred();

    first.resolve(second.promise);
    done.resolve();
    second.resolve(7);
    first.reject(new Error('already resolved'));

    await expect(first.promise).resolves.toBe(7);
    await expect(second.promise).resolves.toBe(7);
    await expect(done.promise).resolves.toBeUndefined();
  });
});
