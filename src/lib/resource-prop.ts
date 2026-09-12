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
import { type Signal, type WritableSignal, computed, signal, untracked } from '@angular/core';

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
 * Status and value as one object — Angular's `ResourceSnapshot<T>`, which a template branches on
 * with `@switch (products.snapshot().status)` and which composes two resources without reading
 * four signals.
 */
export type ResourceDoubleSnapshot<TValue> =
  | { readonly status: 'error'; readonly error: Error | undefined }
  | { readonly status: Exclude<ResourceDoubleStatus, 'error'>; readonly value: TValue };

/**
 * The double installed on the property — the whole of `ResourceRef`, in signals the spec owns.
 *
 * Structural on purpose: a component typed against `ResourceRef<T>` never finds out that its
 * resource is a stand-in, so every member the real interface publishes is here, with the semantics
 * Angular gives it. An earlier version left `set`, `update`, `asReadonly`, `destroy` and `snapshot`
 * out on the theory that a consumer never calls them; a service exposing
 * `readonly products = this.#products.asReadonly()` calls one before the spec even starts, and an
 * optimistic write calls two more, each of them a `TypeError` at run time because the property is
 * typed as the real thing and the compiler has nothing to say.
 */
export interface ResourceDouble<TValue> {
  /** The current value. Writable, and a write through it goes `'local'`, exactly as Angular's does. */
  value: WritableSignal<TValue>;
  /** `'resolved'` unless the spec moved it — see {@link MockedResource} and {@link MockResourceOptions}. */
  status: Signal<ResourceDoubleStatus>;
  /** The error behind an `'error'` status, `undefined` otherwise. */
  error: Signal<Error | undefined>;
  /** `true` while the status is `'loading'` or `'reloading'`, matching Angular's own derivation. */
  isLoading: Signal<boolean>;
  /** Status and value together, the shape `@switch (products.snapshot().status)` reads. */
  snapshot: Signal<ResourceDoubleSnapshot<TValue>>;
  /** `true` unless the status is `'error'` or the value is `undefined` — Angular's rule since v20. */
  hasValue(): boolean;
  /** A write from the code under test: status `'local'`, error cleared. */
  set(value: TValue): void;
  /** {@link ResourceDouble.set} over the current value. */
  update(updater: (value: TValue) => TValue): void;
  /** The readonly view Angular hands out — the same double, since a spec has nothing to hide from itself. */
  asReadonly(): ResourceDouble<TValue>;
  /** Back to `'idle'` at the initial value, after which a write from the code under test does nothing. */
  destroy(): void;
  /** Spied, and inert: a double has no request to re-issue, so the spec asserts the call instead. */
  reload: AddSpyMethodsByReturnTypes<() => boolean>;
}

/** The spec's handle on a resource installed by {@link mockResourceProp}. */
export interface MockedResource<TValue> {
  /** Resolve the resource with a value — status `'resolved'`, error cleared. */
  set(value: TValue): void;
  /** Fail the resource — status `'error'`, `error()` set, `hasValue()` false. */
  fail(error: Error | string): void;
  /** Put the resource back in flight — status `'loading'`, the value left where it was. */
  loading(): void;
  /** Park it before it ever ran — status `'idle'`, back at the initial value, error cleared. */
  idle(): void;
  /** The spied `reload()`; `expect(products.reload).toHaveBeenCalled()`. */
  reload: AddSpyMethodsByReturnTypes<() => boolean>;
  /** The double now behind the property, for asserting on it directly. */
  resource: ResourceDouble<TValue>;
}

/** How the double starts out, for the states a spec would otherwise arrange in its first two lines. */
export interface MockResourceOptions {
  /**
   * The status the double is installed in. `'resolved'` by default — `'idle'` is the one a
   * `params`-driven resource sits in until the signal it reads is set. `'error'` is absent on
   * purpose: an error needs a reason, and that is {@link MockedResource.fail}.
   */
  status?: Exclude<ResourceDoubleStatus, 'error'>;
}

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
 * against most and the one it would otherwise have to arrange; `options.status` picks another one
 * up front. `loading()`, `idle()` and `fail()` are how the rest are reached, and each is a single
 * synchronous call — the point of this helper is that there is no asynchrony to get wrong. When a
 * spec *does* want the real request path, that is `settleResource` over a real `httpResource`, not
 * this.
 *
 * Undone by `restoreMockedProps()` like every other property patch, so a suite running
 * `setupAutoSpy()` needs no teardown of its own.
 *
 * @param object The spy (or real instance) whose property to replace.
 * @param property The resource-valued property.
 * @param initialValue The value the resource starts at, and the one `idle()` and `destroy()` return to.
 * @param options The status to start in.
 * @returns The handle driving that resource — `set` / `fail` / `loading` / `idle`, plus the spied `reload`.
 */
