import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-hand-assigned-global';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

function count(code: string): number {
  return verify(code).length;
}

function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

describe('no-hand-assigned-global', () => {
  it('flags the fetch double a tutorial writes, with no restore anywhere', () => {
    const code = `
      beforeEach(() => {
        global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ id: 1 }) }));
      });
    `;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain("mockValueProp(globalThis, 'fetch'");
    expect(text).toContain('blockNetwork()');
    expect(text).toContain('unstubGlobals: true');
    expect(text).toContain('#how-to-mock-fetch-and-other-globals');
  });

  it('reads every receiver and spelling of the global, cast or configured', () => {
    expect(count('globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}")) as unknown as typeof fetch;')).toBe(1);
    expect(count('window["fetch"] = vi.fn();')).toBe(1);
    expect(count('(global as any).XMLHttpRequest = class {};')).toBe(1);
    expect(count('self.WebSocket = function () {};')).toBe(1);
    expect(count('const fetchMock = vi.fn(); globalThis.fetch = fetchMock;')).toBe(1);
  });

  it('names the storage stub for localStorage and sessionStorage', () => {
    const text = message('window.localStorage = { getItem: vi.fn(), setItem: vi.fn() } as unknown as Storage;');

    expect(text).toContain("stubWebStorage('localStorage')");
    expect(message('window.sessionStorage = { getItem: vi.fn() } as never;')).toContain("stubWebStorage('sessionStorage')");
  });

  it('names mockValueProp and vi.stubGlobal for any other global', () => {
    const text = message('window.matchMedia = vi.fn().mockReturnValue({ matches: true });');

    expect(text).toContain("mockValueProp(globalThis, 'matchMedia', value)");
    expect(text).toContain("vi.stubGlobal('matchMedia', value)");
    expect(text).not.toContain('blockNetwork');
  });

  it('stays silent when a teardown hook puts the original back, by assignment or by delete', () => {
    expect(
      count(`
        const original = globalThis.fetch;
        beforeEach(() => { globalThis.fetch = vi.fn(); });
        afterEach(() => { globalThis.fetch = original; });
      `),
    ).toBe(0);
    expect(
      count(`
        beforeAll(() => { window.scrollTo = vi.fn(); });
        afterAll(() => { delete (window as any).scrollTo; });
      `),
    ).toBe(0);
    expect(
      count(`
        it('reads', () => {
          global.fetch = vi.fn();
          onTestFinished(() => { delete global.fetch; });
        });
      `),
    ).toBe(0);
  });

  it('reports a restore written inside the test, which the first red assertion skips', () => {
    const code = `
      it('loads', async () => {
        const original = globalThis.fetch;
        globalThis.fetch = vi.fn();
        await load();
        expect(globalThis.fetch).toHaveBeenCalled();
        globalThis.fetch = original;
      });
    `;

    expect(count(code)).toBe(1);
    expect(message(code)).toContain('outside a teardown hook');
  });

  it('leaves real implementations, other receivers and non-global names alone', () => {
    expect(count('window.fetch = crossFetch;')).toBe(0);
    expect(count('window.myPolyfill = { run() { return 1; } };')).toBe(0);
    expect(count('fakeWindow.fetch = vi.fn();')).toBe(0);
    expect(count('let fetch; fetch = vi.fn();')).toBe(0);
    expect(count('window[key] = vi.fn();')).toBe(0);
    expect(count('delete window[key];')).toBe(0);
    expect(count('delete localObject.fetch;')).toBe(0);
  });

  it('leaves the observer globals to prefer-observer-stub', () => {
    expect(count('globalThis.IntersectionObserver = class {};')).toBe(0);
  });

  it('reports every assignment of the same global once each', () => {
    expect(count('global.fetch = vi.fn(); global.fetch = vi.fn();')).toBe(2);
  });
});
