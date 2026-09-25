/**
 * The rules shipped with the library.
 *
 * A lint rule that lives next to the API it steers towards travels with it: it is versioned with
 * the helper it recommends, and it stops being re-written in every project that installs the
 * package. Each message names the one replacement and links to the rule's own docs section, because
 * a rule that only says "don't" moves the problem instead of solving it.
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
import { count as plural } from '../message-text';
import { noVacuousAbsenceAssertion } from './absence-assertion';
import { type EsPromiseExecutor, type EsSubscribeCall, awaitedRewriteFor } from './await-emission';
import { bindingState, findBinding } from './bindings';
import { noUnassertedArgument } from './called-arguments';
import { noCompileComponents } from './compile-components';
import { noConsoleInSpec, noImportTimeConsoleSpies, noPassthroughConsoleSpy } from './console-rules';
import { noConstantExpect } from './constant-expect';
import { preferCreateSpyFromClass } from './create-spy-from-class';
import { noDeadSchemas } from './dead-schemas';
import { noStructuralDouble } from './declared-double';
import { defineRule } from './define-rule';
import { preferSettleDynamicImport } from './dynamic-import';
import { noMockCast, preferCreateMock } from './fixture-casts';
import { isFloatingChain, isPromiseCallback } from './floating-assertion';
import { noHandAssignedGlobal } from './global-assignment';
import { lazyValueSuggestion, runsAtImportTime, spreadFailureMode, spreadOfImport } from './import-time-spread';
import {
  INJECTED_SPY_SCHEMA,
  injectSpySuggestion,
  injectedFromVariable,
  isTestBedInject,
  keepsTheRealInstance,
  preferAsSpy,
} from './injected-spy';
import { jasmineRules } from './jasmine-rules';
import { noInstanceLifecycleSpy } from './lifecycle-spy';
import { argumentList, bindingName, excerpt, excerptOr, receiverOf } from './message-data';
import { noMistypedUseValue } from './mistyped-use-value';
import { noRedundantMockReset } from './mock-reset';
import { type EsMockedTypeName, namesOneType, rewritesTheWholeDeclaration, spyTypeFixes } from './mocked-declaration';
import { preferObserverStub } from './observer-stub';
import { noOverriddenProvider } from './overridden-provider';
import { preferRenderShallow } from './prefer-render-shallow';
import { noPrivateMemberAccess } from './private-access';
import { definePropertyData, patchKey, propHelperSuggestion } from './prop-helpers';
import { preferProvideAutoSpy } from './provide-auto-spy';
import { noReflectMemberAccess } from './reflect-access';
import { preferProvideActivatedRoute } from './route-double';
import {
  type EsArrayExpression,
  type EsAssignmentExpression,
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsFunction,
  type EsIdentifier,
  type EsMemberExpression,
  type EsNode,
  type EsSpreadElement,
  type EsVariableDeclarator,
  type RuleContext,
  type RuleModule,
  type SuggestionDescriptor,
  buildsRunnerFnAtModuleScope,
  enclosingFunction,
  isCallExpression,
  isCallee,
  isIdentifier,
  isMemberExpression,
  memberName,
} from './rule-types';
import { noSelfCalledSpy } from './self-called-spy';
import { preferSetInputs } from './set-inputs';
import { noRedundantSmokeTest } from './smoke-test';
import { preferSpyOnOwnMethod } from './spy-on-own-method';
import { noStubClassDouble } from './stub-class';
import { preferStubResponse } from './stub-response';
import { type EsNamedCall, type SubscribeRepair, enclosingSubscribe, helperAssertions, repairFor } from './subscribe-repair';
import { noSyncTestbedAwait } from './testbed-await';
import { INSTANTIATES_THE_MODULE, OVERRIDES_THE_MODULE, RESETS_THE_MODULE, type TestBedOrdering, breaksAnOverride } from './testbed-order';
import { noTsExpectErrorOnDouble } from './ts-expect-error-on-double';
import { noUnknownUseValueKey } from './unknown-use-value-key';
import { emptyRegistrations, readCall, readProviders, unregisteredInjections } from './unregistered-spy';

/** `vi.spyOn(TestBed.inject(X), 'method')`, in one step or in two → `injectSpy(X).method`. */
const preferInjectSpy = defineRule({
  name: 'prefer-inject-spy',
  description: 'Read an already-spied dependency with injectSpy() instead of re-spying a TestBed.inject() result',
  hasSuggestions: true,
  schema: INJECTED_SPY_SCHEMA,
  messages: {
    preferInjectSpy:
      '`vi.spyOn({{args}})` replaces one method of the `{{token}}` instance DI handed out and leaves the rest of it real. Provide it with `provideAutoSpy({{token}})` and read it back with `injectSpy({{token}})`; if the spec needs the real instance, list `{{token}}` in `{ ignoreTokens }`.',
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

      // The token decides, not the spy: for a handful of framework objects the replacement this
      // rule advertises is impossible or removes the reason the spec injected them — see
      // `KEPT_REAL_TOKENS`, which `{ ignoreTokens: [...] }` extends per project.
      if (!injectCall || keepsTheRealInstance(context, injectCall)) {
        return;
      }

      const suggestion = injectSpySuggestion(context, node, injectCall);
      const report = {
        node,
        messageId: 'preferInjectSpy',
        data: { args: argumentList(context, node), token: argumentList(context, injectCall) },
      };

      context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
    },
  }),
});

