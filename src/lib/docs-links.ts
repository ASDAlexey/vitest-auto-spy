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

const DOCS = 'https://asdalexey.github.io/vitest-auto-spy';

export const DOCS_LINKS = {
  angular: `${DOCS}/adapters/angular`,
  // Their own pages rather than anchors on `adapters/angular`: a reader who hits one of these arrived
  // from a failure, not from reading, and the page they want is the one about that check — not the
  // one about the adapter that hosts it.
  angularDiagnostics: `${DOCS}/adapters/angular-diagnostics`,
  angularHttp: `${DOCS}/adapters/angular-http`,
  angularOverrides: `${DOCS}/adapters/angular-overrides`,
  autoMockByType: `${DOCS}/core/auto-mock-by-type`,
  bunAngular: `${DOCS}/runtimes/bun-angular`,
  createSpyFromClass: `${DOCS}/core/create-spy-from-class`,
  constructorSpy: `${DOCS}/utilities/constructor-doubles`,
  controlHelpers: `${DOCS}/core/control-helpers`,
  eventLoop: `${DOCS}/utilities/event-loop`,
  fakeTimers: `${DOCS}/utilities/fake-timers`,
  installation: `${DOCS}/core/installation`,
  mediaElement: `${DOCS}/utilities/media-element`,
  moduleMocks: `${DOCS}/utilities/module-mocks`,
  nestjs: `${DOCS}/adapters/nestjs`,
  observerStubs: `${DOCS}/utilities/observer-stubs`,
  // The recipe for the one failure no spy library can work around: a binding the bundler already
  // inlined. Deep-linked to the section rather than the page, because the page's first half is
  // about the *silent* half of the same problem and the reader arriving here has the loud one.
  realSeam: `${DOCS}/utilities/module-mocks#provide-a-real-seam`,
  rxjs: `${DOCS}/runtimes/rxjs`,
  setup: `${DOCS}/utilities/setup`,
  // Its own page rather than a section of the factory's: the reader arriving here was thrown at by a
  // double they configured somewhere else entirely, and the question they have is what counts as
  // configured — which is the whole page, not a paragraph of another one.
  strictMode: `${DOCS}/core/strict-mode`,
  trackInjections: `${DOCS}/utilities/track-injections`,
} as const;

/** Append a "see also" line to a message, on its own line so a terminal keeps the URL clickable. */
export function withDocs(message: string, link: string): string {
  return `${message}\nDocs: ${link}`;
}
