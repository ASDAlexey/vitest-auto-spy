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
 *
 * **`fetch` is only half of the network.** jsdom implements `XMLHttpRequest` in full, and plenty of
 * libraries never left it: `rmp-vast` pings every VAST tracker through a hand-rolled
 * `XMLHttpRequest` (`FW.ajax`), so a suite driving an ad player kept reaching
 * `radiantmediaplayer.com` with `blockNetwork: true` already on — one ping per quartile, per ad,
 * per test. The cost is the one above under a different name: jsdom prints an `AggregateError at
 * Object.dispatchError` block for every connection that fails, so the output of a green run depends
 * on whether the machine has a route to the internet.
 *
 * The two callers want different answers, which is why {@link BlockNetworkOptions.xhr} takes a mode
 * rather than a boolean. Code that *reads* a response wants the failure branch, same as `fetch`. A
 * tracker ping wants silence: nothing asserts on its response, so failing it only trades one kind
 * of noise for another.
 */
import { mockValueProp } from './prop-mock';

/** Message carried by the rejection, kept greppable for whoever finds it in a failure. */
export const BLOCKED_FETCH_MESSAGE = '[vitest-auto-spy] fetch is stubbed in unit tests';

/**
 * The same marker for the XHR half.
 *
 * A blocked request carries no error object anywhere — the code under test gets an `error` event
 * and a `status` of `0` — so the message goes on `statusText`, the one string channel a failed
 * request has and one that is empty for a real network failure anyway. It is what turns "this
 * request mysteriously fails" into a name, in the debugger and in a snapshot alike.
 */
export const BLOCKED_XHR_MESSAGE = '[vitest-auto-spy] XMLHttpRequest is stubbed in unit tests';

/**
 * What a blocked `XMLHttpRequest` is answered with.
 *
 * - `'reject'` — the request fails: `readyState` 4, `status` 0, an `error` event. This mirrors the
 *   `fetch` half and is the default: the code under test takes its failure branch, which is the
 *   branch a unit test should be asserting on.
 * - `'empty'` — the request succeeds with status 200 and an empty body. For a request whose
 *   response nobody reads — an analytics beacon, a VAST tracker ping — where a failure only prints
 *   a different flavour of the noise it was meant to remove.
 */
export type XhrBlockMode = 'empty' | 'reject';

/** Which channels {@link blockNetwork} closes, and how. Every field defaults to blocking. */
export interface BlockNetworkOptions {
  /** Replace `fetch` with one that rejects. Default `true`. */
  fetch?: boolean;
  /** Divert `XMLHttpRequest`, and how to answer it — see {@link XhrBlockMode}. Default `'reject'`. */
  xhr?: XhrBlockMode | false;
  /**
   * Answer `navigator.sendBeacon` with `false` instead of sending. Default `true`, and a no-op
   * where the environment has none of its own (jsdom has none): installing one would hand the code
   * under test a capability this environment does not have, which is a larger change than the
   * request it was meant to stop.
   */
  beacon?: boolean;
}

/**
 * The `fetch` stub — one function for the run, not one per install.
 *
 * `setupAutoSpy({ blockNetwork: true })` installs it before every test, and the stub holds no state
 * of its own: everything it reports comes from the argument it is handed.
 */
const blockedFetch = (input: unknown): Promise<never> => {
  return Promise.reject(new Error(`${BLOCKED_FETCH_MESSAGE} — the code under test requested ${describeTarget(input)}`));
};

/** A beacon the browser refuses to queue answers `false`, and every caller in the wild ignores it. */
const blockedSendBeacon = (): boolean => false;

/**
 * Where a diverted request is pointed instead: an empty body the DOM implementation serves itself.
 *
 * `data:` is the one scheme jsdom answers in process (`living/xhr/xhr-utils.js`, the
 * `urlObj.protocol === 'data:'` branch), so the request completes with status 200 and an empty
 * body, in the tick order a real one would — and with no socket.
 */
const BLOCKED_REQUEST_URL = 'data:text/plain;charset=utf-8,';

/** `XMLHttpRequest.DONE`, spelled out so the failure path never has to read the global back. */
const XHR_DONE = 4;

/**
 * Whether serving this URL would stay inside the process.
 *
 * `data:` is the only scheme that answers with no socket, so it is the only one that passes. A
 * relative URL is deliberately *not* exempt: the DOM resolves it against the document origin, and
 * the request then depends on what happens to be listening on that port — a spec that reaches
 * `http://localhost:3000/config` and passes because nothing answers is exactly as accidental as one
 * that reaches a CDN.
 */
const isServedInProcess = (url: string): boolean => /^data:/i.test(url.trim());

/** The URL each request was *asked* for, before `open` diverted it — `send` needs the real one. */
const requestedUrls = new WeakMap<XMLHttpRequest, string>();

/**
 * The replacements currently installed, each with the mode its `send` reads.
 *
 * The mode is a cell rather than a captured value because the second install has to be able to
 * change it: `setupAutoSpy({ blockNetwork: { xhr: 'empty' } })` puts its stub in from the setup
 * file's `beforeEach`, which runs before the spec's own, so a spec calling `blockNetwork()` for the
 * failure branch used to get the silent empty 200 the setup had asked for — with nothing saying so.
 */
