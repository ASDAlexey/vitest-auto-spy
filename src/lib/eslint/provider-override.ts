/**
 * `TestBed.overrideProvider(X, …)` — the second place a spec substitutes a dependency, and the one
 * the plugin read nowhere.
 *
 * Every rule here that is about a double behind Angular DI was written against a `providers` array.
 * The override call does the same substitution from outside the array, and it is not a rare
 * spelling: on one consumer's 1759 spec files there are 61 of them across 36 files, and 33 hand the
 * double over as an object literal — the shape `prefer-provide-auto-spy` exists for, reported by
 * nothing, because the `provide:` key it looks for is not there. The token is argument 0 instead.
 *
 * Two consequences, and they are separate rules:
 *
 * ```ts
 * TestBed.overrideProvider(CartService, { useValue: { total: vi.fn(), add: vi.fn() } }); // hand-rolled
 *
 * TestBed.configureTestingModule({ providers: [provideAutoSpy(CartService)] });          // …and dead
 * TestBed.overrideProvider(CartService, { useValue: cartMock });
 * ```
 *
 * **A call whose descriptor is not an object literal is left entirely alone**, and that is what
 * keeps the reading usable: the idiom this consumer settled on is
 * `.overrideProvider(X, provideAutoSpy(X, { … }))`, which works because `provideAutoSpy` returns
 * `{ provide, useValue }` and `overrideProvider` reads `useValue` off it. 28 of the 61 calls are
 * that, they are the fix rather than the problem, and a `CallExpression` in the slot cannot reach
 * {@link overrideDescriptor}.
 */
import {
  type EsCallExpression,
  type EsNode,
  type EsObjectExpression,
  type RuleContext,
  hasAncestor,
  isObjectExpression,
  propertyName,
} from './rule-types';
import { enclosingSuite, resetsTheTestingModule, runsBeforeEveryTest } from './testbed-order';

/**
 * Every `x.overrideProvider(…)`, whatever `x` is written as.
 *
 * `TestBed.overrideProvider` is only half of the field data: the other half is chained off the
 * configuration call — `TestBed.configureTestingModule({ … }).overrideProvider(X, …)` — where
 * `callee.object` is a `CallExpression` and a selector naming `TestBed` matches nothing. Measured on
 * the consumer above, the chained spelling is most of the 61 calls, so reading only the qualified
 * one would have covered a fraction of the files. Nothing else in a spec carries a method of that
 * name.
 */
export const OVERRIDE_PROVIDER_CALL = 'CallExpression[callee.property.name="overrideProvider"]';

/** An override call, reduced to the three things every reader of it needs. */
export interface ProviderOverride {
  call: EsCallExpression;
  /** The token, as source text — the same identity test `overriddenProviders` uses inside an array. */
  token: string;
  /**
   * The line the `.overrideProvider(` itself is written on, which is not the line the call starts on.
   *
   * The chained spelling is `TestBed.configureTestingModule({ … })` — often twenty lines of
   * providers — `.overrideProvider(X, …)`, and a message naming the call's own `loc` sends the
   * reader to the top of that block, where there is nothing to see. Taken off the opening
   * parenthesis, which is the one token of the call guaranteed to sit on that line and to exist
   * whenever there is a token to name at all.
   */
  line: number;
}

/** The token an override names, or nothing for a call with no arguments to read. */
export function providerOverride(context: RuleContext, call: EsCallExpression): ProviderOverride | undefined {
  const [token] = call.arguments;

  if (!token) {
    return undefined;
  }

  return { call, token: context.sourceCode.getText(token), line: context.sourceCode.getTokenBefore(token).loc.start.line };
}

/**
 * The provider descriptor an override hands over, when it hands over a literal one.
 *
 * Anything else — `provideAutoSpy(X)`, a name, a spread — is not read at all. See the module
 * comment: the call form is the recommended one, and following a name from here would report the
 * fix.
 */
export function overrideDescriptor(call: EsCallExpression): EsObjectExpression | undefined {
  const [, descriptor] = call.arguments;

  return descriptor && isObjectExpression(descriptor) ? descriptor : undefined;
}

/** Whether an array is the `providers` of a testing module, as opposed to a decorated class's own. */
export function isTestingModuleProviders(node: EsNode): boolean {
  return propertyName(node.parent) === 'providers' && !hasAncestor(node, (candidate) => candidate.type === 'Decorator');
}

/** One registration an override in the same suite replaces, and the call that replaces it. */
export interface BuriedRegistration {
  element: EsNode;
  token: string;
  override: ProviderOverride;
}

/**
 * The registrations of a file that an override in the same suite replaces.
 *
 * Collected across the file rather than per array, because the two halves are never in one
 * expression: the registration is inside `configureTestingModule`, the override is a statement or a
 * chained call after it. Order is not read at all — an override wins over a module provider whenever
 * it runs, which is what makes this decidable from the source in the first place.
 *
 * Two conditions keep the reading conservative, and each of them was needed on the consumer's own
 * files. The suite is compared **by identity**: an override inside a nested `describe` replaces the
 * provider only for the tests of that block, so a registration in the enclosing suite is still what
 * every other test gets and is not dead — the consumer has that exact shape, a nested block that
 * reconfigures the module for its own two tests. And the override has to be written where every test
 * of the suite reaches it ({@link runsBeforeEveryTest}), which removes the override parked in a
 * helper: one file registers three tokens and overrides each of them from a helper that three of its
 * thirty-four tests call. A suite that resets the testing module is exempt outright, for the reason
 * `no-inject-before-override` exempts one: the module goes back to a state where the registration is
 * live, and nothing readable here says which state a given test runs in.
 */
export function buriedRegistrations(
  registrations: { element: EsNode; token: string }[],
  overrides: ProviderOverride[],
): BuriedRegistration[] {
  return registrations.flatMap((registration) => {
    const suite = enclosingSuite(registration.element);
    const override = overrides.find(
      (candidate) =>
        candidate.token === registration.token && enclosingSuite(candidate.call) === suite && runsBeforeEveryTest(candidate.call),
    );

    if (!override || resetsTheTestingModule(suite)) {
      return [];
    }

    return [{ ...registration, override }];
  });
}
