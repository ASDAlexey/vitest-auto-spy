/**
 * The claim this entry makes is "the value is readable on the next line", so the specs prove it the
 * only way that counts: a real `httpResource()` and a real `HttpClient` in a real zoneless
 * `TestBed`, with no `tick`, no `await Promise.resolve()` and no `detectChanges()` written by the
 * test between the flush and the assertion.
 *
 * The failure messages get the same treatment. A spec that mistypes a URL is the normal way to meet
 * `expectRequest`, and the list of requests that *were* made is the whole reason the message is
 * worth more than `expectOne`'s.
 */
import { HttpClient, HttpErrorResponse, type HttpRequest, httpResource, provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { expectNoRequest, expectRequest, provideHttpTesting, verifyNoPendingRequests } from './angular-http';

interface Product {
  id: number;
}

@Component({
  selector: 'vas-products',
  standalone: true,
  template: `<span>{{ products.value()?.length ?? 0 }} products</span>`,
})
class ProductsComponent {
  readonly products = httpResource<Product[]>(() => '/api/products');
}

describe('provideHttpTesting', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
  });

  it('settles an httpResource, so its value reads on the next line', async () => {
    const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

    await expectRequest('/api/products').flush([{ id: 1 }]);

    expect(products.status()).toBe('resolved');
    expect(products.value()).toEqual([{ id: 1 }]);
  });

  it('settles the view that reads the resource, without a detectChanges of its own', async () => {
    const fixture = TestBed.createComponent(ProductsComponent);

    await expectRequest('/api/products').flush([{ id: 1 }, { id: 2 }]);

    expect(fixture.nativeElement.textContent).toContain('2 products');
  });

  it('answers a plain HttpClient call and hands back the request that was sent', async () => {
    const seen: Product[][] = [];

    TestBed.inject(HttpClient)
      .get<Product[]>('/api/products')
      .subscribe((products) => seen.push(products));

    const pending = expectRequest('/api/products');

    expect(pending.request.method).toBe('GET');

    await pending.flush([{ id: 7 }]);

    expect(seen).toEqual([[{ id: 7 }]]);
  });

  it('narrows two requests to the same URL by method, and says so when it cannot', async () => {
    const client = TestBed.inject(HttpClient);

    client.get('/api/products').subscribe();
    client.post('/api/products', { id: 9 }).subscribe();

    expect(() => expectRequest('/api/products')).toThrow(/2 requests matched \/api\/products: GET \/api\/products, POST/);

    client.get('/api/products').subscribe();
    client.post('/api/products', { id: 9 }).subscribe();

    const created = expectRequest('/api/products', { method: 'post' });

    expect(created.request.body).toEqual({ id: 9 });

    await created.flush({ id: 9 });
    await expectRequest('/api/products', { method: 'GET' }).flush([]);
  });

  it('matches the URL with and without its query string, and by pattern', async () => {
    const client = TestBed.inject(HttpClient);

    client.get('/api/products', { params: { page: 2 } }).subscribe();
    await expectRequest('/api/products').flush([]);

    client.get('/api/products', { params: { page: 3 } }).subscribe();
    await expectRequest('/api/products?page=3').flush([]);

    client.get('/api/products', { params: { page: 4 } }).subscribe();
    await expectRequest(/page=\d+/).flush([]);
  });

  it('matches on anything the request carries, when a URL cannot tell two apart', async () => {
    TestBed.inject(HttpClient).post('/api/products', { id: 11 }).subscribe();

    await expectRequest((request) => request.method === 'POST').flush({ id: 11 });
  });

  it('fails an httpResource with a status, and settles that too', async () => {
    const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

    await expectRequest('/api/products').error(503, { statusText: 'Service Unavailable' });

    expect(products.status()).toBe('error');
  });

  it('fails an HttpClient call with the status and statusText the spec asked for', async () => {
    const failures: HttpErrorResponse[] = [];

    TestBed.inject(HttpClient)
      .get('/api/products')
      .subscribe({ error: (error: HttpErrorResponse) => failures.push(error) });

    await expectRequest('/api/products').error(500);

    expect(failures[0]?.status).toBe(500);
  });

  it('lists the requests that were made when none of them matched', () => {
    TestBed.inject(HttpClient).get('/api/product').subscribe();

    expect(() => expectRequest('/api/products', { method: 'get' })).toThrow(
      /expectRequest: no request matched GET \/api\/products\. Made instead: GET \/api\/product\.\nCompare the URL and verb/,
    );
  });

  it('names the verb that was sent when only the verb differs', () => {
    TestBed.inject(HttpClient).get('/api/products').subscribe();

    expect(() => expectRequest('/api/products', { method: 'POST' })).toThrow(
      /expectRequest: no POST \/api\/products — but GET \/api\/products was made\.\nPass \{ method: 'GET' \}, or check which verb/,
    );
  });

  it('names the query that was sent when only the query differs', () => {
    TestBed.inject(HttpClient)
      .get('/api/products', { params: { page: 3 } })
      .subscribe();

    expect(() => expectRequest('/api/products?page=2', { method: 'GET' })).toThrow(
      /no GET \/api\/products\?page=2 — but GET \/api\/products\?page=3 was made; the query differs\.\n.*expectRequest\('\/api\/products'\)/,
    );
  });

  it('says so plainly when nothing was requested at all', () => {
    expect(() => expectRequest(/api/)).toThrow(
      /no request matched \/api\/ — nothing was requested at all\.\nAn httpResource\(\) sends nothing/,
    );
  });

  it('asserts the absence of a request, and names the ones that break the claim', async () => {
    expectNoRequest('/api/products');

    TestBed.inject(HttpClient).get('/api/products').subscribe();

    expect(() => expectNoRequest()).toThrow(/1 request matched a predicate: GET \/api\/products\./);

    TestBed.inject(HttpClient).get('/api/products').subscribe();

    expect(() => expectNoRequest('/api/products', { method: 'GET' })).toThrow(/matched GET \/api\/products/);
  });

  it('names the predicate in a failure, so the reader can find what was asked for', () => {
    TestBed.inject(HttpClient).get('/api/product').subscribe();

    const isProductsRequest = (request: HttpRequest<unknown>): boolean => request.url === '/api/products';

    expect(() => expectRequest(isProductsRequest)).toThrow(/no request matched a predicate \(isProductsRequest\)/);
  });

  it('names the predicate when an absence claim is broken', () => {
    TestBed.inject(HttpClient).get('/api/products').subscribe();

    const isProductsRequest = (request: HttpRequest<unknown>): boolean => request.url === '/api/products';

    expect(() => expectNoRequest(isProductsRequest)).toThrow(/1 request matched a predicate \(isProductsRequest\): GET \/api\/products/);
  });

  it('fails a test that ends holding an unanswered request', () => {
    TestBed.inject(HttpClient).get('/api/products').subscribe();

    expect(verifyNoPendingRequests).toThrow(
      /^\[vitest-auto-spy\] GET \/api\/products was never answered \(when verifyNoPendingRequests\(\) ran\)\.\nThe code under test is still waiting on it[^\n]*\nAnswer it in the spec: await expectRequest\('\/api\/products'\)\.flush\(body\)\.\nDocs: /,
    );
    expect(verifyNoPendingRequests).not.toThrow();
  });

  it('names the verb in the answer when two open requests share a URL', () => {
    const client = TestBed.inject(HttpClient);

    client.post('/api/products', {}).subscribe();
    client.get('/api/products').subscribe();

    expect(verifyNoPendingRequests).toThrow(
      /2 requests were never answered[^:]*: POST \/api\/products, GET \/api\/products\.[\s\S]*Answer each in the spec: await expectRequest\('\/api\/products', \{ method: 'POST' \}\)/,
    );
  });

  it('holds a cancelled request against the test, like Angular verify() does by default', () => {
    TestBed.inject(HttpClient).get('/api/products').subscribe().unsubscribe();

    let message = '';

    try {
      verifyNoPendingRequests();
    } catch (error) {
      message = String(error);
    }

    expect(message).toMatch(
      /GET \/api\/products was never answered[\s\S]*GET \/api\/products was cancelled by the code under test; when that is intended, pass verifyNoPendingRequests\(\{ ignoreCancelled: true \}\)\./,
    );
    expect(message).not.toMatch(/Answer it/);
  });

  it('names the cancelled ones apart from the one still waiting', () => {
    const client = TestBed.inject(HttpClient);

    client.get('/api/first').subscribe().unsubscribe();
    client.get('/api/second').subscribe().unsubscribe();
    client.get('/api/waiting').subscribe();

    expect(verifyNoPendingRequests).toThrow(
      /Answer each in the spec: await expectRequest\('\/api\/waiting'\)\.flush\(body\)\.\nGET \/api\/first, GET \/api\/second were cancelled by the code under test/,
    );
  });

  it('says all of them were cancelled rather than repeating each one', () => {
    TestBed.inject(HttpClient).get('/api/first').subscribe().unsubscribe();
    TestBed.inject(HttpClient).get('/api/second').subscribe().unsubscribe();

    expect(verifyNoPendingRequests).toThrow(/All of them were cancelled by the code under test/);
  });

  it('lets cancelled requests be ignored, without excusing the ones still waiting', () => {
    TestBed.inject(HttpClient).get('/api/cancelled').subscribe().unsubscribe();
    TestBed.inject(HttpClient).get('/api/waiting').subscribe();

    expect(() => verifyNoPendingRequests({ ignoreCancelled: true })).toThrow(/^\[vitest-auto-spy\] GET \/api\/waiting was never answered/);
  });

  it('passes, asked to ignore cancelled requests, when cancelling is all the test did', () => {
    TestBed.inject(HttpClient).get('/api/cancelled').subscribe().unsubscribe();

    expect(() => verifyNoPendingRequests({ ignoreCancelled: true })).not.toThrow();
  });

  it('ignores cancelled requests at teardown when the suite opted in', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...provideHttpTesting({ verifyOnTeardown: { ignoreCancelled: true } })] });
    TestBed.inject(HttpClient).get('/api/cancelled-at-teardown').subscribe().unsubscribe();
  });

  it('leaves the teardown check off when the suite turned it off', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...provideHttpTesting({ verifyOnTeardown: false })] });
    TestBed.inject(HttpClient).get('/api/opt-out').subscribe();

    // Taken by hand, because the teardown check this test disabled is what would otherwise take it.
    expect(verifyNoPendingRequests).toThrow(/GET \/api\/opt-out/);
  });
});

