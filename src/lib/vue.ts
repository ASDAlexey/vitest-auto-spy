/**
 * Vue testing helpers (bonus): a tiny `global.provide` builder that maps a Vue
 * injection token to a `Spy<T>`, ready to drop into a `@vue/test-utils`
 * `mount(Cmp, { global: { provide } })` call.
 *
 * Dependency-free on purpose: it never imports `vue`, `pinia` or
 * `@vue/test-utils`. The injection `token` is typed structurally (string |
 * symbol — Vue's `InjectionKey<T>` is a branded `symbol` at runtime), so this
 * module compiles and runs without those packages installed.
 */
import { createSpyFromClass } from './create-spy-from-class';
import type { ClassSpyConfiguration, ClassType, OnlyMethodKeysOf, Spy } from './types';

/** A Vue injection token: a plain string/symbol key, or a typed `InjectionKey<T>` (a branded `symbol`). */
export type VueInjectionToken = string | symbol;

/** A `global.provide` map: `{ [token]: Spy<T> }`, spreadable into `@vue/test-utils`'s `global.provide`. */
export type VueProvideSpy<Token extends VueInjectionToken, T> = Record<Token, Spy<T>>;

/**
 * Build a `@vue/test-utils` `global.provide` entry whose value is a fully-typed
 * auto-spy of `ObjectClass`.
 *
 * ```ts
 * const provide = provideAutoSpy(UserServiceKey, UserService);
 * provide[UserServiceKey].getName.mockReturnValue('Fake');
 * mount(Cmp, { global: { provide } });
 * ```
 */
export function provideAutoSpy<Token extends VueInjectionToken, T>(
  token: Token,
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): VueProvideSpy<Token, T> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a single-key computed-property object is `Record<Token, Spy<T>>` by construction, but TS widens the literal to `{ [x: string]: Spy<T> }` and cannot prove the exact `Token` key without the assertion.
  return { [token]: createSpyFromClass(ObjectClass, methodsToSpyOnOrConfig) } as VueProvideSpy<Token, T>;
}
