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
import { noVacuousAbsenceAssertion } from './absence-assertion';
import { noUnassertedArgument } from './called-arguments';
import { noCompileComponents } from './compile-components';
import { noConsoleInSpec, noImportTimeConsoleSpies, noPassthroughConsoleSpy } from './console-rules';
import { noConstantExpect } from './constant-expect';
import { preferCreateSpyFromClass } from './create-spy-from-class';
import { noDeadSchemas } from './dead-schemas';
import { noStructuralDouble } from './declared-double';
import { preferSettleDynamicImport } from './dynamic-import';
import { noMockCast, preferCreateMock } from './fixture-casts';
import { noHandAssignedGlobal } from './global-assignment';
import { preferAsSpy } from './injected-spy';
import { jasmineRules } from './jasmine-rules';
import { noInstanceLifecycleSpy } from './lifecycle-spy';
import { noMistypedUseValue } from './mistyped-use-value';
import { noRedundantMockReset } from './mock-reset';
import { noBareCalledWith } from './no-bare-called-with';
import { noDoneCallback } from './no-done-callback';
import { noExpectInSubscribe } from './no-expect-in-subscribe';
import { noFloatingAssertion } from './no-floating-assertion';
import { noImportTimeSpread } from './no-import-time-spread';
import { noInjectBeforeOverride } from './no-inject-before-override';
import { noMockedForSpy } from './no-mocked-for-spy';
import { noObjectDefineProperty } from './no-object-define-property';
import { noSharedModuleLevelMock } from './no-shared-module-level-mock';
import { noUnregisteredInjectSpy } from './no-unregistered-inject-spy';
import { preferObserverStub } from './observer-stub';
import { noOverriddenProvider } from './overridden-provider';
import { preferInjectSpy } from './prefer-inject-spy';
import { preferRenderShallow } from './prefer-render-shallow';
import { noPrivateMemberAccess } from './private-access';
import { preferProvideAutoSpy } from './provide-auto-spy';
import { noReflectMemberAccess } from './reflect-access';
import { preferProvideActivatedRoute } from './route-double';
import type { RuleModule } from './rule-types';
import { noSelfCalledSpy } from './self-called-spy';
import { preferSetInputs } from './set-inputs';
import { noRedundantSmokeTest } from './smoke-test';
import { preferSpyOnOwnMethod } from './spy-on-own-method';
import { noStubClassDouble } from './stub-class';
import { preferStubResponse } from './stub-response';
import { noSyncTestbedAwait } from './testbed-await';
import { noTsExpectErrorOnDouble } from './ts-expect-error-on-double';
import { noUnknownUseValueKey } from './unknown-use-value-key';

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
