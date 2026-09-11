/**
 * Type-level tests for the `/angular` providers and component stubs.
 *
 * `provideAutoSpy` takes `T` from the class alone, which is what lets a generic class keep its
 * declared default next to a configuration naming both an accessor list and `returns` — the core
 * factory reads `T` back from the list there and rejects the call (`spy.test-d.ts`). The cases
 * below fail the moment the signature starts inferring from the configuration again.
 */
import type { InputSignal, Type } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { createComponentStub, overrideAutoSpy, provideAutoSpy } from '../angular';

interface FlagDefaults {
  beta: boolean;
}

declare class FlagService<T extends object = FlagDefaults> {
  get flags(): Readonly<T>;
  isEnabled(key: keyof T): boolean;
}

class Plain {
  load(): number {
    return 1;
  }
}

describe('provideAutoSpy on a generic class', () => {
  it('keeps the declared default with an accessor list and returns together', () => {
    const provider = provideAutoSpy(FlagService, { gettersToSpyOn: ['flags'], returns: { isEnabled: false } });

    expectTypeOf(provider.useValue.isEnabled).parameter(0).toEqualTypeOf<'beta'>();
  });

  it('keeps it with overrides and returns together', () => {
    const provider = provideAutoSpy(FlagService, { overrides: { flags: { beta: true } }, returns: { isEnabled: false } });

    expectTypeOf(provider.useValue.isEnabled).parameter(0).toEqualTypeOf<'beta'>();
  });

  it('still takes the type argument spelled out', () => {
    const provider = provideAutoSpy<FlagService<{ alpha: boolean }>>(FlagService, {
      gettersToSpyOn: ['flags'],
      returns: { isEnabled: true },
    });

    expectTypeOf(provider.useValue.isEnabled).parameter(0).toEqualTypeOf<'alpha'>();
  });

  it('still checks the configuration against the class', () => {
    // @ts-expect-error -- 'nope' is not a member of FlagService
    provideAutoSpy(FlagService, { gettersToSpyOn: ['nope'] });
    // @ts-expect-error -- 'nope' is not a method of FlagService
    provideAutoSpy(FlagService, { returns: { nope: 1 } });
    // @ts-expect-error -- load answers a number
    provideAutoSpy(Plain, { returns: { load: 'x' } });
  });

  it('infers a plain class exactly as before', () => {
    expectTypeOf(provideAutoSpy(Plain, ['load']).useValue.load).returns.toEqualTypeOf<number>();
  });
});

describe('overrideAutoSpy on a generic class', () => {
  it('keeps the declared default with an accessor list and returns together', () => {
    const override = overrideAutoSpy(FlagService, { gettersToSpyOn: ['flags'], returns: { isEnabled: false } });

    expectTypeOf(override.useValue.isEnabled).parameter(0).toEqualTypeOf<'beta'>();
  });
});

declare class ChartComponent {
  readonly series: InputSignal<number[]>;
  reset(): void;
}

describe('createComponentStub', () => {
  it('types an instance as holding some of the real members, at their own types', () => {
    expectTypeOf(createComponentStub(ChartComponent)).toEqualTypeOf<Type<Partial<ChartComponent>>>();
  });

  it('checks the overrides against the real class', () => {
    createComponentStub(ChartComponent, { reset: () => undefined });
    // @ts-expect-error -- reset takes no argument and is not a string
    createComponentStub(ChartComponent, { reset: 'nope' });
    // @ts-expect-error -- ChartComponent has no member called zoom
    createComponentStub(ChartComponent, { zoom: 1 });
  });
});
