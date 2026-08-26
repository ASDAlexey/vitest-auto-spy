/**
 * Driving a service's signal from a spec.
 *
 * `createSpyFromClass` discovers methods by walking the prototype, and a `signal()` / `computed()`
 * field is not there — it is assigned on the instance. Listing it in `methodsToSpyOn` is not the
 * answer either: that would make it a function spy, and a function spy returns `undefined` until
 * configured, so a component reading `service.count()` gets `undefined` where it expects a value.
 *
 * What a spec actually wants is the signal to be real and writable, so the component reacts the way
 * it does in the application — a `computed()` downstream recomputes, an `effect()` runs, a template
 * binding updates. That is two lines every time:
 *
 * ```ts
 * const count = signal(0);
 * mockReadonlyProp(service, 'count', count);
 * ```
 *
 * and the reason it is two is that the spec needs the writable handle while the service exposes a
 * readonly one. {@link mockSignalProp} is the same pair with the handle returned rather than
 * declared, which also removes the temptation to reach for `service.count` and call `.set` on it —
 * `Signal<T>` has no `set`, so that only type-checks after an assertion.
 *
 * Reactivity is genuine: the signal comes from `@angular/core`, not from a stand-in. A stub with a
 * `set` method would satisfy `service.count()` and silently fail to notify anything downstream,
 * which is the failure this helper exists to avoid rather than cause.
 */
import { type Signal, type WritableSignal, signal } from '@angular/core';

import { mockReadonlyProp } from './prop-mock';

/**
 * Replace a signal-valued property with a writable signal the spec controls.
 *
 * ```ts
 * const service = injectSpy(CounterService);
 * const count = mockSignalProp(service, 'count', 0);
 *
 * expect(component.label()).toBe('0 items');
 *
 * count.set(42);
 * await fixture.whenStable();
 *
 * expect(component.label()).toBe('42 items');
 * ```
 *
 * Undone by `restoreMockedProps()` like every other property patch, so a suite running
 * `setupAutoSpy()` needs no teardown of its own.
 *
 * @param object The spy (or real instance) whose property to replace.
 * @param property The signal-valued property.
 * @param initialValue The value the signal starts at.
 * @returns The writable signal now behind that property — `set()` and `update()` drive the test.
 */
export function mockSignalProp<T, K extends keyof T>(
  object: T,
  property: K,
  initialValue: T[K] extends Signal<infer TValue> ? TValue : never,
): WritableSignal<T[K] extends Signal<infer TValue> ? TValue : never> {
  const writable = signal(initialValue);

  mockReadonlyProp(object, property, writable);

  return writable;
}
