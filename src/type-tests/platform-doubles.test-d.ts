/**
 * Type-level tests for `provideWindowDouble` / `provideDocumentDouble`.
 *
 * The runtime specs prove the merge; what they cannot prove is that the overrides are checked at
 * all. The whole point of taking the application's own token is that its window type — not
 * lib.dom's — decides what a spec may name, and the shape that has to keep working next to it is
 * the slice: `{ screen: { width } }` accepted, `{ screen: { widht } }` a compile error rather than
 * a key the double quietly carries and nothing ever reads.
 */
import type { InjectionToken, Provider } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { createDocumentDouble, createWindowDouble, provideDocumentDouble, provideWindowDouble } from '../angular';

interface AppWindow extends Window {
  appBuildId: string;
}

declare const WINDOW: InjectionToken<AppWindow>;
declare const APP_DOCUMENT: InjectionToken<Document>;

describe('the providers', () => {
  it('drop into a providers array as they are', () => {
    expectTypeOf(provideWindowDouble(WINDOW, { innerWidth: 375 })).toExtend<Provider>();
    expectTypeOf(provideWindowDouble(WINDOW)).toExtend<Provider>();
    expectTypeOf(provideDocumentDouble({ visibilityState: 'hidden' })).toExtend<Provider>();
    expectTypeOf(provideDocumentDouble({}, APP_DOCUMENT)).toExtend<Provider>();
    expectTypeOf(provideDocumentDouble()).toExtend<Provider>();
  });

  it("checks the overrides against the token's own window type", () => {
    provideWindowDouble(WINDOW, { appBuildId: '2026.09.12' });

    // @ts-expect-error — `innerWidth` is a number
    provideWindowDouble(WINDOW, { innerWidth: '375px' });

    // @ts-expect-error — nothing on a Window is called that
    provideWindowDouble(WINDOW, { innerWidht: 375 });
  });

  it('takes a slice of a nested member, and checks that too', () => {
    provideWindowDouble(WINDOW, { screen: { width: 1920, height: 1080 } });

    // @ts-expect-error — `Screen` has no `widht`
    provideWindowDouble(WINDOW, { screen: { widht: 1920 } });
  });

  it('takes a whole member the spec built, function or object, where a slice would not do', () => {
    provideDocumentDouble({ querySelector: () => null, location: new URL('https://shop.test/cart') });

    // @ts-expect-error — `visibilityState` is 'visible' or 'hidden'
    provideDocumentDouble({ visibilityState: 'gone' });

    // @ts-expect-error — nothing on a Document is called that
    provideDocumentDouble({ quesrySelector: () => null });
  });
});

describe('the doubles without a TestBed', () => {
  it('read as the platform object itself, not as a look-alike', () => {
    expectTypeOf(createWindowDouble()).toEqualTypeOf<Window>();
    expectTypeOf(createWindowDouble<AppWindow>({ appBuildId: '1' })).toEqualTypeOf<AppWindow>();
    expectTypeOf(createDocumentDouble()).toEqualTypeOf<Document>();
    expectTypeOf(createDocumentDouble().createElement('div')).toEqualTypeOf<HTMLDivElement>();
  });
});
