/**
 * Type-level tests for `mockSignalProps`, `createElementStub`, `providePlatform` and the
 * sanitizer, change-detector and overlay doubles: each key and value checked against the object it
 * drives, and the doubles typed as what the code under test injects.
 */
import { ChangeDetectorRef, InjectionToken, type Signal, type ValueProvider, type WritableSignal } from '@angular/core';
import type { DomSanitizer } from '@angular/platform-browser';
import { describe, expectTypeOf, it } from 'vitest';

import { mockSignalProps } from '../angular';
import {
  type OverlayDouble,
  type OverlayRefStub,
  createChangeDetectorRefDouble,
  createDomSanitizerDouble,
  createOverlayDouble,
  providePlatform,
} from '../angular-doubles';
import { type ElementStub, createElementStub, fillMissingDomApis } from '../dom-stubs';
import type { Spy } from '../index';

declare class CartStore {
  readonly items: Signal<string[]>;
  readonly total: Signal<number>;
  readonly loading: Signal<boolean>;
  checkout(): void;
}

declare const store: CartStore;

describe('mockSignalProps', () => {
  it('returns a writable handle per key, typed from the member', () => {
    const handles = mockSignalProps(store, { items: ['a'], total: 1 });

    expectTypeOf<keyof typeof handles>().toEqualTypeOf<'items' | 'total'>();
    expectTypeOf(handles.items).toEqualTypeOf<WritableSignal<string[]>>();
    expectTypeOf(handles.total).toEqualTypeOf<WritableSignal<number>>();
  });

  it('checks each value against its signal, and each key against the object', () => {
    // @ts-expect-error -- `total` is a Signal<number>
    mockSignalProps(store, { total: 'one' });

    // @ts-expect-error -- `count` is not a member of the store
    mockSignalProps(store, { count: 1 });
  });
});

describe('createElementStub', () => {
  it('types the element as the element type asked for', () => {
    expectTypeOf(createElementStub().element).toEqualTypeOf<HTMLElement>();
    expectTypeOf(createElementStub<HTMLInputElement>({ tagName: 'input', overrides: { value: 'x' } })).toEqualTypeOf<
      ElementStub<HTMLInputElement>
    >();

    // @ts-expect-error -- an override is checked against the element type
    createElementStub<HTMLInputElement>({ overrides: { value: 1 } });
  });

  it('reports the filled names', () => {
    expectTypeOf(fillMissingDomApis({ cheapComputedStyle: true })).toEqualTypeOf<readonly string[]>();
  });
});

describe('providePlatform', () => {
  it('takes the two platforms only', () => {
    const IS_BROWSER = new InjectionToken<boolean>('IS_BROWSER');

    expectTypeOf(providePlatform('server', { isBrowser: IS_BROWSER })).toEqualTypeOf<ValueProvider[]>();

    // @ts-expect-error -- not a platform `isPlatformBrowser` / `isPlatformServer` knows
    providePlatform('worker');
  });
});

describe('the Angular doubles', () => {
  it('types the sanitizer and the change detector as spies of the injected class', () => {
    expectTypeOf(createDomSanitizerDouble()).toEqualTypeOf<Spy<DomSanitizer>>();
    expectTypeOf(createChangeDetectorRefDouble()).toEqualTypeOf<Spy<ChangeDetectorRef>>();
  });

  it('types the overlay as the class passed, and create() as the ref stub', () => {
    class Overlay {
      create(_config?: unknown): unknown {
        return undefined;
      }
    }

    const double = createOverlayDouble(Overlay);

    expectTypeOf(double).toEqualTypeOf<OverlayDouble<Overlay>>();
    expectTypeOf(double.overlay).toEqualTypeOf<Overlay>();
    expectTypeOf(double.create).returns.toEqualTypeOf<OverlayRefStub>();

    // @ts-expect-error -- not an overlay: nothing to create() with
    createOverlayDouble(ChangeDetectorRef);
  });
});
