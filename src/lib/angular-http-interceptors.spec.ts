import {
  HTTP_INTERCEPTORS,
  HttpClient,
  HttpErrorResponse,
  type HttpEvent,
  type HttpHandler,
  type HttpInterceptor,
  type HttpInterceptorFn,
  type HttpRequest,
  withInterceptorsFromDi,
  withNoXsrfProtection,
  withXhr,
  withXsrfConfiguration,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Observable, catchError, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { expectRequest, provideHttpTesting } from './angular-http';

class SessionExpired extends Error {}

const authInterceptor: HttpInterceptorFn = (request, next) => next(request.clone({ setHeaders: { Authorization: 'Bearer token-1' } }));

const baseUrlInterceptor: HttpInterceptorFn = (request, next) =>
  next(request.url.startsWith('/') ? request.clone({ url: `https://api.example.com${request.url}` }) : request);

const sessionInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) =>
      throwError(() => (error instanceof HttpErrorResponse && error.status === 401 ? new SessionExpired(request.url) : error)),
    ),
  );

const traceInterceptor: HttpInterceptorFn = (request, next) =>
  next(request.clone({ setHeaders: { 'X-Trace': [request.headers.get('X-Trace'), 'fn'].filter(Boolean).join(',') } }));

@Injectable()
class LegacyTraceInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request.clone({ setHeaders: { 'X-Trace': `${request.headers.get('X-Trace') ?? ''},di` } }));
  }
}

function get(url: string): { errors: unknown[]; bodies: unknown[] } {
  const seen = { errors: [] as unknown[], bodies: [] as unknown[] };

  TestBed.inject(HttpClient)
    .get(url)
    .subscribe({ next: (body) => seen.bodies.push(body), error: (error: unknown) => seen.errors.push(error) });

  return seen;
}

describe('provideHttpTesting({ interceptors })', () => {
  it('hands expectRequest the request as the interceptor sent it', async () => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting({ interceptors: [authInterceptor] })] });
    const seen = get('/api/me');

    const pending = expectRequest('/api/me');

    expect(pending.request.headers.get('Authorization')).toBe('Bearer token-1');

    await pending.flush({ id: 1 });

    expect(seen.bodies).toEqual([{ id: 1 }]);
  });

  it('matches the URL the interceptor rewrote, not the one the code asked for', async () => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting({ interceptors: [baseUrlInterceptor] })] });
    get('/api/products');

    expect(() => expectRequest('/api/products')).toThrow(/Made instead: GET https:\/\/api\.example\.com\/api\/products/);

    get('/api/products');

    await expectRequest('https://api.example.com/api/products').flush([]);
  });

  it('delivers the error the interceptor mapped', async () => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting({ interceptors: [sessionInterceptor] })] });
    const seen = get('/api/me');

    await expectRequest('/api/me').error(401);

    expect(seen.errors).toHaveLength(1);
    expect(seen.errors[0]).toBeInstanceOf(SessionExpired);
  });

  it('runs the interceptors in the order given, then the ones from features', async () => {
    TestBed.configureTestingModule({
      providers: [
        ...provideHttpTesting({ interceptors: [traceInterceptor, authInterceptor], features: [withInterceptorsFromDi()] }),
        { provide: HTTP_INTERCEPTORS, useClass: LegacyTraceInterceptor, multi: true },
      ],
    });
    get('/api/me');

    const pending = expectRequest('/api/me');

    expect(pending.request.headers.get('X-Trace')).toBe('fn,di');
    expect(pending.request.headers.get('Authorization')).toBe('Bearer token-1');

    await pending.flush({});
  });

  it.fails('keeps the end-of-test check armed', () => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting({ interceptors: [authInterceptor] })] });
    get('/api/unanswered');
  });
});

describe('provideHttpTesting({ features })', () => {
  it('passes every feature to one provideHttpClient() call, where Angular checks them against each other', () => {
    expect(() => provideHttpTesting({ features: [withNoXsrfProtection(), withXsrfConfiguration({})] })).toThrow(
      /withXsrfConfiguration\(\) and withNoXsrfProtection\(\)/,
    );
  });

  it('keeps the testing backend over a backend feature', async () => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting({ features: [withXhr()] })] });
    const seen = get('/api/products');

    await expectRequest('/api/products').flush(['chair']);

    expect(seen.bodies).toEqual([['chair']]);
  });
});
