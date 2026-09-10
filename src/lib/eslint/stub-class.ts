/**
 * Deciding whether a **class** is a hand-rolled double — the reading behind `no-stub-class-double`
 * and behind the `useClass:` arm of `prefer-provide-auto-spy`.
 *
 * The object-literal double these rules were written for has a second spelling that the plugin was
 * blind to for four minor versions:
 *
 * ```ts
 * class NewCardServiceMock {
 *   getTrailerPlayUrl = vi.fn().mockReturnValue(of(url));
 *   load = vi.fn();
 * }
 *
 * TestBed.configureTestingModule({ providers: [{ provide: NewCardService, useClass: NewCardServiceMock }] });
 * ```
 *
 * Nothing reported it. `prefer-create-spy-from-class` matches an `ObjectExpression` and a class
 * declaration is not one; `prefer-provide-auto-spy` reads `useValue:` and `useFactory:` and the
 * string `useClass` appeared nowhere in the plugin at all. Measured on one consumer's 1759 spec
 * files — a suite that runs every rule of `recommended` at `error` and carries no `eslint-disable`
 * anywhere, so that every hand-rolled double still in it is one the plugin cannot see — the blind
 * spot held 112 `vi.fn()` class fields, in 46 classes across 32 files, 22 of them handed to DI
 * through a `useClass:`.
 *
 * **The evidence is a count of the class's own initialised fields, and four subtractions.** The
 * subtractions are the whole design: a spec file is full of classes that hold a `vi.fn()` and are
 * not service doubles, and on a suite this size a false positive costs more than the gap. A
 * decorated class is a host component or a testing module, whose `vi.fn()` fields are event handlers
 * (`onChange = vi.fn()`); a class with a non-empty `implements` clause **cannot** drift from the
 * type it stands in for, which is the failure the report would be claiming; a class that `extends`
 * something inherits the real behaviour it is specialising, so `provideAutoSpy` is not the
 * replacement; and a class with no name of its own is replacing a module export rather than a
 * service — see {@link isBoundToAName}.
 *
 * Those four are also why the count starts at **one** here where the object-literal rule needs two.
 * That threshold exists because `{ onDone: vi.fn() }` cannot be told apart from `{ load: vi.fn() }`,
 * and nobody writes an options bag as a class: on the consumer above, one field is 28 of the 46
 * classes, and every shape among those that is not a service double is one of the four already
 * removed. Measured both ways over the 1759 files — two fields reports 6, one field reports 12, and
 * the six the threshold hid are all named `*Mock` or `Mock*`.
 */
import { findBinding, initializerOf } from './bindings';
import { defineRule } from './define-rule';
import { insideFactorySeed, insideModuleMock, minRunnerFns } from './hand-rolled-doubles';
import { OVERRIDE_PROVIDER_CALL, overrideDescriptor } from './provider-override';
import {
  type EsCallExpression,
  type EsClass,
  type EsIdentifier,
  type EsNode,
  type EsObjectExpression,
  type EsProperty,
  type EsScope,
  type RuleContext,
  type RuleModule,
  findProperty,
  isClass,
  isIdentifier,
  isNewExpression,
  isPropertyDefinition,
  isRunnerFnCall,
  isVariableDeclarator,
} from './rule-types';

/**
 * How many of a class's own fields are initialised with a runner mock.
 *
 * Own fields only, and initialised ones only: a `declare`d or bare field has no value to read, and a
 * field assigned in the constructor (`this.load = vi.fn()`) is deliberately not counted — see the
 * rule's *Limits*. `static` counts along with instance fields, because a `static` field of
 * `vi.fn()`s is the same double built once per module instead of once per instance.
 */
export function countStubFields(node: EsClass): number {
  return node.body.body.filter((member) => isStubField(member)).length;
}

/** Whether one class member is a field whose initialiser unwraps to `vi.fn()` / `jest.fn()`. */
function isStubField(member: EsNode): boolean {
  if (!isPropertyDefinition(member) || member.computed || member.value === null) {
    return false;
  }

  return isRunnerFnCall(member.value);
}

/**
 * Whether a class is one the rules must leave alone whatever its fields say.
 *
 * Each of the four answers a different question, and none of them is a proxy for the others — see
 * the module comment for what each one is protecting.
 */
