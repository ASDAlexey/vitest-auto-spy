import { afterEach, describe, expect, it, vi } from 'vitest';

import { type StubResponseInit, stubResponse } from './network-stub';

/**
 * The bodies whose `json()` answers, as one table.
 *
 * It is a table rather than a handful of cases because the defect it now pins was a *gap* in it:
 * `null` used to be sent as no body at all, so it was the one JSON literal that did not round-trip
 * while `0`, `false`, `[]` and `{}` all did — and a reader who had seen those work had no reason
 * to expect it. Keeping every literal in one list is what makes the next such gap visible.
 *
 * A `Response` body can be read once, so each row is read from a `stubResponse` of its own.
 */
const JSON_BODIES: readonly (readonly [name: string, init: StubResponseInit, text: string, json: unknown])[] = [
  ['null, the JSON literal', { body: null }, 'null', null],
  ['a number', { body: 0 }, '0', 0],
  ['a boolean', { body: false }, 'false', false],
  ['an empty array', { body: [] }, '[]', []],
  ['an empty object', { body: {} }, '{}', {}],
  ['a populated array', { body: [1, 2] }, '[1,2]', [1, 2]],
  ['a null-prototype object', { body: Object.assign(Object.create(null) as object, { id: 1 }) }, '{"id":1}', { id: 1 }],
];

/** The bodies that carry no JSON, so `json()` rejects — none of them reaches the JSON branch. */
const NON_JSON_BODIES: readonly (readonly [name: string, init: StubResponseInit, text: string])[] = [
  ['undefined', { body: undefined }, ''],
  ['an omitted body', {}, ''],
  ['an empty string', { body: '' }, ''],
  ['a string', { body: 'plain' }, 'plain'],
];

describe('stubResponse', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds a real Response the environment itself would hand back', () => {
    expect(stubResponse()).toBeInstanceOf(Response);
  });

  it('answers 200 with no body when given nothing', async () => {
    const response = stubResponse();

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBeNull();
    expect(await response.text()).toBe('');
  });

  it('serialises plain data as JSON and says so in the content type', async () => {
    const response = stubResponse({ body: { id: 1, tags: ['a'] } });

    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({ id: 1, tags: ['a'] });
  });

  it.each(JSON_BODIES)('serialises %s as JSON, and says so in the content type', async (_name, init, text, json) => {
    expect(stubResponse(init).headers.get('content-type')).toBe('application/json');
    expect(await stubResponse(init).text()).toBe(text);
    expect(await stubResponse(init).json()).toEqual(json);
  });

  it.each(NON_JSON_BODIES)('sends %s as it is, with a json() that rejects', async (_name, init, text) => {
    // Not a fixed content type: for a string body the constructor sets its own, and the
    // implementations disagree about it — `text/plain;charset=UTF-8` under Node, none under
    // happy-dom. What this stub is answerable for is only that it did not claim JSON for a body it
    // did not serialise.
    expect(stubResponse(init).headers.get('content-type')).not.toBe('application/json');
    expect(await stubResponse(init).text()).toBe(text);
    // The message, not `SyntaxError`: the body is parsed by Node's `Response`, so the error comes
    // from Node's realm, while `SyntaxError` in a jsdom suite is the window's own. `instanceof`
    // reads false across that boundary — which is a property of the environment, not of the stub.
    await expect(stubResponse(init).json()).rejects.toThrow(/JSON/);
  });

  it('tells null apart from no body at all', async () => {
    // The pair the old contract could not separate: both sent an empty body, so `.json()` threw on
    // the literal a backend really does answer for "nothing here" — an empty login, an absent
    // profile. `undefined` is the way to say "no body", and it is the one every caller reaches for.
    expect(await stubResponse({ body: null }).text()).toBe('null');
    expect(await stubResponse({ body: null }).json()).toBeNull();
    expect(await stubResponse({ body: undefined }).text()).toBe('');
  });

  it('names body: null on a status that carries no body, rather than letting the constructor do it', () => {
    // Without this the platform raises "Response with null body status cannot have body" about a
    // field whose old meaning was the opposite of a body — the one migration this change asks for.
    expect(() => stubResponse({ body: null, status: 204 })).toThrow('was given body: null with status 204, which carries no body');
    expect(() => stubResponse({ body: null, status: 304 })).toThrow('omit body (or pass undefined) for no body at all');
    expect(stubResponse({ status: 204 }).status).toBe(204);
  });

  it('keeps a content type the caller set', () => {
    const response = stubResponse({ body: { id: 1 }, headers: { 'Content-Type': 'application/problem+json' } });

    expect(response.headers.get('content-type')).toBe('application/problem+json');
  });

  it('sends a string as it is rather than as a JSON string', async () => {
    const response = stubResponse({ body: '<svg/>', headers: { 'content-type': 'image/svg+xml' } });

    expect(await response.text()).toBe('<svg/>');
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('hands a Blob, bytes or search params to the constructor untouched', async () => {
    // A Blob from the constructor's own realm: jsdom's `Blob` is not one Node's `Response` can read.
    const blob = await new Response('blob').blob();

    expect(await stubResponse({ body: blob }).text()).toBe('blob');
    expect(await stubResponse({ body: new TextEncoder().encode('bytes') }).text()).toBe('bytes');
    expect(await stubResponse({ body: new URLSearchParams({ q: '1' }) }).text()).toBe('q=1');
  });

  it('turns ok: false into a 500 when no status is given', () => {
    const response = stubResponse({ ok: false });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });

  it('takes the status and status text it is given', () => {
    const response = stubResponse({ ok: false, status: 404, statusText: 'Not Found' });

    expect(response.status).toBe(404);
    expect(response.statusText).toBe('Not Found');
  });

  it('accepts ok: true next to a status that agrees with it', () => {
    expect(stubResponse({ ok: true, status: 201 }).status).toBe(201);
  });

  it('refuses an ok that disagrees with the status', () => {
    expect(() => stubResponse({ ok: true, status: 404 })).toThrow('was given ok: true with status 404, which is not ok');
    expect(() => stubResponse({ ok: false, status: 204 })).toThrow('was given ok: false with status 204, which is ok');
  });

  it('reports the url it was given, and the empty one a constructed Response has otherwise', () => {
    expect(stubResponse({ url: 'https://api.example.test/user' }).url).toBe('https://api.example.test/user');
    expect(stubResponse().url).toBe('');
  });

  it('can be read only once, like the Response it is', async () => {
    const response = stubResponse({ body: { id: 1 } });

    await response.json();

    await expect(response.json()).rejects.toThrow();
  });

  it('serves a stubbed fetch without a cast', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => stubResponse({ body: { name: 'Ada' } }));

    const first = await fetch('https://api.example.test/user');
    const second = await fetch('https://api.example.test/user');

    expect(await first.json()).toEqual({ name: 'Ada' });
    expect(await second.json()).toEqual({ name: 'Ada' });
  });

  it('names the missing constructor where the environment has no Response', () => {
    vi.stubGlobal('Response', undefined);

    expect(() => stubResponse()).toThrow('stubResponse() needs a global Response');
  });
});
