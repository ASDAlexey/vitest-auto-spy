import { Injectable, type Signal, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import '../angular';
import { injectSpy, provideAutoSpy } from './angular';
import { restoreMockedProps } from './prop-mock';
import { mockResourceProp } from './resource-prop';

/** The slice of `ResourceRef` a component reads — declared locally so the spec needs no HTTP. */
interface ProductResource {
  value: Signal<string[]>;
  status: Signal<string>;
  error: Signal<Error | undefined>;
  isLoading: Signal<boolean>;
  hasValue(): boolean;
  reload(): boolean;
}

@Injectable({ providedIn: 'root' })
class ProductService {
  readonly products: ProductResource = {
    value: signal<string[]>([]),
    status: signal('idle'),
    error: signal<Error | undefined>(undefined),
    isLoading: signal(false),
    hasValue: (): boolean => false,
    reload: (): boolean => false,
  };

  refresh(): void {
    /* prototype method, so the auto-spy finds it */
  }
}

describe('mockResourceProp', () => {
  afterEach(() => {
    restoreMockedProps();
    TestBed.resetTestingModule();
  });

  it('starts resolved at the initial value', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(ProductService)] });

    const service = injectSpy(ProductService);

    mockResourceProp(service, 'products', ['a']);

    expect(service.products.value()).toEqual(['a']);
    expect(service.products.status()).toBe('resolved');
    expect(service.products.hasValue()).toBe(true);
    expect(service.products.isLoading()).toBe(false);
    expect(service.products.error()).toBeUndefined();
  });

  it('set() resolves with a new value and clears a previous error', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', []);

    products.fail('offline');
    products.set(['b']);

    expect(service.products.value()).toEqual(['b']);
    expect(service.products.status()).toBe('resolved');
    expect(service.products.error()).toBeUndefined();
    expect(service.products.hasValue()).toBe(true);
  });

  it('fail() takes a string or an Error, and hasValue goes false', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', ['a']);

    products.fail('offline');

    expect(service.products.status()).toBe('error');
    expect(service.products.error()?.message).toBe('offline');
    expect(service.products.hasValue()).toBe(false);

    const cause = new Error('boom');

    products.fail(cause);

    expect(service.products.error()).toBe(cause);
  });

  it('loading() puts it back in flight and clears the error', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', ['a']);

    products.fail('offline');
    products.loading();

    expect(service.products.status()).toBe('loading');
    expect(service.products.isLoading()).toBe(true);
    expect(service.products.hasValue()).toBe(false);
    expect(service.products.error()).toBeUndefined();
  });

  it('stays reactive, so a computed downstream recomputes', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', ['a']);
    // The shape a component actually holds: one derivation over value and status together.
    const label = computed(() => (service.products.isLoading() ? 'loading' : `${service.products.value().length} products`));

    expect(label()).toBe('1 products');

    products.loading();

    expect(label()).toBe('loading');

    products.set(['a', 'b']);

    expect(label()).toBe('2 products');
  });

  it('spies reload() rather than re-issuing anything', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', []);

    products.reload.mockReturnValue(true);

    expect(service.products.reload()).toBe(true);
    expect(products.reload).toHaveBeenCalledTimes(1);
  });

  it('exposes the installed double, and is undone by restoreMockedProps', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', ['a']);

    expect(service.products).toBe(products.resource);

    restoreMockedProps();

    expect(service.products.status()).toBe('idle');
  });
});
