/**
 * Reading the *declared type* of the name an object literal is bound to, so that a one-method
 * double can be told apart from an options bag with a callback in it.
 *
 * `prefer-create-spy-from-class` needs two `vi.fn()`s before it reports, and the reason is honest:
 * `{ onDone: vi.fn() }` and `{ load: vi.fn() }` are the same tree, and the rule fires on every
 * object literal in the file. The threshold is the cost of that ambiguity, and everywhere the
 * ambiguity can be *resolved* the rule already drops it — `prefer-provide-auto-spy` reports at one
 * because a `provide:` sits next to the object and proves it is a service double.
 *
 * A declaration is the second piece of proof of exactly that kind, and it is the shape a migrated
 * suite writes by default:
 *
 * ```ts
 * let devModeService: { devMode: Mock };
 *
 * beforeEach(() => {
 *   devModeService = { devMode: vi.fn().mockReturnValue(true) };
 * });
 * ```
 *
 * Nobody annotates an options bag that way. Writing `Mock` as a *member* of an object type is a
 * statement that the object stands in for something with that member — and measured on one
 * consumer's 1759 spec files, all 120 of the `Mock` references in that position were assigned an
 * object literal of `vi.fn()`s, against 109 bare `let fn: Mock` annotations that are a plain
 * callback and correct. The type side is what separates the two, and it separates them without the
 * type checker: the annotation is in the file.
 *
 * **The report lands on the literal, not on the annotation**, because the literal is where the
 * repair happens — and it lands *only below* `prefer-create-spy-from-class`'s threshold, so that one
 * double never draws two reports. At two `vi.fn()`s and up that rule already speaks, at `error`,
 * and this one keeps quiet; below it, this one speaks and that one cannot. Both read the same
 * `minRunnerFns`, so a project that moves the threshold has to move it on both.
 *
 * **Why it is not a branch of `no-mocked-for-spy`, which is where `Mock` looks like it belongs.**
 * That rule is one of the two in `configs.typeErrors`, and what puts it there is that its finding
 * does not compile: `let s: Mocked<T>` fails with `TS2322` the moment a spy is assigned to it. `let
 * s: { load: Mock }` compiles perfectly, so folding this in would quietly make that config's one
 * promise false. And `Mocked<T>` is not a spelling of `Mock` either: `Mocked<T>` takes any `T` and
 * maps its members, while `Mock<T>` constrains `T` to `Procedure | Constructable`, so `Mock` can
 * never name a class in the first place — it names one *method* of a double, which is why the shape
 * worth reporting is the object type around it rather than the reference itself.
 */
import { findBinding } from './bindings';
import { defineRule } from './define-rule';
import {
  boundName,
  countRunnerFns,
  insideFactorySeed,
  insideModuleMock,
  minRunnerFns,
  substitutesADependency,
} from './hand-rolled-doubles';
import {
  type EsNode,
  type EsObjectExpression,
  type EsPropertySignature,
  type EsScope,
  type EsTypeLiteral,
  type RuleModule,
  isIdentifier,
  isTypeReference,
  isVariableDeclarator,
} from './rule-types';

/**
 * The mock types Vitest exports, all of them, without asking which one *means* a whole-object double.
 *
 * `no-mocked-for-spy` has to make that distinction and makes it on the type parameter — `Mocked<T>`
 * takes any `T` and maps it, while `Mock<T>` constrains `T` to `Procedure | Constructable` and so
 * cannot name a class at all. Here the question is different and the distinction does not apply:
 * whichever of them appears, it appears as the type of one *member*, and a member of a hand-written
 * object type is a method somebody remembered either way.
 */
const MOCK_TYPES: ReadonlySet<string> = new Set([
  'Mock',
  'MockInstance',
  'Mocked',
  'MockedClass',
  'MockedFunction',
  'MockedFunctionDeep',
  'MockedObject',
  'MockedObjectDeep',
  'PartialMock',
]);

/** Narrow to an inline object type. */
function isTypeLiteral(node: EsNode): node is EsTypeLiteral {
  return node.type === 'TSTypeLiteral';
}

