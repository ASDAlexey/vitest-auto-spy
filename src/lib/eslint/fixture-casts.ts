/**
 * Two casts that keep a fixture compiling while taking it out of the compiler's reach — one over an
 * object literal, one over a member of a double.
 *
 * They are the same defect written in two places. A cast is not an assignment: it asks whether the
 * two types *overlap*, not whether the value is one of them, so an object literal under `as T`
 * passes an excess property that an assignment refuses and a missing required field that an
 * assignment refuses too. The fixture then claims to be a whole `T` while carrying a key `T` does
 * not have, both type gates stay silent, and the object goes on to be spread into the expected
 * payload of a call assertion — at which point the spec pins a key the contract never had. `as Mock`
 * is the same move on the other side of the double: `Mock` with no parameters is `Mock<any>`, so
 * `mockReturnValue` takes anything and `toHaveBeenCalledWith` stops comparing arguments.
 *
 * **Syntax only, deliberately.** Both facts are written on the line: the type a cast names, and the
 * shape of what it is casting. The same footing `no-sync-testbed-await` and `prefer-stub-response`
 * stand on, and the reason neither rule waits for `parserOptions.project`.
 *
 * **What the neighbours do not cover.** `no-mocked-for-spy` reads a `Mocked<T>` *declaration* and
 * `prefer-as-spy` a cast to `Spy<T>` — both about naming the double's own surface, neither about a
 * `Mock` standing in for one member's signature. `no-structural-double` reads a name *declared* as
 * an object of `Mock`s and `no-stub-class-double` a class of `vi.fn()` fields; both want two or
 * more members and a double being built, where these two report one cast over data that already
 * exists. Nothing in that group looks at a plain object literal at all, because none of them has a
 * type written next to it — which is exactly what a cast supplies.
 */
import { PACKAGE, bindingState, findBinding, importNamed } from './bindings';
import { defineRule } from './define-rule';
import { insideFactorySeed } from './hand-rolled-doubles';
import { injectedFromVariable, isTestBedInject } from './injected-spy';
import {
  type EsFix,
  type EsFixer,
  type EsMemberExpression,
  type EsNode,
  type EsTypeReference,
  type EsVariableDefinition,
  type RuleContext,
  type RuleModule,
  type SuggestionDescriptor,
  countInSubtree,
  isFunctionNode,
  isIdentifier,
  isMemberExpression,
  isNamedImportSpecifier,
  isObjectExpression,
} from './rule-types';

/** A cast whose type is a named reference — the only shape either rule reads. */
interface EsReferenceCast extends EsNode {
  expression: EsNode;
  typeAnnotation: EsTypeReference;
}

/** Both spellings of a cast to a named type; `as unknown`, `as any` and `as { … }` are other node types. */
const REFERENCE_CAST_SELECTORS = [
  'TSAsExpression[typeAnnotation.type="TSTypeReference"]',
  'TSTypeAssertion[typeAnnotation.type="TSTypeReference"]',
];

/** The last segment of a dotted type name, which is the one an exemption list is written in. */
function typeHead(context: RuleContext, cast: EsReferenceCast): string {
  return context.sourceCode.getText(cast.typeAnnotation.typeName).replace(/^.*\./, '');
}

/** The helper `prefer-create-mock` names, and the name its suggestion writes. */
const CREATE_MOCK = 'createMock';

/**
 * Type names `createMock<T>` is the wrong answer for, each already owned by another rule or by the
 * language.
 *
 * `const` is `as const`, which is a literal *narrowing* and the opposite of a fixture claiming a
 * type. `Response` belongs to `prefer-stub-response`, whose whole point is that a partial fixture is
 * the wrong tool for that one type. `Spy` belongs to `prefer-as-spy`. The Vitest mock types name a
 * function, and a partial of a function is not a thing — `no-mocked-for-spy` and `no-mock-cast` read
 * those. A line drawing two reports is a line a reader has to arbitrate.
 */
const NOT_A_FIXTURE: ReadonlySet<string> = new Set([
  'Mock',
  'MockInstance',
  'Mocked',
  'MockedClass',
  'MockedFunction',
  'MockedObject',
  'Response',
  'Spy',
  'const',
]);

