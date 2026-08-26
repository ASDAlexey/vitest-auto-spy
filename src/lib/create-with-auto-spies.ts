/**
 * `createWithAutoSpies` — instantiate a service/store/pipe with every dependency already spied.
 *
 * The alternative a project writes by hand is a `providers` array that lists each dependency with
 * a `useValue` object of `vi.fn()`s, rewritten whenever a dependency is added. Here the injector
 * itself answers an unknown token with a spy, so the spec names only what it wants to control.
 *
 * It is still Angular DI: the class is built through its own `ɵfac`, so constructor parameters and
 * `inject()` field initializers resolve the same way they do in the app. Explicit `providers` win —
 * they are the ones Angular finds first; only what is left over becomes an auto-spy.
 */
import { Injector, type Provider, type ProviderToken, type Type, runInInjectionContext } from '@angular/core';

import { createAutoMock } from './auto-mock';
import { createSpyFromClass } from './create-spy-from-class';
import type { ClassType, Spy } from './types';

/** Options for {@link createWithAutoSpies}. */
export interface CreateWithAutoSpiesOptions {
  /**
   * Providers that take precedence over the auto-spies — `provideAutoSpy(X)`, a `useValue` stub, a
   * real service.
   *
   * Plain providers only: this builds an `Injector.create()` injector, which — unlike `TestBed` —
   * does not accept the `EnvironmentProviders` returned by `provideHttpClient()` and friends. A
   * class that needs those belongs in a `TestBed`, i.e. in {@link renderShallow} or a plain
   * `configureTestingModule`.
   */
  providers?: Provider[];
}

/** Resolve a dependency exactly as the instance sees it: an explicit provider if given, the auto-spy otherwise. */
export interface SpyRegistry {
  get<D>(token: ProviderToken<D>): Spy<D>;
  /** Tokens that were answered with an auto-spy (i.e. nothing was provided for them). */
  autoSpiedTokens(): unknown[];
}

/** What {@link createWithAutoSpies} hands back. */
export interface AutoSpiedInstance<T> {
  instance: T;
  injector: Injector;
  spies: SpyRegistry;
}

/** Build the stand-in for a token nobody provided: a class spy when there is a class to read, a type mock otherwise. */
function createSpyForToken(token: unknown): unknown {
  if (typeof token === 'function') {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `ProviderToken` narrowed to `function` is a class or an abstract class; `createSpyFromClass` reads only its prototype chain.
    return createSpyFromClass(token as ClassType<unknown>, { lazySpies: true });
  }

  // An `InjectionToken` carries no runtime shape, so the only honest stand-in is a type-level mock.
  return createAutoMock();
}

/**
 * Bottom of the injector chain: instead of throwing `NullInjectorError`, it mints a spy.
 *
 * A lookup that carries an explicit `notFoundValue` is left alone — that is Angular probing an
 * optional token (`inject(X, { optional: true })`, its own internal `ENVIRONMENT_INITIALIZER`
 * sweeps), and answering those with a spy would change documented DI semantics.
 */
class AutoSpyInjector extends Injector {
  readonly #spies = new Map<unknown, unknown>();

  override get<D>(token: ProviderToken<D> | string, notFoundValue?: unknown): D {
    if (notFoundValue !== undefined && notFoundValue !== Injector.THROW_IF_NOT_FOUND) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- honouring Angular's own contract: when a caller passes a default, that default is the result.
      return notFoundValue as D;
    }

    if (!this.#spies.has(token)) {
      this.#spies.set(token, createSpyForToken(token));
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the map is keyed by token and holds the spy built for that very token; `Map#get` cannot express that.
    return this.#spies.get(token) as D;
  }

  tokens(): unknown[] {
    return [...this.#spies.keys()];
  }
}

/** The Angular-generated factory of a decorated class, which resolves constructor dependencies through DI. */
function factoryOf<T>(target: Type<T>): (() => T) | undefined {
  const factory: unknown = Reflect.get(target, 'ɵfac');

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `ɵfac` is Angular's own factory for this class; narrowing to `function` is all that can be checked at runtime.
  return typeof factory === 'function' ? (factory as () => T) : undefined;
}

/**
 * Create `target` with auto-spied dependencies.
 *
 * ```ts
 * const { instance, spies } = createWithAutoSpies(CartService);
 *
 * spies.get(PricingService).total.mockReturnValue(42);
 * expect(instance.checkout()).toBe(42);
 * ```
 */
export function createWithAutoSpies<T>(target: Type<T>, options: CreateWithAutoSpiesOptions = {}): AutoSpiedInstance<T> {
  const autoSpies = new AutoSpyInjector();
  const injector = Injector.create({ providers: options.providers ?? [], parent: autoSpies, name: 'createWithAutoSpies' });
  const factory = factoryOf(target);
  const instance = runInInjectionContext(injector, () => (factory ? factory() : new target()));

  return {
    instance,
    injector,
    spies: {
      get: <D>(token: ProviderToken<D>): Spy<D> => {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the injector returns the real `D` (a user provider) or the `Spy<D>` built for the token; both are read through the spy surface here.
        return injector.get(token) as Spy<D>;
      },
      autoSpiedTokens: () => autoSpies.tokens(),
    },
  };
}
