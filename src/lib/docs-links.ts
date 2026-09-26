/**
 * Documentation URLs used inside runtime messages.
 *
 * Every error and warning this package emits ends with a link to the page that explains it. The
 * audience is not only human: an AI coding agent reads a stack trace far more often than it reads
 * a README, and a message that names its own fix is the difference between the agent repairing the
 * test and the agent guessing. The same reasoning applies to a person seeing the failure at 2am.
 *
 * Keeping the URLs in one place also means a docs restructure is a single edit rather than a grep
 * across the library. One export per link, imported as a namespace, each a plain literal: an object,
 * or a template on the base URL, is kept whole by the bundler in every entry that prints one message.
 */
export const adoptMock = 'https://asdalexey.github.io/vitest-auto-spy/utilities/module-mocks#adoptmock-mock-options';
// One per Angular message, so the link lands on the section about that failure.
export const angularComponentDefIntact =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-overrides#assertcomponentdefintact-components';
export const angularComponentStub =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#a-stand-in-for-a-child-createcomponentstub';
export const angularCreateWithAutoSpies =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#building-a-class-with-auto-spied-dependencies';
export const angularDeadSchemas = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#deadschemas';
export const angularDialog =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#the-material-dialog-without-material-as-a-dependency';
export const angularDirectiveApplied = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#tohavedirectiveapplied';
export const angularFixtures =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies';
export const angularHttpController = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-http#providehttptesting';
export const angularHttpExpectRequest = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-http#expectrequest-matcher-options';
export const angularHttpNoRequest = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-http#expectnorequest-matcher-options';
export const angularHttpPending = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-http#verifyonteardown';
export const angularInjectSpyReal =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#injectspy-says-when-it-got-the-real-thing';
export const angularInputs = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#changing-an-input-mid-test';
export const angularInternals = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#when-an-angular-internal-moves';
export const angularKeepTemplate =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#keeptemplate-and-a-declaration-an-ngmodule-owns';
export const angularLocationDouble = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-router#the-location-double';
export const angularNgModuleScopes = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-overrides#assertngmodulescopes-modules';
export const angularNgModuleScopesAuto = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#ngmodulescopes';
export const angularOverrideApplied = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-overrides#the-verification';
export const angularOverrideLate =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-overrides#overridecomponentprovider-component-class-config';
export const angularPendingRequests = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#pendingrequests';
export const angularRouteDouble = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-router#injectactivatedroute-injector';
export const angularRouteWiring =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-router#angular-s-own-route-checked-against-angular';
export const angularRouterDouble = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-router#what-the-router-double-does-not-do';
export const angularRouterEvents = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-router#collectrouterevents-events';
export const angularRouterInject = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-router#injectrouterdouble-injector';
export const angularShadowedProviders = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#shadowedproviders';
export const angularEffects = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#running-one-effect-on-demand';
export const angularMockResource =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#skipping-the-request-entirely-—-mockresourceprop';
export const angularResources = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#resources-httpresource-and-resource';
export const angularSignalProp = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#signal-readonly-property-mocking';
export const angularStable = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#zoneless-waiting';
export const angularTypedElements = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#typed-elements-under-a-strict-lint';
export const angularTrackRuns = 'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#counting-recomputations-and-effect-runs';
export const angularSplittingOff =
  'https://asdalexey.github.io/vitest-auto-spy/adapters/angular#when-the-unit-test-build-has-code-splitting-off';
export const angularUnreadResource =
  'https://asdalexey.github.io/vitest-auto-spy/runtimes/bun-angular#a-template-or-stylesheet-that-cannot-be-read';
export const autoMockByType = 'https://asdalexey.github.io/vitest-auto-spy/core/auto-mock-by-type';
export const autoMockHeldBack =
  'https://asdalexey.github.io/vitest-auto-spy/core/auto-mock-by-type#it-answers-everything-so-it-must-not-answer-these';
export const bunAngular = 'https://asdalexey.github.io/vitest-auto-spy/runtimes/bun-angular';
export const captureArg = 'https://asdalexey.github.io/vitest-auto-spy/recipes#an-argument-the-spec-cannot-spell';
export const createSpyFromClass = 'https://asdalexey.github.io/vitest-auto-spy/core/create-spy-from-class';
export const createSpyFromClassAccessorSpies =
  'https://asdalexey.github.io/vitest-auto-spy/core/create-spy-from-class#accessor-spies-—-accessorspies';
export const createSpyFromClassAccessors =
  'https://asdalexey.github.io/vitest-auto-spy/core/create-spy-from-class#getterstospyon-accepts-a-signal-valued-getter';
export const createSpyFromClassInstanceMethods =
  'https://asdalexey.github.io/vitest-auto-spy/core/create-spy-from-class#instancemethodstospyon-—-callables-that-are-not-on-the-prototype';
export const createSpyFromClassLazySpies = 'https://asdalexey.github.io/vitest-auto-spy/core/create-spy-from-class#lazy-spies-—-lazyspies';
export const createSpyFromClassLiveDomNode = 'https://asdalexey.github.io/vitest-auto-spy/core/create-spy-from-class#live-dom-node';
export const createSpyFromClassReturns =
  'https://asdalexey.github.io/vitest-auto-spy/core/create-spy-from-class#returns-—-the-value-where-the-spy-is-built';
