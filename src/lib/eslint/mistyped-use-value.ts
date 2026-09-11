/**
 * `{ provide: TOKEN, useValue }` whose value does not fit the primitive type `TOKEN` declares. Angular
 * types `useValue` as `any`, so no compiler compares the two; this rule asks the checker instead.
 */
import { defineRule } from './define-rule';
import { type EsNode, type EsObjectExpression, findProperty } from './rule-types';
import {
  type CheckerServices,
  PRIMITIVE_CHECKER_METHODS,
  type PrimitiveChecker,
  askChecker,
  checkerServices,
  isPrimitiveLike,
} from './use-value-types';

/** The two type names a report quotes. */
interface Mismatch {
  expected: string;
  actual: string;
}

function compare({ checker, toTs }: CheckerServices<PrimitiveChecker>, provide: EsNode, value: EsNode): Mismatch | undefined {
  const token = checker.getTypeAtLocation(toTs.get(provide));

  if (token.getSymbol()?.getName() !== 'InjectionToken') {
    return undefined;
  }

  const [expected] = checker.getTypeArguments(token);
  const actual = checker.getTypeAtLocation(toTs.get(value));

  if (!expected || !isPrimitiveLike(checker, expected) || checker.isTypeAssignableTo(actual, expected)) {
    return undefined;
  }

  return { expected: checker.typeToString(expected), actual: checker.typeToString(actual) };
}

/** `{ provide: IS_PLATFORM_BROWSER, useValue: {} }` for an `InjectionToken<boolean>` → a value nothing compared. */
export const noMistypedUseValue = defineRule({
  anchor: '-a-service-behind-angular-di',
  description:
    'Give a primitive-typed InjectionToken a useValue of its declared type — Angular types useValue as any, so nothing else checks it',
  messages: {
    noMistypedUseValue:
      '`{{token}}` expects `{{expected}}`, but `useValue` is `{{actual}}` — Angular types `useValue` as `any`, so the compiler never ' +
      'compared them. Whatever injects the token gets this value unchanged: an object or an array where a `boolean` is read is ' +
      'truthy, so the spec runs down the branch it meant to switch off. Provide a value of the declared type; if the code really ' +
      "needs something else, it is the token's declaration that is wrong.",
  },
  create: (context) => ({
    ObjectExpression: (node: EsObjectExpression): void => {
      const provide = findProperty(node, 'provide');
      const useValue = findProperty(node, 'useValue');

      if (!provide || !useValue) {
        return;
      }

      const services = checkerServices<PrimitiveChecker>(context, PRIMITIVE_CHECKER_METHODS);
      const mismatch = services && askChecker(() => compare(services, provide.value, useValue.value));

      if (mismatch) {
        context.report({
          node: useValue.value,
          messageId: 'noMistypedUseValue',
          data: { token: context.sourceCode.getText(provide.value), ...mismatch },
        });
      }
    },
  }),
});
