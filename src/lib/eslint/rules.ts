/**
 * The rules shipped with the library.
 *
 * A lint rule that lives next to the API it steers towards travels with it: it is versioned with
 * the helper it recommends, and it stops being re-written in every project that installs the
 * package. Each rule points at the README recipe that shows the replacement, because a rule that
 * only says "don't" moves the problem instead of solving it.
 *
 * They are deliberately narrow — every one of them fires on a shape that has a single, mechanical
 * replacement.
 *
 * **Fix or suggestion.** A rule applies a fix on its own only where the rewrite is decidable from
 * the file in front of it; everything else is offered as a suggestion, which an editor shows and a
 * human accepts. `no-mocked-for-spy` is the first fix here: a declaration is the only thing it
 * touches, and the worst a wrong one can do is fail to compile — it can never change what the test
 * does at run time. `prefer-inject-spy` cannot make that claim (whether the token really is
 * provided with `provideAutoSpy` is usually decided in another file) and neither can
 * `no-object-define-property` (`mockValueProp` leaves the property writable and configurable, which
 * is the point of the change and still a change), so both suggest.
 *
 * "Decidable from the file" is read strictly, because `no-mocked-for-spy` is where it was first read
 * too loosely. A declaration is decidable; what the name is *assigned* a few lines below is a
 * separate question, and an object literal of `vi.fn()`s does not fit the type the fix wrote. The
 * rule therefore keeps the plain fix only where the value came out of one of this library's own
 * factories, and demotes itself to a suggestion everywhere else — see `mocked-declaration.ts`. A
 * rule here may hand back code it cannot prove compiles only with a human in the loop.
 *
 * `prefer-as-spy` is the second fix, and it passes the same test from the other end: the developer
 * has *already* asserted `Spy<X>` in the file being linted. The rewrite keeps that assertion whole
 * and changes only how it is written — `asSpy` is a typed identity function, so the two lines are
 * the same object and the same claim — which puts the whole change at the level of types, where a
 * wrong fix fails to compile and can reach nothing at run time. Nothing has to be known about
 * another file, because nothing is being decided here: the cast decided it.
 *
 * It is a rule of its own rather than a fix branch inside `prefer-inject-spy`, and the two are
 * adjacent rather than the same. `prefer-inject-spy` reports `vi.spyOn` over an injected instance —
 * a run-time defect (one method replaced, the rest left real) whose repair is a provider in another
 * file. This one reports a correct intention spelled in a way that no longer compiles, and repairs
 * it in place. Fusing them would also cost the honesty of `meta.fixable`, which ESLint reads per
 * rule: `prefer-inject-spy` would then advertise a fix for the shape it can only ever suggest one
 * for, and `--fix` over a suite would look as though it had left its own reports behind.
 */
import { type EsPromiseExecutor, type EsSubscribeCall, awaitedRewriteFor } from './await-emission';
import { bindingState, findBinding, initializerOf } from './bindings';
import { isFloatingChain, isPromiseCallback } from './floating-assertion';
import { lazyValueSuggestion, runsAtImportTime, spreadOfImport } from './import-time-spread';
import { type EsSpyCast, asSpyFixes, assertedValue, injectSpySuggestion, injectedFromVariable, isTestBedInject } from './injected-spy';
import { type EsMockedTypeName, namesOneType, rewritesTheWholeDeclaration, spyTypeFixes } from './mocked-declaration';
import { OVERRIDE_MESSAGES, deleteProviderSuggestion, overriddenProviders } from './overridden-provider';
import { patchKey, propHelperSuggestion } from './prop-helpers';
import {
  type EsArrayExpression,
  type EsAssignmentExpression,
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsFunction,
  type EsNode,
  type EsObjectExpression,
  type EsProperty,
  type EsSpreadElement,
  type EsVariableDeclarator,
  type RuleContext,
  type RuleListener,
  type RuleModule,
  type SuggestionDescriptor,
  buildsRunnerFn,
  buildsRunnerFnAtModuleScope,
  enclosingFunction,
  findProperty,
  isCallExpression,
  isIdentifier,
  isNewExpression,
  isObjectExpression,
  isRunnerCall,
  isRunnerFnCall,
  propertyName,
  propertyValue,
} from './rule-types';
import { type EsNamedCall, type SubscribeRepair, enclosingSubscribe, helperAssertions, repairFor } from './subscribe-repair';
import { breaksAnOverride } from './testbed-order';

const README = 'https://github.com/ASDAlexey/vitest-auto-spy#how-to-mock';

