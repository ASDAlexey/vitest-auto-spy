import { Injectable, type ResourceRef, type Signal, type WritableSignal, computed, resource, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import '../angular';
import { injectSpy, provideAutoSpy } from './angular';
import { restoreMockedProps } from './prop-mock';
import { type ResourceDoubleSnapshot, mockResourceProp } from './resource-prop';
import { PRODUCTS_AB } from './resource-prop.mock';
import { settleResource } from './settle-resource';
import { registerSignalMatchers } from './signal-matchers';

beforeAll(() => registerSignalMatchers());

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

    expect(service.products.value).toHaveSignalValue(['a']);
    expect(service.products.status).toHaveSignalValue('resolved');
    expect(service.products.hasValue()).toBe(true);
    expect(service.products.isLoading).toHaveSignalValue(false);
    expect(service.products.error).toHaveSignalValue(undefined);
  });

  it('set() resolves with a new value and clears a previous error', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', []);

    products.fail('offline');
    products.set(['b']);

    expect(service.products.value).toHaveSignalValue(['b']);
    expect(service.products.status).toHaveSignalValue('resolved');
    expect(service.products.error).toHaveSignalValue(undefined);
    expect(service.products.hasValue()).toBe(true);
  });

  it('fail() takes a string or an Error, and hasValue goes false', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', ['a']);

    products.fail('offline');

    expect(service.products.status).toHaveSignalValue('error');
    expect(service.products.error()?.message).toBe('offline');
    expect(service.products.hasValue()).toBe(false);

    const cause = new Error('boom');

    products.fail(cause);

    expect(service.products.error()).toBe(cause);
  });

  it('value() throws once it has failed, exactly as a real resource does', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', ['a']);
    const cause = new Error('offline');

    products.fail(cause);

    // The failure a double that kept the value readable hid: component code reading `value()`
    // without `hasValue()` passes in the test and dies in the application.
    expect(() => service.products.value()).toThrow(/value\(\) was read while the resource is in the error state/);
    expect(() => service.products.value()).toThrow(/branch on hasValue\(\) or status\(\)/);

    try {
      service.products.value();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).constructor.name).toBe('ResourceValueError');
      expect((error as Error).cause).toBe(cause);
    }

    // Everything a spec asserts on a failed resource still reads.
    expect(service.products.hasValue()).toBe(false);
    expect(service.products.snapshot).toHaveSignalValue({ status: 'error', error: cause });
    expect(service.products.error()).toBe(cause);
  });

  it('keeps the value it had once the spec resolves it again', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', ['a']);

    products.set(PRODUCTS_AB);
    products.fail('offline');
    products.reloading();

    // `fail()` and `reloading()` leave the value alone; `loading()` and `idle()` go back to the initial one.
    expect(service.products.value).toHaveSignalValue(PRODUCTS_AB);
  });

  it("loading() reads the initial value, the way new params read a real resource's defaultValue", () => {
    const service = new ProductService();
    const products = mockResourceProp<ProductService, 'products'>(service, 'products', undefined as unknown as string[]);

    products.set(PRODUCTS_AB);
    products.loading();

    expect(service.products.value).toHaveSignalValue(undefined);
    expect(service.products.hasValue()).toBe(false);
    expect(service.products.snapshot).toHaveSignalValue({ status: 'loading', value: undefined });
  });

  it('reloading() keeps the value in flight and answers reload() with true', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', []);

    products.set(PRODUCTS_AB);
    products.reloading();

    expect(service.products.status).toHaveSignalValue('reloading');
    expect(service.products.isLoading).toHaveSignalValue(true);
    expect(service.products.hasValue()).toBe(true);
    expect(service.products.value).toHaveSignalValue(PRODUCTS_AB);
    expect(service.products.reload()).toBe(true);
  });

  it('matches a real resource() through new params and a reload', async () => {
    const id = signal(1);
    const real = TestBed.runInInjectionContext(() => resource({ params: () => id(), loader: async ({ params }) => [String(params)] }));
    const observe = (): unknown[] => [real.status(), real.value(), real.hasValue()];

    await settleResource(real);

    const resolved = observe();

    id.set(2);
    TestBed.tick();

    const loading = observe();

    await settleResource(real);
    real.reload();
    TestBed.tick();

    const reloading = observe();

    const holder = { items: undefined as unknown as ResourceRef<string[] | undefined> };
    const double = mockResourceProp(holder, 'items', undefined);
    const observeDouble = (): unknown[] => [holder.items.status(), holder.items.value(), holder.items.hasValue()];

    double.set(['1']);

    expect(observeDouble()).toEqual(resolved);

    double.loading();

    expect(observeDouble()).toEqual(loading);

    double.set(['2']);
    double.reloading();

    expect(observeDouble()).toEqual(reloading);
  });

  it('answers reload() the way Angular does: false while there is nothing to re-issue', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', [], { status: 'idle' });

    // A real `reload()` refuses in `idle` and `loading`, and a spec branching on the result was
    // branching on a constant.
    expect(service.products.reload()).toBe(false);

    products.loading();

    expect(service.products.reload()).toBe(false);

    products.set(['a']);

    expect(service.products.reload()).toBe(true);

    products.fail('offline');

    expect(service.products.reload()).toBe(true);
  });

  it('loading() puts it back in flight and clears the error', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', ['a']);

    products.fail('offline');
    products.loading();

    expect(service.products.status).toHaveSignalValue('loading');
    expect(service.products.isLoading).toHaveSignalValue(true);
    expect(service.products.error).toHaveSignalValue(undefined);
  });

  it('stays reactive, so a computed downstream recomputes', () => {
    const service = new ProductService();
    const products = mockResourceProp(service, 'products', ['a']);
    // The shape a component actually holds: one derivation over value and status together.
    const label = computed(() => (service.products.isLoading() ? 'loading' : `${service.products.value().length} products`));

    expect(label).toHaveSignalValue('1 products');

    products.loading();

    expect(label).toHaveSignalValue('loading');

    products.set(PRODUCTS_AB);

    expect(label).toHaveSignalValue('2 products');
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

    expect(service.products.status).toHaveSignalValue('idle');
  });

  describe('hasValue', () => {
    it('is true while loading over a defined initial value', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', []);

      products.set(['a']);
      products.loading();

      expect(service.products.status).toHaveSignalValue('loading');
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

      expect(shown).toHaveSignalValue('list');

      products.fail('offline');

      expect(shown).toHaveSignalValue('spinner');
    });
  });

  describe('the members a component calls on a real ResourceRef', () => {
    it('set() from the code under test writes the value and goes local', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      products.fail('offline');
      service.products.set(['optimistic']);

      expect(service.products.value).toHaveSignalValue(['optimistic']);
      expect(service.products.status).toHaveSignalValue('local');
      expect(service.products.error).toHaveSignalValue(undefined);
    });

    it('writes through value.set and value.update the same way', () => {
      const service = new ProductService();

      mockResourceProp(service, 'products', ['a']);

      service.products.value.set(['b']);

      expect(service.products.value).toHaveSignalValue(['b']);
      expect(service.products.status).toHaveSignalValue('local');

      service.products.value.update((current) => [...current, 'c']);

      expect(service.products.value).toHaveSignalValue(['b', 'c']);
      expect(service.products.status).toHaveSignalValue('local');
    });

    it('update() reads the current value and goes local', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      products.loading();
      service.products.update((current) => [...current, 'b']);

      expect(service.products.value).toHaveSignalValue(PRODUCTS_AB);
      expect(service.products.status).toHaveSignalValue('local');
    });

    it('hands back a readonly view of the value, the way Angular assembles one', () => {
      const service = new ProductService();

      mockResourceProp(service, 'products', ['a']);

      // `BaseWritableResource` puts `set`, `update` and `asReadonly` on its own `value` computation;
      // a service exposing `products.value.asReadonly()` calls this before the spec starts.
      expect(service.products.value.asReadonly()).toHaveSignalValue(['a']);
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

      expect(service.products.status).toHaveSignalValue('idle');
      expect(service.products.value).toHaveSignalValue(['a']);
      expect(service.products.error).toHaveSignalValue(undefined);

      service.products.set(['late']);

      expect(service.products.value).toHaveSignalValue(['a']);
      expect(service.products.status).toHaveSignalValue('idle');
    });

    it('lets the spec arrange a destroyed double again', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      service.products.destroy();
      products.set(['b']);
      service.products.set(['c']);

      expect(service.products.value).toHaveSignalValue(['c']);
      expect(service.products.status).toHaveSignalValue('local');
    });

    it('snapshot() carries the value, and the error when it failed', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      expect(service.products.snapshot).toHaveSignalValue({ status: 'resolved', value: ['a'] });

      products.reloading();

      expect(service.products.snapshot).toHaveSignalValue({ status: 'reloading', value: ['a'] });

      products.fail('offline');

      expect(service.products.snapshot).toHaveSignalValue({ status: 'error', error: new Error('offline') });
    });
  });

  describe('idle', () => {
    it('idle() parks it at the initial value and clears the error', () => {
      const service = new ProductService();
      const products = mockResourceProp(service, 'products', ['a']);

      products.fail('offline');
      products.idle();

      expect(service.products.status).toHaveSignalValue('idle');
      expect(service.products.value).toHaveSignalValue(['a']);
      expect(service.products.isLoading).toHaveSignalValue(false);
      expect(service.products.error).toHaveSignalValue(undefined);
    });

    it('installs the double in a status the options name', () => {
      const service = new ProductService();

      mockResourceProp(service, 'products', ['a'], { status: 'idle' });

      expect(service.products.status).toHaveSignalValue('idle');
      expect(service.products.value).toHaveSignalValue(['a']);

      const other = new ProductService();

      mockResourceProp(other, 'products', [], { status: 'loading' });

      expect(other.products.isLoading).toHaveSignalValue(true);
    });
  });
});
