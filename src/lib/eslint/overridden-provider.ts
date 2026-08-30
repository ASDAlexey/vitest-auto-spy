/**
 * Two providers for one token, in one array.
 *
 * Angular keeps the last provider registered for a token, so everything above it is dead. In a
 * testing module that is not a tidiness question, because of what the dead half usually is:
 *
 * ```ts
 * providers: [
 *   provideAutoSpy(DisplaySettingsService),                              // never runs
 *   { provide: DisplaySettingsService, useValue: mockDisplaySettingsService }, // this is what DI hands out
 * ]
 * ```
 *
 * Eight tokens in one spec file were registered both ways at once. Both halves of that mislead. The
 * author believes they have an auto-spy and writes assertions against one — `calledWith`, a method
 * the class has and the hand-rolled object does not — while the double actually injected is the
 * hand-rolled one, drifting from the class in the way the rest of this plugin exists to prevent.
 * And from the other side: whoever comes to migrate the hand-rolled double sees `provideAutoSpy`
 * sitting beside it and concludes the work is already done.
 *
 * Tokens are compared as source text, not resolved. Two spellings of one token would be missed and
 * one spelling of two tokens would be a false positive, and neither happens in a `providers` array
 * — where the token is written once, by name, next to the double it stands for.
 *
 * **The pair is classified, because the two halves of the field data are not the same defect.** In
 * the first workspace this ran over, 20 reports split in two. Most were literal duplicates —
 * `[provideAutoSpy(KidsModeService), …, provideAutoSpy(KidsModeService)]` — where deleting the
 * earlier one cannot change behaviour, because Angular had already ignored it; that half is offered
 * an edit. The rest were the interesting kind: an earlier `provideAutoSpy(AccountService, { … })`
 * carrying `gettersToSpyOn` and `instanceMethodsToSpyOn`, buried by a later bare
 * `provideAutoSpy(AccountService)`. There the survivor is the *barer* of the two, so the double the
 * spec configured is not the double it got and the assertions below run against a poorer spy — a
 * different message, and no edit, because which of the two to keep is the whole question.
 *
 * **`multi: true` is exempt, and has to be.** Angular accumulates multi providers for a token rather
 * than keeping the last, so a second one is not an override at all — a spec asserting that two
 * `BEFORE_INIT` hooks run in registration order registers both on purpose, and either report can
 * only be silenced with an `eslint-disable` over a working test. Mixing the two modes for one token
 * is still reported: Angular refuses that pair at runtime with
 * `Cannot mix multi providers and regular providers`, so it is a defect whichever half was meant.
 */
import {
  type EsArrayExpression,
  type EsFix,
  type EsNode,
  type EsObjectExpression,
  type RuleContext,
  type SuggestionDescriptor,
  findProperty,
  isCallExpression,
  isIdentifier,
  isObjectExpression,
} from './rule-types';

/** The library's own provider factories, whose first argument is the token. */
const PROVIDER_FACTORIES = new Set(['provideAutoSpy', 'provideAutoSpyForToken']);

/** One element of a `providers` array, and everything the classification needs to read off it. */
interface Registration {
  element: EsNode;
  token: string;
  /** The element as it is written — the whole of the identity test behind {@link OverrideKind}. */
  text: string;
  /** How much this provider settles beyond naming its token. Only the comparison means anything. */
  configured: number;
  /**
   * Whether this registration is `multi: true`, which changes the arithmetic entirely.
   *
   * Angular **accumulates** multi providers for a token instead of keeping the last, so two of them
   * in one array is the feature, not a defect: a spec registering two `BEFORE_INIT` hooks to assert
   * they run in registration order needs both, and deleting either deletes the test. Mixing the two
   * modes for one token stays a report — Angular refuses that pair at runtime
   * (`Cannot mix multi providers and regular providers`), so it is a defect either way.
   */
  multi: boolean;
}

/** How the provider Angular keeps relates to the one it buries. */
export type OverrideKind =
  /** The survivor configures *less*: the spy the spec set up is not the spy the test got. */
  | 'barer'
  /** Two different providers, and the later one wins. Nothing can be said about which to keep. */
  | 'different'
  /** The two are written identically, so deleting this one cannot change anything. */
  | 'duplicate';

/** One dead provider, the token it registered, and the provider that took its place. */
export interface OverriddenProvider {
  element: EsNode;
  token: string;
  kind: OverrideKind;
  /** The provider DI actually hands out — the last one registered for the token. */
  survivor: EsNode;
}