describe('a TestBed without provideHttpTesting', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  });

  it('names the missing providers instead of a token the spec never mentioned', () => {
    expect(() => expectRequest('/api/products')).toThrow(/expectRequest: this TestBed has no HttpTestingController/);
    expect(() => expectNoRequest()).toThrow(/expectNoRequest: this TestBed has no HttpTestingController/);
  });

  it('checks nothing on teardown, rather than failing a suite that never used HTTP testing', () => {
    expect(verifyNoPendingRequests).not.toThrow();
  });
});

describe('a suite that hoists the providers to a constant', () => {
  // Called once at collection time — the ordinary optimisation once a file uses the helper in a
  // dozen places. The teardown check used to be a one-shot arm flag: it verified the first test of
  // the file and let every later one leak silently, so the policy is pinned here from a call no
  // test of its own made.
  const httpTesting = provideHttpTesting();

  it('still verifies a test that never called provideHttpTesting itself', () => {
    TestBed.configureTestingModule({ providers: [...httpTesting] });
    TestBed.inject(HttpClient).get('/api/leaked').subscribe();

    expect(verifyNoPendingRequests).toThrow(/GET \/api\/leaked/);
  });

  it('configures a clean module after a test whose teardown check failed', () => {
    // The throwing hook resets TestBed before rethrowing; without that reset, Vitest skips the
    // framework teardown too and a later configure dies on the previous test's live module.
    TestBed.configureTestingModule({ providers: [...httpTesting] });

    expect(TestBed.inject(HttpClient)).toBeDefined();
  });
});
