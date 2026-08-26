/**
 * Angular testing helpers (bonus): a `TestBed` provider and a typed `inject` shorthand.
 *
 * The property-mocking utilities (`mockReadonlyProp`, `mockValueProp`, `mockAccessorsProp`,
 * `restoreMockedProps`) were introduced here and are still exported from this entry, but nothing
 * about them is Angular-specific — they now live in `./prop-mock` and are shared with the core.
 */
import { TestBed } from '@angular/core/testing';

import { createSpyFromClass } from './create-spy-from-class';
import type { ClassSpyConfiguration, ClassType, OnlyMethodKeysOf, Spy } from './types';

/** `{ provide, useValue }` shape consumed by Angular's `providers`. */
export type AngularValueProvider<T> = { provide: ClassType<T>; useValue: Spy<T> };

/**
 * Angular tests typically spy a wide service but call only a handful of its
 * methods, so `provideAutoSpy` defaults to **lazy** spies: each method spy is
 * materialized on first access instead of eagerly up-front. On a 20-method
 * service where a test touches two, this is ~8× faster spy assembly. Any caller
 * form is honoured — pass `{ lazySpies: false }` to force the eager path.
 */
function withLazyDefault<T>(methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[]): ClassSpyConfiguration<T> {
  if (!methodsToSpyOnOrConfig) {
    return { lazySpies: true };
  }

  if (Array.isArray(methodsToSpyOnOrConfig)) {
    return { methodsToSpyOn: methodsToSpyOnOrConfig, lazySpies: true };
  }

  return { ...methodsToSpyOnOrConfig, lazySpies: methodsToSpyOnOrConfig.lazySpies ?? true };
}

/** Shorthand Angular provider: `{ provide, useValue: createSpyFromClass(...) }` (lazy spies by default). */
export function provideAutoSpy<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): AngularValueProvider<T> {
  return {
    provide: ObjectClass,
    useValue: createSpyFromClass(ObjectClass, withLazyDefault(methodsToSpyOnOrConfig)),
  };
}

/** Inject a service from Angular's `TestBed`, already typed as `Spy<T>`. */
export function injectSpy<T>(token: ClassType<T> | (abstract new (...args: never[]) => T)): Spy<T> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `TestBed.inject`'s overloads do not accept our broadened `ClassType<T> | abstract ctor` token union, and it returns the real instance `T`, not the augmented `Spy<T>`; both assertions bridge the public token/return types to the spy surface.
  const injected = TestBed.inject(token as never) as Spy<T>;

  return injected;
}

export {
  mockAccessorsProp,
  mockReadonlyProp,
  mockReadonlyPropGetter,
  mockValueProp,
  restoreMockedProps,
  type AccessorImplementations,
  type RestoreProp,
} from './prop-mock';
