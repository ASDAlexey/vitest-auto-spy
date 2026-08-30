/**
 * `trackInjections` — the DI seam a barrel mock is usually standing in for.
 *
 * The assertion behind most `vi.mock('@app/services')` calls is not "this module was replaced", it
 * is **which collaborators did this entry point actually ask for**. That question is answerable
 * without touching the module boundary at all, because a provider factory runs exactly when
 * something injects its token: register the collaborators as factories, run the entry point, and
 * read back the tokens whose factories fired, in order.
 *
 * Written by hand it is the same nine lines every time — a `providers.map(token => ({ provide:
 * token, useFactory: … }))` pushing into an array declared just above it — and the hand-written
 * version always stops at the record, so the spec still needs a second mechanism to stub what the
 * collaborator answers. This builds both: the providers carry auto-spies, and the log says which of
 * them DI constructed.
 *
 * Nothing here is framework-specific. `{ provide, useFactory }` is valid in Angular (`deps` is
 * optional) and in NestJS (`inject` is optional), which is why the same function is exported from
 * `vitest-auto-spy/angular` and `vitest-auto-spy/nestjs` rather than written twice. It imports no
 * framework — the NestJS entry stays dependency-free.
 */
import { createAutoMock } from './auto-mock';
import { createSpyFromClass } from './create-spy-from-class';
import { DOCS_LINKS, withDocs } from './docs-links';
import type { ClassType, Spy } from './types';

/**
 * Build the stand-in for a token: a class spy when there is a class to read, a type mock otherwise.
 *
 * Shared with `createWithAutoSpies`, the other place a bare token has to be answered with a double.
 * An `InjectionToken` carries no runtime shape, so the only honest stand-in is a type-level mock.
 */
export function createSpyForToken(token: unknown): unknown {
  if (typeof token === 'function') {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a token narrowed to `function` is a class or an abstract class; `createSpyFromClass` reads only its prototype chain.
    return createSpyFromClass(token as ClassType<unknown>, { lazySpies: true });
  }

  return createAutoMock();
}

/**
 * The provider shape Angular and NestJS agree on: `{ provide, useFactory }`, with the dependency
 * list (`deps` / `inject`) omitted because the factory takes none.
 */
export interface TrackedProvider {
  provide: unknown;
  useFactory: () => unknown;
}

/** How {@link trackInjections} builds its doubles. */
export interface TrackInjectionsOptions {
  /**
   * Build the double for a token. Defaults to {@link createSpyForToken} — a class spy for a class,
   * `createAutoMock()` for anything else. Pass this when a collaborator has to be a real object (a
   * `FormBuilder`, a config literal) rather than a spy.
   */
  double?: (token: unknown) => unknown;
}

/** The providers, plus the ordered record of which of their tokens DI constructed. */
export interface InjectionLog {
  /** Hand these to `TestBed.configureTestingModule({ providers })` or `Test.createTestingModule({ providers })`. */
  readonly providers: TrackedProvider[];
  /** The tokens DI asked for, in the order their factories ran. A copy — mutating it changes nothing. */
  injectedTokens(): unknown[];
  /** The same list as names, which is what makes a failing `toEqual` readable. */
  names(): string[];
  /** Whether DI ever constructed `token`. */
  wasInjected(token: unknown): boolean;
  /** The double registered for `token`, typed as a spy. Throws when the token was never tracked. */
  get<D>(token: ClassType<D> | (abstract new (...args: never[]) => D)): Spy<D>;
  get<D = unknown>(token: unknown): Spy<D>;
  /** Forget the record. The doubles are untouched — reset those with `resetAutoSpy`. */
  reset(): void;
}

/** A readable name for a token: a class name, an `InjectionToken`'s own description, or its `String` form. */
function tokenName(token: unknown): string {
  const name: unknown = typeof token === 'function' ? token.name : undefined;

  return typeof name === 'string' && name.length > 0 ? name : String(token);
}

/**
 * Track which of `tokens` the code under test injects.
 *
 * ```ts
 * const collaborators = trackInjections([FeatureFlagService, ANALYTICS_TOKEN]);
 *
 * TestBed.configureTestingModule({ providers: [CheckoutFacade, ...collaborators.providers] });
 * collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);
 *
 * TestBed.inject(CheckoutFacade).start();
 *
 * expect(collaborators.names()).toEqual(['FeatureFlagService']); // analytics was never asked for
 * ```
 *
 * The doubles are built up front, so a spec can stub one before the entry point runs; the *record*
 * fills in only as DI constructs them. A factory runs once per injector, so a token appears once
 * per injector that asked for it.
 */
export function trackInjections(tokens: readonly unknown[], options: TrackInjectionsOptions = {}): InjectionLog {
  const build = options.double ?? createSpyForToken;
  const doubles = new Map<unknown, unknown>(tokens.map((token) => [token, build(token)]));
  const injected: unknown[] = [];

  const providers = tokens.map((token) => ({
    provide: token,
    useFactory: (): unknown => {
      injected.push(token);

      return doubles.get(token);
    },
  }));

  return {
    providers,
    injectedTokens: () => [...injected],
    names: () => injected.map(tokenName),
    wasInjected: (token) => injected.includes(token),
    get: <D>(token: unknown): Spy<D> => {
      if (!doubles.has(token)) {
        throw new Error(
          withDocs(
            `[vitest-auto-spy] trackInjections(...).get(${tokenName(token)}): that token is not tracked by this log.\n` +
              `Tracked here: ${tokens.map(tokenName).join(', ') || '(none)'}. Add it to the trackInjections([...]) list, or read it ` +
              'from the injector directly — `get` only answers for the tokens whose providers this log created.',
            DOCS_LINKS.trackInjections,
          ),
        );
      }

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the map is keyed by token and holds the double built for that very token; `Map#get` cannot express that.
      return doubles.get(token) as Spy<D>;
    },
    reset: (): void => {
      injected.length = 0;
    },
  };
}