export const mockConstructor = 'https://asdalexey.github.io/vitest-auto-spy/utilities/constructor-doubles#mockconstructor-factory-name';
export const controlHelpers = 'https://asdalexey.github.io/vitest-auto-spy/core/control-helpers';
export const mustBeCalledWith = 'https://asdalexey.github.io/vitest-auto-spy/core/control-helpers#what-a-mustbecalledwith-failure-prints';
export const eventLoopUntil = 'https://asdalexey.github.io/vitest-auto-spy/utilities/event-loop#flusheventloopuntil-isdone-options';
export const advanceTimers = 'https://asdalexey.github.io/vitest-auto-spy/utilities/fake-timers#advancetimers-ms';
export const installationEntries = 'https://asdalexey.github.io/vitest-auto-spy/core/installation#entry-points';
export const installationVitest = 'https://asdalexey.github.io/vitest-auto-spy/core/installation#vitest';
export const installationBun = 'https://asdalexey.github.io/vitest-auto-spy/core/installation#bun';
export const installationNode = 'https://asdalexey.github.io/vitest-auto-spy/core/installation#node-test';
export const installationRstest = 'https://asdalexey.github.io/vitest-auto-spy/core/installation#rstest';
export const jasmineAutoSpies = 'https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#the-auto-spies-api';
export const jasmineClock = 'https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#clock-install-leaves-date-real';
export const jasmineGlobals = 'https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#jasmine-s-own-globals';
export const jasmineWithArgs =
  'https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#three-withargs-strategies-have-no-argument-scoped-form';
export const jasmineTimeout = 'https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine#the-timeout-is-two-numbers-here';
export const mediaElement = 'https://asdalexey.github.io/vitest-auto-spy/utilities/media-element';
export const moduleMocksAssert = 'https://asdalexey.github.io/vitest-auto-spy/utilities/module-mocks#assertmocked-namespace-options';
export const moduleMocksNoOp = 'https://asdalexey.github.io/vitest-auto-spy/utilities/module-mocks#the-two-ways-vi-mock-becomes-a-no-op';
export const narrow =
  'https://asdalexey.github.io/vitest-auto-spy/utilities/fixtures#narrow-value-predicate-—-the-branch-a-test-knows-it-got';
export const nestUnitRefusals = 'https://asdalexey.github.io/vitest-auto-spy/adapters/nestjs#what-it-refuses-and-what-the-message-says';
export const observableAssertions = 'https://asdalexey.github.io/vitest-auto-spy/core/observable-assertions';
export const observableFailures = 'https://asdalexey.github.io/vitest-auto-spy/core/observable-assertions#failure-messages';
export const observerStubsHandle = 'https://asdalexey.github.io/vitest-auto-spy/utilities/observer-stubs#the-handle';
export const observerStubsInstall =
  'https://asdalexey.github.io/vitest-auto-spy/utilities/observer-stubs#install-it-in-beforeeach-never-in-beforeall';
// The recipe for the one failure no spy library can work around: a binding the bundler already
// inlined. Deep-linked to the section rather than the page, because the page's first half is
// about the *silent* half of the same problem and the reader arriving here has the loud one.
export const realSeam = 'https://asdalexey.github.io/vitest-auto-spy/utilities/module-mocks#provide-a-real-seam';
export const rxjs = 'https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs';
export const nextWithValuesLate = 'https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs#nextwith-pushes-nextwithvalues-republishes';
export const setup = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup';
// One per section of the setup page: every guard reports through it, and the page is long enough
// that a link to its top leaves the reader to find the section themselves.
export const setupCopies = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_2-one-copy-of-the-library-in-the-process';
export const setupRestoreProps = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_1-restoring-patched-properties';
export const setupTimers = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_4-cancelling-timers-that-outlive-their-file';
export const setupAsyncLeaks = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#with-vitest-4-1-s-detect-async-leaks';
export const setupNetwork = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_5-keeping-the-run-off-the-network';
export const setupStubResponse = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#answering-a-stubbed-fetch-—-stubresponse';
export const setupGlobals = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_7-naming-the-file-that-sealed-a-global';
export const setupRejections = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed';
export const setupHookBudget = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_11-the-hook-budget-jest-had-only-one-of';
export const setupFrozenClock = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_12-a-timeout-the-clock-explains-not-the-code';
export const setupPrototype =
  'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_15-the-key-on-object-prototype-that-stops-the-run-collecting';
export const setupPrototypeEarlierFile = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#the-key-an-earlier-file-left-behind';
export const setupConsole = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_16-console-output-nothing-absorbed';
export const setupDocument = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_17-an-attribute-left-on-the-shared-document';
export const setupListeners = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_19-listeners-that-outlive-their-file';
export const setupConcurrent = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#under-test-concurrent';
export const setupPerTest = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#reinstalling-a-stub-for-every-test';
export const setupPerFile = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#the-hooks-belong-to-the-file-this-call-ran-in';
export const setupWrongHook = 'https://asdalexey.github.io/vitest-auto-spy/utilities/setup#a-patch-put-in-the-wrong-hook-stops-applying';
export const signalFormsCreate = 'https://asdalexey.github.io/vitest-auto-spy/adapters/signal-forms#the-injection-context-—-createform';
export const signalFormsErrors = 'https://asdalexey.github.io/vitest-auto-spy/adapters/signal-forms#the-errors-—-tohavefielderrors';
export const strictCall = 'https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#the-message';
export const strictModePassthrough = 'https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#passthrough';
export const strictModeSuite = 'https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#turning-it-on-for-a-whole-suite';
export const strictSwallowed = 'https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#a-throw-that-never-reached-the-test';
export const unconfiguredReads = 'https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#reads-nobody-configured';
export const trackInjectionsUntracked =
  'https://asdalexey.github.io/vitest-auto-spy/utilities/track-injections#get-on-a-token-that-is-not-tracked';
export const workerStub = 'https://asdalexey.github.io/vitest-auto-spy/utilities/worker-stub';
export const workerStubRestored = 'https://asdalexey.github.io/vitest-auto-spy/utilities/worker-stub#the-stub-nobody-takes-off';
export const zoneRequirements = 'https://asdalexey.github.io/vitest-auto-spy/utilities/zone#requirements';