function isReferenceCast(node: EsNode): node is EsReferenceCast {
  const annotation: unknown = Reflect.get(node, 'typeAnnotation');

  return (
    (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') &&
    typeof annotation === 'object' &&
    annotation !== null &&
    Reflect.get(annotation, 'type') === 'TSTypeReference'
  );
}

/** A literal cast this rule reports — the operand an object literal, the type one `createMock` can take. */
function isFixtureCast(context: RuleContext, node: EsNode): node is EsReferenceCast {
  return isReferenceCast(node) && isObjectExpression(node.expression) && !NOT_A_FIXTURE.has(typeHead(context, node));
}

/** Whether a fixture cast encloses this one without a function between: the outer report carries it. */
function insideFixtureCast(context: RuleContext, node: EsNode): boolean {
  for (let current = node.parent; current.type !== 'Program' && !isFunctionNode(current); current = current.parent) {
    if (isFixtureCast(context, current)) {
      return true;
    }
  }

  return false;
}

/** The source of `node` with every fixture cast inside it unwrapped — `createMock` checks those literals at every depth. */
function withoutNestedCasts(context: RuleContext, node: EsNode): string {
  const nested: EsReferenceCast[] = [];

  countInSubtree(
    context,
    node,
    (candidate) => {
      const found = candidate !== node && isFixtureCast(context, candidate);

      if (found) {
        nested.push(candidate);
      }

      return found;
    },
    false,
  );

  return nested
    .sort((a, b) => b.range[0] - a.range[0])
    .reduce(
      (text, cast) =>
        `${text.slice(0, cast.range[0] - node.range[0])}${withoutNestedCasts(context, cast.expression)}${text.slice(cast.range[1] - node.range[0])}`,
      context.sourceCode.getText(node),
    );
}

/** `{ … } as T` → `createMock<T>({ … })`, importing the helper when the name is free. */
function buildFixture(context: RuleContext, node: EsReferenceCast): SuggestionDescriptor | undefined {
  const state = bindingState(context.sourceCode.getScope(node), CREATE_MOCK);

  // A file that declares `createMock` as something of its own gets the report and no edit.
  if (state === 'taken') {
    return undefined;
  }

  const type = context.sourceCode.getText(node.typeAnnotation);

  return {
    desc: `Build it with ${CREATE_MOCK}<${type}>(), which checks the fixture against ${type}`,
    fix: (fixer: EsFixer): EsFix[] => {
      const fixes = [fixer.replaceText(node, `${CREATE_MOCK}<${type}>(${withoutNestedCasts(context, node.expression)})`)];

      if (state === 'free') {
        fixes.push(importNamed(fixer, node, CREATE_MOCK, PACKAGE));
      }

      return fixes;
    },
  };
}

const FIXTURE_REPAIR =
  'Where the literal already sits in a slot that has a type — an argument, a `nextWith`, a typed `const` — the first repair is ' +
  'to **delete the cast** and let the slot check it. What survives that is the partial, and the partial is ' +
  `\`${CREATE_MOCK}<T>({ … })\` from \`${PACKAGE}\`: it takes a \`DeepPartial<T>\` and answers a value typed \`T\`, so the literal ` +
  'is checked at every depth while a field the fixture does not care about stays optional — a fixture is a partial by design, ' +
  'and that is the half a cast gets right. What it stops getting away with is the other half: a key `T` does not declare is a ' +
  'compile error on the literal, which is the drift this reports. Adopting it on a suite that has drifted therefore turns those ' +
  'literals red, one fixture at a time; that redness is the finding, not a side effect of the repair. A value outside `T` on ' +
  `purpose — the \`null\` a backend sends, a payload that has to reach a guard — is \`outOfType<T>(…)\` from \`${PACKAGE}\`, which ` +
  'names the intent at the call site and is not reported.';

/** `{ … } as Device` → `createMock<Device>({ … })`. */
export const preferCreateMock: RuleModule = defineRule({
  anchor: '-a-plain-data-fixture',
  description: 'Build a partial fixture with createMock<T>(), not an object literal cast to T',
  hasSuggestions: true,
  messages: {
    castFixture:
      'This object literal claims to be a whole `{{type}}` and nothing checked it. A cast asks whether the two types overlap, ' +
      'not whether the value is one of them, so it passes both directions an assignment refuses: a key `{{type}}` does not ' +
      'declare (the excess-property check is skipped for a cast) and a required field the fixture never sets. Both gates stay ' +
      'silent, and the fixture is then spread into an expected payload or handed to the code under test — so the spec pins a ' +
      `key the contract does not have, or covers a branch the real value could never reach. ${FIXTURE_REPAIR}`,
  },
  create: (context) => ({
    [REFERENCE_CAST_SELECTORS.join(', ')]: (node: EsReferenceCast): void => {
      const type = typeHead(context, node);

      // The literal has to be the cast's own operand. `{ … } as unknown as T` is a different
      // finding with a ban of its own in most consumers, and `createMock<T>` cannot replace it:
      // the hop through `unknown` is there precisely because the compiler refused the single cast.
      if (!isFixtureCast(context, node) || insideFactorySeed(node) || insideFixtureCast(context, node)) {
        return;
      }

      const suggestion = buildFixture(context, node);
      const report = { node, messageId: 'castFixture', data: { type } };

      context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
    },
  }),
});

/** The helper `no-mock-cast` names, and the entry point it is imported from. */
const INJECT_SPY = 'injectSpy';
const ANGULAR_ENTRY = `${PACKAGE}/angular`;

/** The two Vitest types a spec reaches for when it wants to call a spy method on a member. */
const MOCK_TYPES: ReadonlySet<string> = new Set(['Mock', 'MockInstance']);

/**
 * The runners whose `Mock` this is.
 *
 * `Mock` is a popular name — a domain entity, a fixture builder, a test-double type a project
 * declares itself — and for none of those is a spy the repair. Unlike `prefer-stub-response`, which
 * reports the *global* and nothing else, this one reports the *import*: the type has to be written
 * down to be used at all, so a binding that came from one of these modules is the evidence. A name
 * nothing declares counts as well, which is what a project with ambient runner types has in scope.
 */
const RUNNER_MODULES = ['@jest/globals', '@rstest/core', 'bun:test', 'jest', 'vitest'];

/** The members that install an answer, where a cast leaves the value that is installed unchecked. */
const CONFIGURATION_MEMBERS: ReadonlySet<string> = new Set([
  'mockImplementation',
  'mockImplementationOnce',
  'mockRejectedValue',
  'mockRejectedValueOnce',
  'mockResolvedValue',
  'mockResolvedValueOnce',
  'mockReturnThis',
  'mockReturnValue',
  'mockReturnValueOnce',
]);

/** Whether one definition of a name is a named import taken from one of those modules. */
function importsFromRunner(definition: EsVariableDefinition): boolean {
  if (!isNamedImportSpecifier(definition.node)) {
    return false;
  }

  const source = definition.node.parent.source.value;

  return RUNNER_MODULES.some((module) => source === module);
}

/** Whether the `Mock` in scope is a runner's, rather than a name the file or the project owns. */
function namesTheRunnersMock(context: RuleContext, node: EsNode, name: string): boolean {
  const binding = findBinding(context.sourceCode.getScope(node), name);

  return binding === undefined || binding.defs.some(importsFromRunner);
}

/** The dotted path a member expression spells, or nothing when any step of it is computed. */
function dottedPath(member: EsMemberExpression): { base: EsNode; path: string[] } | undefined {
  const path: string[] = [];
  let current: EsNode = member;

  while (isMemberExpression(current)) {
    if (current.computed || !isIdentifier(current.property)) {
      return undefined;
    }

    path.unshift(current.property.name);
    current = current.object;
  }

  return { base: current, path };
}

/**
 * `TestBed.inject(X).m as Mock` → `injectSpy(X).m`, written in place.
 *
 * Offered rather than applied, and the reason is not the type system: `injectSpy` answers the double
 * the container was *given*, so the rewrite is only right when that double is one this library
 * built. A spec that provided a hand-rolled `{ provide: X, useValue: { m: vi.fn() } }` gets a
 * run-time throw instead of a compile error — the one failure mode an unattended fix may not have.
 * `no-unregistered-inject-spy` is what reports an accepted suggestion that landed on such a double.
 */
function readFromDi(context: RuleContext, node: EsReferenceCast, member: EsMemberExpression): SuggestionDescriptor | undefined {
  const dotted = dottedPath(member);
  const state = bindingState(context.sourceCode.getScope(node), INJECT_SPY);

  if (!dotted || state === 'taken') {
    return undefined;
  }

  const injectCall = isTestBedInject(dotted.base) ? dotted.base : injectedFromVariable(context, dotted.base);
  const [token, ...extra] = injectCall?.arguments ?? [];

  // `TestBed.inject(X, null, InjectFlags.Optional)` is left alone: `injectSpy` takes the token
  // alone, and dropping the rest would change which instance — if any — comes back.
  if (!token || extra.length > 0) {
    return undefined;
  }

  const replacement = `${INJECT_SPY}(${context.sourceCode.getText(token)}).${dotted.path.join('.')}`;

  return {
    desc: `Read the spy from DI instead: ${replacement}`,
    fix: (fixer: EsFixer): EsFix[] => {
      const fixes = [fixer.replaceText(node, replacement)];

      if (state === 'free') {
        fixes.push(importNamed(fixer, node, INJECT_SPY, ANGULAR_ENTRY));
      }

      return fixes;
    },
  };
}

const MOCK_REPAIR =
  'A member of a double built here is already a spy, and it is typed from the real signature: read it as it is — ' +
  `\`${INJECT_SPY}(Service).method\` for one DI handed out, \`asSpy(double).method\` for one the test holds — and the cast has ` +
  'nothing left to do. `mockReturnValue` then takes what the method returns, and `toHaveBeenCalledWith` compares what it ' +
  'accepts. A `vi.spyOn` spy or a `vi.fn()` on an object that is not such a double takes `vi.mocked(object.method)`, which ' +
  'reads the type from the member itself. A parameterised `Mock<[…], R>` is no repair either: it is the signature written a ' +
  'second time, in a place nothing keeps in step with the first.';

/** `TestBed.inject(S).m as Mock` → `injectSpy(S).m`. */
export const noMockCast: RuleModule = defineRule({
  anchor: '-reading-a-spy-back-from-di',
  description: 'Read a spy member off the double, not through a cast to Vitest’s Mock',
  hasSuggestions: true,
  messages: {
    mockCast:
      '`{{type}}` with no parameters is `{{type}}<any>`, so this cast does not add the spy surface — it removes the signature. ' +
      '`mockReturnValue` accepts anything from here on, and `toHaveBeenCalledWith` stops comparing arguments altogether: the ' +
      'assertion below still passes when the code under test calls the method with the wrong ones, which is a test green on a ' +
      `fact it no longer checks. ${MOCK_REPAIR}`,
    configurationCast:
      'The cast is on `{{member}}` itself, so nothing checks the value being installed — not the argument, and not the ' +
      'method’s own return type, which is two steps away behind a `{{type}}<any>`. A double seeded this way answers a value ' +
      'the real collaborator could not produce, and every assertion downstream is about that value rather than about the ' +
      'contract. Where the cast went in because the value would not compile, look at the method: an overloaded one is typed ' +
      "against its **last** signature (`observe: 'events'` on a generated client), and " +
      "`Spy<Service, { overload: { method: 'first' } }>` picks the one the code calls. " +
      `${MOCK_REPAIR}`,
  },
  create: (context) => ({
    [REFERENCE_CAST_SELECTORS.join(', ')]: (node: EsReferenceCast): void => {
      const type = typeHead(context, node);

      if (!MOCK_TYPES.has(type) || !isMemberExpression(node.expression) || !namesTheRunnersMock(context, node, type)) {
        return;
      }

      const member = node.expression.property;
      const configured = isIdentifier(member) && CONFIGURATION_MEMBERS.has(member.name);
      const suggestion = readFromDi(context, node, node.expression);
      const report = {
        node,
        messageId: configured ? 'configurationCast' : 'mockCast',
        data: { member: context.sourceCode.getText(member), type },
      };

      context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
    },
  }),
});
