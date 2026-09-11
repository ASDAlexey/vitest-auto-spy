/**
 * Type-level tests for `vitest-auto-spy/angular-router`.
 *
 * The runtime specs prove the route is Angular's own; what they cannot prove is that a call site
 * sees it that way — that `route` reads as `ActivatedRoute` rather than a look-alike a component's
 * constructor would reject, that the provider drops into `providers` without a spread or a cast,
 * and that a misspelled part of the route is a compile error rather than a key nobody reads.
 */
import type { Provider } from '@angular/core';
import { type ActivatedRoute, type ActivatedRouteSnapshot, type Params, UrlSegment } from '@angular/router';
import { describe, expectTypeOf, it } from 'vitest';

import { type ActivatedRouteDouble, createActivatedRoute, injectActivatedRoute, provideActivatedRoute } from '../angular-router';

describe('provideActivatedRoute', () => {
  it('is a provider, for a providers array as it is', () => {
    expectTypeOf(provideActivatedRoute({ params: { id: '7' } })).toExtend<Provider>();
    expectTypeOf(provideActivatedRoute()).toExtend<Provider>();
  });

  it('rejects a part of the route that does not exist', () => {
    // @ts-expect-error — `param` is not a part of a route; `params` is
    provideActivatedRoute({ param: { id: '7' } });
  });

  it('takes a URL as a string or as UrlSegments, and a fragment as a string or null', () => {
    provideActivatedRoute({ url: 'products/7', fragment: null });
    provideActivatedRoute({ url: [new UrlSegment('products', { color: 'red' })], fragment: 'top' });

    // @ts-expect-error — a fragment is a string or null
    provideActivatedRoute({ fragment: 7 });
  });
});

describe('the double', () => {
  it("hands out Angular's own ActivatedRoute, not a look-alike", () => {
    expectTypeOf(injectActivatedRoute()).toEqualTypeOf<ActivatedRouteDouble>();
    expectTypeOf(createActivatedRoute().route).toEqualTypeOf<ActivatedRoute>();
    expectTypeOf(createActivatedRoute().route.snapshot).toEqualTypeOf<ActivatedRouteSnapshot>();
  });

  it('types every setter by the part it replaces', () => {
    const double = createActivatedRoute();

    expectTypeOf(double.setParams).parameter(0).toEqualTypeOf<Params>();
    expectTypeOf(double.setFragment).parameter(0).toEqualTypeOf<string | null>();

    // @ts-expect-error — a URL is not a number
    double.setUrl(7);

    // @ts-expect-error — `route` is the route itself, not something to assign
    double.route = createActivatedRoute().route;
  });
});
