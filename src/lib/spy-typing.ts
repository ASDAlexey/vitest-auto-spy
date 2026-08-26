/**
 * Type bridges — the two casts users otherwise write as `as any`.
 *
 * `Spy<T>` is a mapped type, so it drops `#private` / `private` members and is therefore *not*
 * assignable to `T`. That is correct (a spy is not the class) but it collides with reality: an API
 * under test asks for `T`, a `TestBed.inject()` result is typed `T` while the spy surface is what
 * the assertion needs. Both directions are safe at runtime — it is the same object — so the fix is
 * a named, documented view instead of an assertion scattered through the suite.
 */
import { createSpyFromClass } from './create-spy-from-class';
import type { ClassSpyConfiguration, ClassType, Spy } from './types';

/**
 * View a spy as the class it stands for, for APIs typed against `T`.
 *
 * ```ts
 * const store = createSpyFromClass(CartStore);
 * renderShallow(CartComponent, { providers: [{ provide: CartStore, useValue: asInstance(store) }] });
 * ```
 */
export function asInstance<T>(spy: Spy<T>): T {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- one object, two views: `Spy<T>` adds the control helpers and drops the private members a mapped type cannot see; at runtime this *is* the stand-in for `T`.
  return spy as T;
}

/**
 * View an instance as its spy surface — for a dependency that was provided as a spy but comes back
 * from an API typed against the real class (`TestBed.inject`, `injector.get`, a `viewChild`).
 */
export function asSpy<T>(instance: T): Spy<T> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the caller asserts this instance was provided as a spy; the cast exposes the helpers that `T` does not describe.
  return instance as Spy<T>;
}

/** A constructor stand-in: `new SpyClass()` yields a fresh {@link Spy}, and every construction is recorded. */
export interface ConstructorSpy<T> {
  new (...args: unknown[]): Spy<T>;
  /** Arguments of every `new` (and plain call), in order. */
  calls: unknown[][];
  /** The spy produced by each construction, in order. */
  instances: Spy<T>[];
}

/**
 * A spy that can be called with `new`.
 *
 * A runner mock (`vi.fn()`) rejects `new` as soon as it carries a `mockReturnValue`, so code under
 * test that does `new Foo()` — a `Worker`, an `IntersectionObserver`, a hand-rolled client — cannot
 * be served by one. This returns a real constructor function whose instances are full auto-spies.
 *
 * ```ts
 * const WorkerSpy = createSpyClass(BackgroundWorker);
 * mockValueProp(globalThis, 'BackgroundWorker', WorkerSpy);
 *
 * service.start();
 * expect(WorkerSpy.calls[0]).toEqual(['./task.js']);
 * WorkerSpy.instances[0].postMessage.mockReturnValue(undefined);
 * ```
 */
export function createSpyClass<T>(ObjectClass: ClassType<T>, config?: ClassSpyConfiguration<T>): ConstructorSpy<T> {
  const calls: unknown[][] = [];
  const instances: Spy<T>[] = [];

  function SpyClass(...args: unknown[]): Spy<T> {
    const instance = createSpyFromClass(ObjectClass, config);

    calls.push(args);
    instances.push(instance);

    // A constructor that returns an object hands that object back from `new`, which is what makes
    // this construction-compatible without touching `prototype`.
    return instance;
  }

  SpyClass.calls = calls;
  SpyClass.instances = instances;

  // A plain function that returns an object *is* construction-compatible at runtime, but TypeScript
  // models callable and `new`-able as unrelated shapes, so the two views only meet through `object`.
  const constructable: object = SpyClass;

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowing the widened `object` back to the constructor surface this function documents and tests.
  return constructable as ConstructorSpy<T>;
}
