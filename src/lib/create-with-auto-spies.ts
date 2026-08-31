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

import { DOCS_LINKS, withDocs } from './docs-links';
import { createSpyForToken } from './track-injections';
import type { Spy } from './types';

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

  knows(token: unknown): boolean {
    return this.#spies.has(token);
  }
}

/**
 * A token as a reader recognises it: a class by its `name`, an `InjectionToken` by the description
 * its own `toString()` prints.
 */
function describeToken(token: unknown): string {
  const name: unknown = Reflect.get(Object(token), 'name');

  return typeof name === 'string' ? name : String(token);
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
        // The instance is already built by the time anyone can call this, so "did it ask for this
        // token" is a settled fact — and a token it never asked for is worth refusing rather than
        // answering. The injector would otherwise mint a fresh spy on the spot: `spies.get(X).m
        // .mockReturnValue(…)` then configures an object the instance has never seen, the assertion
        // fails on the *real* collaborator several frames in, and in the worst case the test is
        // green because it asserted nothing. Stubbing the base class instead of the implementation,
        // or a token the class stopped injecting after a refactor, both land here.
        //
        // The probe is the optional lookup rather than a sentinel default: Angular's two-argument
        // `get(token, notFoundValue)` is the deprecated overload, and the auto-spy injector answers
        // *any* explicit default with that default — which is why `knows` is asked first and the
        // probe only settles whether `providers` supplies it. A provider whose value is genuinely
        // `null` is indistinguishable from an absent one here, and reading a spy off it would have
        // handed back `null` anyway.
        if (!autoSpies.knows(token) && injector.get(token, null, { optional: true }) === null) {
          throw new Error(
            withDocs(
              `[vitest-auto-spy] createWithAutoSpies(${describeToken(target)}).spies.get(${describeToken(token)}): the instance never ` +
                `asked for that token, and nothing in \`providers\` supplies it, so the spy you would get back is not the one it uses. ` +
                `Auto-spied tokens: ${autoSpies.tokens().map(describeToken).join(', ') || '(none)'}.`,
              DOCS_LINKS.angular,
            ),
          );
        }

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the injector returns the real `D` (a user provider) or the `Spy<D>` built for the token; both are read through the spy surface here.
        return injector.get(token) as Spy<D>;
      },
      autoSpiedTokens: () => autoSpies.tokens(),
    },
  };
}