/** Whether one member of an object type is typed as one of Vitest's mock types. */
function isMockMember(member: EsNode): boolean {
  if (member.type !== 'TSPropertySignature') {
    return false;
  }

  const signature: EsPropertySignature = member;
  const declared = signature.typeAnnotation?.typeAnnotation;

  if (declared === undefined || !isTypeReference(declared)) {
    return false;
  }

  return isIdentifier(declared.typeName) && MOCK_TYPES.has(declared.typeName.name);
}

/**
 * Whether a type annotation is an object type with at least one Vitest mock member.
 *
 * An intersection, a union and a generic wrapper are all read as "no", and that is not an oversight
 * to be widened later: `Mocked<{ a: Mock }>` is already `no-mocked-for-spy`'s report, and an
 * intersection carrying real fields alongside the mocks is the one shape where the object genuinely
 * is part configuration.
 */
function declaresMockMember(annotation: EsNode): boolean {
  return isTypeLiteral(annotation) && annotation.members.some(isMockMember);
}

/** The `: T` of a declared name, following an assignment target back to the `let` that declared it. */
function annotationOf(scope: EsScope, name: EsNode): EsNode | undefined {
  if (!isIdentifier(name)) {
    return undefined;
  }

  if (name.typeAnnotation) {
    return name.typeAnnotation.typeAnnotation;
  }

  const binding = findBinding(scope, name.name);
  const declarator = binding?.defs.map((definition) => definition.node).find(isVariableDeclarator);

  return declarator && isIdentifier(declarator.id) ? declarator.id.typeAnnotation?.typeAnnotation : undefined;
}

/**
 * Whether the name this object literal is bound to is declared as an object of Vitest mock types —
 * i.e. whether the file itself says the literal is a structural stand-in rather than an options bag.
 */
function declaredAsStructuralDouble(scope: EsScope, object: EsObjectExpression): boolean {
  const name = boundName(object);
  const annotation = name && annotationOf(scope, name);

  return annotation !== undefined && declaresMockMember(annotation);
}

/** `let card: { load: Mock }; card = { load: vi.fn() };` → `createAutoMock<CardService>()`. */
export const noStructuralDouble: RuleModule = defineRule({
  anchor: '-a-service-without-di',
  description: 'Build a double from the type it stands in for, not from an object type of Vitest Mocks',
  schema: [{ type: 'object', properties: { minRunnerFns: { type: 'integer', minimum: 1 } }, additionalProperties: false }],
  messages: {
    noStructuralDouble:
      'The name this object is bound to is declared as an object of Vitest `Mock`s, which says it stands in for a type — and then hand-writes the stand-in one method at a time. `createAutoMock<T>()` reads the type instead, so the double cannot fall behind it, and `createSpyFromClass(X)` does the same from a class; behind Angular DI it is `provideAutoSpy(X)` and the declaration goes away with the object. The declaration is what makes this reportable at a single `vi.fn()` where `prefer-create-spy-from-class` needs two: nobody annotates an options bag `{ onDone: Mock }`. A **bare** `let fn: Mock` is not this and is never reported — that is a plain `vi.fn()` callback, and `Mock` is its correct type. `createAutoMock<T>()` is also the answer where `provideAutoSpy` cannot go, an abstract class or an interface having no constructor to read.',
  },
  create: (context) => ({
    ObjectExpression: (node: EsObjectExpression): void => {
      const runnerFns = countRunnerFns(node);

      // The same three carve-outs the count-based rule makes, for the same reasons — a double DI
      // hands out is `prefer-provide-auto-spy`'s, a factory seed is the fix, and a module mock's
      // exports are not a service double — plus the threshold this rule sits *below*.
      //
      // The DI carve-out is `substitutesADependency` rather than a look at the parent property,
      // because this rule and that one now follow a name to the same places: the shape below is one
      // report from the provider rule, and a parent-only reading would have made it two.
      //
      //   let nav: { go: Mock };
      //   beforeEach(() => { nav = { go: vi.fn() }; TestBed.configureTestingModule({ providers: [{ provide: NAV, useValue: nav }] }); });
      if (
        runnerFns < 1 ||
        runnerFns >= minRunnerFns(context) ||
        substitutesADependency(context, node) ||
        insideFactorySeed(node) ||
        insideModuleMock(node)
      ) {
        return;
      }

      if (declaredAsStructuralDouble(context.sourceCode.getScope(node), node)) {
        context.report({ node, messageId: 'noStructuralDouble' });
      }
    },
  }),
});