export function isExemptClass(node: EsClass): boolean {
  return node.decorators.length > 0 || node.implements.length > 0 || node.superClass !== null || !isBoundToAName(node);
}

/**
 * Whether the class is bound to a name of its own — a declaration, or a `const X = class { … }`.
 *
 * A class expression sitting in a property slot is left alone, and the one that taught this is real:
 *
 * ```ts
 * const contextMenuModule = { KdsWebContextMenuComponent: class MockContextMenu { open = vi.fn() } };
 * vi.mock('@kion/kds-web', () => contextMenuModule);
 * ```
 *
 * That class replaces a module *export*, which is then used as a DI token, and a token has to be a
 * constructor — `createSpyFromClass` cannot go there in any form. `insideModuleMock` catches the
 * inline spelling of this and misses the one above, because the object is a `const` and the factory
 * only names it. Requiring a name of its own covers both, and costs nothing: a double a spec
 * provides is always declared.
 */
function isBoundToAName(node: EsClass): boolean {
  return node.type === 'ClassDeclaration' || isVariableDeclarator(node.parent);
}

/**
 * The class a name refers to, when the linted file is where it is declared.
 *
 * Both spellings resolve: a `class X { … }` declaration, which the scope manager records as a
 * definition whose node is the class, and `const X = class { … }`, which it records as a variable
 * and which {@link initializerOf} unwraps. A class imported from a shared `*.mock.ts` resolves to
 * neither, and that is the honest answer — nothing in the file being linted says what its fields
 * are.
 */
export function declaredClass(scope: EsScope, identifier: EsIdentifier): EsClass | undefined {
  const binding = findBinding(scope, identifier.name);
  const declared = binding?.defs.map((definition) => definition.node).find(isClass);

  if (declared) {
    return declared;
  }

  const initializer = initializerOf(scope, identifier);

  return initializer && isClass(initializer) ? initializer : undefined;
}

/**
 * The stub class a `useClass:` hands to DI, if that is what it hands over.
 *
 * One field is enough, and the `provide:` on the line above is why: it proves the class is a service
 * double, so the shape a lone `vi.fn()` field would otherwise be indistinguishable from — a callback
 * in an options bag — cannot be what this is. That is the same argument `prefer-provide-auto-spy`
 * already makes for reporting a one-method `useValue` object that `prefer-create-spy-from-class`
 * leaves alone.
 */
export function providedStubClass(scope: EsScope, value: EsNode): EsClass | undefined {
  if (!isIdentifier(value)) {
    return undefined;
  }

  const declared = declaredClass(scope, value);

  return declared && !isExemptClass(declared) && countStubFields(declared) > 0 ? declared : undefined;
}

/** The two slots that hand DI a class by name. Angular resolves them differently and neither is a value. */
const CLASS_SLOTS = ['useClass', 'useExisting'] as const;

/**
 * The property of a provider that hands DI a stub class, in any of the three spellings.
 *
 * `useClass:` is the one the consumer audit found 22 of; `useValue: new StubMock()` is the same
 * double instantiated by hand, and it slipped through the object-literal reading for the same reason
 * — `providedDouble` answers for an `ObjectExpression`, and a `NewExpression` is not one.
 *
 * `useExisting:` is the third, and it is read here rather than left to `no-stub-class-double`
 * because of *which* message the report then carries. Angular's two class slots differ in what they
 * construct — `useClass` builds an instance per injector, `useExisting` aliases the token to
 * whatever the named one already resolves to — and neither difference changes the repair: the stub
 * is still a class of `vi.fn()`s standing in for a real service behind DI, so the answer is
 * `provideAutoSpy(Real)` and the stub goes away. Reported from the class instead, it drew
 * `no-stub-class-double`'s message, which recommends `createSpyFromClass` and cannot know DI is
 * involved. Aliasing to a *real* class is the ordinary use of the slot and is untouched:
 * `providedStubClass` answers only for a class declared in this file whose own fields are
 * `vi.fn()`s.
 */
export function stubClassProvider(context: RuleContext, descriptor: EsObjectExpression): EsProperty | undefined {
  const named = CLASS_SLOTS.map((slot) => findProperty(descriptor, slot)).find(
    (slot) => slot && providedStubClass(context.sourceCode.getScope(slot.value), slot.value),
  );

  if (named) {
    return named;
  }

  const useValue = findProperty(descriptor, 'useValue');

  if (!useValue || !isNewExpression(useValue.value)) {
    return undefined;
  }

  return providedStubClass(context.sourceCode.getScope(useValue.value), useValue.value.callee) ? useValue : undefined;
}

