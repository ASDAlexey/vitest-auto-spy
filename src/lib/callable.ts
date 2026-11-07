import { createFunctionSpy } from './function-spy';
import type { Func } from './types';

/** Narrow an unknown member to the callable the adapter needs, without an assertion. */
export function isCallable(value: unknown): value is Func {
  return typeof value === 'function';
}

// What a plain function carries of its own; anything more (a mock's API, a signal's `set`) is kept as seeded.
const PLAIN_FUNCTION_KEYS: ReadonlySet<PropertyKey> = new Set(['length', 'name', 'prototype', 'arguments', 'caller']);

/** A `class` (or a built-in constructor): the one callable whose `prototype` cannot be reassigned, and which cannot be applied without `new`. */
export function isClass(value: object): boolean {
  return Object.getOwnPropertyDescriptor(value, 'prototype')?.writable === false;
}

/** A callable carrying an API of its own — an Angular `signal()` with `set`/`update`, a mock — rather than a plain method. */
export function carriesOwnApi(value: object): boolean {
  return Reflect.ownKeys(value).some((key) => !PLAIN_FUNCTION_KEYS.has(key));
}

/** A function written as the member's implementation: not a class, not a mock or a signal that must keep its identity. */
export function isPlainImplementation(value: unknown): value is Func {
  return isCallable(value) && !isClass(value) && !carriesOwnApi(value);
}

/**
 * The spy a function seeded on a method becomes, so `Spy<T>` stays true of it: every call is recorded
 * and runs the seed, with the double as `this`, until the test configures the spy.
 */
export function seededMethodSpy(double: object, key: PropertyKey, implementation: Func, className: string | undefined): Func {
  return createFunctionSpy(String(key), {
    className,
    implementation: true,
    handle: (call) => Reflect.apply(implementation, double, call.args),
  });
}
