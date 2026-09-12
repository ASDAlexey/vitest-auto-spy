/**
 * `settleResource` exists because Angular's two resource primitives need two different waits and a
 * spec should need one. These specs pin both measurements: an `httpResource` settles one round
 * after its response is flushed, a plain `resource()` takes two, and the same call covers both.
 *
 * The negative cases are the ones that matter most — a resource nobody flushed must fail *naming
 * itself*, because the alternative is the runner reporting a file-level timeout, and a resource
 * that never started must fail too, because the alternative is a green test reading the default.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { resource, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ResourceStatusLike, settleResource } from './settle-resource';
import { flushEffects } from './zoneless';

/** The real timer, so the fake-timer case below can still resolve its loader out of band. */
const realTimer: typeof setTimeout = globalThis.setTimeout.bind(globalThis);

/** A double whose `status()` answers `loading` for the given number of reads, then `resolved`. */
function settlingAfter(reads: number): ResourceStatusLike {
  let seen = 0;

  return {
    status: (): string => {
      seen += 1;

      return seen > reads ? 'resolved' : 'loading';
    },
  };
}

describe('settleResource', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  it('takes delivery of a flushed httpResource response', async () => {
    const { httpResource } = await import('@angular/common/http');
    const products = TestBed.runInInjectionContext(() => httpResource<{ id: number }[]>(() => '/api/products'));

    // Nothing is in flight until something ticks — the whole reason `flushEventLoopUntil` could
    // never serve this, and the reason the tick below comes before the flush rather than after.
    expect(products.status()).toBe('loading');

    flushEffects();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/products')
      .flush([{ id: 1 }]);

    // Still `loading` with the default value at this point: the response needs one microtask more.
    expect(products.status()).toBe('loading');

    await settleResource(products, { label: 'the product resource' });

    expect(products.status()).toBe('resolved');
    expect(products.value()).toEqual([{ id: 1 }]);
  });

  it('settles a plain resource(), which needs one more round than an httpResource', async () => {
    const data = TestBed.runInInjectionContext(() => resource({ loader: async () => 'loaded' }));

    await settleResource(data);

    expect(data.status()).toBe('resolved');
    expect(data.value()).toBe('loaded');
  });

  it('settles a loader that resolves on a real timer, which no number of microtasks reaches', async () => {
    const timed = TestBed.runInInjectionContext(() =>
      resource({
        params: () => 1,
        loader: () =>
          new Promise<string[]>((resolve) => {
            setTimeout(() => resolve(['late']), 5);
          }),
        defaultValue: [],
      }),
    );

    await settleResource(timed, { label: 'the timed resource' });

    expect(timed.status()).toBe('resolved');
    expect(timed.value()).toEqual(['late']);
  });

  it('takes its event-loop turn on a timer captured at import, so fake timers cannot freeze it', async () => {
    vi.useFakeTimers();

    try {
      const timed = TestBed.runInInjectionContext(() =>
        resource({
          params: () => 1,
          loader: () =>
            new Promise<string>((resolve) => {
              realTimer(() => resolve('late'), 1);
            }),
          defaultValue: '',
        }),
      );

      await settleResource(timed, { label: 'the timed resource' });

      expect(timed.value()).toBe('late');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns without ticking when the resource has already settled', async () => {
    const settled = { status: (): string => 'resolved' };

    await expect(settleResource(settled)).resolves.toBeUndefined();
  });

  it('returns for a resource that errored, which toHaveResourceError is the assertion for', async () => {
    await expect(settleResource({ status: (): string => 'error' })).resolves.toBeUndefined();
  });

  it('refuses an idle resource instead of letting every assertion read the default value', async () => {
    const params = signal<number | undefined>(undefined);
    const idle = TestBed.runInInjectionContext(() =>
      resource({ params: () => params(), loader: async () => ['x'], defaultValue: ['DEFAULT'] }),
    );

    flushEffects();

    await expect(settleResource(idle, { label: 'the idle resource' })).rejects.toThrow(
      /the idle resource never started .* status is 'idle'.*allowIdle/s,
    );

    expect(idle.status()).toBe('idle');
    expect(idle.value()).toEqual(['DEFAULT']);
  });

  it('accepts idle once the spec says the idle state is what it is asserting', async () => {
    await expect(settleResource({ status: (): string => 'idle' }, { allowIdle: true })).resolves.toBeUndefined();
  });

  it('falls back to a generic name in the idle failure too', async () => {
    await expect(settleResource({ status: (): string => 'idle' })).rejects.toThrow(/the resource never started/);
  });

  it('fails naming the resource and the flush, instead of hanging to the runner timeout', async () => {
    const { httpResource } = await import('@angular/common/http');
    const products = TestBed.runInInjectionContext(() => httpResource<{ id: number }[]>(() => '/api/products'));

    await expect(settleResource(products, { turns: 3, label: 'the product resource' })).rejects.toThrow(
      /the product resource was still 'loading' after 3 rounds.*flush/s,
    );

    TestBed.inject(HttpTestingController).expectOne('/api/products').flush([]);
  });

  it('spends exactly the rounds it reports, so { turns: 0 } is check-and-fail', async () => {
    await expect(settleResource(settlingAfter(1), { turns: 0, label: 'the stuck resource' })).rejects.toThrow(
      /the stuck resource was still 'loading' after 0 rounds/,
    );

    await expect(settleResource(settlingAfter(1), { turns: 1 })).resolves.toBeUndefined();
  });

  it('spends twenty rounds by default and says so', async () => {
    await expect(settleResource({ status: (): string => 'loading' })).rejects.toThrow(
      /was still 'loading' after 20 rounds of tick \+ microtask/,
    );
  });

  it('falls back to a generic name when no label is given', async () => {
    await expect(settleResource({ status: (): string => 'reloading' }, { turns: 1 })).rejects.toThrow(/the resource was still 'reloading'/);
  });
});
