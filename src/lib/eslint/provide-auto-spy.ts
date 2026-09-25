/**
 * `prefer-provide-auto-spy` — every shape a provider hands DI a double in, and the one call that
 * replaces them.
 *
 * The rule lives here rather than in `rules.ts` because it reads four provider slots and now a fifth
 * shape, and the readings are worth having next to each other. Three of them are somebody's hand-
 * written double — an object of `vi.fn()`s in a `useValue`, a stub class behind `useClass:` or
 * `useExisting:`, a factory building either — and are read through `hand-rolled-doubles.ts` and
 * `stub-class.ts`. The fourth is this file's own: the provider that spells `provideAutoSpy` out.
 *
 * `{ provide: X, useValue: createSpyFromClass(X) }` is not a hand-rolled anything — it is the
 * factory's body, `provideAutoSpy(X, config)` being `{ provide: X, useValue: createSpyFromClass(X,
 * config) }` and nothing else — and the object reading, which looks for an object *literal* in the
 * slot, never saw it. Measured on a suite of 1771 spec files that is otherwise clean against
 * `recommended`: 91 providers in 49 files, none of them reported.
 *
 * Two neighbours are deliberately not this, and both would cost more than they are worth:
 *
 * - **A different class** — `{ provide: LocalStorage, useValue: createSpyFromClass(BaseLocalStorage) }`,
 *   51 sites in 41 files on the same suite. The token is an abstract class and the spy is built from
 *   an implementation of it, because an abstract prototype carries none of the methods the double
 *   needs: `provideAutoSpy(LocalStorage)` would spy nothing at all. There is no shorter spelling of
 *   that provider, so there is nothing to report.
 * - **A call parked in a name** — `const cart = createSpyFromClass(Cart);` with `useValue: cart`
 *   below it. The double is configured through that name afterwards, so the replacement is
 *   `provideAutoSpy(Cart)` *plus* an `injectSpy(Cart)` at every use — a rewrite of the file rather
 *   than of the provider.
 */
import { count as plural } from '../message-text';
import { PACKAGE, bindingState, dropNamedImport, findBinding, importNamed } from './bindings';
import { defineRule } from './define-rule';
import { handRolledProvider, providesToken } from './hand-rolled-doubles';
import { argumentList, excerpt, excerptOr } from './message-data';
import { OVERRIDE_PROVIDER_CALL, overrideDescriptor } from './provider-override';
import { namesActivatedRoute } from './route-double';
import {
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsNode,
  type EsObjectExpression,
  type EsProperty,
  type RuleContext,
  type RuleModule,
  findProperty,
  isCallExpression,
  isIdentifier,
  isObjectExpression,
  propertyName,
  propertyValue,
} from './rule-types';
import { stubClassProvider } from './stub-class';

/** The factory the long form calls, and the one that replaces the whole literal. */
const SPY_FROM_CLASS = 'createSpyFromClass';
const PROVIDE_AUTO_SPY = 'provideAutoSpy';

/** The entry point `provideAutoSpy` is imported from, which is not the package root. */
const ANGULAR_ENTRY = `${PACKAGE}/angular`;

/**
 * The `createSpyFromClass(X, …)` a provider hands over for the very class it stands in for.
 *
 * The two names are compared rather than resolved: a provider and the spy inside it are written on
 * one line of one file, so a name meaning a different class three scopes up is a shape nobody
 * writes — and resolving them would still not say whether two imported names are the same class.
 */
function longFormAutoSpy(descriptor: EsObjectExpression): EsCallExpression | undefined {
  const provide = findProperty(descriptor, 'provide');
  const useValue = findProperty(descriptor, 'useValue');

  if (!provide || !useValue || findProperty(descriptor, 'multi')) {
    return undefined;
  }

  const token = propertyValue(provide);
  const call = propertyValue(useValue);

  if (!isCallExpression(call) || !isIdentifier(call.callee) || call.callee.name !== SPY_FROM_CLASS) {
    return undefined;
  }

  const [read] = call.arguments;

  return read && isIdentifier(read) && isIdentifier(token) && token.name === read.name ? call : undefined;
}

/** The provider that spells the factory out instead of calling it — fixed where the rewrite is exact. */
function reportLongForm(context: RuleContext, descriptor: EsObjectExpression): void {
  const call = longFormAutoSpy(descriptor);

  if (!call) {
    return;
  }

  const report = { node: descriptor, messageId: 'preferProvideAutoSpyOverLongForm', data: { token: argumentList(context, call) } };

  context.report(
    isLongFormFixable(context, descriptor, call)
      ? { ...report, fix: (fixer: EsFixer): EsFix[] => longFormFixes(context, fixer, descriptor, call) }
      : report,
  );
}

