/**
 * `extendWithAutoSpies` — the `TestBed` half of a spec, moved into Vitest fixtures.
 *
 * The shape it replaces is in every Angular suite ever migrated:
 *
 * ```ts
 * let cart: Spy<CartService>;
 * let api: Spy<ApiService>;
 *
 * beforeEach(() => {
 *   TestBed.configureTestingModule({ providers: [provideAutoSpy(CartService), provideAutoSpy(ApiService)] });
 *   cart = injectSpy(CartService);
 *   api = injectSpy(ApiService);
 * });
 * ```
 *
 * Five lines of ceremony per dependency, a `let` that is `undefined` between tests and a
 * declaration whose type has to be repeated by hand. Vitest 4.1's builder form of `test.extend`
 * infers the type from the factory, so the whole block becomes one statement — and a test that does
 * not destructure `api` never builds it.
 *
 * **Why one call rather than a chain of `.extend`s.** The obvious composing form —
 * `base.extend('cart', autoSpy(CartService)).extend('api', autoSpy(ApiService))` — cannot work, and
 * the reason is `TestBed`, not typing. Fixtures resolve lazily and independently, so `cart` would
 * configure the testing module and inject, which *instantiates* it; `api` would then reach
 * `configureTestingModule` after instantiation and fail with Angular's own
 * "Cannot configure the test module when the test module has already been instantiated". Every
 * provider has to be known before the first injection, so the helper has to see them all at once.
 *
 * A `beforeEach` that configures the module further still composes, because it runs before any
 * fixture resolves and `configureTestingModule` may be called repeatedly right up until the first
 * injection. A `beforeEach` that *injects* does not — and that is the one case this cannot paper
 * over, since by then Angular has already made the decision.
 */
import { InjectionToken } from '@angular/core';
import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TestAPI } from 'vitest';

import { injectSpy, provideAutoSpy, provideAutoSpyForToken } from './angular';
import { DOCS_LINKS, withDocs } from './docs-links';
import type { ClassSpyConfiguration, ClassType, OnlyMethodKeysOf, Spy } from './types';

/**
 * One entry of the map: a class, a class with the configuration {@link provideAutoSpy} takes, or an
 * `InjectionToken` whose type argument is what the double is built from.
 */
export type AutoSpyFixture =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the map is heterogeneous by design; each entry's own type is recovered by `SpiedFixtures` below, and a narrower element type here would reject the very mix this helper exists for.
  | ClassType<any>
  | InjectionToken<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above; the tuple's second member is the configuration for whatever class its first member is.
  | readonly [ClassType<any>, ...unknown[]];

/** What each entry of the map becomes in the test's context. */
export type SpiedFixtures<Spec> = {
  [Name in keyof Spec]: Spec[Name] extends InjectionToken<infer T>
    ? Spy<T>
    : Spec[Name] extends readonly [ClassType<infer T>, ...unknown[]]
      ? Spy<T>
      : Spec[Name] extends ClassType<infer T>
        ? Spy<T>
        : never;
};

/** Options for {@link extendWithAutoSpies}. */
export interface ExtendWithAutoSpiesOptions {
  /**
   * Providers registered alongside the spies, in the same `configureTestingModule` call — the
   * component under test, a real service the spec deliberately keeps, `provideHttpClient()`.
   *
   * They go in *before* the generated ones, so a provider named here wins over the auto-spy that
   * would otherwise be made for the same token.
   */
  providers?: Provider[];
}

/**
 * The one `extend` signature this module uses, freed of the context type that changes on every hop.
 *
 * `extend` is not just a builder: it also *mutates* nothing and returns a new API, so the loop keeps
 * the returned value — which is why this is a self-returning shape rather than `void`.
 */
interface Builder {
  extend(name: string, factory: (context: object, use: { onCleanup: (teardown: () => void) => void }) => unknown): Builder;
}

/** Enter the loop: a `TestAPI` read as the one signature the loop uses. */
function toBuilder(api: object): Builder {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `TestAPI#extend` carries this signature among its overloads; the narrowing is what lets the loop have one type instead of one per iteration.
  return api as Builder;
}

/** Leave the loop: the builder, said at the type the keys it was given produce. */
function fromBuilder<Context>(builder: Builder): TestAPI<Context> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the value is the `TestAPI` that went in, with one fixture added per key; `Builder` is deliberately too narrow to say so, and `TestAPI` is assignable to it, which is what makes the assertion legal in one step.
  return builder as TestAPI<Context>;
}

/**
 * Whether `api.extend` is the builder form — `extend(name, factory)` — and not the object form alone.
 *
 * Vitest exports no version to ask, so this reads the one thing the builder form changed: the arity
 * of `extend`. Through 4.0 it is `function (fixtures)`, one parameter; 4.1 rewrote it as
 * `function (fixturesOrName, optionsOrFn, maybeFn)`, three — checked against the published
 * `@vitest/runner` builds for 3.2.4, 4.0.0 and 4.1.0. The check exists because the older `extend`
 * handed a string does **not** throw: it walks `Object.entries('cart')` and registers fixtures named
 * `'0'`, `'1'`, …, so every test would receive `cart` as `undefined` and die on the first property
 * read — one `TypeError` per test, naming neither this helper nor the version.
 */
