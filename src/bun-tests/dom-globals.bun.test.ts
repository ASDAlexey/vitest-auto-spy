/**
 * The DOM registrars against the real packages, which only Bun can do here: importing `jsdom` from
 * inside Vitest's own jsdom environment trips a CJS/ESM interop bug in one of its transitive
 * dependencies, so `src/lib/dom-globals.spec.ts` drives the same code with a stand-in.
 */
import { describe, expect, it } from 'bun:test';

import { createJsdomRegistrar, registerDomGlobals } from '../bun-angular';

describe('DOM registrars on bun', () => {
  it('builds a usable jsdom document into a throwaway target', async () => {
    const target: Record<string, unknown> = {};

    await createJsdomRegistrar({ load: () => import('jsdom'), target, url: 'https://example.test/' }).install();

    const document = target['document'];

    expect(document).toBeDefined();
    expect(String(target['location'])).toContain('example.test');
  });

  it('leaves the DOM the preload already installed alone', async () => {
    expect(await registerDomGlobals()).toBeUndefined();
    expect(typeof globalThis.document).toBe('object');
  });
});
