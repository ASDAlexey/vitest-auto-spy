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
import type { ClassSpyConfiguration, ClassType, Spy, SpyOptions } from './types';

/**
 * View a spy as the class it stands for, for APIs typed against `T`.
 *
 * ```ts
 * const store = createSpyFromClass(CartStore);
 * renderShallow(CartComponent, { providers: [{ provide: CartStore, useValue: asInstance(store) }] });
 * ```
 *
 * **This is the fix for three compiler errors** that never mention the word "spy", so they are hard
 * to connect to this function — a spy assigned into a field, an object literal or a parameter typed
 * as the real class:
 *
 * ```
 * TS2739: Type 'Spy<PlayerLayerService>' is missing the following properties from type 'PlayerLayerService': …
 * TS2740: Type 'Spy<PlayerStateService>' is missing the following properties …
 * TS2345: Argument of type 'Spy<RemoteInput>' is not assignable to parameter of type 'RemoteInput'.
 * ```
 *
 * Do not silence them with a double assertion: that also hides a genuine mismatch, and this
 * function is the narrow, reviewed version of the same step.
 */
export function asInstance<T>(spy: Spy<T>): T {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- one object, two views: `Spy<T>` adds the control helpers and drops the private members a mapped type cannot see; at runtime this *is* the stand-in for `T`.
  return spy as T;
}

/** Each element of a tuple of spies, viewed as the class it stands for. */
export type AsInstances<Spies> = { -readonly [K in keyof Spies]: Spies[K] extends Spy<infer T> ? T : Spies[K] };

/**
 * {@link asInstance} for a whole argument list at once.
 *
 * ```ts
 * factory = webSsoAuthCheckFactory(...asInstances(account, authCheck, domainEvents, storage), document);
 * ```
 *
 * The version with one wrapper per argument is not merely longer — it is *discovered* one argument
 * at a time. TypeScript stops checking a call at the first argument that does not fit, so a factory
 * taking five spies reports one `TS2345`, and the next one only after the previous is fixed and the
 * compiler is run again. Wrapping the list is a single edit against a single error.
 *
 * A non-spy in the list passes through unchanged, so a call that mixes spies with real values
 * (`document`, a config literal) does not have to be split.
 */
export function asInstances<Spies extends readonly unknown[]>(...spies: Spies): AsInstances<Spies>;
// The implementation signature is the runtime truth — the arguments, unchanged. Only the public
// overload above changes the view, which is why no assertion is needed anywhere in this function.
export function asInstances(...spies: readonly unknown[]): readonly unknown[] {
  return spies;
}

/**
 * View an instance as its spy surface — for a dependency that was provided as a spy but comes back
 * from an API typed against the real class (`TestBed.inject`, `injector.get`, a `viewChild`).
 *
 * @example
 * ```ts
 * asSpy(TestBed.inject(CartService)).checkout.resolveWith({ ok: true });
 * ```
 *
 * **This is the fix for `TS2352`**, the error the habitual `TestBed.inject(X) as Spy<X>` produces —
 * a cast a `jest-auto-spies` suite has in every file, and which only starts failing once the specs
 * are compiled by the same toolchain as production code:
 *
 * ```
 * TS2352: Conversion of type 'Router' to type 'Spy<Router>' may be a mistake because neither type
 *         sufficiently overlaps with the other. Property 'accessorSpies' is missing in type 'Router'.
 * ```
 *
 * For a **generic** class, pass the type argument explicitly. `TestBed.inject` infers
 * `Service<any>` from the constructor rather than the declared default, and the `any` surfaces much
 * later as a mismatch between `AddPromiseSpyMethods<unknown>` and `WithMockReturnValue<…>`:
 *
 * ```ts
 * const config = asSpy<FeatureFlagService>(TestBed.inject(FeatureFlagService));
 * ```
 *
 * Declare the variable as `Spy<T>`, never as Vitest's `Mocked<T>`: `Mocked<T>` keeps `T`'s private
 * members, so it reports a spy as "missing the following properties: _modalOpened, body, …" — a
 * list of private field names that gives no hint the declaration is what is wrong.
 *
 * For a method with several **overloads**, `Parameters` / `ReturnType` — and therefore the spy's
 * helpers — read the *last* one, which on a generated API client is `observe: 'events'` rather than
 * the body-returning signature anybody calls. Ask for the first instead:
 *
 * ```ts
 * const cinemas = asSpy<VenuesService, { overload: 'first' }>(TestBed.inject(VenuesService));
 * ```
 *
 * **Not for the object under test.** `asSpy(TestBed.inject(ServiceUnderTest))` is a habit carried
 * over from `jest-auto-spies`; the service a spec exercises is not a double, and the compiler
 * reports the mistake as `TS2740: … is missing the following properties: httpClient, platform, …`,
 * a list of that service's private fields with no hint that the call is what is wrong. Type it as
 * the class.
 */
export function asSpy<T, Options extends SpyOptions = SpyOptions>(instance: T): Spy<T, Options> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the caller asserts this instance was provided as a spy; the cast exposes the helpers that `T` does not describe.
  return instance as Spy<T, Options>;
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
