/**
 * Keeping a unit-test run off the network.
 *
 * jsdom ships no `fetch`, so under it a component that reaches for a remote asset is inert and the
 * suite never notices. happy-dom implements it, and the same component starts issuing real
 * requests — an icon loader pulling every SVG from a CDN, a config service polling an endpoint.
 * The tests still pass, because whatever they assert does not depend on the response. The *run*
 * does not:
 *
 * ```text
 *  Test Files  260 passed (260)
 *       Tests  2257 passed (2257)
 *
 * Vitest caught 8 unhandled errors during the test run.
 * DOMException [AbortError]: The operation was aborted.
 * ```
 *
 * The runner aborts whatever is still in flight when it tears the environment down, and those
 * aborts arrive as unhandled rejections after the summary is printed. A run in which every single
 * test is green exits with code 1, and the report names no test — because no test failed.
 *
 * A stub that rejects immediately fixes both halves. Nothing leaves the machine, so the run stops
 * depending on a host being reachable, and the code under test takes exactly the branch it would
 * have taken for a failed request — which is the branch a unit test should be exercising anyway.
 * A spec that genuinely wants `fetch` replaces it as before; this is a floor, not a ceiling.
 */
import { mockValueProp } from './prop-mock';

/** Message carried by the rejection, kept greppable for whoever finds it in a failure. */
export const BLOCKED_FETCH_MESSAGE = '[vitest-auto-spy] fetch is stubbed in unit tests';

/**
 * Replace `fetch` with one that rejects, and report what the code under test asked for.
 *
 * The URL goes into the error because the usual reason to look at this message is to find out which
 * dependency is unexpectedly talking to the network — and that is exactly what the stack alone
 * does not say.
 *
 * Installed through {@link mockValueProp}, so `restoreMockedProps()` puts the real `fetch` back.
 *
 * ```ts
 * beforeEach(() => {
 *   blockNetwork();
 * });
 * ```
 */
export function blockNetwork(): void {
  mockValueProp(globalThis, 'fetch', (input: unknown): Promise<never> => {
    return Promise.reject(new Error(`${BLOCKED_FETCH_MESSAGE} — the code under test requested ${describeTarget(input)}`));
  });
}

/**
 * Name what was requested, whatever `fetch` was handed.
 *
 * The argument is a string, a `URL`, or a `Request` — and under a DOM environment it can be a
 * `Request` from a different realm, which `instanceof` would miss. Reading the `url` property when
 * one is there covers all three without asking what the value claims to be.
 */
function describeTarget(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }

  const url: unknown = typeof input === 'object' && input !== null ? Reflect.get(input, 'url') : undefined;

  return String(url ?? input);
}
