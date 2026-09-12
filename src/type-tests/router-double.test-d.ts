/**
 * Type-level tests for the `Router` double.
 *
 * The runtime specs prove the double answers; what they cannot prove is that a call site sees it as
 * a `Router` — that it drops into a constructor and into `providers` without a cast, that the two
 * navigation spies carry their promise helpers typed by what they resolve, and that a URL the spec
 * mistypes is a compile error rather than a string nobody reads.
 */
import type { Provider } from '@angular/core';
import { NavigationEnd, type Router } from '@angular/router';
import { describe, expectTypeOf, it } from 'vitest';

import { type RouterDouble, createRouterDouble, injectRouterDouble, provideRouterDouble } from '../angular-router';

describe('provideRouterDouble', () => {
  it('is a provider, for a providers array as it is', () => {
    expectTypeOf(provideRouterDouble({ url: '/products/7' })).toExtend<Provider>();
    expectTypeOf(provideRouterDouble()).toExtend<Provider>();
  });

  it('takes a URL and nothing else', () => {
    // @ts-expect-error — a URL is a string, not a list of segments
    provideRouterDouble({ url: ['products', '7'] });

    // @ts-expect-error — `events` is not something the double is configured with; emitNavigation moves it
    provideRouterDouble({ events: [] });
  });
});

describe('the double', () => {
  it("hands out something the code under test reads as Angular's own Router", () => {
    expectTypeOf(injectRouterDouble()).toEqualTypeOf<RouterDouble>();
    expectTypeOf(createRouterDouble().router).toEqualTypeOf<Router>();
    expectTypeOf(createRouterDouble().router.url).toEqualTypeOf<string>();
  });

  it('types both navigation spies by what they resolve', () => {
    const double = createRouterDouble();

    double.navigate.resolveWith(false);
    double.navigateByUrl.rejectWith(new Error('offline'));
    expectTypeOf(double.router.navigate(['/checkout'])).toEqualTypeOf<Promise<boolean>>();

    // @ts-expect-error — navigate resolves a boolean, not a URL
    double.navigate.resolveWith('/checkout');
  });

  it('moves the URL with a string and the events with an event', () => {
    const double = createRouterDouble();

    double.setUrl('/products/8');
    double.emitNavigation();
    double.emitNavigation('/products/8');
    double.emitNavigation(new NavigationEnd(1, '/products/8', '/products/8'));

    // @ts-expect-error — a URL is a string
    double.setUrl(8);

    // @ts-expect-error — `router` is the double itself, not something to assign
    double.router = createRouterDouble().router;
  });
});