const installedXhrStubs = new WeakMap<object, { mode: XhrBlockMode }>();

/**
 * Close the network channels the environment implements, and report what the code under test asked
 * for.
 *
 * The URL travels with the failure because the usual reason to look at one is to find out which
 * dependency is unexpectedly talking to the network — and that is exactly what the stack alone does
 * not say.
 *
 * Installed through {@link mockValueProp}, so `restoreMockedProps()` puts the real members back.
 *
 * ```ts
 * beforeEach(() => {
 *   blockNetwork();                 // fetch rejects, XHR fails, sendBeacon answers false
 * });
 *
 * beforeEach(() => {
 *   blockNetwork({ xhr: 'empty' }); // …but answer XHR with a silent, empty 200
 * });
 * ```
 *
 * `WebSocket` and `EventSource` are deliberately left alone. They are constructors whose failure is
 * an event on an object the code under test keeps and reconnects, so there is no answer a blanket
 * stub could give that is not a behaviour change of its own — `stubConstructor(globalThis,
 * 'WebSocket', …)` is the tool for a spec that has one.
 */
export function blockNetwork(options: BlockNetworkOptions = {}): void {
  // Each patch is skipped where the stub is already the member, which is what makes the call
  // idempotent. It matters with `restoreProps: false`, where nothing ever takes the stubs off: the
  // per-test re-install then recorded another journal entry for `fetch` and `sendBeacon` on every
  // test, and the journal on `globalThis` grew for the whole run.
  if ((options.fetch ?? true) && globalThis.fetch !== blockedFetch && !isFetchIntercepted()) {
    mockValueProp(globalThis, 'fetch', blockedFetch);
  }

  const xhr = options.xhr ?? 'reject';

  if (xhr) {
    blockXhr(xhr);
  }

  if (options.beacon ?? true) {
    blockBeacon();
  }
}

// `@mswjs/interceptors` (MSW `setupServer`, nock 14) holds this symbol while applied; replacing its
// proxy would switch every handler off, since it captured the real `fetch` underneath itself.
function isFetchIntercepted(): boolean {
  return Symbol.for('fetch-interceptor') in globalThis;
}

/**
 * Divert `XMLHttpRequest` at both ends.
 *
 * `open` is where the diversion has to happen — by the time `send` runs, a URL that was let through
 * is already the request's own — and it is a hard floor: whatever `send` then decides, the only
 * address the real implementation ever holds is a local one. `send` decides what the code under
 * test *sees*, which is the half the mode names.
 */
function blockXhr(mode: XhrBlockMode): void {
  if (typeof globalThis.XMLHttpRequest === 'undefined') {
    return;
  }

  const { prototype } = globalThis.XMLHttpRequest;

  // A second install would take the first stub for the original and chain onto it: `open` would
  // record the already-diverted `data:` URL, and `send` would read it back as one to let through.
  // The stub in place stands until `restoreMockedProps()` takes it off — but it answers with the
  // mode of whoever asked last, which is the spec rather than the setup file.
  const installed = installedXhrStubs.get(prototype.open);

  if (installed) {
    installed.mode = mode;

    return;
  }

  const cell = { mode };
  const openRequest = prototype.open;
  const sendRequest = prototype.send;

  function open(
    this: XMLHttpRequest,
    method: string,
    url: URL | string,
    async = true,
    user?: string | null,
    password?: string | null,
  ): void {
    const requested = String(url);

    requestedUrls.set(this, requested);
    openRequest.call(this, method, isServedInProcess(requested) ? url : BLOCKED_REQUEST_URL, async, user, password);
  }

  function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    const requested = requestedUrls.get(this);

    // Nothing recorded means `send` was called without `open`. Let the real one raise the
    // `InvalidStateError` that says so, rather than answering a request that was never made.
    if (cell.mode === 'empty' || requested === undefined || isServedInProcess(requested)) {
      sendRequest.call(this, body);

      return;
    }

    failRequest(this, requested);
  }

  installedXhrStubs.set(open, cell);
  mockValueProp(prototype, 'open', open);
  mockValueProp(prototype, 'send', send);
}

/**
 * Answer a blocked request the way an unreachable host does, without asking the environment for it.
 *
 * Synthesising the failure rather than pointing the request at something that fails is what keeps
 * this the same under jsdom, happy-dom and whatever comes next: there is no URL every
 * implementation agrees to fail on, but every one of them dispatches events and reads its state off
 * the instance.
 *
 * That state is shadowed with own properties. `readyState` and its neighbours are prototype
 * accessors everywhere, so an own data property covers them for this one request — which is garbage
 * as soon as the test that made it is over, and is why none of this is registered for restoring.
 *
 * A microtask, not a timer: timers are frequently faked for a whole run, and a failure nothing
 * advances the clock for would never arrive. It is still late enough for a handler assigned on the
 * line after `send()`.
 */