/** Build a rule, appending the recipe link to every message so the fix is one click away. */
function defineRule(options: {
  anchor: string;
  description: string;
  messages: Record<string, string>;
  fixable?: true;
  hasSuggestions?: true;
  schema?: readonly object[];
  create: (context: RuleContext) => RuleListener;
}): RuleModule {
  const url = `${README}${options.anchor}`;
  const messages = Object.fromEntries(Object.entries(options.messages).map(([id, text]) => [id, `${text} Recipe: ${url}`]));

  return {
    meta: {
      type: 'suggestion',
      docs: { description: options.description, url },
      messages,
      schema: options.schema ?? [],
      // Spread rather than assigned: ESLint reads the presence of these keys, and
      // `exactOptionalPropertyTypes` will not let an absent one be spelled as `undefined`.
      ...(options.fixable ? { fixable: 'code' as const } : {}),
      ...(options.hasSuggestions ? { hasSuggestions: true } : {}),
    },
    create: options.create,
  };
}

/**
 * Whether an object literal stubs behaviour, as opposed to carrying plain configuration values.
 *
 * The whole subtree counts, not the top level: a platform double is routinely written as
 * `{ type: 'tizen', application: { init: vi.fn() } }`, and reading only the direct properties of
 * that says it is configuration. The walk stops at every function boundary, so a factory *returning*
 * spies — the shape these rules steer towards — is not mistaken for a hand-rolled double.
 */
function looksLikeHandRolledMock(object: EsObjectExpression): boolean {
  return buildsRunnerFnAtModuleScope(object);
}

/**
 * The double a provider hands over, whether it is written in place or parked in a `const` above.
 *
 * The identifier step is not a refinement: in the suite this came from, eight hand-rolled doubles
 * were declared above the TestBed and passed by name, and the rule — reading only the literal form
 * — reported none of them.
 */
function providedDouble(context: RuleContext, value: EsNode): EsObjectExpression | undefined {
  if (isObjectExpression(value)) {
    return value;
  }

  if (!isIdentifier(value)) {
    return undefined;
  }

  const initializer = initializerOf(context.sourceCode.getScope(value), value);

  return initializer && isObjectExpression(initializer) ? initializer : undefined;
}

