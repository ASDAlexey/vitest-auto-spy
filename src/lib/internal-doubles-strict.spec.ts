/**
 * A suite-wide `strict: true` is for the doubles a spec builds, never for the stand-ins this package
 * installs on the environment: those answer every call they expose, whatever the default says.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '../index';
import { consoleSpiesForImport, installConsoleSpies, restoreConsole } from './console-spy';
import { mockConstructor } from './constructor-spy';
import { setDefaultStrictMode } from './function-spy';
import { stubMediaElement } from './media-element-stub';
import { stubIntersectionObserver, stubMutationObserver, stubResizeObserver } from './observer-stubs';
import { restoreMockedProps } from './prop-mock';

describe('the package’s own stand-ins under a suite-wide strict default', () => {
  beforeAll(() => {
    setDefaultStrictMode({ strict: true, onUnstubbedCall: undefined });
  });

  afterAll(() => {
    setDefaultStrictMode(undefined);
    restoreMockedProps();
  });

  it('keeps every observer stub answering observe, unobserve, disconnect and takeRecords', () => {
    const target = document.createElement('div');

    stubIntersectionObserver();
    stubResizeObserver();
    stubMutationObserver();

    for (const Observer of [IntersectionObserver, ResizeObserver, MutationObserver]) {
      const observer = new Observer(() => undefined);

      expect(() => {
        observer.observe(target);
        // `unobserve` and `takeRecords` are on two of the three, so they are called where present.
        ['unobserve', 'takeRecords'].forEach((member) => {
          const method: unknown = Reflect.get(observer, member);

          if (typeof method === 'function') {
            Reflect.apply(method, observer, [target]);
          }
        });
        observer.disconnect();
      }).not.toThrow();
    }
  });

  it('keeps the media element stub playing and pausing', async () => {
    stubMediaElement();

    const video = document.createElement('video');

    await expect(video.play()).resolves.toBeUndefined();
    expect(() => video.pause()).not.toThrow();
  });

  it('keeps the console spies silent rather than strict', () => {
    consoleSpiesForImport();
    installConsoleSpies();

    try {
      expect(() => console.warn('absorbed')).not.toThrow();
    } finally {
      restoreConsole();
    }
  });

  it('keeps a constructor double building what its factory returns', () => {
    const Client = mockConstructor<{ id: number }>(() => ({ id: 1 }));

    expect(new Client().id).toBe(1);
  });
});
