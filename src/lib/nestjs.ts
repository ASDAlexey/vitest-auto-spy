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

/** Shorthand NestJS provider: `{ provide, useValue: createSpyFromClass(...) }`. */
export function provideAutoSpy<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): NestValueProvider<T> {
  return {
    provide: ObjectClass,
    useValue: createSpyFromClass(ObjectClass, methodsToSpyOnOrConfig),
  };
}

/** Resolve a provider from a NestJS `TestingModule`, already typed as `Spy<T>`. */
export function injectSpy<T>(moduleRef: NestModuleRef, token: ClassType<T> | (abstract new (...args: never[]) => T)): Spy<T> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `moduleRef.get`'s structural signature returns `unknown`, and Nest hands back the real instance `T`, not the augmented `Spy<T>` we registered via `useValue`; the assertion bridges the lookup result to the spy surface.
  const injected = moduleRef.get(token) as Spy<T>;

  return injected;
}