export function mockResourceProp<T, K extends keyof T>(
  object: T,
  property: K,
  initialValue: T[K] extends { value: Signal<infer TValue> } ? TValue : never,
  options: MockResourceOptions = {},
): MockedResource<T[K] extends { value: Signal<infer TValue> } ? TValue : never> {
  return installResourceDouble(object, property, initialValue, options);
}

/** Angular's own `snapshot`: the error state carries the error, every other one carries the value. */
function createSnapshot<TValue>(
  status: Signal<ResourceDoubleStatus>,
  value: Signal<TValue>,
  error: Signal<Error | undefined>,
): Signal<ResourceDoubleSnapshot<TValue>> {
  return computed<ResourceDoubleSnapshot<TValue>>(() => {
    const current = status();

    return current === 'error' ? { status: current, error: error() } : { status: current, value: value() };
  });
}

/** The double, plus the write the spec's half of this file needs and the code under test must not have. */
interface BuiltDouble<TValue> {
  resource: ResourceDouble<TValue>;
  arrange(status: ResourceDoubleStatus, value: TValue, failure?: Error): void;
}

/**
 * Assemble the double out of three signals.
 *
 * The two writes are deliberately different: `arrange` is the spec saying what state the resource
 * is in, and `setLocal` is the code under test writing a value, which in Angular means `'local'`
 * and nothing else. Both go through `writeValue`, captured before `value.set` is rewired, because
 * after the rewiring the signal's own setter *is* the `'local'` one.
 */
function buildResourceDouble<TValue>(name: string, initialValue: TValue, options: MockResourceOptions): BuiltDouble<TValue> {
  const value: WritableSignal<TValue> = signal(initialValue);
  const status: WritableSignal<ResourceDoubleStatus> = signal<ResourceDoubleStatus>(options.status ?? 'resolved');
  const error: WritableSignal<Error | undefined> = signal<Error | undefined>(undefined);

  // Kept before `value.set` is rewired below, because the spec's half of this file has to be able
  // to write the value without the `'local'` status a write from the code under test means.
  const writeValue = value.set;
  let destroyed = false;

  const arrange = (nextStatus: ResourceDoubleStatus, nextValue: TValue, failure?: Error): void => {
    destroyed = false;
    writeValue(nextValue);
    error.set(failure);
    status.set(nextStatus);
  };

  const setLocal = (next: TValue): void => {
    if (destroyed) {
      return;
    }

    writeValue(next);
    error.set(undefined);
    status.set('local');
  };

  const updateLocal = (updater: (current: TValue) => TValue): void => {
    setLocal(updater(untracked(value)));
  };

  value.set = setLocal;
  value.update = updateLocal;

  const valueIsDefined = computed(() => status() !== 'error' && value() !== undefined);
  const reload = createFunctionSpy<() => boolean>(`${name}.reload`);

  // A real `reload()` answers `false` for "no reload was needed", so a spec that branches on the
  // result would otherwise be branching on an unconfigured `undefined`.
  reload.mockReturnValue(true);

  const resource: ResourceDouble<TValue> = {
    value,
    status,
    error,
    isLoading: computed(() => LOADING_STATUSES.has(status())),
    snapshot: createSnapshot(status, value, error),
    hasValue: (): boolean => valueIsDefined(),
    set: setLocal,
    update: updateLocal,
    asReadonly: (): ResourceDouble<TValue> => resource,
    destroy: (): void => {
      destroyed = true;
      writeValue(initialValue);
      error.set(undefined);
      status.set('idle');
    },
    reload,
  };

  return { arrange, resource };
}

/**
 * The untyped body of {@link mockResourceProp}.
 *
 * Split out because the public signature's conditional types describe the *call site* and are
 * worthless inside the implementation — `TValue` there is an unresolved conditional, so every
 * `signal()` above would need an assertion to satisfy it. One generic that means what it says here,
 * one that reads well out there, and no `as` in either.
 */
function installResourceDouble<TValue>(
  object: unknown,
  property: PropertyKey,
  initialValue: TValue,
  options: MockResourceOptions,
): MockedResource<TValue> {
  const { arrange, resource } = buildResourceDouble(String(property), initialValue, options);
  const value = resource.value;

  mockReadonlyProp(object, property, resource);

  return {
    set: (next: TValue): void => {
      arrange('resolved', next);
    },
    fail: (reason: Error | string): void => {
      arrange('error', untracked(value), typeof reason === 'string' ? new Error(reason) : reason);
    },
    loading: (): void => {
      arrange('loading', untracked(value));
    },
    idle: (): void => {
      arrange('idle', initialValue);
    },
    reload: resource.reload,
    resource,
  };
}