/** `Object.defineProperty(obj, 'x', …)` → `mockReadonlyProp` / `mockValueProp`. */
const noObjectDefineProperty = defineRule({
  name: 'no-object-define-property',
  description: 'Patch properties with mockReadonlyProp / mockValueProp, which record the undo',
  hasSuggestions: true,
  messages: {
    noObjectDefineProperty:
      '`{{property}}` is patched with `Object.{{method}}`, which nothing undoes: `configurable` defaults to `false`, so the property stays sealed for the rest of the worker. Use `{{fix}}`, which restores it after the test.',
    manualRestore:
      '`{{property}}` is patched and restored by hand in the same block, so the first failing assertion between the two skips the restore and the patch leaks into every later test. Use `{{fix}}`, whose undo runs in a hook whatever the assertions did.',
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
            const report = { node, messageId, data: { ...definePropertyData(context, node), method: 'defineProperty' } };

            context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
          });
        });
      },
      // `defineProperties` takes a map of descriptors, so its replacement is one `mockValueProp` per
      // entry — several statements where there was one, which is not a per-node edit.
      'CallExpression[callee.object.name="Object"][callee.property.name="defineProperties"]': (node: EsCallExpression): void => {
        const object = excerptOr(context, node.arguments[0], 'obj', 40);

        context.report({
          node,
          messageId: 'noObjectDefineProperty',
          data: { property: object, method: 'defineProperties', fix: `mockValueProp(${object}, key, value)` },
        });
      },
    };
  },
});

/** `TestBed.inject()` / `injectSpy()` in a hook, in a suite that still overrides → the override throws. */
const noInjectBeforeOverride = defineRule({
  name: 'no-inject-before-override',
  description: 'Do not instantiate the TestBed in a hook when the suite still needs to override a provider',
  messages: {
    noInjectBeforeOverride:
      '`{{call}}` instantiates the testing module here, and this suite still calls `TestBed.override*` later, which then throws `Cannot override provider when the test module has already been instantiated`. Read the double inside the test, after the overrides, or keep it lazy: `const api = () => {{call}}`.',
  },
  create: (context) => {
    // Collected first, decided at the end: an `override*` runs whenever its suite calls it, so the
    // question is about the whole file and asking it per injection re-read the file once per
    // injection — 96 % of the plugin's time on a spec with fifteen of them in one hook.
    const ordering: TestBedOrdering = { overrides: [], resets: [] };
    const injections: EsNode[] = [];

    return {
      [OVERRIDES_THE_MODULE]: (node: EsNode): void => {
        ordering.overrides.push(node);
      },
      [RESETS_THE_MODULE]: (node: EsNode): void => {
        ordering.resets.push(node);
      },
      [INSTANTIATES_THE_MODULE]: (node: EsNode): void => {
        injections.push(node);
      },
      'Program:exit': (): void => {
        injections.forEach((node) => {
          if (breaksAnOverride(node, ordering)) {
            context.report({ node, messageId: 'noInjectBeforeOverride', data: { call: excerpt(context, node) } });
          }
        });
      },
    };
  },
});

