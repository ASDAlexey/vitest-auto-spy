/**
 * Angular testing helpers (bonus): a `TestBed` provider and a typed `inject` shorthand.
 *
 * The property-mocking utilities (`mockReadonlyProp`, `mockValueProp`, `mockAccessorsProp`,
 * `restoreMockedProps`) were introduced here and are still exported from this entry, but nothing
 * about them is Angular-specific — they now live in `./prop-mock` and are shared with the core.
 */
import type { InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { type AutoMockConfiguration, createAutoMock } from './auto-mock';
import { createSpyFromClass } from './create-spy-from-class';
import { DOCS_LINKS, withDocs } from './docs-links';
import { isAutoSpyLike } from './spy-mark';
import type { ClassSpyConfiguration, ClassType, DeepPartial, OnlyMethodKeysOf, Spy, SpyOptions } from './types';

/** `{ provide, useValue }` shape consumed by Angular's `providers`. */
export type AngularValueProvider<T> = { provide: ClassType<T>; useValue: Spy<T> };

/**
 * Shorthand Angular provider: `{ provide, useValue: createSpyFromClass(...) }`.
 *
 * Method spies are lazy — materialized on first access rather than built up front — but that is the
 * core default rather than something this wrapper adds; it used to force the flag on, and no longer
 * needs to. Pass `{ lazySpies: false }` for the eager path.
 *
 * @example
 * ```ts
 * TestBed.configureTestingModule({
 *   providers: [provideAutoSpy(MyService), provideAutoSpy(ApiService, { methodsToSpyOn: ['get'] })],
 * });
 * ```
 */
export function provideAutoSpy<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): AngularValueProvider<T> {
  return {
    provide: ObjectClass,
    useValue: createSpyFromClass(ObjectClass, methodsToSpyOnOrConfig),
  };
}

/** `{ provide, useValue }` for a token, where the spy is built from the token's own type. */
export type AngularTokenProvider<T> = { provide: InjectionToken<T>; useValue: Spy<T> };

/**
 * The provider for a dependency that lives behind an `InjectionToken`.
 *
 * A token typed with an *interface* has no class to read, which is where the usual workaround comes
 * from: a `SomethingServiceMock` class written in the spec, spied, and provided — after which
 * `Spy<Mock>` and `Spy<Interface>` disagree about `calledWith` and somebody reaches for an
 * assertion. `createAutoMock` needs no class, and the token already carries the type.
 *
 * ```ts
 * TestBed.configureTestingModule({ providers: [provideAutoSpyForToken(PASSCODE_SERVICE_TOKEN)] });
 *
 * const passcode = injectSpy(PASSCODE_SERVICE_TOKEN); // Spy<PasscodeService>
 * ```
 *
 * @param token The injection token; its type argument is what the spy is built from.
 * @param overrides Seed values for members the double must answer with rather than spy on. A seeded
 *   key is stored verbatim and is no longer a spy — so seed data, not methods.
 * @param config Method configuration the seeds cannot express: `{ returns: { getProducts: of([]) } }`
 *   keeps the method a spy *and* says what it answers, which `overrides` cannot do at once. Pass
 *   `undefined` for `overrides` when only this is needed.
 */
export function provideAutoSpyForToken<T>(
  token: InjectionToken<T>,
  overrides?: DeepPartial<T>,
  config?: AutoMockConfiguration<T>,
): AngularTokenProvider<T> {
  return { provide: token, useValue: createAutoMock<T>(overrides, config) };
}

/**
 * Inject a service from Angular's `TestBed`, already typed as `Spy<T>`.
 *
 * @example
 * ```ts
 * const users = injectSpy(UserService);                   // Spy<UserService>
 * const facade = injectSpy(FAVORITES_FACADE_TOKEN);       // an InjectionToken works too
 * ```
 *
 * For a **generic** class, name the type argument. `TestBed.inject` infers from the constructor and
 * so produces `FeatureFlagService<any>` rather than the declared default, and the `any` then
 * spreads through `Spy<>` until an assignment fails eight levels deep in a message about
 * `AddPromiseSpyMethods` — which reads like a broken spy and is not one:
 *
 * ```ts
 * const config = injectSpy<FeatureFlagService>(FeatureFlagService);
 * ```
 *
 * The token parameter is deliberately `abstract new (...args: never[]) => T` and not `unknown[]`:
 * `never[]` is what makes a **generic** class match, and "tightening" it to `unknown[]` breaks every
 * generic service at once — a copy of this helper written that way is how the failure usually
 * arrives, in four unrelated files.
 *
 * If the injector hands back something that is not an auto-spy, that is reported: a provider the
 * spec forgot to register is otherwise found much later, when `.mockReturnValue` is called on the
 * real method.
 */
export function injectSpy<T, Options extends SpyOptions = SpyOptions>(
  token: ClassType<T> | InjectionToken<T> | (abstract new (...args: never[]) => T),
): Spy<T, Options> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `TestBed.inject`'s overloads do not accept our broadened `ClassType<T> | abstract ctor` token union, and it returns the real instance `T`, not the augmented `Spy<T>`; both assertions bridge the public token/return types to the spy surface.
  const injected = TestBed.inject(token as never) as Spy<T, Options>;

  reportWhenNotASpy(token, injected);

  return injected;
}

/** Tokens already reported, so a `beforeEach` does not print the same warning once per test. */
const reportedTokens = new WeakSet<object>();

let unspiedProvidersFail = false;

/**
 * Raise {@link injectSpy}'s "not an auto-spy" report from a `console.warn` to a thrown failure.
 *
 * Exported for `enableAngularDiagnostics({ unspiedProviders })` — the one caller — rather than from
 * `vitest-auto-spy/angular`: a project that wants this wants it for the whole run, from its setup
 * file, which is what the diagnostics group is.
 */
export function failOnUnspiedProvider(fail: boolean): void {
  unspiedProvidersFail = fail;
}

function reportWhenNotASpy(token: object, injected: unknown): void {
  if (isAutoSpyLike(injected)) {
    return;
  }

  const name = 'name' in token ? String(token.name) : String(token);
  const message = withDocs(
    `[vitest-auto-spy] injectSpy(${name}): the injector returned a plain instance, not an auto-spy. ` +
      `Register it with provideAutoSpy(${name}) (or { provide: TOKEN, useValue: createAutoMock<T>() } for a token), ` +
      'or read it with TestBed.inject() if the real implementation is what this spec wants. As it stands, the ' +
      'control helpers are typed but absent, and `.mockReturnValue(…)` will throw on the real method.',
    DOCS_LINKS.angular,
  );

  // Under `unspiedProviders` every occurrence fails, so the per-token de-duplication that keeps the
  // warning readable is skipped: a throw is seen once per test by definition.
  if (unspiedProvidersFail) {
    throw new Error(message);
  }

  if (reportedTokens.has(token)) {
    return;
  }

  reportedTokens.add(token);

  // eslint-disable-next-line no-console -- a dev-time misconfiguration warning, the channel this library already uses for `onlyMethodsToSpyOn` typos.
  console.warn(message);
}

export {
  mockAccessorsProp,
  mockReadonlyProp,
  mockReadonlyPropGetter,
  mockValueProp,
  restoreMockedProps,
  type AccessorImplementations,
  type RestoreProp,
} from './prop-mock';
