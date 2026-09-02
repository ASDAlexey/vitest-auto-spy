/**
 * NestJS testing helpers (bonus): a `{ provide, useValue }` provider tailored
 * for `Test.createTestingModule({ providers: [...] })`, and a typed `get`
 * shorthand for pulling a spy out of the resulting `TestingModule`.
 *
 * Dependency-free by design: `@nestjs/common` / `@nestjs/testing` are optional
 * peers, so the module reference is described by a minimal structural type
 * instead of being imported.
 */
import { createSpyFromClass } from './create-spy-from-class';
import type { ClassSpyConfiguration, ClassType, OnlyMethodKeysOf, Spy } from './types';

/** `{ provide, useValue }` shape consumed by NestJS's `providers`. */
export type NestValueProvider<T> = { provide: ClassType<T>; useValue: Spy<T> };

/**
 * The slice of NestJS's `TestingModule` / `ModuleRef` the helper needs: a single
 * `get(token)` lookup. Typed structurally so this entry never imports
 * `@nestjs/testing`.
 */
export interface NestModuleRef {
  get(token: unknown): unknown;
}

/**
 * Shorthand NestJS provider: `{ provide, useValue: createSpyFromClass(...) }`.
 *
 * @example
 * ```ts
 * const moduleRef = await Test.createTestingModule({
 *   providers: [AuthService, provideAutoSpy(UserService)],
 * }).compile();
 * ```
 */
export function provideAutoSpy<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): NestValueProvider<T> {
  return {
    provide: ObjectClass,
    useValue: createSpyFromClass(ObjectClass, methodsToSpyOnOrConfig),
  };
}

/**
 * Resolve a provider from a NestJS `TestingModule`, already typed as `Spy<T>`.
 *
 * @example
 * ```ts
 * const users = injectSpy(moduleRef, UserService); // the module reference comes FIRST
 *
 * users.findByEmail.resolveWith({ id: 1 });
 * ```
 *
 * @remarks
 * The module reference is the first argument. Nest has no ambient injector, so the one-argument
 * `injectSpy(token)` of `vitest-auto-spy/angular` — which reads the global `TestBed` — has no
 * counterpart here and the `moduleRef` from `Test.createTestingModule(…).compile()` has to be
 * passed in. It has no counterpart of that helper's "not an auto-spy" warning either: a provider
 * listed as the bare class instead of `provideAutoSpy(X)` is built for real, comes back typed
 * `Spy<T>` all the same, and the failure arrives a line later when `.mockReturnValue(…)` is called
 * on the real method.
 */
export function injectSpy<T>(moduleRef: NestModuleRef, token: ClassType<T> | (abstract new (...args: never[]) => T)): Spy<T> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `moduleRef.get`'s structural signature returns `unknown`, and Nest hands back the real instance `T`, not the augmented `Spy<T>` we registered via `useValue`; the assertion bridges the lookup result to the spy surface.
  const injected = moduleRef.get(token) as Spy<T>;

  return injected;
}
