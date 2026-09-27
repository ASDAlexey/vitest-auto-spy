/**
 * Type-level tests for `provideHttpTesting`'s interceptor and feature options: they take exactly what
 * `withInterceptors()` and `provideHttpClient()` take, including a `readonly` constant.
 */
import {
  type HttpInterceptorFn,
  withInterceptors,
  withInterceptorsFromDi,
  withNoXsrfProtection,
  withXsrfConfiguration,
} from '@angular/common/http';
import { type EnvironmentProviders, type Provider } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { type HttpTestingOptions, provideHttpTesting } from '../angular-http';

declare const auth: HttpInterceptorFn;
declare const retry: HttpInterceptorFn;

describe('provideHttpTesting', () => {
  it('takes functional interceptors, readonly included', () => {
    const interceptors = [auth, retry] as const;

    expectTypeOf(provideHttpTesting({ interceptors })).toEqualTypeOf<(EnvironmentProviders | Provider)[]>();
    expectTypeOf<NonNullable<HttpTestingOptions['interceptors']>>().toEqualTypeOf<readonly HttpInterceptorFn[]>();
  });

  it('takes any provideHttpClient() feature, of mixed kinds', () => {
    expectTypeOf({
      features: [withInterceptorsFromDi(), withXsrfConfiguration({ headerName: 'X-Token' }), withInterceptors([auth])],
    }).toExtend<HttpTestingOptions>();
    expectTypeOf({ features: [withNoXsrfProtection()], verifyOnTeardown: false }).toExtend<HttpTestingOptions>();
  });

  it('refuses a class interceptor where a function is expected', () => {
    class LegacyInterceptor {
      intercept(): void {}
    }

    expectTypeOf({ interceptors: [new LegacyInterceptor()] }).not.toExtend<HttpTestingOptions>();
    expectTypeOf({ features: [auth] }).not.toExtend<HttpTestingOptions>();
  });
});
