import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { fixRule, runRule } from './run-rule';

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
    expect(text).toMatch(/^`fetch` is replaced by assignment/);
    expect(text).toContain("mockValueProp(globalThis, 'fetch', vi.fn(…))");
    expect(text).toContain('/utilities/eslint-rules#no-hand-assigned-global');
    expect(message('self.WebSocket = function () {};')).toContain("stubConstructor(globalThis, 'WebSocket', …)");
    expect(message('window.ResizeObserverEntry = function () {};')).toContain("stubConstructor(globalThis, 'ResizeObserverEntry', …)");
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

  it('names mockValueProp for any other global', () => {
    const text = message('window.matchMedia = vi.fn().mockReturnValue({ matches: true });');

    expect(text).toContain("mockValueProp(globalThis, 'matchMedia', vi.fn(…))");
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

  describe('a member of an imported binding', () => {
    const header = "import { environment } from '../environments/environment';\n";

    function fixed(code: string): string {
      return fixRule(RULE, code).output;
    }

    it('reports any value written into an imported object, not only a double', () => {
      const code = `${header}it('reads', () => { environment.useRemoteConfigs = true; });`;
      const text = message(code);

      expect(count(code)).toBe(1);
      expect(text).toContain('`environment.useRemoteConfigs` is written into an imported module');
      expect(text).toContain("mockValueProp(environment, 'useRemoteConfigs', value)");
    });

    it('rewrites the assignment through mockValueProp and imports it', () => {
      expect(fixed(`${header}it('reads', () => { environment.useRemoteConfigs = true; });`)).toBe(
        `import { mockValueProp } from 'vitest-auto-spy';\n${header}it('reads', () => { mockValueProp(environment, 'useRemoteConfigs', true); });`,
      );
    });

    it('joins an existing import, keeps a quoted key as written, and reaches a nested object or a cast', () => {
      const code = `import { createMock } from 'vitest-auto-spy';
import config from './config';
beforeEach(() => {
  config['api-url'] = 'http://test';
  (config as any).feature.enabled = false;
});`;

      expect(fixed(code)).toBe(`import { createMock, mockValueProp } from 'vitest-auto-spy';
import config from './config';
beforeEach(() => {
  mockValueProp(config, 'api-url', 'http://test');
  mockValueProp((config as any).feature, 'enabled', false);
});`);
    });

    it('imports mockValueProp from the adapter entry the file already runs on', () => {
      const write = "it('reads', () => { environment.production = true; });";
      const onEntry = (entry: string): string => `import { createSpyFromClass } from '${entry}';\n${header}${write}`;

      expect(fixed(onEntry('vitest-auto-spy/bun-angular'))).toContain(
        "import { createSpyFromClass, mockValueProp } from 'vitest-auto-spy/bun-angular';",
      );
      expect(fixed(onEntry('vitest-auto-spy/node'))).toContain("import { createSpyFromClass, mockValueProp } from 'vitest-auto-spy/node';");
      expect(fixed(onEntry('vitest-auto-spy'))).toContain("import { createSpyFromClass, mockValueProp } from 'vitest-auto-spy';");
      expect(fixed(`${header}${write}`)).toMatch(/^import \{ mockValueProp \} from 'vitest-auto-spy';\n/u);
    });

    it('falls back to the root when the file imports only entries without the helper', () => {
      const code = `import { provideAutoSpy } from 'vitest-auto-spy/angular';\n${header}it('reads', () => { environment.production = true; });`;

      expect(fixed(code)).toMatch(/^import \{ mockValueProp \} from 'vitest-auto-spy';\nimport \{ provideAutoSpy \}/u);
    });

    it('uses a mockValueProp the file already imports, from any entry', () => {
      const code = `import { mockValueProp } from 'vitest-auto-spy/angular';\n${header}test.each([1, 2])('reads %s', (n) => { environment.retries = n; });`;

      expect(fixed(code)).toContain("mockValueProp(environment, 'retries', n)");
      expect(fixed(code).match(/import/gu)).toHaveLength(2);
    });

    it('looks past a call whose callee is not a name, to the test around it', () => {
      expect(fixed(`${header}it('reads', () => { (() => { environment.production = true; })(); });`)).toContain(
        "mockValueProp(environment, 'production', true)",
      );
    });

    it('reports without a fix where the sweep would take the patch off early, or the rewrite would change meaning', () => {
      const cases = [
        `${header}beforeAll(() => { environment.production = true; });`,
        `${header}describe('suite', () => { environment.production = true; });`,
        `${header}environment.production = true;`,
        `${header}it('reads', () => { const value = (environment.production = true); });`,
        `${header}it('reads', () => { environment.production = (1, true); });`,
        `${header}const mockValueProp = 1;\nit('reads', () => { environment.production = true; });`,
      ];

      cases.forEach((code) => {
        expect(count(code)).toBe(1);
        expect(fixed(code)).toBe(code);
      });
    });

    it('stays silent when a teardown hook puts the value back', () => {
      expect(
        count(`${header}
          const original = environment.production;
          beforeEach(() => { environment.production = true; });
          afterEach(() => { environment.production = original; });
        `),
      ).toBe(0);
    });

    it('leaves locals, this, compound assignments, computed keys and a namespace object alone', () => {
      expect(count(`${header}const local = { a: 1 }; it('x', () => { local.a = 2; });`)).toBe(0);
      expect(count(`class Holder { value = 0; set(): void { this.value = 1; } }`)).toBe(0);
      expect(count(`${header}it('x', () => { environment.retries += 1; });`)).toBe(0);
      expect(count(`${header}it('x', () => { environment[key] = 1; });`)).toBe(0);
      expect(count(`import * as env from './env';\nit('x', () => { env.production = true; });`)).toBe(0);
      expect(count(`it('x', () => { unknownGlobal.production = true; });`)).toBe(0);
      expect(count(`it('x', () => { fn().production = true; });`)).toBe(0);
    });

    it('reports a member of an object reached through a namespace import', () => {
      expect(count(`import * as env from './env';\nit('x', () => { env.environment.production = true; });`)).toBe(1);
    });
  });
});
