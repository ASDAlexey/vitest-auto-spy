/**
 * Type-level tests for the Location half of `vitest-auto-spy/angular-router`.
 *
 * The runtime specs prove the double is Angular's own `SpyLocation`; what they cannot prove is that
 * a call site sees it that way — that the handle a spec drives carries the journal and the
 * `simulate*` triggers by name, and that the provider pair drops into `providers` without a cast.
 */
import type { Provider } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { type LocationDouble, createLocationDouble, injectLocationDouble, provideLocationDouble } from '../angular-router';

describe('provideLocationDouble', () => {
  it('is the provider pair, for a providers array spread as it is', () => {
    expectTypeOf(provideLocationDouble()).toExtend<Provider[]>();
  });
});

describe('the double', () => {
  it("hands out Angular's own SpyLocation, journal and simulators typed by name", () => {
    const double = createLocationDouble();

    expectTypeOf(double).toEqualTypeOf<LocationDouble>();
    expectTypeOf(double.urlChanges).toEqualTypeOf<string[]>();
    expectTypeOf(double.simulateUrlPop).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(double.simulateHashChange).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(injectLocationDouble()).toEqualTypeOf<LocationDouble>();
  });
});
