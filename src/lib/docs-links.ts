/**
 * Documentation URLs used inside runtime messages.
 *
 * Every error and warning this package emits ends with a link to the page that explains it. The
 * audience is not only human: an AI coding agent reads a stack trace far more often than it reads
 * a README, and a message that names its own fix is the difference between the agent repairing the
 * test and the agent guessing. The same reasoning applies to a person seeing the failure at 2am.
 *
 * Keeping the URLs in one place also means a docs restructure is a single edit rather than a grep
 * across the library. One export per link, imported as a namespace: an object would carry the whole
 * catalogue into every entry that prints a single message.
 */
import { DOCS, DOCS_RXJS } from './message-link';

export const adoptMock = `${DOCS}/utilities/module-mocks#adoptmock-mock-options`;
// One per Angular message, so the link lands on the section about that failure.
export const angularComponentDefIntact = `${DOCS}/adapters/angular-overrides#assertcomponentdefintact-components`;
export const angularComponentStub = `${DOCS}/adapters/angular#a-stand-in-for-a-child-createcomponentstub`;
export const angularCreateWithAutoSpies = `${DOCS}/adapters/angular#building-a-class-with-auto-spied-dependencies`;
export const angularDeadSchemas = `${DOCS}/adapters/angular-diagnostics#deadschemas`;
export const angularDialog = `${DOCS}/adapters/angular#the-material-dialog-without-material-as-a-dependency`;
export const angularDirectiveApplied = `${DOCS}/adapters/angular#tohavedirectiveapplied`;
export const angularFixtures = `${DOCS}/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies`;
export const angularHttpController = `${DOCS}/adapters/angular-http#providehttptesting`;
export const angularHttpExpectRequest = `${DOCS}/adapters/angular-http#expectrequest-matcher-options`;
export const angularHttpNoRequest = `${DOCS}/adapters/angular-http#expectnorequest-matcher-options`;
export const angularHttpPending = `${DOCS}/adapters/angular-http#verifyonteardown`;
export const angularInjectSpyReal = `${DOCS}/adapters/angular#injectspy-says-when-it-got-the-real-thing`;
export const angularInputs = `${DOCS}/adapters/angular#changing-an-input-mid-test`;
export const angularInternals = `${DOCS}/adapters/angular#when-an-angular-internal-moves`;
export const angularKeepTemplate = `${DOCS}/adapters/angular#keeptemplate-and-a-declaration-an-ngmodule-owns`;
export const angularLocationDouble = `${DOCS}/adapters/angular-router#the-location-double`;
export const angularNgModuleScopes = `${DOCS}/adapters/angular-overrides#assertngmodulescopes-modules`;
export const angularNgModuleScopesAuto = `${DOCS}/adapters/angular-diagnostics#ngmodulescopes`;
export const angularOverrideApplied = `${DOCS}/adapters/angular-overrides#the-verification`;
export const angularOverrideLate = `${DOCS}/adapters/angular-overrides#overridecomponentprovider-component-class-config`;
export const angularPendingRequests = `${DOCS}/adapters/angular-diagnostics#pendingrequests`;
export const angularRouteDouble = `${DOCS}/adapters/angular-router#injectactivatedroute-injector`;
export const angularRouteWiring = `${DOCS}/adapters/angular-router#angular-s-own-route-checked-against-angular`;
export const angularRouterDouble = `${DOCS}/adapters/angular-router#what-the-router-double-does-not-do`;
export const angularRouterEvents = `${DOCS}/adapters/angular-router#collectrouterevents-events`;
export const angularRouterInject = `${DOCS}/adapters/angular-router#injectrouterdouble-injector`;
export const angularShadowedProviders = `${DOCS}/adapters/angular-diagnostics#shadowedproviders`;
export const angularEffects = `${DOCS}/adapters/angular#running-one-effect-on-demand`;
export const angularMockResource = `${DOCS}/adapters/angular#skipping-the-request-entirely-—-mockresourceprop`;
export const angularResources = `${DOCS}/adapters/angular#resources-httpresource-and-resource`;
export const angularSignalProp = `${DOCS}/adapters/angular#signal-readonly-property-mocking`;
export const angularStable = `${DOCS}/adapters/angular#zoneless-waiting`;
export const angularTrackRuns = `${DOCS}/adapters/angular#counting-recomputations-and-effect-runs`;
export const angularSplittingOff = `${DOCS}/adapters/angular#when-the-unit-test-build-has-code-splitting-off`;
export const angularUnreadResource = `${DOCS}/runtimes/bun-angular#a-template-or-stylesheet-that-cannot-be-read`;
export const autoMockByType = `${DOCS}/core/auto-mock-by-type`;
export const autoMockHeldBack = `${DOCS}/core/auto-mock-by-type#it-answers-everything-so-it-must-not-answer-these`;
export const bunAngular = `${DOCS}/runtimes/bun-angular`;
export const captureArg = `${DOCS}/recipes#an-argument-the-spec-cannot-spell`;
export const createSpyFromClass = `${DOCS}/core/create-spy-from-class`;
export const createSpyFromClassAccessorSpies = `${DOCS}/core/create-spy-from-class#accessor-spies-—-accessorspies`;
export const createSpyFromClassAccessors = `${DOCS}/core/create-spy-from-class#getterstospyon-accepts-a-signal-valued-getter`;
export const createSpyFromClassInstanceMethods = `${DOCS}/core/create-spy-from-class#instancemethodstospyon-—-callables-that-are-not-on-the-prototype`;
export const createSpyFromClassLazySpies = `${DOCS}/core/create-spy-from-class#lazy-spies-—-lazyspies`;
export const createSpyFromClassReturns = `${DOCS}/core/create-spy-from-class#returns-—-the-value-where-the-spy-is-built`;
export const mockConstructor = `${DOCS}/utilities/constructor-doubles#mockconstructor-factory-name`;
export const controlHelpers = `${DOCS}/core/control-helpers`;
export const mustBeCalledWith = `${DOCS}/core/control-helpers#what-a-mustbecalledwith-failure-prints`;
export const eventLoopUntil = `${DOCS}/utilities/event-loop#flusheventloopuntil-isdone-options`;
export const advanceTimers = `${DOCS}/utilities/fake-timers#advancetimers-ms`;
export const installationEntries = `${DOCS}/core/installation#entry-points`;
export const installationVitest = `${DOCS}/core/installation#vitest`;
export const installationBun = `${DOCS}/core/installation#bun`;
export const installationNode = `${DOCS}/core/installation#node-test`;
export const installationRstest = `${DOCS}/core/installation#rstest`;
export const jasmineAutoSpies = `${DOCS}/migrating-jasmine#the-auto-spies-api`;
export const jasmineClock = `${DOCS}/migrating-jasmine#clock-install-leaves-date-real`;
export const jasmineGlobals = `${DOCS}/migrating-jasmine#jasmine-s-own-globals`;
export const jasmineWithArgs = `${DOCS}/migrating-jasmine#three-withargs-strategies-have-no-argument-scoped-form`;
export const jasmineTimeout = `${DOCS}/migrating-jasmine#the-timeout-is-two-numbers-here`;
export const mediaElement = `${DOCS}/utilities/media-element`;
export const moduleMocksAssert = `${DOCS}/utilities/module-mocks#assertmocked-namespace-options`;
export const moduleMocksNoOp = `${DOCS}/utilities/module-mocks#the-two-ways-vi-mock-becomes-a-no-op`;
export const narrow = `${DOCS}/utilities/fixtures#narrow-value-predicate-—-the-branch-a-test-knows-it-got`;
export const nestUnitRefusals = `${DOCS}/adapters/nestjs#what-it-refuses-and-what-the-message-says`;
export const observableAssertions = `${DOCS}/core/observable-assertions`;
export const observableFailures = `${DOCS}/core/observable-assertions#failure-messages`;
export const observerStubsHandle = `${DOCS}/utilities/observer-stubs#the-handle`;
export const observerStubsInstall = `${DOCS}/utilities/observer-stubs#install-it-in-beforeeach-never-in-beforeall`;
// The recipe for the one failure no spy library can work around: a binding the bundler already
// inlined. Deep-linked to the section rather than the page, because the page's first half is
// about the *silent* half of the same problem and the reader arriving here has the loud one.
export const realSeam = `${DOCS}/utilities/module-mocks#provide-a-real-seam`;
export const rxjs = DOCS_RXJS;
export const nextWithValuesLate = `${DOCS_RXJS}#nextwith-pushes-nextwithvalues-republishes`;
export const setup = `${DOCS}/utilities/setup`;
// One per section of the setup page: every guard reports through it, and the page is long enough
// that a link to its top leaves the reader to find the section themselves.
export const setupCopies = `${DOCS}/utilities/setup#_2-one-copy-of-the-library-in-the-process`;
export const setupRestoreProps = `${DOCS}/utilities/setup#_1-restoring-patched-properties`;
export const setupTimers = `${DOCS}/utilities/setup#_4-cancelling-timers-that-outlive-their-file`;
export const setupAsyncLeaks = `${DOCS}/utilities/setup#with-vitest-4-1-s-detect-async-leaks`;
export const setupNetwork = `${DOCS}/utilities/setup#_5-keeping-the-run-off-the-network`;
export const setupStubResponse = `${DOCS}/utilities/setup#answering-a-stubbed-fetch-—-stubresponse`;
export const setupGlobals = `${DOCS}/utilities/setup#_7-naming-the-file-that-sealed-a-global`;
export const setupRejections = `${DOCS}/utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed`;
export const setupHookBudget = `${DOCS}/utilities/setup#_11-the-hook-budget-jest-had-only-one-of`;
export const setupFrozenClock = `${DOCS}/utilities/setup#_12-a-timeout-the-clock-explains-not-the-code`;
export const setupPrototype = `${DOCS}/utilities/setup#_15-the-key-on-object-prototype-that-stops-the-run-collecting`;
export const setupPrototypeEarlierFile = `${DOCS}/utilities/setup#the-key-an-earlier-file-left-behind`;
export const setupConsole = `${DOCS}/utilities/setup#_16-console-output-nothing-absorbed`;
export const setupDocument = `${DOCS}/utilities/setup#_17-an-attribute-left-on-the-shared-document`;
export const setupListeners = `${DOCS}/utilities/setup#_19-listeners-that-outlive-their-file`;
export const setupConcurrent = `${DOCS}/utilities/setup#under-test-concurrent`;
export const setupPerTest = `${DOCS}/utilities/setup#reinstalling-a-stub-for-every-test`;
export const setupWrongHook = `${DOCS}/utilities/setup#a-patch-put-in-the-wrong-hook-stops-applying`;
export const signalFormsCreate = `${DOCS}/adapters/signal-forms#the-injection-context-—-createform`;
export const signalFormsErrors = `${DOCS}/adapters/signal-forms#the-errors-—-tohavefielderrors`;
export const strictCall = `${DOCS}/core/strict-mode#the-message`;
export const strictModePassthrough = `${DOCS}/core/strict-mode#passthrough`;
export const strictModeSuite = `${DOCS}/core/strict-mode#turning-it-on-for-a-whole-suite`;
export const strictSwallowed = `${DOCS}/core/strict-mode#a-throw-that-never-reached-the-test`;
export const unconfiguredReads = `${DOCS}/core/strict-mode#reads-nobody-configured`;
export const trackInjectionsUntracked = `${DOCS}/utilities/track-injections#get-on-a-token-that-is-not-tracked`;
export const workerStub = `${DOCS}/utilities/worker-stub`;
export const workerStubRestored = `${DOCS}/utilities/worker-stub#the-stub-nobody-takes-off`;
export const zoneRequirements = `${DOCS}/utilities/zone#requirements`;
