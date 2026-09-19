import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubResponse } from './network-stub';

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
    expect(await response.text()).toBe('');
  });

  it('serialises plain data as JSON and says so in the content type', async () => {
    const response = stubResponse({ body: { id: 1, tags: ['a'] } });

    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({ id: 1, tags: ['a'] });
  });

  it.each([[[1, 2]], [42], [false], [Object.assign(Object.create(null) as object, { id: 1 })]])('serialises %j as JSON', async (body) => {
    expect(await stubResponse({ body }).json()).toEqual(body);
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

  it('sends no body for null', async () => {
    expect(await stubResponse({ body: null }).text()).toBe('');
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
