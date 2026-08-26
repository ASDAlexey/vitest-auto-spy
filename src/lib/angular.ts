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
 * Shorthand Angular provider: `{ provide, useValue: createSpyFromClass(...) }`.
 *
 * Method spies are lazy — materialized on first access rather than built up front — but that is the
 * core default rather than something this wrapper adds; it used to force the flag on, and no longer
 * needs to. Pass `{ lazySpies: false }` for the eager path.
 *
 * @example
 * ```ts
 * TestBed.configureTestingModule({
 *   providers: [provideAutoSpy(MyService), provideAutoSpy(ApiService, { methodsToSpyOn: ['get'] })],
 * });
 * ```
 */
export function provideAutoSpy<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): AngularValueProvider<T> {
  return {
    provide: ObjectClass,
    useValue: createSpyFromClass(ObjectClass, methodsToSpyOnOrConfig),
  };
}

/**
 * Inject a service from Angular's `TestBed`, already typed as `Spy<T>`.
 *
 * @example
 * ```ts
 * const users = injectSpy(UserService); // Spy<UserService>
 *
 * users.load.resolveWith({ id: 1 });
 * ```
 */
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
