/**
 * Type-level tests for the `renderShallow` / `prepareShallow` options that reach `TestBed`: the
 * additive lists on `create()`, the `testBed` passthrough, and the `cleanTestBed` grade of `setupAutoSpy`.
 */
import { Component, type EnvironmentProviders, type Provider, input, model } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { type ShallowOverrides, createComponentStub, prepareShallow, renderShallow } from '../angular';
import type { SetupAutoSpyOptions } from '../setup';

@Component({ selector: 'app-typed', template: '' })
class TypedComponent {
  readonly heading = input('', { alias: 'title' });
  readonly level = input(0, { alias: 'priority', transform: (value: string) => Number(value) });
  readonly position = model(0);
}

interface HeadingInputs {
  heading: string;
}

describe('createComponentStub signal transforms', () => {
  it('takes the write type and returns the read type of a signal input', () => {
    createComponentStub(TypedComponent, {}, { signalTransforms: { level: (value) => value.length } });
    // @ts-expect-error -- the transform must produce the number read by the child
    createComponentStub(TypedComponent, {}, { signalTransforms: { level: (value) => value } });
    // @ts-expect-error -- transforms use field names, not public aliases
    createComponentStub(TypedComponent, {}, { signalTransforms: { priority: Number } });
    // @ts-expect-error -- model inputs do not take transforms
    createComponentStub(TypedComponent, {}, { signalTransforms: { position: Number } });
  });
});

describe('renderShallow inputs', () => {
  it('accepts public aliases and checks known field values', () => {
    renderShallow(TypedComponent, { inputs: { title: 'published' } });
    const fields: HeadingInputs = { heading: 'published' };
    renderShallow(TypedComponent, { inputs: fields });

    // @ts-expect-error -- the field takes a string
    renderShallow(TypedComponent, { inputs: { heading: 42 } });
  });
});

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
