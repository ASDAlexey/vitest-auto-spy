import { Injectable, type Signal, type WritableSignal, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import '../angular';
import { injectSpy, provideAutoSpy } from './angular';
import { restoreMockedProps } from './prop-mock';
import { type ResourceDoubleSnapshot, mockResourceProp } from './resource-prop';

/** The slice of `ResourceRef` a component reads — declared locally so the spec needs no HTTP. */
interface ProductResource {
  value: WritableSignal<string[]>;
  status: Signal<string>;
  error: Signal<Error | undefined>;
  isLoading: Signal<boolean>;
  snapshot: Signal<ResourceDoubleSnapshot<string[]>>;
  hasValue(): boolean;
  set(value: string[]): void;
  update(updater: (value: string[]) => string[]): void;
  asReadonly(): ProductResource;
  destroy(): void;
  reload(): boolean;
}

@Injectable({ providedIn: 'root' })
class ProductService {
  readonly products: ProductResource = {
    value: signal<string[]>([]),
    status: signal('idle'),
    error: signal<Error | undefined>(undefined),
    isLoading: signal(false),
    snapshot: signal<ResourceDoubleSnapshot<string[]>>({ status: 'idle', value: [] }),
    hasValue: (): boolean => false,
    set: (): void => undefined,
    update: (): void => undefined,
    asReadonly(): ProductResource {
      return this;
    },
    destroy: (): void => undefined,
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

  it('spies reload(), which answers true until the spec says otherwise', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', []);

    expect(service.products.reload()).toBe(true);

    products.reload.mockReturnValue(false);

    expect(service.products.reload()).toBe(false);
    expect(products.reload).toHaveBeenCalledTimes(2);
  });

  it('exposes the installed double, and is undone by restoreMockedProps', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', ['a']);

    expect(service.products).toBe(products.resource);

    restoreMockedProps();

    expect(service.products.status()).toBe('idle');
  });

  describe('hasValue', () => {
    it('is true while loading, because the value is still defined', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', []);

      products.loading();

      expect(service.products.status()).toBe('loading');
      expect(service.products.hasValue()).toBe(true);
    });

    it('is true in idle, and false only for an error or an undefined value', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      products.idle();

      expect(service.products.hasValue()).toBe(true);

      products.set(undefined as unknown as string[]);

      expect(service.products.hasValue()).toBe(false);

      products.fail('offline');

      expect(service.products.hasValue()).toBe(false);
    });

    it('is reactive, so a computed over it recomputes', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);
      const shown = computed(() => (service.products.hasValue() ? 'list' : 'spinner'));

      expect(shown()).toBe('list');

      products.fail('offline');

      expect(shown()).toBe('spinner');
    });
  });

  describe('the members a component calls on a real ResourceRef', () => {
    it('set() from the code under test writes the value and goes local', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      products.fail('offline');
      service.products.set(['optimistic']);

      expect(service.products.value()).toEqual(['optimistic']);
      expect(service.products.status()).toBe('local');
      expect(service.products.error()).toBeUndefined();
    });

    it('writes through value.set and value.update the same way', () => {
      const service = new ProductService();

      mockResourceProp(service, 'products', ['a']);

      service.products.value.set(['b']);

      expect(service.products.value()).toEqual(['b']);
      expect(service.products.status()).toBe('local');

      service.products.value.update((current) => [...current, 'c']);

      expect(service.products.value()).toEqual(['b', 'c']);
      expect(service.products.status()).toBe('local');
    });

    it('update() reads the current value and goes local', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      products.loading();
      service.products.update((current) => [...current, 'b']);

      expect(service.products.value()).toEqual(['a', 'b']);
      expect(service.products.status()).toBe('local');
    });

    it('asReadonly() hands back the same double', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      expect(service.products.asReadonly()).toBe(products.resource);
    });

    it('destroy() goes idle at the initial value and stops later writes', () => {
      const service = new ProductService();

      mockResourceProp(service, 'products', ['a']);

      service.products.set(['b']);
      service.products.destroy();

      expect(service.products.status()).toBe('idle');
      expect(service.products.value()).toEqual(['a']);
      expect(service.products.error()).toBeUndefined();

      service.products.set(['late']);

      expect(service.products.value()).toEqual(['a']);
      expect(service.products.status()).toBe('idle');
    });

    it('lets the spec arrange a destroyed double again', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      service.products.destroy();
      products.set(['b']);
      service.products.set(['c']);

      expect(service.products.value()).toEqual(['c']);
      expect(service.products.status()).toBe('local');
    });

    it('snapshot() carries the value, and the error when it failed', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      expect(service.products.snapshot()).toEqual({ status: 'resolved', value: ['a'] });

      products.loading();

      expect(service.products.snapshot()).toEqual({ status: 'loading', value: ['a'] });

      products.fail('offline');

      expect(service.products.snapshot()).toEqual({ status: 'error', error: new Error('offline') });
    });
  });

  describe('idle', () => {
    it('idle() parks it at the initial value and clears the error', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      products.fail('offline');
      products.idle();

      expect(service.products.status()).toBe('idle');
      expect(service.products.value()).toEqual(['a']);
      expect(service.products.isLoading()).toBe(false);
      expect(service.products.error()).toBeUndefined();
    });

    it('installs the double in a status the options name', () => {
      const service = new ProductService();

      mockResourceProp(service, 'products', ['a'], { status: 'idle' });

      expect(service.products.status()).toBe('idle');
      expect(service.products.value()).toEqual(['a']);

      const other = new ProductService();

      mockResourceProp(other, 'products', [], { status: 'loading' });

      expect(other.products.isLoading()).toBe(true);
    });
  });
});
