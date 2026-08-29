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
 */
import {
  type EsArrayExpression,
  type EsNode,
  type RuleContext,
  findProperty,
  isCallExpression,
  isIdentifier,
  isObjectExpression,
} from './rule-types';

/** The library's own provider factories, whose first argument is the token. */
const PROVIDER_FACTORIES = new Set(['provideAutoSpy', 'provideAutoSpyForToken']);

/** One element of a `providers` array, and the token it registers. */
export interface RegisteredProvider {
  element: EsNode;
  token: string;
}

/** The token an array element provides, as it is spelled, or nothing when the element is not a provider. */
function providedToken(context: RuleContext, element: EsNode): string | undefined {
  if (isObjectExpression(element)) {
    const provide = findProperty(element, 'provide');

    return provide ? context.sourceCode.getText(provide.value) : undefined;
  }

  if (!isCallExpression(element) || !isIdentifier(element.callee) || !PROVIDER_FACTORIES.has(element.callee.name)) {
    return undefined;
  }

  const [token] = element.arguments;

  return token ? context.sourceCode.getText(token) : undefined;
}

/**
 * The providers of an array that are overridden by a later one for the same token.
 *
 * Returned in source order, so a token registered three times reports the first two.
 */
export function overriddenProviders(context: RuleContext, node: EsArrayExpression): RegisteredProvider[] {
  const registered = node.elements.flatMap((element) => {
    if (!element) {
      return [];
    }

    const token = providedToken(context, element);

    return token === undefined ? [] : [{ element, token }];
  });

  const lastFor = new Map<string, EsNode>();

  registered.forEach(({ element, token }) => lastFor.set(token, element));

  return registered.filter(({ element, token }) => lastFor.get(token) !== element);
}