function countRunnerFns(object: EsObjectExpression): number {
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
function buildsInjectionToken(node: EsNode | undefined): boolean {
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
function providesToken(context: RuleContext, provide: EsNode): boolean {
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
function handRolledProvider(
  context: RuleContext,
  useValue: EsProperty | undefined,
  useFactory: EsProperty | undefined,
): EsProperty | undefined {
  if (useValue) {
    const double = providedDouble(context, useValue.value);

    return double && looksLikeHandRolledMock(double) ? useValue : undefined;
  }

  return useFactory && buildsRunnerFn(factoryBody(context, useFactory.value), true) ? useFactory : undefined;
}

/** The factory itself, or the value a name was bound to — one step, the same as `providedDouble` takes. */
function factoryBody(context: RuleContext, value: EsNode): EsNode {
  if (!isIdentifier(value)) {
    return value;
  }

  return initializerOf(context.sourceCode.getScope(value), value) ?? value;
}

/** `{ provide: X, useValue: { a: vi.fn() } }` → `provideAutoSpy(X)`. */
const preferProvideAutoSpy = defineRule({
  anchor: '-a-service-behind-angular-di',
  description: 'Provide a spied service with provideAutoSpy() instead of a hand-rolled useValue object',
  messages: {
    preferProvideAutoSpy:
      'This `useValue` object hand-rolls a service mock. `provideAutoSpy(Class)` spies every method of the real class, so the stub cannot drift from it. For a dependency behind an `InjectionToken` — which has no class to read, and which `provideAutoSpy` therefore cannot take — it is `provideAutoSpyForToken(TOKEN)`, built from the type the token carries.',
    preferProvideAutoSpyForToken:
      'This `useValue` object hand-rolls a mock for an `InjectionToken`. `provideAutoSpy` cannot take one: it reads a class prototype and a token has none. `provideAutoSpyForToken(TOKEN)` builds the double from the type the token carries instead. Members the double must *answer* with rather than spy on go in its second argument — including a call the code under test chains off: `provideAutoSpyForToken(LOGGER, { channel: vi.fn().mockReturnThis() })`, without which `inject(LOGGER).channel("x").debug()` dies on `undefined` inside the constructor.',
  },
  create: (context) => ({
    ObjectExpression: (node: EsObjectExpression): void => {
      const provide = findProperty(node, 'provide');
      const useValue = findProperty(node, 'useValue');
      const useFactory = findProperty(node, 'useFactory');

      const reported = handRolledProvider(context, useValue, useFactory);

      // A `multi: true` registration has no `provideAutoSpy` form — the factory builds one double for
      // a token and takes no registration mode — so the replacement this rule asks for would silently
      // turn an accumulating provider into an overriding one. Nothing to recommend, so nothing said.
      if (!provide || !reported || findProperty(node, 'multi')) {
        return;
      }

      const messageId = providesToken(context, provide.value) ? 'preferProvideAutoSpyForToken' : 'preferProvideAutoSpy';

      context.report({ node: reported, messageId });
    },
  }),
});

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
function isFactoryCall(node: EsNode): boolean {
  return isCallExpression(node) && isIdentifier(node.callee) && SPY_FACTORIES.has(node.callee.name);
}

/**
 * Whether the literal is somewhere inside a factory call.
 *
 * The walk goes all the way up rather than looking at the immediate parent, because a seed nests:
 * `mockDeep<T>({ api: { load: vi.fn(), save: vi.fn() } })` puts the object two levels below the call.
 */
function insideFactorySeed(node: EsNode): boolean {
  let current = node;

  while (current.type !== 'Program') {
    if (isFactoryCall(current)) {
      return true;
    }

    current = current.parent;
  }

  return false;
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
 */
function minRunnerFns(context: RuleContext): number {
  const configured: unknown = Reflect.get(Object(context.options[0]), 'minRunnerFns');

  return typeof configured === 'number' ? configured : 2;
}

/**
 * Whether the literal sits inside a `vi.mock()` factory.
 *
 * The object a module mock returns replaces the module's *exports*, and the `vi.fn()`s in it stand
 * in for classes that are then used as DI tokens — `createSpyFromClass` cannot go there in any
 * form, because a token has to be a constructor. Reported once, and the agent's own repair
 * (`class DialogRefStub {}`) had nothing to do with what the message said.
 */
function insideModuleMock(node: EsNode): boolean {
  let current = node;

  while (current.type !== 'Program') {
    if (isRunnerCall(current, MODULE_MOCKS)) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

/** `{ a: vi.fn(), b: vi.fn() }` → `createSpyFromClass(X)` / `createAutoMock<T>()`. */
const preferCreateSpyFromClass = defineRule({
  anchor: '-a-service-without-di',
  description: 'Build a spy from the class (createSpyFromClass / createAutoMock) instead of an object of vi.fn()s',
  schema: [{ type: 'object', properties: { minRunnerFns: { type: 'integer', minimum: 1 } }, additionalProperties: false }],
  messages: {
    preferCreateSpyFromClass:
      'An object of **two or more** `vi.fn()`s only mocks the methods you remembered. `createSpyFromClass(X)` reads the class, `createAutoMock<T>()` the type — both stay in step with it. The threshold is why an object next to this one with a single `vi.fn()` is not flagged: on its own that is indistinguishable from an options bag with a callback in it. Lower it with `{ minRunnerFns: 1 }` if the suite has no such objects — and note that a one-method double handed to DI is reported by `prefer-provide-auto-spy` either way.',
  },
  create: (context) => ({
    ObjectExpression: (node: EsObjectExpression): void => {
      // The provider form is `prefer-provide-auto-spy`'s business — do not report it twice; a seed
      // handed to one of this library's own factories is the fix rather than the problem; and a
      // module mock's exports are not a service double at all.
      if (
        propertyName(node.parent) === 'useValue' ||
        countRunnerFns(node) < minRunnerFns(context) ||
        insideFactorySeed(node) ||
        insideModuleMock(node)
      ) {
        return;
      }

      context.report({ node, messageId: 'preferCreateSpyFromClass' });
    },
  }),
});

/** `vi.spyOn(TestBed.inject(X), 'method')`, in one step or in two → `injectSpy(X).method`. */
const preferInjectSpy = defineRule({
  anchor: '-reading-a-spy-back-from-di',
  description: 'Read an already-spied dependency with injectSpy() instead of re-spying a TestBed.inject() result',
  hasSuggestions: true,
  messages: {
    preferInjectSpy:
      'Spying the instance DI just handed you replaces one method and leaves the rest real. Provide it with `provideAutoSpy(X)` and read it back with `injectSpy(X)`.',
  },
  create: (context) => ({
    'CallExpression[callee.object.name="vi"][callee.property.name="spyOn"]': (node: EsCallExpression): void => {
      const [target] = node.arguments;

      if (!target) {
        return;
      }

      // Two shapes, one problem: the injected instance handed straight to `spyOn`, and the same
      // instance parked in a `const` first. The second one is the common half of the pair — both
      // were found on adjacent lines of the same file, and only the inline one used to be reported.
      const injectCall = isTestBedInject(target) ? target : injectedFromVariable(context, target);

      if (!injectCall) {
        return;
      }

      const suggestion = injectSpySuggestion(context, node, injectCall);

      context.report(suggestion ? { node, messageId: 'preferInjectSpy', suggest: [suggestion] } : { node, messageId: 'preferInjectSpy' });
    },
  }),
});

/** `Object.defineProperty(obj, 'x', …)` → `mockReadonlyProp` / `mockValueProp`. */
const noObjectDefineProperty = defineRule({
  anchor: '-a-readonly-property-or-a-signal',
  description: 'Patch properties with mockReadonlyProp / mockValueProp, which record the undo',
  hasSuggestions: true,
  messages: {
    noObjectDefineProperty:
      '`Object.defineProperty` in a spec leaves no way back: nothing restores the original descriptor, and it defaults `configurable` to `false`, so the patch seals the property for the rest of the worker under `isolate: false`. Take the helper the descriptor asks for — `{ value }` holding data is `mockValueProp`; `{ value }` holding a mock the code calls with `new` (a `mockImplementation(function () { … })`, spelled with a `function` because an arrow cannot be constructed) is `stubConstructor`; `{ get }` is `mockReadonlyPropGetter`; a `get`/`set` pair is `mockAccessorsProp`; a `Signal<T>` property is `mockReadonlyProp(obj, key, signal(value))` — with a **real** `signal`, because the `vi.fn().mockReturnValue(value)` that reads identically at the call site is not one, and every `computed()` and `effect()` downstream of it stops updating the moment anything depends on it. Each returns the undo and registers it with `restoreMockedProps()`. And if the property is missing because it is an instance field rather than a prototype member, the repair belongs where the spy is built — `instanceMethodsToSpyOn` / `observablePropsToSpyOn` — not here.',
    manualRestore:
      'This property is redefined twice in the same block, which is a patch and a hand-written restore. The restore runs only if every assertion between them passes: the first red one skips it, and the patch is then live for every later test of the file — and, under `isolate: false`, for every later file of the worker. `vi.restoreAllMocks()` does not help, because it knows about spies and not about descriptors. `mockValueProp` / `mockReadonlyPropGetter` register the undo with `restoreMockedProps()`, which runs in a hook and therefore runs whatever the assertions did.',
  },
  create: (context) => {
    // Grouped and reported at the end, because "is there a hand-written restore below" is only
    // answerable once the block has been walked. Keyed by the block and by what is being patched,
    // so a `beforeEach` patch paired with an `afterEach` restore — which is correct, and runs in a
    // hook whatever the assertions did — is not mistaken for one.
    const patches = new Map<string, EsCallExpression[]>();

    return {
      'CallExpression[callee.object.name="Object"][callee.property.name="defineProperty"]': (node: EsCallExpression): void => {
        const key = patchKey(context, node);
        const seen = patches.get(key) ?? [];

        seen.push(node);
        patches.set(key, seen);
      },
      'Program:exit': (): void => {
        patches.forEach((nodes) => {
          const messageId = nodes.length > 1 ? 'manualRestore' : 'noObjectDefineProperty';

          nodes.forEach((node) => {
            const suggestion = propHelperSuggestion(context, node);

            context.report(suggestion ? { node, messageId, suggest: [suggestion] } : { node, messageId });
          });
        });
      },
      // `defineProperties` takes a map of descriptors, so its replacement is one `mockValueProp` per
      // entry — several statements where there was one, which is not a per-node edit.
      'CallExpression[callee.object.name="Object"][callee.property.name="defineProperties"]': (node: EsNode): void =>
        context.report({ node, messageId: 'noObjectDefineProperty' }),
    };
  },
});

/** `TestBed.inject()` in a hook, in a suite that still overrides → the override throws. */
const noInjectBeforeOverride = defineRule({
  anchor: '-a-service-behind-angular-di',
  description: 'Do not instantiate the TestBed in a hook when the suite still needs to override a provider',
  messages: {
    noInjectBeforeOverride:
      'This instantiates the testing module, and this suite overrides something: every `TestBed.override*` that runs afterwards — in a test, or in a `createComponent` helper written above this line — throws `Cannot override provider when the test module has already been instantiated`. The trap is one that migrating *to* `provideAutoSpy` creates: a hand-rolled `useValue` configured its return values in the literal, and the replacement has nowhere to put them, so the line lands in `beforeEach`. Configure the double after every override instead — `injectSpy(X)` inside the test — or keep the access lazy (`const api = () => injectSpy(Api)`), which moves instantiation into the first test, after the overrides have run.',
  },
  create: (context) => ({
    'CallExpression[callee.object.name="TestBed"][callee.property.name=/^(inject|createComponent)$/]': (node: EsNode): void => {
      if (breaksAnOverride(node)) {
        context.report({ node, messageId: 'noInjectBeforeOverride' });
      }
    },
  }),
});

/** Two providers for one token in one array → the earlier one never runs. */
const noOverriddenProvider = defineRule({
  anchor: '-a-service-behind-angular-di',
  description: 'Register a token once — a second provider for it in the same array silently replaces the first',
  hasSuggestions: true,
  messages: {
    noOverriddenProvider:
      'Another provider for `{{token}}` follows this one in the same array, and Angular keeps the last: the one on line {{line}} is what DI hands out, and this one never runs. `provideAutoSpy({{token}})` sitting above `{ provide: {{token}}, useValue: … }` is not an auto-spy with extra configuration — it is a hand-rolled double, and the auto-spy is dead code. That misleads from both sides: assertions get written against a spy nothing provided, and whoever comes to replace the hand-rolled double sees the `provideAutoSpy` beside it and reads the work as done. Keep one.',
    duplicateProvider:
      '`{{token}}` is provided twice in this array, in the same words: the copy on line {{line}} is the one DI hands out, and Angular had already ignored this one. Deleting it therefore cannot change what the test gets, which is why this is the only shape here that comes with an edit — offered as a suggestion, because deleting a line of a `providers` array is not something to discover in a diff.',
    overriddenByBarerProvider:
      'Another provider for `{{token}}` follows this one on line {{line}}, and Angular keeps the last — so the double this spec configured is not the double it got. The survivor is the **barer** of the two: whatever is set up here (`gettersToSpyOn`, `instanceMethodsToSpyOn`, a `useValue` body) never reaches DI, and every assertion below runs against a poorer spy answering to the same name. Nothing can be deleted for you, because which of the two to keep is the question: move this configuration onto the provider on line {{line}}, or delete that one.',
  },
  create: (context) => ({
    ArrayExpression: (node: EsArrayExpression): void => {
      overriddenProviders(context, node).forEach(({ element, token, kind, survivor }) => {
        const report = {
          node: element,
          messageId: OVERRIDE_MESSAGES[kind],
          data: { token, line: String(survivor.loc.start.line) },
        };

        context.report(kind === 'duplicate' ? { ...report, suggest: [deleteProviderSuggestion(context, element, token)] } : report);
      });
    },
  }),
});

/** `source$.subscribe(v => expect(v)…)` → `await expectEmission(source$)`. */
const noExpectInSubscribe = defineRule({
  anchor: '-an-observable',
  description: 'Assert observables with expectEmission() instead of expect() inside a subscribe callback',
  messages: {
    invertible:
      'If the stream never emits, this callback never runs and the test passes having asserted nothing — all {{count}} of these. Turn the subscription inside out: `const value = await firstValueFrom(source$)`, then assert on it. `await expectEmission(source$)` does the same and fails with the source named when the value does not arrive. If the stream emits more than once and every emission was meant to be checked, count them and take `expectEmissions(source$, N)`.',
    afterTrigger:
      'There is code after this subscription, which usually means the code after it is what makes the stream emit — `httpMock.expectOne(...)`, `subject.next(...)`, `vi.runAllTimers()`. `await firstValueFrom(source$)` deadlocks on that shape: the await never returns, so the trigger never runs. Hold the promise instead, and note that `expectEmission` subscribes when you call it, not when you await it:\n  const emission = expectEmission(source$);\n  req.flush(payload);\n  await expect(emission).resolves.toEqual(payload);\nAll {{count}} assertions here move below the await.',
    inErrorHandler:
      'This assertion is in the failure branch, where `expectEmission` cannot help: it resolves on a value, and wraps whatever the stream errored with. Assert on the rejection instead — `await expect(firstValueFrom(source$)).rejects.toBeInstanceOf(UdmsStatusError)`, or `.rejects.toMatchObject({ status: 404 })` — which fails the test when the stream succeeds, something an `error` callback nobody calls cannot do. All {{count}} assertions here move into the matcher, and the `next` half goes with them: `subscribe({ next: () => expect.unreachable(…), error: (e) => expect(e).toBe(err) })` becomes the one line `await expect(firstValueFrom(source$)).rejects.toBe(err)`, because the guard against an emission is what `rejects` already is.',
  },
  hasSuggestions: true,
  create: (context) => {
    // Counted per `subscribe`, reported once. One assertion per report turned 23 places into 44
    // messages in a single file of the suite this came from, which doubles the apparent size of the
    // job at triage time — and every one of those messages named the same rewrite.
    const assertions = new Map<EsSubscribeCall, { count: number; repair: SubscribeRepair }>();
    const rewrites = new Map<EsNode, SuggestionDescriptor>();

    /** Add assertions to the `subscribe` they belong to. The first of them decides the repair: a
     * second one in a different branch of the same `subscribe` is possible, rare, and wants the
     * message that is already there. */
    const record = (node: EsNode, count: number): void => {
      if (count === 0) {
        return;
      }

      const subscribeCall = enclosingSubscribe(node);
      const seen = assertions.get(subscribeCall);

      assertions.set(subscribeCall, { count: (seen?.count ?? 0) + count, repair: seen?.repair ?? repairFor(node, subscribeCall) });
    };

    return {
      // The whole `it(name, () => new Promise((done) => { … }))` frame, matched as a shape so that
      // the rewrite has nothing left to prove about where it is. It is visited before the
      // assertions inside it, and both are collected until the file is over.
      'CallExpression[callee.name=/^(it|test)$/] > ArrowFunctionExpression > NewExpression[callee.name="Promise"] > :matches(ArrowFunctionExpression, FunctionExpression)':
        (node: EsPromiseExecutor): void => {
          const rewrite = awaitedRewriteFor(context, node);

          if (rewrite) {
            rewrites.set(rewrite.subscribeCall, rewrite.suggestion);
          }
        },
      'CallExpression[callee.property.name="subscribe"] CallExpression[callee.name="expect"]': (node: EsNode): void => {
        record(node, 1);
      },
      // Every plain-name call inside a `subscribe`, so that assertions parked in a helper are found
      // too. `expect` and `done` land here as well and resolve to no local function, which costs a
      // scope lookup and nothing else.
      'CallExpression[callee.property.name="subscribe"] CallExpression[callee.type="Identifier"]': (node: EsNamedCall): void => {
        record(node, helperAssertions(context, node, enclosingSubscribe(node)));
      },
      'Program:exit': (): void => {
        assertions.forEach(({ count, repair }, subscribeCall) => {
          const suggestion = rewrites.get(subscribeCall);
          const report = { node: subscribeCall, messageId: repair, data: { count: String(count) } };

          context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
        });
      },
    };
  },
});

/** `export const fixture = { m: vi.fn() }` → `export const createFixture = () => ({ m: vi.fn() })`. */
const noSharedModuleLevelMock = defineRule({
  anchor: '-a-double-more-than-one-spec-uses',
  description: 'Export a factory that builds the shared double, not a module-level object holding vi.fn()s',
  messages: {
    noSharedModuleLevelMock:
      'This exported double is built once per module, not once per test. Under `isolate: false` every importing spec shares the same spies and subjects, `clearMocks` reaches only the file that imported first, and the failure lands in whichever file happens to run next. Export a **factory** that returns it.',
  },
  create: (context) => ({
    'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator': (node: EsVariableDeclarator): void => {
      if (node.init && buildsRunnerFnAtModuleScope(node.init)) {
        context.report({ node, messageId: 'noSharedModuleLevelMock' });
      }
    },
  }),
});

/** `let s: Mocked<Cart>` → `let s: Spy<Cart>`. */
const noMockedForSpy = defineRule({
  anchor: '-reading-a-spy-back-from-di',
  description: 'Declare a spy as Spy<T>, not as Vitest’s Mocked<T>',
  fixable: true,
  hasSuggestions: true,
  messages: {
    noMockedForSpy:
      '`Mocked<T>` keeps `T`’s private members, so assigning a spy to it fails with "is missing the following properties: _zone, _queries, …" — a list of private field names that says nothing about the real problem, which is the declaration. Declare `Spy<T>`.',
  },
  create: (context) => {
    // Collected and reported at the end, because what a `let` ends up holding is routinely written
    // below its declaration — and whether the rename is the whole edit depends on that value.
    const assignments = new Map<string, EsNode[]>();
    const reported: EsMockedTypeName[] = [];

    return {
      AssignmentExpression: (node: EsAssignmentExpression): void => {
        if (!isIdentifier(node.left)) {
          return;
        }

        assignments.set(node.left.name, [...(assignments.get(node.left.name) ?? []), node.right]);
      },
      // Every type position, not only a `let` annotation: the type turns up in a factory's return
      // type, in a helper's parameter and — in all eight reports of one batch, on the line right after
      // the declaration — in `as unknown as Mocked<T>`. Fixing the declaration and leaving the cast
      // spelled `Mocked` is how the same file ends up saying both.
      'TSTypeReference > Identifier[name=/^Mocked(Object)?$/]': (node: EsMockedTypeName): void => {
        reported.push(node);
      },
      'Program:exit': (): void => {
        reported.forEach((node) => {
          const mocked = findBinding(context.sourceCode.getScope(node), node.name);
          // A `Mocked` the file declares itself is not Vitest's, whatever it is called, and `Spy`
          // already meaning something else here is the same problem from the other end.
          const rewritable =
            (!mocked || mocked.defs.some((definition) => definition.type === 'ImportBinding')) &&
            namesOneType(node.parent) &&
            bindingState(context.sourceCode.getScope(node), 'Spy') !== 'taken';

          if (!rewritable) {
            context.report({ node, messageId: 'noMockedForSpy' });

            return;
          }

          const fix = (fixer: EsFixer): EsFix[] => spyTypeFixes(context, fixer, node, mocked);

          context.report(
            rewritesTheWholeDeclaration(node, assignments)
              ? { node, messageId: 'noMockedForSpy', fix }
              : {
                  node,
                  messageId: 'noMockedForSpy',
                  suggest: [
                    { desc: 'Declare Spy<T> — and rebuild what is assigned to it, which Spy<T> will reject if it is a literal', fix },
                  ],
                },
          );
        });
      },
    };
  },
});

/** `TestBed.inject(X) as Spy<X>` → `asSpy(TestBed.inject(X))`. */
const preferAsSpy = defineRule({
  anchor: '-reading-a-spy-back-from-di',
  description: 'Read a spy back out of the container with asSpy(), not with a cast to Spy<T>',
  fixable: true,
  messages: {
    preferAsSpy:
      'A cast is not how a spy comes back out of a container. `TestBed.inject(X) as Spy<X>` is the line a `jest-auto-spies` suite carries in every file, and it stops compiling here: `Spy<T>` adds `accessorSpies` and the per-method helpers, so neither type sufficiently overlaps the other and the line fails with `TS2352: Conversion of type ‘X’ to type ‘Spy<X>’ may be a mistake`. `asSpy(...)` makes exactly the same assertion as a typed identity function — the same object at run time, the same claim, no cast — and `injectSpy(X)` is that with the `TestBed.inject` folded in. Neither is for the object under test: a service a spec exercises is not a double, and typing it as the class is the repair there.',
  },
  create: (context) => ({
    'TSAsExpression[typeAnnotation.type="TSTypeReference"][typeAnnotation.typeName.name="Spy"]': (node: EsSpyCast): void => {
      const spy = findBinding(context.sourceCode.getScope(node), 'Spy');

      // A `Spy` the file declares itself is not this library's, whatever it is called — and unlike
      // `no-mocked-for-spy`, which reports a `Mocked<T>` it cannot rewrite because the *declaration*
      // is wrong either way, there is nothing to say about a cast to somebody else's type.
      if (spy && !spy.defs.some((definition) => definition.type === 'ImportBinding')) {
        return;
      }

      const value = assertedValue(node);

      if (!value) {
        return;
      }

      const rewritable = bindingState(context.sourceCode.getScope(node), 'asSpy') !== 'taken';

      context.report(
        rewritable
          ? { node, messageId: 'preferAsSpy', fix: (fixer: EsFixer): EsFix[] => asSpyFixes(context, fixer, node, value, spy) }
          : { node, messageId: 'preferAsSpy' },
      );
    },
  }),
});

/** `it('x', (done) => …)` → `async` + an awaited assertion. */
const noDoneCallback = defineRule({
  anchor: '-an-observable',
  description: 'Vitest has no done callback — the first parameter of a test or hook is its TestContext',
  messages: {
    noDoneCallback:
      'Vitest passes a `TestContext` here, not a `done` callback: calling it throws `TestContext is not a function` inside a promise nobody awaits, so the test **passes** having run almost none of its body. Make the callback `async` and await the result (`firstValueFrom`, `expectEmission`), or destructure the context (`({ task })`) if that is what you meant.',
  },
  create: (context) => ({
    'CallExpression[callee.name=/^(it|test|beforeAll|beforeEach|afterAll|afterEach)$/] > :matches(ArrowFunctionExpression, FunctionExpression)':
      (node: EsFunction): void => {
        // An identifier parameter, not a destructuring pattern: Vitest's own fixtures must be
        // destructured, so a plain name here is a `done` carried over from Jest.
        if (node.params[0]?.type === 'Identifier') {
          context.report({ node: node.params[0], messageId: 'noDoneCallback' });
        }
      },
  }),
});

/** `p.then(() => expect(…))` as a statement of its own → `expect(await p)`. */
const noFloatingAssertion = defineRule({
  anchor: '-a-promise-a-test-forgets-to-await',
  description: 'Await or return a promise chain that asserts, instead of leaving the .then() callback floating',
  messages: {
    noFloatingAssertion:
      'Nothing awaits this chain, so the test ends before the callback runs: the assertion never runs, and the test passes no matter what it claims — including claims that are false. Await the chain (or `return` it) and assert on the settled value: `expect(await promise)`, `await expectEmission(source$)`.',
  },
  create: (context) => ({
    'CallExpression[callee.name="expect"]': (node: EsNode): void => {
      // Only the *immediately* enclosing function counts. One nested callback deeper the advice stops
      // being true: awaiting the chain revives an `expect` sitting directly in the `.then()` callback,
      // but not one parked in a `subscribe` or a `setTimeout` inside it — and which of those a
      // callback is cannot be read off the syntax. Reporting only what awaiting actually fixes keeps
      // the message honest, and leaves the deferred-callback shapes to `no-expect-in-subscribe`.
      const callback = enclosingFunction(node);

      if (!callback || !isPromiseCallback(callback) || !isFloatingChain(callback.parent)) {
        return;
      }

      context.report({ node, messageId: 'noFloatingAssertion' });
    },
  }),
});

/** `export const events = [...BaseEvents]` at module scope → a TypeError while the bundle loads. */
const noImportTimeSpread = defineRule({
  anchor: '-a-double-more-than-one-spec-uses',
  description: 'Do not spread an imported binding at module scope — inside a bundle it can still be undefined',
  hasSuggestions: true,
  messages: {
    noImportTimeSpread:
      'This spreads `{{name}}`, a binding another module owns, while this module is still being evaluated. Under `tsc` and under a browser’s ESM loader that is safe — nothing runs before its dependency. Inside one bundle it is not: the spec bundle emits shared chunks, a chunk can be evaluated while the binding it re-exports is still `undefined`, and `[...undefined]` throws `Spread syntax requires ...iterable[Symbol.iterator] to be a function` before a single test runs — on a tree whose every test passes. Build the value lazily (a function, called where it is read), or inline the constant so nothing has to be imported for this line to work. Nothing inside a function body is reported: that runs later, which is the whole repair.',
  },
  create: (context) => ({
    SpreadElement: (node: EsSpreadElement): void => {
      const imported = spreadOfImport(context, node);

      if (!imported || !runsAtImportTime(node)) {
        return;
      }

      const suggestion = lazyValueSuggestion(context, node);
      const report = { node, messageId: 'noImportTimeSpread', data: { name: imported.name } };

      context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
    },
  }),
});

/** Every rule the plugin ships, keyed by the name used in an ESLint config. */
export const rules: Record<string, RuleModule> = {
  'prefer-provide-auto-spy': preferProvideAutoSpy,
  'prefer-create-spy-from-class': preferCreateSpyFromClass,
  'prefer-inject-spy': preferInjectSpy,
  'no-object-define-property': noObjectDefineProperty,
  'no-expect-in-subscribe': noExpectInSubscribe,
  'no-shared-module-level-mock': noSharedModuleLevelMock,
  'no-mocked-for-spy': noMockedForSpy,
  'prefer-as-spy': preferAsSpy,
  'no-done-callback': noDoneCallback,
  'no-floating-assertion': noFloatingAssertion,
  'no-overridden-provider': noOverriddenProvider,
  'no-inject-before-override': noInjectBeforeOverride,
  'no-import-time-spread': noImportTimeSpread,
};
