/**
 * Documentation URLs used inside runtime messages.
 *
 * Every error and warning this package emits ends with a link to the page that explains it. The
 * audience is not only human: an AI coding agent reads a stack trace far more often than it reads
 * a README, and a message that names its own fix is the difference between the agent repairing the
 * test and the agent guessing. The same reasoning applies to a person seeing the failure at 2am.
 *
 * Keeping the URLs in one place also means a docs restructure is a single edit rather than a grep
 * across the library.
 */
import { DOCS, DOCS_RXJS } from './message-link';

export { withDocs } from './message-link';

export const DOCS_LINKS = {
  angular: `${DOCS}/adapters/angular`,
  // Their own pages rather than anchors on `adapters/angular`: a reader who hits one of these arrived
  // from a failure, not from reading, and the page they want is the one about that check — not the
  // one about the adapter that hosts it.
  angularDiagnostics: `${DOCS}/adapters/angular-diagnostics`,
  angularHttp: `${DOCS}/adapters/angular-http`,
  angularOverrides: `${DOCS}/adapters/angular-overrides`,
  angularRouter: `${DOCS}/adapters/angular-router`,
  autoMockByType: `${DOCS}/core/auto-mock-by-type`,
  bunAngular: `${DOCS}/runtimes/bun-angular`,
  createSpyFromClass: `${DOCS}/core/create-spy-from-class`,
  constructorSpy: `${DOCS}/utilities/constructor-doubles`,
  controlHelpers: `${DOCS}/core/control-helpers`,
  eventLoop: `${DOCS}/utilities/event-loop`,
  fakeTimers: `${DOCS}/utilities/fake-timers`,
  installation: `${DOCS}/core/installation`,
  // The migration guide, not an adapter page: everything that reports through this link is a jasmine
  // idiom that has no exact counterpart here, and that page is where the counterparts are listed.
  jasmine: `${DOCS}/migrating-jasmine`,
  mediaElement: `${DOCS}/utilities/media-element`,
  moduleMocks: `${DOCS}/utilities/module-mocks`,
  nestjs: `${DOCS}/adapters/nestjs`,
  observableAssertions: `${DOCS}/core/observable-assertions`,
  observerStubs: `${DOCS}/utilities/observer-stubs`,
  // The recipe for the one failure no spy library can work around: a binding the bundler already
  // inlined. Deep-linked to the section rather than the page, because the page's first half is
  // about the *silent* half of the same problem and the reader arriving here has the loud one.
  realSeam: `${DOCS}/utilities/module-mocks#provide-a-real-seam`,
  rxjs: DOCS_RXJS,
  setup: `${DOCS}/utilities/setup`,
  signalForms: `${DOCS}/adapters/signal-forms`,
  // Its own page rather than a section of the factory's: the reader arriving here was thrown at by a
  // double they configured somewhere else entirely, and the question they have is what counts as
  // configured — which is the whole page, not a paragraph of another one.
  strictMode: `${DOCS}/core/strict-mode`,
  unconfiguredReads: `${DOCS}/core/strict-mode#reads-nobody-configured`,
  trackInjections: `${DOCS}/utilities/track-injections`,
} as const;
