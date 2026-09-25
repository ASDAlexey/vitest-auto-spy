/**
 * Type-level tests for `hostElement` / `queryElement`.
 *
 * The helpers are worth having only for their return type: `nativeElement` is `any`, and a result
 * that widened back to `any` or `Element` would put every `no-unsafe-*` report straight back into
 * a strict suite while every runtime spec stayed green.
 */
import { type DebugElement } from '@angular/core';
import { type ComponentFixture } from '@angular/core/testing';
import { describe, expectTypeOf, it } from 'vitest';

import { hostElement, queryElement } from '../angular';

declare const fixture: ComponentFixture<unknown>;
declare const debugElement: DebugElement;

describe('hostElement', () => {
  it('returns an HTMLElement when no type is given', () => {
    expectTypeOf(hostElement(fixture)).toEqualTypeOf<HTMLElement>();
    expectTypeOf(hostElement(debugElement)).toEqualTypeOf<HTMLElement>();
  });

  it('returns the element type it is given', () => {
    expectTypeOf(hostElement(fixture, SVGSVGElement)).toEqualTypeOf<SVGSVGElement>();
  });

  it('rejects a constructor that does not build an element', () => {
    // @ts-expect-error — a Date is not an Element
    hostElement(fixture, Date);
  });
});

describe('queryElement', () => {
  it('returns an HTMLElement when no type is given', () => {
    expectTypeOf(queryElement(fixture, '.close')).toEqualTypeOf<HTMLElement>();
  });

  it('returns the element type it is given, from a fixture, a DebugElement or an element', () => {
    expectTypeOf(queryElement(fixture, 'input', HTMLInputElement)).toEqualTypeOf<HTMLInputElement>();
    expectTypeOf(queryElement(debugElement, 'button', HTMLButtonElement)).toEqualTypeOf<HTMLButtonElement>();
    expectTypeOf(queryElement(hostElement(fixture), 'circle', SVGCircleElement)).toEqualTypeOf<SVGCircleElement>();
  });

  it('rejects a source with no nativeElement', () => {
    // @ts-expect-error — a component instance is not a fixture
    queryElement({ title: 'x' }, 'a');
  });
});
