import { ElementRef, type Signal, type WritableSignal } from '@angular/core';

import { type ElementStub, type ElementStubOptions, createElementStub } from './element-stub';
import { mockSignalProp } from './signal-prop';

type QueryValue<T> = T extends Signal<infer V> ? V : never;
type QueryElement<T> = [Exclude<QueryValue<T>, undefined>] extends [never]
  ? never
  : Exclude<QueryValue<T>, undefined> extends ElementRef<infer E extends HTMLElement>
    ? E
    : never;
type ElementQueryKey<T> = {
  [K in keyof T]-?: [QueryElement<T[K]>] extends [never] ? never : K;
}[keyof T];

/** Element spies together with the reference installed on the query and its writable test handle. */
export type ElementRefPropStub<T extends HTMLElement, V = ElementRef<T> | undefined> = ElementStub<T> & {
  readonly ref: ElementRef<T>;
  readonly query: WritableSignal<V>;
};

/**
 * Replace an ElementRef-valued signal query with a DOM stub and return its spies.
 *
 * ```ts
 * const trigger = mockElementRefProp(component, 'dateTrigger');
 * component.close();
 * expect(trigger.focus).toHaveBeenCalledExactlyOnceWith();
 * ```
 *
 * The queried element type is inferred from the property. Options are those of `createElementStub`;
 * they do not infer a different element type. `ref` is the installed `ElementRef`; `query` can drive
 * a later reference, or `undefined` for an optional query. Patch before rendering a live consumer.
 * Like `mockSignalProp`, replacement patches are undone by `restoreMockedProps()` / `setupAutoSpy()`.
 * This does not render a DOM element or cause Angular to resolve a view query.
 */
export function mockElementRefProp<T, K extends ElementQueryKey<T> & keyof T>(
  object: T,
  property: K,
  options: ElementStubOptions<NoInfer<QueryElement<T[K]>>> = {},
): ElementRefPropStub<QueryElement<T[K]>, QueryValue<T[K]>> {
  const stub = createElementStub<QueryElement<T[K]>>(options);
  const ref = new ElementRef(stub.element);
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- ElementQueryKey restricts the property to an ElementRef-valued signal; TS cannot reduce the matching conditional inside the generic implementation.
  const query = mockSignalProp(object, property, ref as T[K] extends Signal<infer V> ? V : never);

  return { ...stub, ref, query };
}
