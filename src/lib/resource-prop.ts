/**
 * Driving an Angular resource from a spec, without any HTTP at all.
 *
 * `httpResource()` and `resource()` are the primitives a modern Angular service exposes, and a spec
 * that wants to assert "the component shows the empty state while products are loading" has, until
 * now, had to produce that state the long way: configure `provideHttpClientTesting`, tick so the
 * request is issued, find it on the `HttpTestingController`, flush it, then settle. Six steps and a
 * real request, to arrive at a value the spec picked in advance.
 *
 * {@link settleResource} is the answer when the request is the point. This is the answer when it is
 * not — the shallow one, for a suite that tests business logic and never wanted a request in the
 * first place. The property is replaced by a hand-built double whose statuses the spec sets
 * directly, so nothing is ever in flight and there is nothing to wait for: no tick, no flush, no
 * budget, and no way for the test to pass against a resource's default value by accident.
 *
 * Reactivity is genuine, exactly as in {@link mockSignalProp}: the double is built out of real
 * `signal()`s from `@angular/core`, so a `computed()` reading `products.value()` recomputes and an
 * `effect()` watching `products.status()` runs. A plain object with the same keys would satisfy
 * every read and notify nothing.
 *
 * `@angular/core` stays an optional peer the same way the rest of this surface does: `ResourceRef`
 * is only ever a *type* here, and the value handed to the property is assembled from `signal()`.
 */
import { type Signal, type WritableSignal, computed, signal } from '@angular/core';

import { createFunctionSpy } from './function-spy';
import { mockReadonlyProp } from './prop-mock';
import type { AddSpyMethodsByReturnTypes } from './types';

/**
 * The resource statuses Angular defines, as a string union.
 *
 * Declared here rather than imported so this module keeps `@angular/core` to a type-only
 * dependency in spirit as well as in fact — Angular moved this from an enum to a union in v20, and
 * a local union works against both without a version guard.
 */
export type ResourceDoubleStatus = 'error' | 'idle' | 'loading' | 'local' | 'reloading' | 'resolved';

/**
 * The double installed on the property — the slice of `ResourceRef` a component actually reads.
 *
 * Structural on purpose: a component typed against `ResourceRef<T>` reads `value`, `status`,
 * `error`, `isLoading`, `hasValue` and `reload`, and this provides all six with the same shapes.
 * The members `ResourceRef` has that a *consumer* never calls — `asReadonly`, `destroy`, `update` —
 * are deliberately absent, because a double that answers a call nobody should be making is how a
 * typo survives a test run.
 */
export interface ResourceDouble<TValue> {
  /** The current value. Writable through the returned handle, readonly to the code under test. */
  value: Signal<TValue>;
  /** `'resolved'` unless the spec moved it — see {@link MockedResource.loading} / `fail`. */
  status: Signal<ResourceDoubleStatus>;
  /** The error behind an `'error'` status, `undefined` otherwise. */
  error: Signal<Error | undefined>;
  /** `true` while the status is `'loading'` or `'reloading'`, matching Angular's own derivation. */
  isLoading: Signal<boolean>;
  /** `true` when the status is `'resolved'` or `'local'` — that is, when `value()` means anything. */
  hasValue(): boolean;
  /** Spied, and inert: a double has no request to re-issue, so the spec asserts the call instead. */
  reload: AddSpyMethodsByReturnTypes<() => boolean>;
}

/** The spec's handle on a resource installed by {@link mockResourceProp}. */
export interface MockedResource<TValue> {
  /** Resolve the resource with a value — status `'resolved'`, error cleared. */
  set(value: TValue): void;
  /** Fail the resource — status `'error'`, `error()` set, `hasValue()` false. */
  fail(error: Error | string): void;
  /** Put the resource back in flight — status `'loading'`, `hasValue()` false. */
  loading(): void;
  /** The spied `reload()`; `expect(products.reload).toHaveBeenCalled()`. */
  reload: AddSpyMethodsByReturnTypes<() => boolean>;
  /** The double now behind the property, for asserting on it directly. */
  resource: ResourceDouble<TValue>;
}

/** The statuses in which `value()` holds something the code under test may read. */
const VALUE_STATUSES: ReadonlySet<ResourceDoubleStatus> = new Set<ResourceDoubleStatus>(['local', 'resolved']);

/** The statuses that mean work is in flight — the same pair {@link settleResource} waits on. */
const LOADING_STATUSES: ReadonlySet<ResourceDoubleStatus> = new Set<ResourceDoubleStatus>(['loading', 'reloading']);

/**
 * Replace a resource-valued property with a double the spec drives directly.
 *
 * ```ts
 * const service = injectSpy(ProductService);
 * const products = mockResourceProp(service, 'products', []);
 *
 * expect(component.emptyState()).toBe(true);
 *
 * products.set([product]);
 * await stable(fixture);
 *
 * expect(component.emptyState()).toBe(false);
 *
 * products.fail('offline');
 * expect(component.errorMessage()).toBe('offline');
 * ```
 *
 * The resource starts `'resolved'` at `initialValue`, because that is the state a spec asserts
 * against most and the one it would otherwise have to arrange. `loading()` and `fail()` are how the
 * other two states are reached, and each is a single synchronous call — the point of this helper is
 * that there is no asynchrony to get wrong. When a spec *does* want the real request path, that is
 * `settleResource` over a real `httpResource`, not this.
 *
 * Undone by `restoreMockedProps()` like every other property patch, so a suite running
 * `setupAutoSpy()` needs no teardown of its own.
 *
 * @param object The spy (or real instance) whose property to replace.
 * @param property The resource-valued property.
 * @param initialValue The value the resource starts resolved at.
 * @returns The handle driving that resource — `set` / `fail` / `loading`, plus the spied `reload`.
 */
export function mockResourceProp<T, K extends keyof T>(
  object: T,
  property: K,
  initialValue: T[K] extends { value: Signal<infer TValue> } ? TValue : never,
): MockedResource<T[K] extends { value: Signal<infer TValue> } ? TValue : never> {
  return installResourceDouble(object, property, initialValue);
}

/**
 * The untyped body of {@link mockResourceProp}.
 *
 * Split out because the public signature's conditional types describe the *call site* and are
 * worthless inside the implementation — `TValue` there is an unresolved conditional, so every
 * `signal()` below would need an assertion to satisfy it. One generic that means what it says here,
 * one that reads well out there, and no `as` in either.
 */
function installResourceDouble<TValue>(object: unknown, property: PropertyKey, initialValue: TValue): MockedResource<TValue> {
  const value: WritableSignal<TValue> = signal(initialValue);
  const status: WritableSignal<ResourceDoubleStatus> = signal<ResourceDoubleStatus>('resolved');
  const error: WritableSignal<Error | undefined> = signal<Error | undefined>(undefined);

  const reload = createFunctionSpy<() => boolean>(`${String(property)}.reload`);

  const resource: ResourceDouble<TValue> = {
    value,
    status,
    error,
    isLoading: computed(() => LOADING_STATUSES.has(status())),
    hasValue: (): boolean => VALUE_STATUSES.has(status()),
    reload,
  };

  mockReadonlyProp(object, property, resource);

  return {
    set: (next: TValue): void => {
      value.set(next);
      error.set(undefined);
      status.set('resolved');
    },
    fail: (reason: Error | string): void => {
      error.set(typeof reason === 'string' ? new Error(reason) : reason);
      status.set('error');
    },
    loading: (): void => {
      error.set(undefined);
      status.set('loading');
    },
    reload,
    resource,
  };
}
