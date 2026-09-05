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
import { bindingState, findBinding } from './bindings';
import { defineRule } from './define-rule';
import { RENDER_MESSAGES, buildsDirectiveHarness, readsRenderedTemplate, renderShallowSuggestion, templatePolicy } from './dom-reads';
import { isFloatingChain, isPromiseCallback } from './floating-assertion';
import {
  countRunnerFns,
  handRolledProvider,
  insideFactorySeed,
  insideModuleMock,
  minRunnerFns,
  providesToken,
} from './hand-rolled-doubles';
import { lazyValueSuggestion, runsAtImportTime, spreadOfImport } from './import-time-spread';
import { type EsSpyCast, asSpyFixes, assertedValue, injectSpySuggestion, injectedFromVariable, isTestBedInject } from './injected-spy';
import { jasmineRules } from './jasmine-rules';
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
  type EsMemberExpression,
  type EsNode,
  type EsObjectExpression,
  type EsSpreadElement,
  type EsVariableDeclarator,
  type RuleContext,
  type RuleModule,
  type SuggestionDescriptor,
  buildsRunnerFnAtModuleScope,
  enclosingFunction,
  findProperty,
  isCallExpression,
  isCallee,
  isIdentifier,
  isMemberExpression,
  propertyName,
} from './rule-types';
import { type EsNamedCall, type SubscribeRepair, enclosingSubscribe, helperAssertions, repairFor } from './subscribe-repair';
import { breaksAnOverride } from './testbed-order';
import { emptyRegistrations, readCall, readProviders, unregisteredInjections } from './unregistered-spy';

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

/**
 * Whether `node` is the first parameter of a test callback this rule has already reported.
 *
 * Resolved through the scope manager rather than matched by name: `done` is what the parameter is
 * called in nine files out of ten and in none of the tenth, and a `fail` method on anything else —
 * a matcher bag, a domain object, an `AbortController` wrapper — is somebody's API.
 */
function isTestCallbackParameter(context: RuleContext, node: EsNode, callbacks: ReadonlySet<EsNode>): boolean {
  if (!isIdentifier(node)) {
    return false;
  }

  const binding = findBinding(context.sourceCode.getScope(node), node.name);

  return Boolean(binding?.defs.some((definition) => definition.type === 'Parameter' && callbacks.has(definition.node)));
}

