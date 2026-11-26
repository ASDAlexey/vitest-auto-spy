import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerMockAdapter } from './mock-adapter';
import { mockValueProp, restoreMockedProps } from './prop-mock';
import { spyOnGlobal } from './spy-on-global';
import { vitestMockAdapter } from './vitest-adapter';

beforeEach(() => registerMockAdapter(vitestMockAdapter));
afterEach(() => restoreMockedProps());

describe('spyOnGlobal', () => {
  it('installs a named, configurable spy and restores the original descriptor', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const response = new Response('ok');
    const fetchSpy = spyOnGlobal('fetch');

    fetchSpy.calledWith('/status').resolveWith(response);

    expect(fetchSpy.getMockName()).toBe('fetch');
    expect(globalThis.fetch).toBe(fetchSpy);
    await expect(globalThis.fetch('/status')).resolves.toBe(response);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith('/status');

    restoreMockedProps();

    expect(Object.getOwnPropertyDescriptor(globalThis, 'fetch')).toStrictEqual(original);
  });

  it('creates a spy even when the runtime value is unavailable', () => {
    const original = globalThis.fetch;

    mockValueProp(globalThis, 'fetch', undefined);
    const fetchSpy = spyOnGlobal('fetch');

    expect(globalThis.fetch).toBe(fetchSpy);

    restoreMockedProps();

    expect(globalThis.fetch).toBe(original);
  });
});
