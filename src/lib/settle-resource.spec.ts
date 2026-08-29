/**
 * `settleResource` exists because Angular's two resource primitives need two different waits and a
 * spec should need one. These specs pin both measurements: an `httpResource` settles one round
 * after its response is flushed, a plain `resource()` takes two, and the same call covers both.
 *
 * The negative case is the one that matters most — a resource nobody flushed must fail *naming
 * itself*, because the alternative is the runner reporting a file-level timeout.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { resource } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { settleResource } from './settle-resource';
import { flushEffects } from './zoneless';

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

  it('returns without ticking when the resource has already settled', async () => {
    const settled = { status: (): string => 'resolved' };

    await expect(settleResource(settled)).resolves.toBeUndefined();
  });

  it('returns for a resource that errored or never started, rather than waiting for the impossible', async () => {
    await expect(settleResource({ status: (): string => 'error' })).resolves.toBeUndefined();
    await expect(settleResource({ status: (): string => 'idle' })).resolves.toBeUndefined();
  });

  it('fails naming the resource and the flush, instead of hanging to the runner timeout', async () => {
    const { httpResource } = await import('@angular/common/http');
    const products = TestBed.runInInjectionContext(() => httpResource<{ id: number }[]>(() => '/api/products'));

    await expect(settleResource(products, { turns: 3, label: 'the product resource' })).rejects.toThrow(
      /the product resource was still 'loading' after 3 rounds.*flush/s,
    );

    TestBed.inject(HttpTestingController).expectOne('/api/products').flush([]);
  });

  it('falls back to a generic name when no label is given', async () => {
    await expect(settleResource({ status: (): string => 'reloading' }, { turns: 1 })).rejects.toThrow(/the resource was still 'reloading'/);
  });
});