/**
 * Whether an object literal is the provider registration that `prefer-provide-auto-spy` reports for
 * a stub class — which is what makes `no-stub-class-double` stand down on the class itself.
 *
 * Deliberately the *same* three conditions that rule applies, rather than "is there a `useClass`
 * anywhere": a `multi: true` registration has no `provideAutoSpy` form, so that rule says nothing
 * about it, and standing down there would leave the class reported by nobody.
 */
function isReportedRegistration(object: EsObjectExpression): boolean {
  return findProperty(object, 'provide') !== undefined && findProperty(object, 'multi') === undefined;
}

/** The class name a provider registration hands over, when it hands over a name at all. */
export function registeredClassName(object: EsObjectExpression): string | undefined {
  const named = CLASS_SLOTS.map((slot) => findProperty(object, slot)).find((slot) => slot && isIdentifier(slot.value));

  if (named && isIdentifier(named.value)) {
    return named.value.name;
  }

  const useValue = findProperty(object, 'useValue');

  if (!useValue || !isNewExpression(useValue.value) || !isIdentifier(useValue.value.callee)) {
    return undefined;
  }

  return useValue.value.callee.name;
}

/** `class CardMock { load = vi.fn(); save = vi.fn(); }` → `createSpyFromClass(CardService)`. */
export const noStubClassDouble: RuleModule = defineRule({
  anchor: '-a-service-without-di',
  description: 'Build a double from the class (createSpyFromClass / createAutoMock) instead of a stub class of vi.fn() fields',
  schema: [{ type: 'object', properties: { minRunnerFns: { type: 'integer', minimum: 1 } }, additionalProperties: false }],
  messages: {
    noStubClassDouble:
      'A class whose fields are `vi.fn()`s is an object of `vi.fn()`s with a `new` in front of it, and it drifts the same way: it only mocks the methods somebody remembered, and the class it stands in for is free to grow one. `createSpyFromClass(X)` reads the real class, `createAutoMock<T>()` reads the type — neither can fall behind, and a member the double must *be* rather than spy on goes in the seed. Where the double is handed to Angular DI, `provideAutoSpy(X)` registers it and the whole stub class can be deleted, with the tuned returns moving to `{ overrides: … }`. Four shapes are exempt because none of them is a service double: a decorated class (a test host, whose `vi.fn()` fields are event handlers), a class with an `implements` clause (which cannot drift — the compiler holds it to the type), a class that `extends` something, and a class with no name of its own (which is replacing a module export). Raise the field count with `{ minRunnerFns: 2 }`.',
  },
  create: (context) => {
    // Collected and reported at the end: whether a class is registered through a provider is
    // routinely written below its declaration, and that registration is `prefer-provide-auto-spy`'s
    // report rather than this one's.
    const candidates: EsClass[] = [];
    const registered = new Set<string>();

    /** Remember a class `prefer-provide-auto-spy` reports the registration of, so this rule stays quiet. */
    const remember = (descriptor: EsObjectExpression | undefined): void => {
      const name = descriptor && registeredClassName(descriptor);

      if (name !== undefined) {
        registered.add(name);
      }
    };

    return {
      'ClassDeclaration, ClassExpression': (node: EsClass): void => {
        if (isExemptClass(node) || countStubFields(node) < minRunnerFns(context, 1) || insideFactorySeed(node) || insideModuleMock(node)) {
          return;
        }

        candidates.push(node);
      },
      ObjectExpression: (node: EsObjectExpression): void => remember(isReportedRegistration(node) ? node : undefined),
      // A stub class handed over by `TestBed.overrideProvider` is that rule's report too, and the
      // token sits in argument 0 rather than in a `provide:` key — so there is nothing here to read
      // for it beyond the descriptor.
      [OVERRIDE_PROVIDER_CALL]: (node: EsCallExpression): void => remember(overrideDescriptor(node)),
      'Program:exit': (): void => {
        candidates.forEach((node) => {
          if (node.id && isIdentifier(node.id) && registered.has(node.id.name)) {
            return;
          }

          context.report({ node: node.id ?? node, messageId: 'noStubClassDouble' });
        });
      },
    };
  },
});
