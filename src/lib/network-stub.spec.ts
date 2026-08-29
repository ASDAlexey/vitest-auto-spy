import { afterEach, describe, expect, it } from 'vitest';

import '../index';
import { BLOCKED_FETCH_MESSAGE, blockNetwork } from './network-stub';
import { restoreMockedProps } from './prop-mock';

describe('blockNetwork', () => {
  afterEach(() => {
    restoreMockedProps();
  });

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
});
