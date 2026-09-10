/**
 * Deciding whether an object literal is a hand-rolled double — the shared reading behind
 * `prefer-provide-auto-spy` and `prefer-create-spy-from-class`.
 *
 * Both rules ask the same question in two places and answer it from the same evidence: how many
 * `vi.fn()`s the subtree carries, whether the object was written in place or parked in a `const`
 * above the TestBed, and whether it sits somewhere the answer must be "leave it alone" — inside one
 * of this library's own factories, or inside a `vi.mock()` factory. Keeping that reading in one
 * module is what stops the two rules from drifting into disagreeing about the same literal.
 */
import { boundValueOf, findBinding, initializerOf } from './bindings';
import {
  type EsNode,
  type EsObjectExpression,
  type EsProperty,
  type RuleContext,
  buildsRunnerFn,
  buildsRunnerFnAtModuleScope,
  findProperty,
  hasAncestor,
  isAssignmentExpression,
  isCallExpression,
  isIdentifier,
  isNewExpression,
  isObjectExpression,
  isRunnerCall,
  isRunnerFnCall,
  isVariableDeclarator,
  propertyName,
  propertyValue,
} from './rule-types';

/**
 * Whether an object literal stubs behaviour, as opposed to carrying plain configuration values.
 *
 * The whole subtree counts, not the top level: a platform double is routinely written as
 * `{ type: 'tizen', application: { init: vi.fn() } }`, and reading only the direct properties of
 * that says it is configuration. The walk stops at every function boundary, so a factory *returning*
 * spies — the shape these rules steer towards — is not mistaken for a hand-rolled double.
 */
export function looksLikeHandRolledMock(object: EsObjectExpression): boolean {
  return buildsRunnerFnAtModuleScope(object);
}

/**
 * The double a provider hands over, whether it is written in place or parked in a name above.
 *
 * The identifier step is not a refinement: in the suite this came from, eight hand-rolled doubles
 * were declared above the TestBed and passed by name, and the rule — reading only the literal form
 * — reported none of them.
 *
 * It follows a name through **either** spelling of a single binding — a `const` initialiser and a
 * `let` filled in by a `beforeEach` alike, which is what {@link boundValueOf} means by settled. The
 * second spelling is what one migration shard's whole set of opportunities was written in, and
 * before it was read the double behind it was reported by the count-based rule instead: the message
 * then recommends `createSpyFromClass` and never mentions `provideAutoSpy`, which is the only answer
 * for a double DI hands out.
 */
export function providedDouble(context: RuleContext, value: EsNode): EsObjectExpression | undefined {
  if (isObjectExpression(value)) {
    return value;
  }

  if (!isIdentifier(value)) {
    return undefined;
  }

  const bound = boundValueOf(context.sourceCode.getScope(value), value);

  return bound && isObjectExpression(bound) ? bound : undefined;
}

/**
 * Whether a node **is** a provider's `useValue`, rather than merely sitting somewhere below one.
 *
 * `useValue` and nothing else, because this is the carve-out of the rules that read an *object
 * literal*, and `useValue` is the only slot in which `prefer-provide-auto-spy` reads one — its
 * `useClass:` and `useExisting:` arms answer for a class by name. Widening the set would silence
 * those two rules on a shape the provider rule does not speak for either, which is how a report
 * goes missing rather than moves.
 */
function isProvidedValue(node: EsNode): boolean {
  const { parent } = node;

  return propertyName(parent) === 'useValue' && propertyValue(parent) === node;
}

/**
 * The name an object literal is bound to — written in place or assigned below.
 *
 * The assignment arm is what makes this worth having. In the suite this was measured on, not one of
 * the 120 annotated doubles carried an initialiser: every single one is `let x: { … };` at the top
 * of the `describe` and `x = { … }` in a `beforeEach`, so a reading that only looked at declarators
 * would have seen none of them.
 */
export function boundName(object: EsObjectExpression): EsNode | undefined {
  const { parent } = object;

  if (isVariableDeclarator(parent) && parent.init === object) {
    return parent.id;
  }

  return isAssignmentExpression(parent) && parent.right === object ? parent.left : undefined;
}

/**
 * Whether this object literal is what a provider substitutes a dependency with — in the slot, or
 * one name away from it.
 *
 * The carve-out every rule reading a bare object literal needs, and it has to be read in the
 * *forward* direction: `providedDouble` walks from the slot down to the literal, which answers
 * nothing for a rule standing on the literal and asking where it ends up. Both directions have to
 * follow a name for the same reason, so a literal parked in a `const` or filled into a `let` is
 * this as much as one written inline.
 *
 * Reading `parent` off a reference that sits **below** this node in the file is safe: ESLint
 * assigns every `parent` in one traversal and only then starts emitting the events rules listen to
 * — which is why this needs none of the `Program:exit` deferral `no-stub-class-double` uses to
 * collect a set.
 */
export function substitutesADependency(context: RuleContext, object: EsObjectExpression): boolean {
  if (isProvidedValue(object)) {
    return true;
  }

  const name = boundName(object);

  if (!name || !isIdentifier(name)) {
    return false;
  }

  const binding = findBinding(context.sourceCode.getScope(object), name.name);

  return binding?.references.some((reference) => isProvidedValue(reference.identifier)) === true;
}

export function countRunnerFns(object: EsObjectExpression): number {
  return object.properties.filter((property) => propertyName(property) !== undefined && isRunnerFnCall(propertyValue(property))).length;
}

/**
 * The spelling an Angular `InjectionToken` carries almost without exception.
 *
 * A last resort, and only that: a token is nearly always imported from the file that declares it, so
 * the declaration is out of the resolver's reach and the name is what is left to read.
 */
