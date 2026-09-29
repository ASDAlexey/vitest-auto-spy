/**
 * Type-level tests for the `renderShallow` / `prepareShallow` options that reach `TestBed`: the
 * additive lists on `create()`, the `testBed` passthrough, and the `cleanTestBed` grade of `setupAutoSpy`.
 */
import { Component, type EnvironmentProviders, type Provider } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { type ShallowOverrides, prepareShallow, renderShallow } from '../angular';
import type { SetupAutoSpyOptions } from '../setup';

@Component({ selector: 'app-typed', template: '' })
class TypedComponent {}

describe('prepareShallow create()', () => {
  it('takes extraProviders and extraImports next to every renderShallow option', () => {
    const prepare = prepareShallow(TypedComponent);

    prepare.create({ extraProviders: [{ provide: 'X', useValue: 1 }], extraImports: [], detectChanges: false });

    expectTypeOf<ShallowOverrides<TypedComponent>['extraProviders']>().toEqualTypeOf<(EnvironmentProviders | Provider)[] | undefined>();
  });

  it('keeps the additive lists off renderShallow itself', () => {
    // @ts-expect-error — `extraProviders` only means something against prepared options
    renderShallow(TypedComponent, { extraProviders: [] });
  });
});

describe('renderShallow testBed', () => {
  it('passes the rest of the TestBed metadata through', () => {
    renderShallow(TypedComponent, {
      testBed: { errorOnUnknownElements: true, errorOnUnknownProperties: true, teardown: { destroyAfterEach: true } },
    });
  });

  it('refuses the keys renderShallow owns', () => {
    // @ts-expect-error — providers have their own option
    renderShallow(TypedComponent, { testBed: { providers: [] } });
  });
});

describe('setupAutoSpy cleanTestBed', () => {
  it('is graded like every other guard', () => {
    expectTypeOf<SetupAutoSpyOptions['cleanTestBed']>().toEqualTypeOf<'off' | 'throw' | 'warn' | undefined>();
  });
});