/** `it('x', (done) => …)` → `async` + an awaited assertion. */
const noDoneCallback = defineRule({
  anchor: '-an-observable',
  description: 'Vitest has no done callback — the first parameter of a test or hook is its TestContext',
  messages: {
    noDoneCallback:
      'Vitest passes a `TestContext` here, not a `done` callback: calling it throws `TestContext is not a function` inside a promise nobody awaits, so the test **passes** having run almost none of its body. Make the callback `async` and await the result (`firstValueFrom`, `expectEmission`), or destructure the context (`({ task })`) if that is what you meant.',
    doneFail:
      '`done.fail(…)` is jasmine’s failure channel, and the `TestContext` Vitest passes instead has no `fail` on it: this throws `done.fail is not a function` — and it throws where the line sits, which is almost always an `error` callback or a `.catch()`, i.e. inside a promise nobody awaits. The rejection is unhandled, the test body returned long ago, and the run is **green** on the exact path that was supposed to fail it. Assert on the failure instead: `await expect(firstValueFrom(source$)).rejects.toMatchObject({ status: 404 })`, or `expect.fail(message)` where the line is simply unreachable.',
  },
  create: (context) => {
    // The functions whose first parameter has already been reported. `done.fail(…)` is only this
    // rule's business when `done` is one of those parameters — a `fail` method on anything else is
    // somebody's API — and the parameter is visited before the body, so the set is complete by then.
    const callbacks = new Set<EsNode>();

    return {
      'CallExpression[callee.name=/^(it|test|beforeAll|beforeEach|afterAll|afterEach)$/] > :matches(ArrowFunctionExpression, FunctionExpression)':
        (node: EsFunction): void => {
          // An identifier parameter, not a destructuring pattern: Vitest's own fixtures must be
          // destructured, so a plain name here is a `done` carried over from Jest.
          if (node.params[0]?.type === 'Identifier') {
            callbacks.add(node);
            context.report({ node: node.params[0], messageId: 'noDoneCallback' });
          }
        },
      'MemberExpression[property.name="fail"]': (node: EsMemberExpression): void => {
        if (isCallee(node) && isTestCallbackParameter(context, node.object, callbacks)) {
          context.report({ node: node.parent, messageId: 'doneFail' });
        }
      },
    };
  },
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

/**
 * Whether a member chain is rooted at `expect(...)` — i.e. it is chai's assertion, not this
 * library's stub.
 *
 * The two spell `calledWith` identically, and Vitest 4.1 made the collision common rather than
 * theoretical by adding `expect(fn).to.have.been.calledWith(x)` for suites arriving from sinon.
 * Reading the *root* of the chain is what separates them: an assertion always begins at a call to
 * `expect`, a stub always begins at a spy.
 */
function rootsAtExpect(node: EsNode): boolean {
  let current: EsNode = node;

  for (;;) {
    if (isMemberExpression(current)) {
      current = current.object;
    } else if (isCallExpression(current)) {
      current = current.callee;
    } else {
      return isIdentifier(current) && current.name === 'expect';
    }
  }
}

/** `spy.method.calledWith(1);` as a statement of its own → a stub nobody configured, asserting nothing. */
const noBareCalledWith = defineRule({
  anchor: '-argument-matching',
  description: 'Continue a calledWith / mustBeCalledWith chain — on its own it configures nothing and asserts nothing',
  messages: {
    noBareCalledWith:
      'This is a stub, not an assertion: `calledWith(...)` on its own configures the method to answer `undefined` for these arguments and checks nothing, so the test passes whether or not the call ever happened. Continue the chain (`.mockReturnValue(v)`, `.resolveWith(v)`, `.nextWith(v)`, `.failWith(err)`), or assert with `expect(spy.method).toHaveBeenCalledWith(...)`.',
    noBareMustBeCalledWith:
      'On its own, `mustBeCalledWith(...)` rejects *every* call — the matching one included, since nothing was configured for it — so the failure it produces names the arguments it was given. Continue the chain (`.mockReturnValue(v)`, `.resolveWith(v)`, `.failWith(err)`), or assert with `expect(spy.method).toHaveBeenCalledWith(...)`.',
  },
  // One selector per chain rather than one alternation and a branch: the two say different things,
  // and reading the name back off a node the selector already matched is a check that cannot fail.
  create: (context) => ({
    'ExpressionStatement > CallExpression[callee.property.name="calledWith"]': (node: EsCallExpression): void => {
      // The chai assertion shares the name and is a bare statement by design — see `rootsAtExpect`.
      if (!rootsAtExpect(node)) {
        context.report({ node, messageId: 'noBareCalledWith' });
      }
    },
    // No `rootsAtExpect` guard here, and that is not an oversight: chai's bundle has `calledWith`
    // and nothing named `mustBeCalledWith`, so there is no assertion of this name to mistake a stub
    // for. A guard would be a branch no input can take.
    'ExpressionStatement > CallExpression[callee.property.name="mustBeCalledWith"]': (node: EsCallExpression): void => {
      context.report({ node, messageId: 'noBareMustBeCalledWith' });
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

/** `injectSpy(X)` for a token this file never registered as an auto-spy. */
const noUnregisteredInjectSpy = defineRule({
  anchor: '-a-service-behind-angular-di',
  description: 'Do not read a token with injectSpy unless this file registered it as an auto-spy',
  messages: {
    noUnregisteredInjectSpy:
      'Nothing in this file registers `{{token}}` as an auto-spy, so this hands back whatever Angular DI already had — the real service, or a hand-rolled object some imported module provides. The line still compiles and the spec still runs: `injectSpy` types the result as a spy, so the helpers are there for the compiler and absent at run time, and the first `.mockReturnValue(…)` or `.calledWith(…)` throws on a real method. Add `provideAutoSpy({{token}})` to the providers, or read the real implementation with `TestBed.inject({{token}})` and say so. Nothing is reported from a file whose providers this cannot read in full — a spread, an unknown provider factory, `createWithAutoSpies` or `TestBed.overrideProvider` all silence it.',
  },
  create: (context) => {
    const tally = emptyRegistrations();

    return {
      CallExpression: (node: EsCallExpression): void => {
        readCall(context, node, tally);
      },
      'Property[key.name="providers"] > ArrayExpression': (node: EsArrayExpression): void => {
        readProviders(context, node, tally);
      },
      'Program:exit': (): void => {
        unregisteredInjections(tally).forEach(({ node, token }) => {
          context.report({ node, messageId: 'noUnregisteredInjectSpy', data: { token } });
        });
      },
    };
  },
});

/** `TestBed.createComponent(X)` in a file that never reads the DOM → `renderShallow(X)`. */
const preferRenderShallow = defineRule({
  anchor: '-a-components-children',
  description: 'Render through renderShallow() when the spec never reads the rendered template',
  hasSuggestions: true,
  schema: [{ type: 'object', properties: { templates: { enum: ['as-needed', 'never'] } }, additionalProperties: false }],
  messages: RENDER_MESSAGES,
  create: (context) => ({
    'CallExpression[callee.object.name="TestBed"][callee.property.name="createComponent"]': (node: EsCallExpression): void => {
      // Asked of the whole file, not of this fixture: see `readsRenderedTemplate`. Under
      // `{ templates: 'never' }` the question is not asked at all — no spec renders a template,
      // except the harness a directive has no way to be reached without.
      const source = context.sourceCode.getText();

      if (templatePolicy(context) === 'as-needed' ? readsRenderedTemplate(source) : buildsDirectiveHarness(source)) {
        return;
      }

      const suggestion = renderShallowSuggestion(context, node);

      context.report(
        suggestion ? { node, messageId: 'preferRenderShallow', suggest: [suggestion] } : { node, messageId: 'preferRenderShallow' },
      );
    },
    'Property[key.name="keepTemplate"][value.value=true]': (node: EsNode): void => {
      if (templatePolicy(context) === 'never') {
        context.report({ node, messageId: 'keepTemplate' });
      }
    },
  }),
});

/**
 * Every rule the plugin ships, keyed by the name used in an ESLint config.
 *
 * The jasmine set is merged in rather than written out: those four are about a suite that has not
 * finished arriving, they are configured differently (two of them are for a migration and one of
 * them is off by default), and keeping them in their own module is what stops this file from
 * growing a second half nobody reads.
 */
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
  'no-bare-called-with': noBareCalledWith,
  'no-overridden-provider': noOverriddenProvider,
  'no-inject-before-override': noInjectBeforeOverride,
  'no-import-time-spread': noImportTimeSpread,
  'no-unregistered-inject-spy': noUnregisteredInjectSpy,
  'prefer-render-shallow': preferRenderShallow,
  ...jasmineRules,
};
