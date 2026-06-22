/**
 * Angular testing helpers (bonus): a `TestBed` provider, a typed `inject`
 * shorthand, and property-mocking utilities for readonly props, getters and
 * accessor pairs (incl. `signal()` / `computed()`).
 */

import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { createSpyFromClass } from './create-spy-from-class';
import type { ClassSpyConfiguration, ClassType, OnlyMethodKeysOf, Spy } from './types';

/** `{ provide, useValue }` shape consumed by Angular's `providers`. */
export type AngularValueProvider<T> = { provide: ClassType<T>; useValue: Spy<T> };

/** Shorthand Angular provider: `{ provide, useValue: createSpyFromClass(...) }`. */
export function provideAutoSpy<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: OnlyMethodKeysOf<T>[] | ClassSpyConfiguration<T>,
): AngularValueProvider<T> {
  return {
    provide: ObjectClass,
    useValue: createSpyFromClass(ObjectClass, methodsToSpyOnOrConfig),
  };
}

/** Inject a service from Angular's `TestBed`, already typed as `Spy<T>`. */
export function injectSpy<T>(token: ClassType<T> | (abstract new (...args: never[]) => T)): Spy<T> {
  return TestBed.inject(token as never) as Spy<T>;
}

/** Override a readonly property (incl. `signal()` / `computed()`) with a static value. */
export function mockReadonlyProp<T, K extends keyof T>(object: T, property: K, value: unknown): void {
  Object.defineProperty(object, property, { get: () => value, configurable: true });
}

/** Override a readonly property with a dynamic getter. */
export function mockReadonlyPropGetter<T, K extends keyof T>(object: T, property: K, getter: () => unknown): void {
  Object.defineProperty(object, property, { get: getter, configurable: true });
}

/** Replace a property with spied `get`/`set` accessors (`vi.fn()`). */
export function mockAccessorsProp<T, K extends keyof T>(object: T, property: K): void {
  Object.defineProperty(object, property, { get: vi.fn(), set: vi.fn(), configurable: true });
}
