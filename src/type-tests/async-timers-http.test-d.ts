/**
 * Type-level tests for the async helpers whose return type follows an argument: a `{ tick: false }`
 * request answered synchronously, `withFakeTimers` handing back what its body returns, the sync
 * no-emission check, the observer-spy timeout and the subscriber count on an observable prop spy.
 */
import { HttpErrorResponse } from '@angular/common/http';
import { type Observable, Subject } from 'rxjs';
import { describe, expectTypeOf, it } from 'vitest';

import { type RequestExpectation, expectRequest } from '../angular-http';
import { createSpyFromClass, expectNoEmissionSync } from '../auto-spy';
import { subscribeSpyTo } from '../observer-spy';
import { type ExpectedUnhandledError, withFakeTimers } from '../setup';

describe('expectRequest', () => {
  it('answers synchronously on { tick: false }, and with a promise otherwise', () => {
    expectTypeOf(expectRequest('/api', { tick: false })).toEqualTypeOf<RequestExpectation<void>>();
    expectTypeOf(expectRequest('/api', { tick: false }).flush({})).toBeVoid();
    expectTypeOf(expectRequest('/api', { tick: false, method: 'POST' }).error(401)).toBeVoid();
    expectTypeOf(expectRequest('/api').flush({})).toEqualTypeOf<Promise<void>>();
    expectTypeOf(expectRequest('/api', { tick: true }).error(500)).toEqualTypeOf<Promise<void>>();
    expectTypeOf(expectRequest('/api', { method: 'GET' })).toEqualTypeOf<RequestExpectation>();
  });
});

describe('expectUnhandledObservableErrors', () => {
  it('takes a class that does not extend Error, such as HttpErrorResponse', () => {
    expectTypeOf(HttpErrorResponse).toExtend<ExpectedUnhandledError>();
    expectTypeOf({ message: /502/ }).toExtend<ExpectedUnhandledError>();
  });
});

describe('withFakeTimers', () => {
  it('returns what the body returns, a promise for an async body', () => {
    expectTypeOf(withFakeTimers(() => 1)).toEqualTypeOf<number>();
    expectTypeOf(withFakeTimers(async () => 'done')).toEqualTypeOf<Promise<string>>();
    expectTypeOf(withFakeTimers(() => undefined, { toFake: ['setTimeout'] })).toEqualTypeOf<undefined>();
  });
});

describe('expectNoEmissionSync', () => {
  it('returns nothing and takes no timeout', () => {
    expectTypeOf(expectNoEmissionSync(new Subject<number>(), { skip: 1, until: (value) => value > 1 })).toBeVoid();
    // @ts-expect-error -- a sync check has no window to wait for
    expectNoEmissionSync(new Subject<number>(), { timeout: 5 });
  });
});

describe('ObserverSpy', () => {
  it('takes a timeout on the promise forms and keeps the callback forms void', () => {
    const spy = subscribeSpyTo(new Subject<number>());

    expectTypeOf(spy.onComplete({ timeout: 100 })).toEqualTypeOf<Promise<void>>();
    expectTypeOf(spy.onError({ timeout: 100 })).toEqualTypeOf<Promise<void>>();
    expectTypeOf(spy.onComplete(() => undefined)).toBeVoid();
  });
});

describe('an observable prop spy', () => {
  class Feed {
    items$!: Observable<number>;
  }

  it('counts its open subscriptions', () => {
    const feed = createSpyFromClass(Feed, { observablePropsToSpyOn: ['items$'] });

    expectTypeOf(feed.items$.subscriberCount()).toEqualTypeOf<number>();
  });
});
