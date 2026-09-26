/**
 * Type-level tests for `stable`.
 *
 * The helper only ever awaits `whenStable()`, so it takes any fixture that has one — Angular
 * 22.2's `DirectiveFixture` included, which shares `AbstractFixture` with `ComponentFixture` but is
 * not one. The published signature must not name `DirectiveFixture`: the peer range starts at 20.
 */
import { type ComponentFixture, type DirectiveFixture } from '@angular/core/testing';
import { describe, expectTypeOf, it } from 'vitest';

import { stable } from '../angular';

declare const componentFixture: ComponentFixture<unknown>;
declare const directiveFixture: DirectiveFixture<unknown>;

describe('stable', () => {
  it('awaits a component fixture or a directive fixture', () => {
    expectTypeOf(stable(componentFixture)).toEqualTypeOf<Promise<void>>();
    expectTypeOf(stable(directiveFixture, { label: 'directive' })).toEqualTypeOf<Promise<void>>();
  });

  it('rejects what has no whenStable', () => {
    // @ts-expect-error — an element is not a fixture
    void stable(document.body);
  });
});