/** `source$.subscribe(v => expect(v)…)` → `await expectEmission(source$)`. */
const noExpectInSubscribe = defineRule({
  name: 'no-expect-in-subscribe',
  description: 'Assert observables with expectEmission() instead of expect() inside a subscribe callback',
  messages: {
    invertible:
      'If `{{source}}` never emits, this callback never runs and the test passes having checked nothing ({{assertions}} inside). Await the value and assert on it: `expect(await firstValueFrom({{source}}))…`, or `await expectEmission({{source}})`, which names the source when nothing arrives.',
    afterTrigger:
      'The code after this subscription is what makes `{{source}}` emit, so `await firstValueFrom({{source}})` in its place would wait forever. Start the expectation first, run the trigger, then await it: `const emission = expectEmission({{source}});` … `await expect(emission).resolves.toEqual(…)` ({{assertions}} move below the await).',
    inErrorHandler:
      'This assertion sits in the `error` callback of `{{source}}`, so when the stream succeeds it never runs and the test passes anyway ({{assertions}} there). Assert on the rejection instead: `await expect(firstValueFrom({{source}})).rejects.toMatchObject(…)`.',
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
          const data = { source: excerpt(context, subscribeCall.callee.object, 40), assertions: plural(count, 'assertion') };
          const report = { node: subscribeCall, messageId: repair, data };

          context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
        });
      },
    };
  },
});

/** `export const fixture = { m: vi.fn() }` → `export const createFixture = () => ({ m: vi.fn() })`. */
const noSharedModuleLevelMock = defineRule({
  name: 'no-shared-module-level-mock',
  description: 'Export a factory that builds the shared double, not a module-level object holding vi.fn()s',
  messages: {
    noSharedModuleLevelMock:
      '`{{name}}` is built once when the module loads, so every spec that imports it shares the same spies, and calls recorded in one file show up in the next under `isolate: false`. Export a factory instead: `export const {{factory}} = () => ({ … })`.',
  },
  create: (context) => ({
    'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator': (node: EsVariableDeclarator): void => {
      if (node.init && buildsRunnerFnAtModuleScope(context, node.init)) {
        const name = bindingName(context, node.id);
        const factory = `create${name.charAt(0).toUpperCase()}${name.slice(1)}`;

        context.report({ node, messageId: 'noSharedModuleLevelMock', data: { name, factory } });
      }
    },
  }),
});

