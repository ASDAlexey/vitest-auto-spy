/**
 * What the two type-aware `useValue` rules ask the checker, in one place: whether a program is there
 * at all, whether its checker has the methods a rule needs, and whether a type is primitive-like.
 *
 * Every method named here is public TypeScript API, but some are recent, and `@typescript-eslint`
 * hands over whichever checker the project's TypeScript builds — so a rule asks for the methods it
 * calls and says nothing when one is missing, rather than throwing inside a consumer's lint run.
 */
import type { EsToTsMap, RuleContext, TsNode } from './rule-types';

/** The slice of a TypeScript type the `useValue` rules read. */
export interface CheckedType {
  getSymbol(): { getName(): string } | undefined;
  isUnion(): this is { readonly types: readonly CheckedType[] };
}

/** The checker methods {@link isPrimitiveLike} needs. */
export interface PrimitiveChecker {
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

export const PRIMITIVE_CHECKER_METHODS = [
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

/** A checker a rule can use, and the ESTree → TypeScript map it reads nodes through. */
export interface CheckerServices<Checker> {
  checker: Checker;
  toTs: EsToTsMap;
}

/** The program's checker when it has every one of `methods`, or nothing — no program, or an older TypeScript. */
export function checkerServices<Checker extends object>(
  context: RuleContext,
  methods: readonly string[],
): CheckerServices<Checker> | undefined {
  const { program, esTreeNodeToTSNodeMap: toTs } = context.sourceCode.parserServices;

  if (!program || !toTs) {
    return undefined;
  }

  const checker: object = program.getTypeChecker();

  return hasMethods<Checker>(checker, methods) ? { checker, toTs } : undefined;
}

function hasMethods<Checker extends object>(checker: object, methods: readonly string[]): checker is Checker {
  return methods.every((name) => typeof Reflect.get(checker, name) === 'function');
}

/** Every constituent is a string, number, boolean, bigint, enum, a literal of one of those, `null` or `undefined`. */
export function isPrimitiveLike(checker: PrimitiveChecker, type: CheckedType): boolean {
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

/**
 * Run a checker question, and treat a throw as "no answer": a checker over the isolated program of a
 * single-run second parse can throw (see `private-access.ts`), and that program knows nothing.
 */
export function askChecker<Answer>(question: () => Answer | undefined): Answer | undefined {
  try {
    return question();
  } catch {
    return undefined;
  }
}