/**
 * How many configuration values sit after the token.
 *
 * An options object counts by its entries rather than as one, because that is the axis the message
 * is about: `provideAutoSpy(A, { gettersToSpyOn, instanceMethodsToSpyOn })` scores 2 against the
 * bare call's 0, and a spread or an identifier — whose contents are not readable here — counts as
 * the one thing it is.
 */
function countOptions(options: EsNode[]): number {
  return options.reduce((total, option) => total + (isObjectExpression(option) ? option.properties.length : 1), 0);
}

/**
 * Whether an object provider registers in multi mode.
 *
 * Read as "present and not written as `false`" rather than as "written as `true`", because the value
 * may be a flag this rule cannot resolve (`multi: isFeatureOn`). Guessing wrong in that direction
 * costs a missed report on a shape nobody writes; guessing wrong in the other direction reports
 * correct code, which can only be silenced with an `eslint-disable` over a working test.
 */
function isMultiProvider(context: RuleContext, element: EsObjectExpression): boolean {
  const multi = findProperty(element, 'multi');

  return multi !== undefined && context.sourceCode.getText(multi.value) !== 'false';
}

/** What an array element registers, or nothing when the element is not a provider at all. */
function registrationOf(context: RuleContext, element: EsNode): Registration | undefined {
  const text = context.sourceCode.getText(element);

  if (isObjectExpression(element)) {
    const provide = findProperty(element, 'provide');

    return provide
      ? {
          element,
          token: context.sourceCode.getText(provide.value),
          text,
          configured: element.properties.length - 1,
          multi: isMultiProvider(context, element),
        }
      : undefined;
  }

  if (!isCallExpression(element) || !isIdentifier(element.callee) || !PROVIDER_FACTORIES.has(element.callee.name)) {
    return undefined;
  }

  const [token, ...options] = element.arguments;

  // The library's factories build a single double for a token and have no multi form, so a call to
  // one is never an accumulating registration.
  return token ? { element, token: context.sourceCode.getText(token), text, configured: countOptions(options), multi: false } : undefined;
}

/** Which of the three shapes a buried provider and its survivor make. */
function overrideKind(buried: Registration, survivor: Registration): OverrideKind {
  if (buried.text === survivor.text) {
    return 'duplicate';
  }

  return survivor.configured < buried.configured ? 'barer' : 'different';
}

/**
 * The providers of an array that a later one for the same token buries.
 *
 * Walked right to left, because the provider Angular keeps is the last one: the first registration
 * met for a token is that survivor, and every one met afterwards is dead and knows what buried it.
 * Returned in source order, so a token registered three times reports the first two.
 */
export function overriddenProviders(context: RuleContext, node: EsArrayExpression): OverriddenProvider[] {
  const registered = node.elements.flatMap((element) => {
    if (!element) {
      return [];
    }

    const registration = registrationOf(context, element);

    return registration ? [registration] : [];
  });

  const survivors = new Map<string, Registration>();
  const buried: OverriddenProvider[] = [];

  registered
    .slice()
    .reverse()
    .forEach((registration) => {
      const survivor = survivors.get(registration.token);

      // Two multi providers for one token both run, so neither buries the other. The survivor is
      // left as it is: what matters for the rest of the array is that the token is spoken for.
      if (survivor?.multi === true && registration.multi) {
        return;
      }

      if (survivor) {
        buried.push({
          element: registration.element,
          token: registration.token,
          kind: overrideKind(registration, survivor),
          survivor: survivor.element,
        });

        return;
      }

      survivors.set(registration.token, registration);
    });

  return buried.reverse();
}

/** Which message each shape of the pair gets. The three are not the same defect. */
export const OVERRIDE_MESSAGES: Record<OverrideKind, string> = {
  barer: 'overriddenByBarerProvider',
  different: 'noOverriddenProvider',
  duplicate: 'duplicateProvider',
};

/**
 * Delete a dead provider, and the comma that separates it from the next element.
 *
 * A suggestion rather than a fix even here, where the deletion is provably inert: `--fix` deleting
 * lines of a `providers` array unattended is not a thing to find out about from a diff. The token
 * after the element is that comma by construction — a buried provider always has a later element,
 * the one that buried it.
 */
export function deleteProviderSuggestion(context: RuleContext, element: EsNode, token: string): SuggestionDescriptor {
  const comma = context.sourceCode.getTokenAfter(element);

  return {
    desc: `Delete this duplicate provider for ${token}`,
    fix: (fixer): EsFix => fixer.replaceTextRange([element.range[0], comma.range[1]], ''),
  };
}
