/**
 * DOM installation for a runtime that ships none. Everything here is exercised against fakes or a
 * throwaway target object — a spec that patched the real `globalThis` would take the rest of the
 * Vitest run with it, which is exactly the failure mode `registerDomGlobals` is written to avoid.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  type DomRegistrar,
  type JsdomModule,
  copyWindowGlobals,
  createGlobalRegistratorRegistrar,
  createJsdomRegistrar,
  registerDomGlobals,
} from './dom-globals';

/** A registrar that records that it ran, or refuses to. */
function registrar(name: string, installed: string[], failure?: unknown): DomRegistrar {
  return {
    name,
    install: (): void => {
      if (failure !== undefined) {
        throw failure;
      }

      installed.push(name);
    },
  };
}

describe('registerDomGlobals', () => {
  it('does nothing when a DOM is already present', async () => {
    const installed: string[] = [];

    expect(await registerDomGlobals({ registrars: [registrar('unused', installed)] })).toBeUndefined();
    expect(installed).toEqual([]);
  });

  it('detects the ambient DOM through its default check', async () => {
    // The suite runs on jsdom, so the default `hasDom` must short-circuit with no registrars at all.
    expect(await registerDomGlobals()).toBeUndefined();
  });

  it('falls through to the next registrar when one is unavailable', async () => {
    const installed: string[] = [];
    const used = await registerDomGlobals({
      hasDom: (): boolean => false,
      registrars: [registrar('missing', installed, new Error('not installed')), registrar('fallback', installed)],
    });

    expect(used).toBe('fallback');
    expect(installed).toEqual(['fallback']);
  });

  it('reports every failure, whatever was thrown', async () => {
    const installed: string[] = [];

    await expect(
      registerDomGlobals({
        hasDom: (): boolean => false,
        registrars: [registrar('a', installed, new Error('boom')), registrar('b', installed, 'plain string')],
      }),
    ).rejects.toThrow(/a: boom[\s\S]*b: plain string/);
  });

  it('says so when nothing was configured to try', async () => {
    await expect(registerDomGlobals({ hasDom: (): boolean => false })).rejects.toThrow(/no registrars were configured/);
  });
});

describe('copyWindowGlobals', () => {
  it('overwrites the forced globals and fills in the rest', () => {
    const source = { window: 'w', document: 'd', fetch: 'window-fetch', extra: 'e' };
    const target: Record<string, unknown> = { document: 'stale', fetch: 'native-fetch' };

    copyWindowGlobals(source, target);

    expect(target['document']).toBe('d');
    expect(target['window']).toBe('w');
    expect(target['extra']).toBe('e');
    expect(target['fetch']).toBe('native-fetch');
  });

  it('skips private keys and absent values', () => {
    const target: Record<string, unknown> = {};

    copyWindowGlobals({ _internal: 'x', absent: undefined, kept: 'y' }, target);

    expect('_internal' in target).toBe(false);
    expect('absent' in target).toBe(false);
    expect(target['kept']).toBe('y');
  });

  it('leaves a global the host has locked down', () => {
    const target: Record<string, unknown> = {};

    Object.defineProperty(target, 'frozen', { value: 'host', configurable: false, writable: false });
    copyWindowGlobals({ frozen: 'from-window' }, target);

    expect(target['frozen']).toBe('host');
  });
});

describe('registrars', () => {
  /**
   * A stand-in for `jsdom`. The real package is loaded for real in `src/bun-tests/` — importing it
   * from inside Vitest's own jsdom environment trips a CJS/ESM interop bug in one of its
   * transitive dependencies, which says nothing about this registrar.
   */
  const fakeJsdom = (): Promise<JsdomModule> =>
    Promise.resolve({
      JSDOM: class {
        readonly window: Record<string, unknown>;

        constructor(html: string, options?: Record<string, unknown>) {
          this.window = { document: { html }, location: String(options?.['url']), pretendToBeVisual: options?.['pretendToBeVisual'] };
        }
      },
    });

  it('builds a window into the target it is given', async () => {
    const target: Record<string, unknown> = {};
    const jsdomRegistrar = createJsdomRegistrar({ load: fakeJsdom, target, url: 'https://example.test/' });

    expect(jsdomRegistrar.name).toBe('jsdom');
    await jsdomRegistrar.install();

    expect(target['document']).toBeDefined();
    expect(target['location']).toBe('https://example.test/');
  });

  it('defaults the document URL', async () => {
    const target: Record<string, unknown> = {};

    await createJsdomRegistrar({ load: fakeJsdom, target }).install();

    expect(target['location']).toBe('http://localhost/');
  });

  it('delegates to a module that registers itself', async () => {
    const register = vi.fn();
    const self = createGlobalRegistratorRegistrar({
      name: '@happy-dom/global-registrator',
      load: () => Promise.resolve({ GlobalRegistrator: { register } }),
    });

    expect(self.name).toBe('@happy-dom/global-registrator');
    await self.install();

    expect(register).toHaveBeenCalledTimes(1);
  });
});