function failRequest(request: XMLHttpRequest, url: string): void {
  queueMicrotask(() => {
    shadowProp(request, 'readyState', XHR_DONE);
    shadowProp(request, 'status', 0);
    shadowProp(request, 'statusText', `${BLOCKED_XHR_MESSAGE} — the code under test requested ${url}`);

    request.dispatchEvent(new Event('readystatechange'));
    request.dispatchEvent(new ProgressEvent('error'));
    request.dispatchEvent(new ProgressEvent('loadend'));
  });
}

/** Give one request its own value for a property the prototype exposes as a getter. */
function shadowProp(request: XMLHttpRequest, property: string, value: number | string): void {
  Object.defineProperty(request, property, { value, configurable: true });
}

/** Replace `sendBeacon`, but only where there is one to replace — see {@link BlockNetworkOptions.beacon}. */
function blockBeacon(): void {
  const beacon: unknown = globalThis.navigator?.sendBeacon;

  if (typeof beacon !== 'function' || beacon === blockedSendBeacon) {
    return;
  }

  mockValueProp(globalThis.navigator, 'sendBeacon', blockedSendBeacon);
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

/** What {@link stubResponse} builds a `Response` from. Every field is optional. */
export interface StubResponseInit {
  /**
   * A plain object, an array, a number, a boolean or `null` is sent as JSON with an
   * `application/json` content type; a string, `Blob`, `ArrayBuffer`, typed array, `FormData`,
   * `URLSearchParams` or `ReadableStream` is sent as it is. `undefined`, and an omitted `body`,
   * send no body at all.
   *
   * `null` is the JSON literal, not the absence of one — `.json()` answers `null`, the way it
   * answers `0`, `false`, `[]` and `{}` for their literals. A backend that reports "nothing here"
   * as a JSON `null` is a real shape, and a stub that could not express it was a trap rather than
   * a preference: every other falsy literal round-tripped, so nothing warned the reader that this
   * one would come back as an empty body whose `.json()` throws `Unexpected end of JSON input`.
   * There is one way to say "no body" and every caller already reaches for it, which is what
   * leaves `null` free to mean what it means in JSON.
   */
  body?: unknown;
  /** Default `200`, or `500` when `ok` is `false`. */
  status?: number;
  /** Shorthand for the status class; a `status` that disagrees with it throws. */
  ok?: boolean;
  statusText?: string;
  headers?: HeadersInit;
  /** What `response.url` reads — empty on a constructed `Response` otherwise. */
  url?: string;
}

/**
 * A real `Response` for a stubbed `fetch`, built from the environment's own constructor.
 *
 * ```ts
 * vi.spyOn(globalThis, 'fetch').mockResolvedValue(stubResponse({ body: { id: 1 } }));
 * vi.spyOn(globalThis, 'fetch').mockResolvedValue(stubResponse({ ok: false, status: 404 }));
 * ```
 */
export function stubResponse(init: StubResponseInit = {}): Response {
  if (typeof globalThis.Response !== 'function') {
    throw new TypeError('[vitest-auto-spy] stubResponse() needs a global Response, and this environment has none');
  }

  const status = init.status ?? (init.ok === false ? 500 : 200);
  const ok = status >= 200 && status < 300;

  if (init.ok !== undefined && init.ok !== ok) {
    throw new TypeError(`[vitest-auto-spy] stubResponse() was given ok: ${init.ok} with status ${status}, which is ${ok ? '' : 'not '}ok`);
  }

  const headers = new Headers(init.headers);
  const json = isJsonBody(init.body);

  // `null` is a body now — the JSON literal — and these three statuses carry none, so the
  // constructor would raise "Response with null body status cannot have body" about the one field
  // whose old meaning was the opposite. Said here instead, because that is the migration: a caller
  // who wrote `body: null` for "no body" has to drop the field, and no platform error says so.
  if (init.body === null && NULL_BODY_STATUSES.has(status)) {
    throw new TypeError(
      `[vitest-auto-spy] stubResponse() was given body: null with status ${status}, which carries no body — null is sent as the JSON literal, so omit body (or pass undefined) for no body at all`,
    );
  }

  if (json && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = new Response(json ? JSON.stringify(init.body) : toBodyInit(init.body), {
    status,
    headers,
    ...(init.statusText === undefined ? {} : { statusText: init.statusText }),
  });

  if (init.url !== undefined) {
    Object.defineProperty(response, 'url', { value: init.url, configurable: true });
  }

  return response;
}

/** The statuses the platform refuses a body on, so that `body: null` can name itself in the error. */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

// Decided by shape rather than `instanceof`: under a DOM environment a `Blob` or a `FormData` can
// come from another realm, and it is the plain data that needs serialising anyway. `null` is in
// the first line rather than falling through to `typeof body === 'object'`, which it satisfies —
// that fall-through is what used to send it as no body at all.
function isJsonBody(body: unknown): boolean {
  if (body === null || typeof body === 'number' || typeof body === 'boolean' || Array.isArray(body)) {
    return true;
  }

  if (typeof body !== 'object') {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(body);

  return prototype === Object.prototype || prototype === null;
}

function toBodyInit(body: unknown): BodyInit | null {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- anything that is not JSON data is handed to the constructor, which rejects what it cannot read.
  return (body ?? null) as BodyInit | null;
}
