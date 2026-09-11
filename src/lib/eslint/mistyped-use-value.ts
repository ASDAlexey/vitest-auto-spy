/**
 * `{ provide: TOKEN, useValue }` whose value does not fit the primitive type `TOKEN` declares. Angular
 * types `useValue` as `any`, so no compiler compares the two; this rule asks the checker instead.
 */
import { defineRule } from './define-rule';
import { type EsNode, type EsObjectExpression, type EsToTsMap, type RuleContext, type TsNode, findProperty } from './rule-types';

/** The slice of a TypeScript type this rule reads. */
interface CheckedType {
  getSymbol(): { getName(): string } | undefined;
  isUnion(): this is { readonly types: readonly CheckedType[] };
}

/** The checker methods the comparison needs — all public API, but only on a recent TypeScript. */
interface ComparingChecker {
  getTypeAtLocation(node: TsNode): CheckedType;
  getTypeArguments(type: CheckedType): readonly CheckedType[];
  isTypeAssignableTo(source: CheckedType, target: CheckedType): boolean;
  typeToString(type: CheckedType): string;
  getStringType(): CheckedType;
  getNumberType(): CheckedType;
  getBooleanType(): CheckedType;
  getBigIntType(): CheckedType;
  getNullType(): CheckedType;
  getUndefinedType(): CheckedType;
}

interface ComparingServices {
  checker: ComparingChecker;
  toTs: EsToTsMap;
}

/** The two type names a report quotes. */
interface Mismatch {
  expected: string;
  actual: string;
}

const CHECKER_METHODS = [
  'getTypeAtLocation',
  'getTypeArguments',
  'isTypeAssignableTo',
  'typeToString',
  'getStringType',
  'getNumberType',
  'getBooleanType',
  'getBigIntType',
  'getNullType',
  'getUndefinedType',
];

function canCompare(checker: object): checker is ComparingChecker {
  return CHECKER_METHODS.every((name) => typeof Reflect.get(checker, name) === 'function');
}

function comparingServices(context: RuleContext): ComparingServices | undefined {
  const { program, esTreeNodeToTSNodeMap: toTs } = context.sourceCode.parserServices;

  if (!program || !toTs) {
    return undefined;
  }

  const checker: object = program.getTypeChecker();

  return canCompare(checker) ? { checker, toTs } : undefined;
}

/** Every constituent is a string, number, boolean, bigint, enum, a literal of one of those, `null` or `undefined`. */
function isPrimitiveLike(checker: ComparingChecker, type: CheckedType): boolean {
  const primitives = [
    checker.getStringType(),
    checker.getNumberType(),
    checker.getBooleanType(),
    checker.getBigIntType(),
    checker.getNullType(),
    checker.getUndefinedType(),
  ];
  const parts = type.isUnion() ? type.types : [type];

  return parts.every((part) => primitives.some((primitive) => checker.isTypeAssignableTo(part, primitive)));
}

function compare({ checker, toTs }: ComparingServices, provide: EsNode, value: EsNode): Mismatch | undefined {
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

function mismatchOf(services: ComparingServices, provide: EsNode, value: EsNode): Mismatch | undefined {
  // A checker over the isolated program of a single-run second parse can throw (see private-access.ts);
  // that program knows nothing, and silence is the answer there too.
  try {
    return compare(services, provide, value);
  } catch {
    return undefined;
  }
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

      const services = comparingServices(context);
      const mismatch = services && mismatchOf(services, provide.value, useValue.value);

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
