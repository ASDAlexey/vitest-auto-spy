/**
 * `{ provide: X, useValue: { … } }` whose literal names a key the provided type does not have.
 *
 * Angular types `useValue` as `any`, so the compiler never compares the literal with anything: a key
 * that was renamed in production, or misspelled in the spec, stays in the fixture and nothing reads
 * it. This rule checks **keys only**. Whether each value fits is deliberately not asked — a partial
 * fixture is the normal shape of a `useValue`, and checking assignability is the broad form
 * `no-mistyped-use-value` keeps to primitive tokens for that reason.
 */
import { defineRule } from './define-rule';
import {
  type EsNode,
  type EsObjectExpression,
  type EsProperty,
  type TsNode,
  findProperty,
  isObjectExpression,
  propertyName,
} from './rule-types';
import {
  type CheckedType,
  type CheckerServices,
  PRIMITIVE_CHECKER_METHODS,
  type PrimitiveChecker,
  askChecker,
  checkerServices,
  isPrimitiveLike,
} from './use-value-types';

/** A type this rule can look keys up on, and — for a class — read the instance type from. */
interface KeyedType extends CheckedType {
  isUnion(): this is { readonly types: readonly KeyedType[] };
  getConstructSignatures(): readonly { getReturnType(): KeyedType }[];
}

interface KeyChecker extends PrimitiveChecker {
  getTypeAtLocation(node: TsNode): KeyedType;
  getTypeArguments(type: CheckedType): readonly KeyedType[];
  getPropertyOfType(type: CheckedType, name: string): object | undefined;
  getPropertiesOfType(type: CheckedType): readonly object[];
  getIndexInfosOfType(type: CheckedType): readonly object[];
}

const KEY_CHECKER_METHODS = [...PRIMITIVE_CHECKER_METHODS, 'getPropertyOfType', 'getPropertiesOfType', 'getIndexInfosOfType'];

/** One literal key the provided type does not have, and the type it was looked up on. */
interface UnknownKey {
  node: EsNode;
  key: string;
  expected: string;
}

/** What the token hands out: `T` of an `InjectionToken<T>`, or a class's instance type. */
function providedType(checker: KeyChecker, token: KeyedType): KeyedType | undefined {
  if (token.getSymbol()?.getName() === 'InjectionToken') {
    return checker.getTypeArguments(token)[0];
  }

  return token.getConstructSignatures()[0]?.getReturnType();
}

/**
 * The object members of `expected` a key can be found on, or nothing when the type says nothing
 * about keys: `any`, `unknown`, `object`, `{}`, a primitive, or anything with an index signature.
 */
function keyedParts(checker: KeyChecker, expected: KeyedType): readonly KeyedType[] | undefined {
  const parts = (expected.isUnion() ? expected.types : [expected]).filter((part) => !isPrimitiveLike(checker, part));
  const saysNothing =
    parts.length === 0 ||
    parts.some((part) => checker.getPropertiesOfType(part).length === 0 || checker.getIndexInfosOfType(part).length > 0);

  return saysNothing ? undefined : parts;
}

function unknownKeys({ checker, toTs }: CheckerServices<KeyChecker>, provide: EsNode, literal: EsObjectExpression): UnknownKey[] {
  const expected = providedType(checker, checker.getTypeAtLocation(toTs.get(provide)));
  const parts = expected && keyedParts(checker, expected);

  if (!expected || !parts) {
    return [];
  }

  return literal.properties.flatMap((property) => {
    const key = propertyName(property);

    // A spread contributes no key of its own to check, and a computed key is not the name it spells.
    if (key === undefined || parts.some((part) => checker.getPropertyOfType(part, key) !== undefined)) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `propertyName` only names nodes whose `type` is `'Property'`.
    return [{ node: (property as EsProperty).key, key, expected: checker.typeToString(expected) }];
  });
}

/** `multi: true` hands out an array the value is one element of, so the token's type is not the value's. */
function isMultiProvider(node: EsObjectExpression): boolean {
  const multi = findProperty(node, 'multi');

  return multi !== undefined && !(multi.value.type === 'Literal' && Reflect.get(multi.value, 'value') === false);
}

/** `{ provide: ActivatedRoute, useValue: { queryParams$: of({}) } }` → a key `ActivatedRoute` does not have. */
export const noUnknownUseValueKey = defineRule({
  anchor: '-a-service-behind-angular-di',
  description:
    'Name only members the provided type has in a useValue object literal — Angular types useValue as any, so nothing else checks the keys',
  messages: {
    noUnknownUseValueKey:
      '`{{key}}` does not exist on `{{expected}}`, which `{{token}}` provides — Angular types `useValue` as `any`, so the compiler ' +
      'never checked this literal. The code under test reads the members the type declares, so a renamed or misspelled key is a ' +
      'fixture nothing reads and the spec stays green without it. Rename it to the member it stands for, or drop it; a partial ' +
      'double the compiler does check is `provideAutoSpy(X, { overrides })`, `provideAutoSpyForToken(TOKEN, { … })` or ' +
      '`createMock<T>({ … })`.',
  },
  create: (context) => ({
    ObjectExpression: (node: EsObjectExpression): void => {
      const provide = findProperty(node, 'provide');
      const useValue = findProperty(node, 'useValue');

      if (!provide || !useValue || !isObjectExpression(useValue.value) || isMultiProvider(node)) {
        return;
      }

      const literal = useValue.value;
      const services = checkerServices<KeyChecker>(context, KEY_CHECKER_METHODS);
      const found = (services && askChecker(() => unknownKeys(services, provide.value, literal))) ?? [];

      found.forEach(({ node: key, ...data }) => {
        context.report({
          node: key,
          messageId: 'noUnknownUseValueKey',
          data: { ...data, token: context.sourceCode.getText(provide.value) },
        });
      });
    },
  }),
});
