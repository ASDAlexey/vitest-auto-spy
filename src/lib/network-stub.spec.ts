import { afterEach, describe, expect, it, vi } from 'vitest';

import '../index';
import { BLOCKED_FETCH_MESSAGE, BLOCKED_XHR_MESSAGE, blockNetwork } from './network-stub';
import { mockValueProp, restoreMockedProps } from './prop-mock';

/** Drive a request to whatever end it reaches, and report which one that was. */
function request(url: string, open: (xhr: XMLHttpRequest) => void = (xhr) => xhr.open('GET', url)): Promise<string> {
  const xhr = new XMLHttpRequest();

  return new Promise<string>((resolve) => {
    xhr.addEventListener('load', () => resolve(`load ${xhr.status} ${JSON.stringify(xhr.responseText)}`));
    xhr.addEventListener('error', () => resolve(`error ${xhr.status} ${xhr.statusText}`));
    open(xhr);
    xhr.send();
  });
}

/** A fixture served by the DOM itself, and the one shape of URL that is let through. */
const DATA_URL = 'data:text/plain;charset=utf-8,hello';

describe('blockNetwork', () => {
  afterEach(() => {
    restoreMockedProps();
    vi.unstubAllGlobals();
  });

  describe('fetch', () => {
    it('rejects a string URL and reports it', async () => {
      blockNetwork();

      await expect(fetch('https://cdn.example.test/sprite.svg')).rejects.toThrow(
        `${BLOCKED_FETCH_MESSAGE} — the code under test requested https://cdn.example.test/sprite.svg`,
      );
    });

    it('reports the url of a Request-like argument', async () => {
      blockNetwork();

      await expect(fetch({ url: 'https://api.example.test/config' } as unknown as Request)).rejects.toThrow(/api\.example\.test\/config/);
    });

    it('still rejects when there is nothing to name', async () => {
      blockNetwork();

      await expect(fetch(undefined as unknown as string)).rejects.toThrow(BLOCKED_FETCH_MESSAGE);
    });

    it('installs one and the same stub, however many tests install it', () => {
      blockNetwork();

      const first = globalThis.fetch;

      restoreMockedProps();
      blockNetwork();

      // The stub carries no state, so `setupAutoSpy({ blockNetwork: true })` allocating a fresh
      // closure before every test of the run bought nothing.
      expect(globalThis.fetch).toBe(first);
    });

    it('gives the real fetch back through restoreMockedProps', () => {
      const real = globalThis.fetch;

      blockNetwork();

      expect(globalThis.fetch).not.toBe(real);

      restoreMockedProps();

      expect(globalThis.fetch).toBe(real);
    });

    it('leaves fetch alone when only the other channels are asked for', () => {
      const real = globalThis.fetch;

      blockNetwork({ fetch: false });

      expect(globalThis.fetch).toBe(real);
    });
  });

  describe('XMLHttpRequest', () => {
    it('fails a request that would leave the machine, naming what it asked for', async () => {
      blockNetwork();

      const outcome = await request('https://tracker.example.test/ping.gif?type=impression');

      expect(outcome).toBe(
        `error 0 ${BLOCKED_XHR_MESSAGE} — the code under test requested https://tracker.example.test/ping.gif?type=impression`,
      );
    });

    it('leaves the request in the state a real network failure leaves it', async () => {
      blockNetwork();

      const xhr = new XMLHttpRequest();

      await new Promise<void>((resolve) => {
        xhr.addEventListener('loadend', () => resolve());
        xhr.open('GET', 'https://tracker.example.test/ping.gif');
        xhr.send();
      });

      expect(xhr.readyState).toBe(XMLHttpRequest.DONE);
      expect(xhr.status).toBe(0);
    });

    it('lets a data: fixture through — that is what a spec serves its own payload from', async () => {
      blockNetwork();

      expect(await request(DATA_URL)).toBe('load 200 "hello"');
    });

    it('answers with a silent empty 200 when that is the mode', async () => {
      blockNetwork({ xhr: 'empty' });

      expect(await request('https://tracker.example.test/ping.gif')).toBe('load 200 ""');
    });

    it('passes the remaining open() arguments on, however few of them there are', async () => {
      blockNetwork();

      expect(await request(DATA_URL, (xhr) => xhr.open('GET', DATA_URL, true, null, null))).toBe('load 200 "hello"');
    });

    it('leaves a send() without an open() to raise the error that says so', () => {
      blockNetwork();

      expect(() => new XMLHttpRequest().send()).toThrow(/state/i);
    });

    it('does not stack a second install on the first', async () => {
      blockNetwork();

      const first = XMLHttpRequest.prototype.open;

      blockNetwork();

      expect(XMLHttpRequest.prototype.open).toBe(first);
      // Chaining would have recorded the already-diverted `data:` URL and downgraded the mode to
      // the silent 200 — which is the whole reason a second install is refused.
      expect(await request('https://tracker.example.test/ping.gif')).toContain('error 0');
    });

    it('gives the real open and send back through restoreMockedProps', () => {
      const { open, send } = XMLHttpRequest.prototype;

      blockNetwork();

      expect(XMLHttpRequest.prototype.open).not.toBe(open);

      restoreMockedProps();

      expect(XMLHttpRequest.prototype.open).toBe(open);
      expect(XMLHttpRequest.prototype.send).toBe(send);
    });

    it('leaves XMLHttpRequest alone when it is turned off', () => {
      const { open } = XMLHttpRequest.prototype;

      blockNetwork({ xhr: false });

      expect(XMLHttpRequest.prototype.open).toBe(open);
    });

    it('does nothing where the environment has no XMLHttpRequest', () => {
      vi.stubGlobal('XMLHttpRequest', undefined);

      expect(() => blockNetwork()).not.toThrow();
    });
  });

  describe('navigator.sendBeacon', () => {
    it('answers false instead of sending', () => {
      mockValueProp(globalThis.navigator, 'sendBeacon', () => true);

      blockNetwork();

      expect(navigator.sendBeacon('https://tracker.example.test/beacon')).toBe(false);
    });

    it('leaves a sendBeacon the suite installed itself alone when it is turned off', () => {
      mockValueProp(globalThis.navigator, 'sendBeacon', () => true);

      blockNetwork({ beacon: false });

      expect(navigator.sendBeacon('https://tracker.example.test/beacon')).toBe(true);
    });

    it('does not introduce one where the environment has none — jsdom is that environment', () => {
      blockNetwork();

      expect('sendBeacon' in globalThis.navigator).toBe(false);
    });

    it('does nothing where there is no navigator at all', () => {
      vi.stubGlobal('navigator', undefined);

      expect(() => blockNetwork()).not.toThrow();
    });
  });
});
