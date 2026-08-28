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
  observerStubs: `${DOCS}/utilities/observer-stubs`,
  rxjs: `${DOCS}/runtimes/rxjs`,
  setup: `${DOCS}/utilities/setup`,
} as const;

/** Append a "see also" line to a message, on its own line so a terminal keeps the URL clickable. */
export function withDocs(message: string, link: string): string {
  return `${message}\nDocs: ${link}`;
}
