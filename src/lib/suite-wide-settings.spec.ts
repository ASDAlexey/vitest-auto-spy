/**
 * Every suite-wide switch, written through one module instance and read through another.
 *
 * A second instance is what a consumer really has: `/setup`, `dist/index.js` and `dist/angular.js`
 * each carry their own copy of these modules, and a switch kept in module scope reached none of the
 * doubles a spec built — `setupAutoSpy({ strict: true })` passed a full suite without applying once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../index';
import { resolveUnstubbedGuard, setDefaultStrictMode } from './function-spy';
import { misconfigurationThrows } from './misconfiguration';
import { getSpyEngine, setSpyEngine } from './spy-engine';

/** A fresh instance of a module, as another bundle of the package would hold it. */
async function secondCopy<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules();

  return load();
}

describe('suite-wide settings across two copies of the package', () => {
  afterEach(() => {
    setDefaultStrictMode(undefined);
    setSpyEngine('auto-spy');
    globalThis.__vitestAutoSpyMisconfiguration__ = undefined;
    globalThis.__vitestAutoSpyFailOnUnspiedProvider__ = undefined;
  });

  it('shares the strict default', async () => {
    const other = await secondCopy(() => import('./function-spy'));

    other.setDefaultStrictMode({ strict: true, onUnstubbedCall: undefined });

    expect(other.setDefaultStrictMode).not.toBe(setDefaultStrictMode);
    expect(resolveUnstubbedGuard('Cart', { strict: undefined, onUnstubbedCall: undefined })).toBeDefined();
  });

  it('shares the spy engine', async () => {
    const other = await secondCopy(() => import('./spy-engine'));

    other.setSpyEngine('runner');

    expect(getSpyEngine()).toBe('runner');
  });

  it('shares the misconfiguration grade', async () => {
    const other = await secondCopy(() => import('./misconfiguration'));

    other.setMisconfigurationReaction('throw');

    expect(misconfigurationThrows()).toBe(true);
  });

  it('shares the unspied-provider grade injectSpy reads', async () => {
    const other = await secondCopy(() => import('./angular'));

    other.failOnUnspiedProvider(true);

    expect(globalThis.__vitestAutoSpyFailOnUnspiedProvider__).toBe(true);
  });
});
