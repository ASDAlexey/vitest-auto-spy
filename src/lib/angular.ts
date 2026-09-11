/**
 * Angular testing helpers (bonus): a `TestBed` provider and a typed `inject` shorthand.
 *
 * The property-mocking utilities (`mockReadonlyProp`, `mockValueProp`, `mockAccessorsProp`,
 * `restoreMockedProps`) were introduced here and are still exported from this entry, but nothing
 * about them is Angular-specific — they now live in `./prop-mock` and are shared with the core.
 */
import type { InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { mergeTokenDefaults } from './angular-spy-defaults';
import { type AutoMockConfiguration, createAutoMock } from './auto-mock';
import { createSpyFromClass } from './create-spy-from-class';
import { DOCS_LINKS, withDocs } from './docs-links';
import { misconfigurationThrows, reportMisconfiguration } from './misconfiguration';
import { currentSpecFile } from './spec-file';
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
 *
 * @param ObjectClass The class to read. Its prototype decides what is spied.
 * @param methodsToSpyOnOrConfig A bare list of extra callables, or the full
 *   {@link ClassSpyConfiguration}. The parameter's name is older than the configuration object and
 *   undersells it: `returns` says what a method answers, and **`overrides` seeds a member the
 *   double must *be* rather than spy on** — the same channel, shape and semantics as
 *   {@link provideAutoSpyForToken}'s second argument. That symmetry is easy to miss from the name
 *   alone, and missing it sends a reader to `gettersToSpyOn`, which is a different thing: a spied
 *   accessor answers `undefined` until it is configured, while the code under test usually needs
 *   the member to already *hold* a value — and inside a `providers: []` array there is no later
 *   statement in which to put one.
 *
 * ```ts
 * providers: [
 *   provideAutoSpy(RemoteConfigService, {
 *     overrides: { remoteConfig: { theme: 'dark' }, updates$: of(undefined) },
 *     returns: { load: of([]) },
 *   }),
 * ];
 * ```
 *
 * **A generic class keeps its declared default, whatever the configuration names.** TypeScript
 * checks a generic class argument after the configuration, so the core factory reads `T` back from
 * `gettersToSpyOn` or `overrides` first: `createSpyFromClass(RemoteConfigService, { gettersToSpyOn:
 * ['remoteConfig'], returns: { isKeyEnabled: false } })` fails with `'isKeyEnabled' does not exist in
 * type 'MethodReturns<{ remoteConfig: any; }>'`. Here `T` comes from the class alone (`NoInfer`:
 * TypeScript 5.4, which every Angular this entry supports already requires), so the same
 * configuration compiles. The core factories still need the argument spelled out:
 * `createSpyFromClass<RemoteConfigService>(…)`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- read only while the generic class argument is deferred, so the configuration passes that first check; the class then decides `T`.
export function provideAutoSpy<T = any>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: NoInfer<ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[]>,
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
 *
 * A token registered with `registerAutoSpyDefaults(TOKEN, …)` from this entry starts from that
 * registration, exactly as `provideAutoSpy(Class)` starts from a class's: both arguments are merged
 * over it — lists unioned, `returns` and `overrides` key by key with the call site winning.
 */
export function provideAutoSpyForToken<T>(
  token: InjectionToken<T>,
  overrides?: DeepPartial<T>,
  config?: AutoMockConfiguration<T>,
): AngularTokenProvider<T> {
  const { overrides: seeds, ...merged } = mergeTokenDefaults(token, overrides, config);

  return { provide: token, useValue: createAutoMock<T>(seeds, { ...merged, name: merged.name ?? String(token) }) };
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
 * @remarks
 * The signature is `injectSpy(token)` — the token alone, resolved through the global `TestBed`. The
 * two-argument `injectSpy(moduleRef, token)` belongs to `vitest-auto-spy/nestjs`, which has no
 * ambient injector to read.
 *
 * When the injector hands back a real instance rather than a double, that is reported — a provider
 * the spec forgot to register is otherwise found much later, when `.mockReturnValue` is called on
 * the real method. It is a `console.warn`, once per token and spec file; raise it to a thrown failure
 * with `enableAngularDiagnostics({ unspiedProviders: true })` from `vitest-auto-spy/angular`, or for
 * every misconfiguration report at once with `setupAutoSpy({ misconfiguration: 'throw' })`.
 */
/**
 * A class, read through a bare construct signature — the overload that keeps a **declared default**
 * type argument.
 *
 * Inference gives up on a default the moment the parameter is a union: `class Config<T = Defaults>`
 * handed to a `ClassType<T> | InjectionToken<T> | …` parameter infers `T` as `unknown`, and every
 * member typed against it then reads as `unknown` — `injectSpy(RemoteConfigService)` came back with
 * `read(): unknown` where the class says `read(): RemoteConfigDefaults`. Splitting the class case
 * into its own overload is the whole fix; the union survives underneath it for tokens.
 */
export function injectSpy<T, Options extends SpyOptions = SpyOptions>(token: abstract new (...args: never[]) => T): Spy<T, Options>;
/** A token, or a class whose statics the call site names — the shape the union was written for. */
export function injectSpy<T, Options extends SpyOptions = SpyOptions>(token: ClassType<T> | InjectionToken<T>): Spy<T, Options>;
export function injectSpy<T, Options extends SpyOptions = SpyOptions>(
  token: ClassType<T> | InjectionToken<T> | (abstract new (...args: never[]) => T),
): Spy<T, Options> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `TestBed.inject`'s overloads do not accept our broadened `ClassType<T> | abstract ctor` token union, and it returns the real instance `T`, not the augmented `Spy<T>`; both assertions bridge the public token/return types to the spy surface.
  const injected = TestBed.inject(token as never) as Spy<T, Options>;

  reportWhenNotASpy(token, injected);

  return injected;
}

// Per spec file, not per worker: under `isolate: false` a worker-wide set printed the warning in
// whichever file got there first, so the file that showed it changed from run to run.
let reportedTokens = new WeakSet<object>();
let reportedIn: unknown;

function reportedInThisFile(token: object): boolean {
  const file = currentSpecFile();

  if (file !== reportedIn) {
    reportedIn = file;
    reportedTokens = new WeakSet<object>();
  }

  const seen = reportedTokens.has(token);

  reportedTokens.add(token);

  return seen;
}

// On `globalThis`, so `enableAngularDiagnostics` reaches `injectSpy` even from another bundle's copy.
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyFailOnUnspiedProvider__: boolean | undefined;
}

/**
 * Raise {@link injectSpy}'s "not an auto-spy" report from a `console.warn` to a thrown failure.
 *
 * Exported for `enableAngularDiagnostics({ unspiedProviders })` — the one caller — rather than from
 * `vitest-auto-spy/angular`: a project that wants this wants it for the whole run, from its setup
 * file, which is what the diagnostics group is.
 */
export function failOnUnspiedProvider(fail: boolean): void {
  globalThis.__vitestAutoSpyFailOnUnspiedProvider__ = fail;
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

  // A throw is seen once per test by definition, so the de-duplication only applies to the printed grade.
  if (globalThis.__vitestAutoSpyFailOnUnspiedProvider__ === true || misconfigurationThrows()) {
    throw new Error(message);
  }

  if (!reportedInThisFile(token)) {
    reportMisconfiguration(message);
  }
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
