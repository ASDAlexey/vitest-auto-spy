/**
 * The optional rxjs layer on `node:test`.
 *
 * The observable helpers are pure rxjs over the shared `MockAdapter`, so what this proves is that
 * nothing between the spy and the subject reaches for a Vitest-only primitive, and that the
 * timing-sensitive helpers settle against Node's own event loop rather than a fake one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Observable, firstValueFrom, lastValueFrom, of, toArray } from 'rxjs';

import { createSpyFromClass, expectEmission, expectNoEmission } from '../node';
import '../rxjs';

class FeedService {
  status$: Observable<string> = of('idle');

  watch(topic: string): Observable<string> {
    return of(topic);
  }
}

describe('observable spies on node:test', () => {
  it('emits a sequence from an observable-returning method', async () => {
    const feed = createSpyFromClass(FeedService);

    feed.watch.nextWithValues([{ value: 'first' }, { value: 'second' }, { complete: true }]);

    assert.deepEqual(await lastValueFrom(feed.watch('news').pipe(toArray())), ['first', 'second']);
  });

  it('emits from an observable property, and errors the same stream afterwards', async () => {
    const feed = createSpyFromClass(FeedService, { observablePropsToSpyOn: ['status$'] });

    feed.status$.nextOneTimeWith('ready');
    assert.equal(await firstValueFrom(feed.status$), 'ready');

    feed.status$.throwWith('feed lost');
    await assert.rejects(firstValueFrom(feed.status$), /feed lost/);
  });

  it('settles expectEmission and expectNoEmission on Node’s event loop', async () => {
    const feed = createSpyFromClass(FeedService, { observablePropsToSpyOn: ['status$'] });
    const emitted = expectEmission(feed.status$);

    feed.status$.nextWith('live');

    assert.equal(await emitted, 'live');

    const silent = createSpyFromClass(FeedService, { observablePropsToSpyOn: ['status$'] });

    await expectNoEmission(silent.status$);
  });
});