/**
 * The report for `ActivatedRoute`, wherever the double for it is written.
 *
 * Drawn only where the rule would have said something anyway — a hand-rolled double, or the long
 * form of the factory — so the token changes the advice rather than widening the rule.
 */
function reportRouteToken(context: RuleContext, descriptor: EsObjectExpression, reported: EsNode | undefined): void {
  const node = reported ?? (longFormAutoSpy(descriptor) ? descriptor : undefined);

  if (node) {
    context.report({ node, messageId: 'preferProvideActivatedRoute' });
  }
}

/**
 * Whether the replacement is a transposition rather than a change of meaning.
 *
 * The type arguments are what this really guards. `createSpyFromClass<T, Options>` takes two and
 * `provideAutoSpy<T>` one, so a call that spells either — `createSpyFromClass<CartService>(…)` — has
 * no `provideAutoSpy` form that says the same thing, and a fixer dropping them would change what the
 * spy's type is. A third property in the literal has nowhere to go either, and neither does an
 * argument list the factory does not take.
 */
function isTransposition(descriptor: EsObjectExpression, call: EsCallExpression): boolean {
  return (
    descriptor.properties.length === 2 &&
    call.typeArguments === undefined &&
    call.arguments.length <= 2 &&
    call.arguments.every((argument) => argument.type !== 'SpreadElement')
  );
}

/** Whether a mention of the factory is the callee of a provider this rule rewrites away. */
function rewrittenAway(identifier: EsNode): boolean {
  const call = identifier.parent;

  if (!isCallExpression(call) || call.callee !== identifier) {
    return false;
  }

  const descriptor = call.parent.parent;

  return isObjectExpression(descriptor) && longFormAutoSpy(descriptor) === call && isTransposition(descriptor, call);
}

/**
 * Rewrite the literal as the call, import `provideAutoSpy`, and drop the import the rewrite orphans.
 *
 * The arguments are carried over as **source text**, from the callee to the closing parenthesis, so a
 * configuration object spread over ten lines — which is what most of them are — arrives character for
 * character, and the fix is a rename of the call in all but name.
 *
 * The import is dropped when every surviving mention of the factory is a provider this rule rewrites,
 * not only when this is the last one: ESLint applies as many non-overlapping fixes per pass as it
 * can, so a file with three of them would otherwise fix the last two together and leave the import
 * behind with nothing reported to clean it up. Asking the wider question makes every fix in such a
 * file overlap at the import, which serialises them over the passes ESLint already runs.
 */
function longFormFixes(context: RuleContext, fixer: EsFixer, descriptor: EsObjectExpression, call: EsCallExpression): EsFix[] {
  const { sourceCode } = context;
  const scope = sourceCode.getScope(descriptor);
  const args = sourceCode.getText().slice(call.callee.range[1], call.range[1]);
  const edits = [fixer.replaceText(descriptor, `${PROVIDE_AUTO_SPY}${args}`)];

  if (bindingState(scope, PROVIDE_AUTO_SPY) === 'free') {
    edits.push(importNamed(fixer, descriptor, PROVIDE_AUTO_SPY, ANGULAR_ENTRY));
  }

  const factory = findBinding(scope, SPY_FROM_CLASS);
  const orphaned = factory?.references.every((reference) => rewrittenAway(reference.identifier))
    ? dropNamedImport(sourceCode, fixer, factory)
    : undefined;

  if (orphaned) {
    edits.push(orphaned);
  }

  return edits;
}

/** Whether the rewrite can be applied for the reader, rather than only described. */
function isLongFormFixable(context: RuleContext, descriptor: EsObjectExpression, call: EsCallExpression): boolean {
  return isTransposition(descriptor, call) && bindingState(context.sourceCode.getScope(descriptor), PROVIDE_AUTO_SPY) !== 'taken';
}

/** What a hand-rolled provider report quotes: the token, the slot the double sits in and what it holds. */
function doubleData(context: RuleContext, token: EsNode | undefined, reported: EsProperty): Record<string, string> {
  const { value } = reported;

  return {
    token: excerptOr(context, token, 'TOKEN', 40),
    slot: String(propertyName(reported)),
    what: isObjectExpression(value) ? `hand-lists ${plural(value.properties.length, 'member')}` : 'is a hand-rolled double',
    stub: excerpt(context, value, 40),
  };
}