function supportsBuilderExtend(api: object): boolean {
  const extend: unknown = Reflect.get(api, 'extend');

  return typeof extend === 'function' && extend.length >= 2;
}

/** Whether an entry names a token rather than a class — the two need different providers. */
function isToken(fixture: AutoSpyFixture): fixture is InjectionToken<unknown> {
  return fixture instanceof InjectionToken;
}

/** The provider one entry contributes. */
function providerFor(fixture: AutoSpyFixture): Provider {
  if (isToken(fixture)) {
    return provideAutoSpyForToken(fixture);
  }

  if (Array.isArray(fixture)) {
    const [ObjectClass, config] = fixture;

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the tuple's second member is declared `unknown` so the map can hold entries for unrelated classes; it is the configuration of *this* entry's class, which the tuple type cannot say.
    return provideAutoSpy(ObjectClass, config as ClassSpyConfiguration<unknown> | OnlyMethodKeysOf<unknown>[]);
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed by elimination: not a token, not a tuple.
  return provideAutoSpy(fixture as ClassType<unknown>);
}

/** The token an entry is injected by. */
function tokenFor(fixture: AutoSpyFixture): ClassType<unknown> | InjectionToken<unknown> {
  if (isToken(fixture)) {
    return fixture;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a tuple's first member is the class; anything else already is one.
  return (Array.isArray(fixture) ? fixture[0] : fixture) as ClassType<unknown>;
}

/**
 * Turn a map of dependencies into typed `TestBed` fixtures.
 *
 * ```ts
 * import { test as base } from 'vitest';
 * import { extendWithAutoSpies } from 'vitest-auto-spy/angular';
 *
 * const test = extendWithAutoSpies(base, {
 *   cart: CartService,
 *   api: [ApiService, { methodsToSpyOn: ['get'] }],
 *   passcode: PASSCODE_TOKEN,
 * });
 *
 * test('checks out', async ({ cart }) => {
 *   cart.checkout.resolveWith(true);
 *
 *   await expect(cart.checkout(1)).resolves.toBe(true);
 * });
 * ```
 *
 * The testing module is configured **once per test**, the first time any of the fixtures is
 * touched, and the flag that remembers it is released on cleanup — a fixture object outlives the
 * test that used it, and a module configured for the previous one is the shape that makes an
 * Angular suite fail depending on order.
 *
 * Needs **Vitest 4.1 or newer**: the builder form of `test.extend` it is written against is what
 * infers a fixture's type from its factory, and older versions have only the object form.
 *
 * @param base The `test` to extend — Vitest's own, or one already carrying fixtures of yours.
 * @param spec Fixture name to dependency. A bare class, `[Class, config]` with what
 *   {@link provideAutoSpy} accepts, or an `InjectionToken`.
 */
export function extendWithAutoSpies<Context, const Spec extends Record<string, AutoSpyFixture>>(
  base: TestAPI<Context>,
  spec: Spec,
  { providers = [] }: ExtendWithAutoSpiesOptions = {},
): TestAPI<Context & SpiedFixtures<Spec>> {
  if (!supportsBuilderExtend(base)) {
    throw new Error(
      withDocs(
        '[vitest-auto-spy] extendWithAutoSpies needs Vitest 4.1 or newer: the `test` handed in has only the object form of ' +
          '`extend` (Vitest 4.0 and below), which would register fixtures named "0", "1", … and hand every test `undefined`. ' +
          'Upgrade Vitest, or keep `provideAutoSpy` + `injectSpy` in a `beforeEach` until then.',
        DOCS_LINKS.angular,
      ),
    );
  }

  // Entries rather than keys, so nothing has to index back into `spec` — under
  // `noUncheckedIndexedAccess` that index is `AutoSpyFixture | undefined`, and the only honest way
  // to spend the `undefined` is a check that a key taken from the same object can never fail.
  const entries = Object.entries(spec);
  let configured = false;

  const configureOnce = (onCleanup: (teardown: () => void) => void): void => {
    if (configured) {
      return;
    }

    configured = true;
    onCleanup(() => {
      configured = false;
    });

    TestBed.configureTestingModule({ providers: [...providers, ...entries.map(([, fixture]) => providerFor(fixture))] });
  };

  // The loop is written against `Builder` rather than `TestAPI` on purpose. `TestAPI#extend` is ten
  // overloads deep, and every one of them is stated in terms of the context it is *adding to* — a
  // context that grows by one key per iteration, which no accumulator type can track. `Builder` is
  // the single signature this loop actually uses, and the two conversions around it are the whole
  // cost: one to enter, one to say what came out. What came out is this function's claim anyway —
  // one fixture per key of `spec`, each holding the spy for that key's token.
  let builder = toBuilder(base);

  for (const [name, fixture] of entries) {
    // The empty destructuring pattern is required, not stylistic: Vitest reads the factory's source
    // to discover which fixtures it depends on, and rejects a plainly-named first parameter with
    // `FixtureParseError`. This factory depends on none of them.
    // eslint-disable-next-line no-empty-pattern -- see above.
    builder = builder.extend(name, ({}, { onCleanup }) => {
      configureOnce(onCleanup);

      return injectSpy(tokenFor(fixture));
    });
  }

  return fromBuilder<Context & SpiedFixtures<Spec>>(builder);
}
