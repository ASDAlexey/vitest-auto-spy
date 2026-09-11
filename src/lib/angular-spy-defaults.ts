/**
 * `registerAutoSpyDefaults` as `vitest-auto-spy/angular` exports it: the core's overloads, plus the
 * key the core cannot name — an `InjectionToken`.
 *
 * The registry never cared what its key is: it is a `Map` keyed by object identity, and a token is an
 * object exactly as a class is. What kept tokens out was the signature, because the core entry is
 * framework-agnostic and may not mention `InjectionToken`. So the registration is the same call and
 * the same registry; only this entry, which already depends on Angular, can type it.
 *
 * A token's double is built from its type (`createAutoMock`), so what a registration may say is what
 * that factory takes — `returns`, `selfReturning`, `observablePropsToSpyOn`, `strict`, `name` — plus
 * `overrides`, which `provideAutoSpyForToken` otherwise takes as its second argument. The merge is the
 * class one: lists unioned, `returns` / `overrides` merged key by key with the call site winning,
 * scalars decided by the call site when it names them.
 */
import type { InjectionToken } from '@angular/core';

import type { AutoMockConfiguration } from './auto-mock';
import { type DeepReadonly, dropAutoSpyDefaults, mergeRegisteredDefaults, registerFrom } from './spy-defaults';
import type { ClassSpyConfiguration, ClassType, DeepPartial } from './types';

/** What a token's registration holds: {@link AutoMockConfiguration} plus the seeds `provideAutoSpyForToken` takes second. */
export interface AutoSpyTokenDefaults<T> extends AutoMockConfiguration<T> {
  /** Values the double answers with rather than spies on — merged key by key under the call site's own seeds. */
  overrides?: DeepPartial<T>;
}

/**
 * The many-at-once form's constraint, with a second kind of row: a class row checked against its
 * class, a token row against the type the token carries. The same placement as the core's — in the
 * constraint, where it is instantiated after the overload is chosen (see `spy-defaults.ts`).
 */
type AngularAutoSpyDefaultEntries<Entries extends readonly unknown[]> = {
  [Row in keyof Entries]: Entries[Row] extends readonly [infer Key, unknown]
    ? Key extends ClassType<infer Instance>
      ? readonly [ClassType<Instance>, DeepReadonly<ClassSpyConfiguration<Instance>>]
      : Key extends InjectionToken<infer Value>
        ? readonly [InjectionToken<Value>, DeepReadonly<AutoSpyTokenDefaults<Value>>]
        : never
    : never;
};

/**
 * Register the configuration every double of a class — or of an `InjectionToken` — should start from.
 *
 * The core's `registerAutoSpyDefaults`, over the same registry, with one more key: a token, read back
 * by `provideAutoSpyForToken(TOKEN)` the way `provideAutoSpy(Class)` reads a class's registration.
 * The per-class form and the table form are unchanged, and a table may mix class rows and token rows.
 *
 * @example
 * ```ts
 * registerAutoSpyDefaults(LOGGER, { returns: { info: undefined, err: undefined }, selfReturning: ['channel'] });
 *
 * providers: [provideAutoSpyForToken(LOGGER)]; // starts from the registration
 * ```
 */
export function registerAutoSpyDefaults<T>(ObjectClass: ClassType<T>, config: ClassSpyConfiguration<T>): void;
export function registerAutoSpyDefaults<T>(token: InjectionToken<T>, config: AutoSpyTokenDefaults<T>): void;
export function registerAutoSpyDefaults<
  const Entries extends AngularAutoSpyDefaultEntries<Entries> & readonly (readonly [unknown, unknown])[],
>(entries: Entries): void;
export function registerAutoSpyDefaults(...args: unknown[]): void {
  registerFrom(args);
}

/** Drop one class's or one token's registration, or every one of them. */
export function clearAutoSpyDefaults(key?: ClassType<unknown> | InjectionToken<unknown>): void {
  dropAutoSpyDefaults(key);
}

/** `provideAutoSpyForToken`'s two arguments, merged over the token's registration as one configuration. */
export function mergeTokenDefaults<T>(
  token: InjectionToken<T>,
  overrides: DeepPartial<T> | undefined,
  config: AutoMockConfiguration<T> | undefined,
): AutoSpyTokenDefaults<T> {
  const written: Record<string, unknown> = overrides === undefined ? { ...config } : { ...config, overrides };

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- merged from the token's registration and the call site's arguments, both typed against this very `T`; the merge introduces no key neither side had.
  return mergeRegisteredDefaults(token, written) as AutoSpyTokenDefaults<T>;
}