const TOKEN_NAME = /^[\dA-Z_]+$/;

/** Whether an initialiser is `new InjectionToken<…>(…)` — the one form that settles the question outright. */
export function buildsInjectionToken(node: EsNode | undefined): boolean {
  return node !== undefined && isNewExpression(node) && isIdentifier(node.callee) && node.callee.name === 'InjectionToken';
}

/**
 * Whether what is being provided is a token rather than a class.
 *
 * It decides which of two calls the message names, and the two are not interchangeable:
 * `provideAutoSpy` reads a class prototype, an `InjectionToken` has none, and the advice to use it
 * on one does not compile. Three migration batches reported the same wrong recommendation — 6 of 8
 * reports in one of them were on tokens.
 */
export function providesToken(context: RuleContext, provide: EsNode): boolean {
  if (!isIdentifier(provide)) {
    return false;
  }

  return buildsInjectionToken(initializerOf(context.sourceCode.getScope(provide), provide)) || TOKEN_NAME.test(provide.name);
}

/**
 * Whether a provider hands DI a hand-rolled double, in either of the two ways it can.
 *
 * `useFactory` is read *through* the function, which is the opposite of how `useValue` is read and
 * is the right way round for each: a factory's whole body is what DI ends up holding, while a
 * function sitting inside a `useValue` is a lazily-built double, i.e. the shape these rules
 * recommend. Missing the factory form let three layers of fiction hide behind one line —
 * `useFactory: vi.fn().mockImplementation(() => ({ isKeyEnabled: vi.fn() }))`, a structural double
 * with no relation to the class, and a double cast to make it fit.
 */
export function handRolledProvider(context: RuleContext, descriptor: EsObjectExpression): EsProperty | undefined {
  const useValue = findProperty(descriptor, 'useValue');

  if (useValue) {
    const double = providedDouble(context, useValue.value);

    return double && looksLikeHandRolledMock(double) ? useValue : undefined;
  }

  const useFactory = findProperty(descriptor, 'useFactory');

  return useFactory && buildsRunnerFn(factoryBody(context, useFactory.value), true) ? useFactory : undefined;
}

/** The factory itself, or the value a name was bound to — one step, the same as `providedDouble` takes. */
export function factoryBody(context: RuleContext, value: EsNode): EsNode {
  if (!isIdentifier(value)) {
    return value;
  }

  return boundValueOf(context.sourceCode.getScope(value), value) ?? value;
}
/**
 * The factories this library offers, whose arguments are seeds rather than hand-rolled doubles.
 *
 * A seed is an object of `vi.fn()`s that has no other form it could take: `createAutoMock<T>({ send:
 * vi.fn() })` is what the rule *asked* for, and flagging it again turns the recommended fix into a
 * violation that only an `eslint-disable` over correct code can clear.
 */
const SPY_FACTORIES = new Set([
  'autoMocked',
  'createAutoMock',
  'createMock',
  'createSpyClass',
  'createSpyFromClass',
  'mockConstructor',
  'mockDeep',
  'provideAutoSpy',
  'provideAutoSpyForToken',
]);

/** Whether a node is a call of one of those factories. */
export function isFactoryCall(node: EsNode): boolean {
  return isCallExpression(node) && isIdentifier(node.callee) && SPY_FACTORIES.has(node.callee.name);
}

/**
 * Whether the literal is somewhere inside a factory call.
 *
 * The walk goes all the way up rather than looking at the immediate parent, because a seed nests:
 * `mockDeep<T>({ api: { load: vi.fn(), save: vi.fn() } })` puts the object two levels below the call.
 */
export function insideFactorySeed(node: EsNode): boolean {
  return hasAncestor(node, isFactoryCall);
}

/** `vi.mock(…)` and friends: the second argument replaces a module's exports, not a service. */
const MODULE_MOCKS = new Set(['doMock', 'mock']);

/**
 * How many `vi.fn()`s make an object a hand-rolled double, per the rule's options.
 *
 * Two by default, and the argument for that is what the rule cannot see: an object holding one
 * `vi.fn()` is indistinguishable from an options bag with a callback in it (`{ onDone: vi.fn() }`,
 * `{ next: vi.fn() }`), and this rule fires on every object literal in the file. What made the
 * default defensible is that the case the reports were actually about — a one-method double handed
 * to DI — is `prefer-provide-auto-spy`'s, which has a `provide:` next to it to prove the object is
 * a service double and therefore fires at **one**. Since that rule learnt to follow a name to the
 * `const` above the TestBed, the overlap is covered from the side that can prove it. Projects that
 * want the stricter reading anyway can say so.
 *
 * `fallback` is what a rule reading a *different* shape asks for. `no-stub-class-double` takes one,
 * because nobody writes an options bag as a class: the shapes that hold a lone `vi.fn()` field and
 * are not doubles — a test host, a test subclass, an interface-conforming stub — are removed by that
 * rule's own exemptions rather than by a threshold.
 */
export function minRunnerFns(context: RuleContext, fallback = 2): number {
  const configured: unknown = Reflect.get(Object(context.options[0]), 'minRunnerFns');

  return typeof configured === 'number' ? configured : fallback;
}

/**
 * Whether the literal sits inside a `vi.mock()` factory.
 *
 * The object a module mock returns replaces the module's *exports*, and the `vi.fn()`s in it stand
 * in for classes that are then used as DI tokens — `createSpyFromClass` cannot go there in any
 * form, because a token has to be a constructor. Reported once, and the agent's own repair
 * (`class DialogRefStub {}`) had nothing to do with what the message said.
 */
export function insideModuleMock(node: EsNode): boolean {
  return hasAncestor(node, (candidate) => isRunnerCall(candidate, MODULE_MOCKS));
}
