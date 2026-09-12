/**
 * Type-level tests for `mockResourceProp` against Angular's own `ResourceRef`.
 *
 * The value type is taken from the property, not from the argument, which is what makes the wrong
 * initial value a compile error rather than a resource that quietly holds the wrong thing. The
 * double is checked here member by member because it stands in for a `ResourceRef` at a consumer
 * that is typed against the real one: anything missing from it is a `TypeError` at run time, with
 * nothing to catch it in the spec.
 */
import type { ResourceRef, WritableSignal } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { type ResourceDouble, mockResourceProp } from '../angular';

declare class ProductService {
  readonly products: ResourceRef<string[]>;
}

declare const service: ProductService;

describe('mockResourceProp', () => {
  it('takes the value type from the property', () => {
    const products = mockResourceProp(service, 'products', ['a']);

    expectTypeOf(products.resource).toEqualTypeOf<ResourceDouble<string[]>>();
    expectTypeOf(products.set).parameter(0).toEqualTypeOf<string[]>();

    // @ts-expect-error -- the initial value has to be the resource's own
    mockResourceProp(service, 'products', [1]);
  });

  it('takes a starting status, but not the one that needs a reason', () => {
    mockResourceProp(service, 'products', [], { status: 'idle' });
    mockResourceProp(service, 'products', [], { status: 'loading' });

    // @ts-expect-error -- an error needs a reason, which is what fail() takes
    mockResourceProp(service, 'products', [], { status: 'error' });
    // @ts-expect-error -- there is no such option
    mockResourceProp(service, 'products', [], { state: 'idle' });
  });

  it('hands back a double carrying every member of a ResourceRef', () => {
    const { resource } = mockResourceProp(service, 'products', ['a']);

    expectTypeOf(resource.value).toEqualTypeOf<WritableSignal<string[]>>();
    expectTypeOf(resource.hasValue()).toEqualTypeOf<boolean>();
    expectTypeOf(resource.set).parameter(0).toEqualTypeOf<string[]>();
    expectTypeOf(resource.update).parameter(0).toEqualTypeOf<(value: string[]) => string[]>();
    expectTypeOf(resource.asReadonly()).toEqualTypeOf<ResourceDouble<string[]>>();
    expectTypeOf(resource.destroy()).toEqualTypeOf<void>();
    expectTypeOf(resource.reload()).toEqualTypeOf<boolean>();
  });

  it('narrows the snapshot on its status, the way a template branches on it', () => {
    const { resource } = mockResourceProp(service, 'products', ['a']);
    const snapshot = resource.snapshot();

    if (snapshot.status === 'error') {
      expectTypeOf(snapshot.error).toEqualTypeOf<Error | undefined>();
    } else {
      expectTypeOf(snapshot.value).toEqualTypeOf<string[]>();
    }
  });
});