/** `let s: Mocked<Cart>` → `let s: Spy<Cart>`. */
const noMockedForSpy = defineRule({
  name: 'no-mocked-for-spy',
  description: 'Declare a spy as Spy<T>, not as Vitest’s Mocked<T>',
  fixable: true,
  hasSuggestions: true,
  messages: {
    noMockedForSpy:
      '`{{type}}` keeps the class’s private members, so assigning a spy to it fails with a list of private field names that hides the real problem. Declare `{{spy}}` instead.',
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
          const type = excerpt(context, node.parent);
          const data = { type, spy: type.replace(/^Mocked(Object)?/, 'Spy') };
          const mocked = findBinding(context.sourceCode.getScope(node), node.name);
          // A `Mocked` the file declares itself is not Vitest's, whatever it is called, and `Spy`
          // already meaning something else here is the same problem from the other end.
          const rewritable =
            (!mocked || mocked.defs.some((definition) => definition.type === 'ImportBinding')) &&
            namesOneType(node.parent) &&
            bindingState(context.sourceCode.getScope(node), 'Spy') !== 'taken';

          if (!rewritable) {
            context.report({ node, messageId: 'noMockedForSpy', data });

            return;
          }

          const fix = (fixer: EsFixer): EsFix[] => spyTypeFixes(context, fixer, node, mocked);

          context.report(
            rewritesTheWholeDeclaration(node, assignments)
              ? { node, messageId: 'noMockedForSpy', data, fix }
              : {
                  node,
                  messageId: 'noMockedForSpy',
                  data,
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

/**
 * Whether every mention of the parameter reads it the way a `TestContext` is read.
 *
 * Vitest passes the context as the first argument whether or not it is destructured, and
 * `it('x', (ctx) => ctx.skip())` is its own documentation's example — so a name is only a `done`
 * carried over from Jest where it is *called* (`done()`), handed to something that will call it
 * (`.subscribe(done)`, `setTimeout(done)`) or never used at all. A member read is the context being
 * used: `ctx.task`, `ctx.expect`, `ctx.onTestFinished`. Except `fail`, which the context has no
 * member for — that one is jasmine's failure channel and this rule's second message.
 */
function readsTheTestContext(context: RuleContext, callback: EsFunction, parameter: EsIdentifier): boolean {
  // The callback's own scope, not the chain above it: the parameter is declared right here, and a
  // name the scope manager does not know at all is a name nothing in the body mentions.
  const scope = context.sourceCode.getScope(callback);
  const references = scope.variables.flatMap((variable) => (variable.name === parameter.name ? variable.references : []));

  return (
    references.length > 0 &&
    references.every(({ identifier }) => {
      const member = identifier.parent;

      return isMemberExpression(member) && member.object === identifier && memberName(member) !== 'fail';
    })
  );
}

/** `it('x', (done) => …)` → `async` + an awaited assertion. */
const noDoneCallback = defineRule({
  name: 'no-done-callback',
  description: 'Vitest has no done callback — the first parameter of a test or hook is its TestContext',
  messages: {
    noDoneCallback:
      'Vitest passes a `TestContext` as `{{name}}`, not a `done` callback: calling it throws inside a promise nobody awaits, and the test passes having run almost none of its body. Make the callback `async` and await the result, e.g. `await firstValueFrom(source$)` or `await expectEmission(source$)`.',
    doneFail:
      '`{{call}}` throws `{{name}}.fail is not a function`, because Vitest’s `TestContext` has no `fail`, and it throws inside a callback nobody awaits, so the run stays green on the path meant to fail it. Assert on the failure with `await expect(promise).rejects…`, or write `expect.fail(message)` for a line that must not run.',
  },
  create: (context) => {
    // The functions whose first parameter has already been reported. `done.fail(…)` is only this
    // rule's business when `done` is one of those parameters — a `fail` method on anything else is
    // somebody's API — and the parameter is visited before the body, so the set is complete by then.
    const callbacks = new Set<EsNode>();

    return {
      'CallExpression[callee.name=/^(it|test|beforeAll|beforeEach|afterAll|afterEach)$/] > :matches(ArrowFunctionExpression, FunctionExpression)':
        (node: EsFunction): void => {
          // An identifier parameter, not a destructuring pattern: a `test.extend` fixture has to be
          // destructured, so a plain name here is either a `done` carried over from Jest or the
          // `TestContext` taken whole — and what the body does with it is what tells the two apart.
          const [parameter] = node.params;

          if (!parameter || !isIdentifier(parameter) || readsTheTestContext(context, node, parameter)) {
            return;
          }

          callbacks.add(node);
          context.report({ node: parameter, messageId: 'noDoneCallback', data: { name: parameter.name } });
        },
      'MemberExpression[property.name="fail"]': (node: EsMemberExpression): void => {
        if (isCallee(node) && isTestCallbackParameter(context, node.object, callbacks)) {
          context.report({
            node: node.parent,
            messageId: 'doneFail',
            data: { call: excerpt(context, node.parent), name: excerpt(context, node.object) },
          });
        }
      },
    };
  },
});

/** `p.then(() => expect(…))` as a statement of its own → `expect(await p)`. */
const noFloatingAssertion = defineRule({
  name: 'no-floating-assertion',
  description: 'Await or return a promise chain that asserts, instead of leaving the .then() callback floating',
  messages: {
    noFloatingAssertion:
      'Nothing awaits `{{chain}}`, so the test ends before its callback runs and this assertion never executes. Await the chain (or `return` it) and assert on the settled value: `expect(await promise)…`.',
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

      context.report({ node, messageId: 'noFloatingAssertion', data: { chain: excerpt(context, callback.parent, 50) } });
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

/** What a bare `calledWith` report quotes: the call, the method it stubs and its arguments. */
function calledWithData(context: RuleContext, node: EsCallExpression): Record<string, string> {
  const method = receiverOf(context, node);

  return { call: excerpt(context, node), method, args: argumentList(context, node) };
}

/** `spy.method.calledWith(1);` as a statement of its own → a stub nobody configured, asserting nothing. */
const noBareCalledWith = defineRule({
  name: 'no-bare-called-with',
  description: 'Continue a calledWith / mustBeCalledWith chain — on its own it configures nothing and asserts nothing',
  messages: {
    noBareCalledWith:
      '`{{call}}` is a stub, not an assertion: on its own it makes the method answer `undefined` for these arguments and checks nothing. Continue the chain with `.mockReturnValue(v)` / `.resolveWith(v)`, or assert with `expect({{method}}).toHaveBeenCalledWith({{args}})`.',
    noBareMustBeCalledWith:
      '`{{call}}` on its own rejects every call, the matching one included, because nothing was configured for these arguments. Continue the chain with `.mockReturnValue(v)` / `.resolveWith(v)`, or assert with `expect({{method}}).toHaveBeenCalledWith({{args}})`.',
  },
  // One selector per chain rather than one alternation and a branch: the two say different things,
  // and reading the name back off a node the selector already matched is a check that cannot fail.
  create: (context) => ({
    'ExpressionStatement > CallExpression[callee.property.name="calledWith"]': (node: EsCallExpression): void => {
      // The chai assertion shares the name and is a bare statement by design — see `rootsAtExpect`.
      if (!rootsAtExpect(node)) {
        context.report({ node, messageId: 'noBareCalledWith', data: calledWithData(context, node) });
      }
    },
    // No `rootsAtExpect` guard here, and that is not an oversight: chai's bundle has `calledWith`
    // and nothing named `mustBeCalledWith`, so there is no assertion of this name to mistake a stub
    // for. A guard would be a branch no input can take.
    'ExpressionStatement > CallExpression[callee.property.name="mustBeCalledWith"]': (node: EsCallExpression): void => {
      context.report({ node, messageId: 'noBareMustBeCalledWith', data: calledWithData(context, node) });
    },
  }),
});

/** `export const events = [...BaseEvents]` at module scope → a TypeError, or a silently empty object, while the bundle loads. */
const noImportTimeSpread = defineRule({
  name: 'no-import-time-spread',
  description: 'Do not spread an imported binding at module scope — inside a bundle it can still be undefined',
  hasSuggestions: true,
  messages: {
    noImportTimeSpread:
      'This spreads `{{name}}` from another module while this one is still loading. In a bundle that module’s chunk can run later, `{{name}}` is still `undefined`, and the spread throws `Spread syntax requires ...iterable[Symbol.iterator] to be a function` before any test runs. Build the value lazily, in a function called where it is read.',
    noImportTimeSpreadObject:
      'This spreads `{{name}}` from another module into an object while this one is still loading. In a bundle that module’s chunk can run later, and `{ ...undefined }` is `{}`, so every key reads `undefined` with no error. Build the value lazily, in a function called where it is read.',
  },
  create: (context) => ({
    SpreadElement: (node: EsSpreadElement): void => {
      const imported = spreadOfImport(context, node);

      if (!imported || !runsAtImportTime(node)) {
        return;
      }

      const suggestion = lazyValueSuggestion(context, node);
      const messageId = spreadFailureMode(node) === 'object' ? 'noImportTimeSpreadObject' : 'noImportTimeSpread';
      const report = { node, messageId, data: { name: imported.name } };

      context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
    },
  }),
});

/** `injectSpy(X)` for a token this file never registered as an auto-spy. */
const noUnregisteredInjectSpy = defineRule({
  name: 'no-unregistered-inject-spy',
  description: 'Do not read a token with injectSpy unless this file registered it as an auto-spy',
  messages: {
    noUnregisteredInjectSpy:
      'Nothing in this file registers `{{token}}` as an auto-spy, so `injectSpy({{token}})` returns what DI already had, usually the real service, and the first `.mockReturnValue(…)` on it throws. Add `provideAutoSpy({{token}})` to the providers.',
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
  'no-vacuous-absence-assertion': noVacuousAbsenceAssertion,
  'no-shared-module-level-mock': noSharedModuleLevelMock,
  'no-mocked-for-spy': noMockedForSpy,
  'prefer-as-spy': preferAsSpy,
  'no-done-callback': noDoneCallback,
  'no-floating-assertion': noFloatingAssertion,
  'no-bare-called-with': noBareCalledWith,
  'no-overridden-provider': noOverriddenProvider,
  'no-inject-before-override': noInjectBeforeOverride,
  'no-private-member-access': noPrivateMemberAccess,
  'no-reflect-member-access': noReflectMemberAccess,
  'no-dead-schemas': noDeadSchemas,
  'no-import-time-spread': noImportTimeSpread,
  'no-unregistered-inject-spy': noUnregisteredInjectSpy,
  'prefer-render-shallow': preferRenderShallow,
  'prefer-observer-stub': preferObserverStub,
  'no-hand-assigned-global': noHandAssignedGlobal,
  'prefer-stub-response': preferStubResponse,
  'prefer-settle-dynamic-import': preferSettleDynamicImport,
  'prefer-create-mock': preferCreateMock,
  'no-mock-cast': noMockCast,
  'prefer-provide-activated-route': preferProvideActivatedRoute,
  'no-stub-class-double': noStubClassDouble,
  'no-structural-double': noStructuralDouble,
  'no-passthrough-console-spy': noPassthroughConsoleSpy,
  'no-console-in-spec': noConsoleInSpec,
  'no-import-time-console-spies': noImportTimeConsoleSpies,
  'no-mistyped-use-value': noMistypedUseValue,
  'no-unknown-use-value-key': noUnknownUseValueKey,
  'no-instance-lifecycle-spy': noInstanceLifecycleSpy,
  'no-ts-expect-error-on-double': noTsExpectErrorOnDouble,
  'no-constant-expect': noConstantExpect,
  'no-compile-components': noCompileComponents,
  'no-redundant-mock-reset': noRedundantMockReset,
  'no-unasserted-argument': noUnassertedArgument,
  'no-sync-testbed-await': noSyncTestbedAwait,
  'no-redundant-smoke-test': noRedundantSmokeTest,
  'no-self-called-spy': noSelfCalledSpy,
  'prefer-set-inputs': preferSetInputs,
  'prefer-spy-on-own-method': preferSpyOnOwnMethod,
  ...jasmineRules,
};
