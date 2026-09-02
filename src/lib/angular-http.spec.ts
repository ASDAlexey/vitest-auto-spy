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
import { HttpClient, HttpErrorResponse, httpResource, provideHttpClient } from '@angular/common/http';
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
      /no request matched GET \/api\/products[\s\S]*Requests that were made: GET \/api\/product\./,
    );
  });

  it('says so plainly when nothing was requested at all', () => {
    expect(() => expectRequest(/api/)).toThrow(/no request matched \/api\/[\s\S]*No request was made at all\./);
  });

  it('asserts the absence of a request, and names the ones that break the claim', async () => {
    expectNoRequest('/api/products');

    TestBed.inject(HttpClient).get('/api/products').subscribe();

    expect(() => expectNoRequest()).toThrow(/1 request\(s\) matched a predicate: GET \/api\/products\./);

    TestBed.inject(HttpClient).get('/api/products').subscribe();

    expect(() => expectNoRequest('/api/products', { method: 'GET' })).toThrow(/matched GET \/api\/products/);
  });

  it('fails a test that ends holding an unanswered request', () => {
    TestBed.inject(HttpClient).get('/api/products').subscribe();

    expect(verifyNoPendingRequests).toThrow(/ended with 1 unanswered request\(s\): GET \/api\/products/);
    expect(verifyNoPendingRequests).not.toThrow();
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