/** `{ provide: X, useValue: { a: vi.fn() } }`, `{ provide: X, useClass: XMock }` and `TestBed.overrideProvider(X, …)` → `provideAutoSpy(X)`. */
export const preferProvideAutoSpy: RuleModule = defineRule({
  name: 'prefer-provide-auto-spy',
  description: 'Provide a spied service with provideAutoSpy() instead of a hand-rolled useValue object or stub class',
  fixable: true,
  messages: {
    preferProvideAutoSpyOverLongForm:
      '`{ provide: {{token}}, useValue: createSpyFromClass({{token}}) }` is `provideAutoSpy({{token}})` spelled out, with the token written twice where a rename can split them. Write `provideAutoSpy({{token}})`; a config argument moves over as its second argument.',
    preferProvideAutoSpy:
      'The `{{slot}}` for `{{token}}` {{what}}, and the class is free to grow a method this double does not have. Write `provideAutoSpy({{token}})`, which spies every method of the real class; values the double must hold go in `{ overrides }`.',
    preferProvideAutoSpyForToken:
      'The `{{slot}}` for the token `{{token}}` {{what}}, and nothing ties it to the type the token carries. Write `provideAutoSpyForToken({{token}})`, which builds the double from that type; nested values go in its second argument, and a method the code chains off in `{ selfReturning }`.',
    preferProvideAutoSpyOverStubClass:
      '`{{token}}` is provided with the stub class `{{stub}}`, whose `vi.fn()` fields cover only the methods someone remembered. Write `provideAutoSpy({{token}})`, which spies every method of the real class, and delete the stub; the returns it was tuned with go in the second argument.',
    preferProvideActivatedRoute:
      'This hand-written `ActivatedRoute` double leaves the route’s instance fields (`snapshot`, `params`, …) `undefined` unless each is seeded, and its streams and snapshot can disagree. Write `provideActivatedRoute({ params: { … } })` from `vitest-auto-spy/angular-router`, which builds Angular’s own route over one state.',
    preferProvideAutoSpyInOverride:
      '`TestBed.overrideProvider({{token}}, …)` hands DI a hand-rolled double: its `{{slot}}` {{what}}. Pass `{{factory}}({{token}})` as the override instead; values the double must hold go in its second argument.',
  },
  create: (context) => {
    /**
     * What a provider descriptor hands over, whichever of the four slots it uses.
     *
     * The stub-class arm is read first because the two are disjoint: `useClass` and `useExisting`
     * are not values the object reading looks at, and a `new StubMock()` in a `useValue` is not an
     * object literal, so neither spelling can reach `handRolledProvider` at all. Whichever answers
     * owns the message.
     */
    const handedOver = (descriptor: EsObjectExpression): { reported: EsProperty; stubClass: boolean } | undefined => {
      const stubClass = stubClassProvider(context, descriptor);
      const reported = stubClass ?? handRolledProvider(context, descriptor);

      return reported ? { reported, stubClass: stubClass !== undefined } : undefined;
    };

    return {
      ObjectExpression: (node: EsObjectExpression): void => {
        const provide = findProperty(node, 'provide');
        const handed = handedOver(node);

        // A `multi: true` registration has no `provideAutoSpy` form — the factory builds one double
        // for a token and takes no registration mode — so the replacement this rule asks for would
        // silently turn an accumulating provider into an overriding one. Nothing to recommend, so
        // nothing said.
        if (!provide || findProperty(node, 'multi')) {
          return;
        }

        if (namesActivatedRoute(propertyValue(provide))) {
          reportRouteToken(context, node, handed?.reported);

          return;
        }

        if (!handed) {
          reportLongForm(context, node);

          return;
        }

        const messageId = handed.stubClass
          ? 'preferProvideAutoSpyOverStubClass'
          : providesToken(context, provide.value)
            ? 'preferProvideAutoSpyForToken'
            : 'preferProvideAutoSpy';

        context.report({ node: handed.reported, messageId, data: doubleData(context, provide.value, handed.reported) });
      },
      // The same substitution from outside the array. One message for all four slots rather than
      // three more: what differs at this call site is not which factory to reach for but where the
      // replacement goes, and that paragraph is the same whichever slot the double arrived in.
      [OVERRIDE_PROVIDER_CALL]: (node: EsCallExpression): void => {
        const descriptor = overrideDescriptor(node);
        const handed = descriptor && handedOver(descriptor);

        if (handed) {
          const [token] = node.arguments;
          const messageId = namesActivatedRoute(token) ? 'preferProvideActivatedRoute' : 'preferProvideAutoSpyInOverride';

          const factory = node.arguments.slice(0, 1).some((first) => providesToken(context, first))
            ? 'provideAutoSpyForToken'
            : PROVIDE_AUTO_SPY;

          context.report({ node: handed.reported, messageId, data: { ...doubleData(context, token, handed.reported), factory } });
        }
      },
    };
  },
});
