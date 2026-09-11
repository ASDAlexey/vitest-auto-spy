/**
 * The three console rules, checked from both ends: the shapes that still print or silence other files,
 * and the ones that absorb the output, install the spies themselves or only read a spy — which stay silent.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const PASSTHROUGH = 'no-passthrough-console-spy';
const IN_SPEC = 'no-console-in-spec';
const IMPORT_TIME = 'no-import-time-console-spies';

const linter = new Linter({ configType: 'flat' });

function verify(code: string, rule: string, globals: Record<string, 'readonly'> = {}): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser, globals },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${rule}`]: 'error' },
      },
    ],
    'logger.spec.ts',
  );
}

function count(code: string, rule: string): number {
  return verify(code, rule).length;
}

describe(PASSTHROUGH, () => {
  it('reports a spy on a console method that is never given an implementation', () => {
    expect(count("vi.spyOn(console, 'error');", PASSTHROUGH)).toBe(1);
    expect(count("jest.spyOn(console, 'warn').mockName('warn');", PASSTHROUGH)).toBe(1);
    expect(count("vi.spyOn(globalThis.console, 'log');", PASSTHROUGH)).toBe(1);
    expect(count("vi.spyOn(window.console, 'info');", PASSTHROUGH)).toBe(1);
  });

  it('names the method and both repairs', () => {
    const [report] = verify("vi.spyOn(console, 'error');", PASSTHROUGH);

    expect(report?.message).toMatch(/console\.error[\s\S]*installConsoleSpies\(\)[\s\S]*mockImplementation\(\(\) => undefined\)/);
    expect(report?.message).toContain('#how-to-mock-the-console');
  });

  it('suggests the implementation rather than applying it', () => {
    const [report] = verify("const spy = vi.spyOn(console, 'error');\nexpect(spy).toHaveBeenCalled();", PASSTHROUGH);
    const fix = report?.suggestions?.[0]?.fix;

    expect(report).not.toHaveProperty('fix');
    expect(fix?.text).toBe('.mockImplementation(() => undefined)');
    expect(fix?.range).toEqual([38, 38]);
  });

  it('follows a name the spy is bound to, and reports when it is only ever read', () => {
    const code = `
      let spy;
      beforeEach(() => { spy = vi.spyOn(console, 'warn'); });
      it('warns', () => {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls).toEqual([]);
        spy('direct');
        spy.mockRestore();
      });
    `;

    expect(count(code, PASSTHROUGH)).toBe(1);
  });

  it('stays silent once the spy is given an implementation, directly or through its name', () => {
    expect(count("vi.spyOn(console, 'error').mockImplementation(() => undefined);", PASSTHROUGH)).toBe(0);
    expect(count("vi.spyOn(console, 'error').mockName('e').mockReturnValue(undefined);", PASSTHROUGH)).toBe(0);
    expect(count("const spy = vi.spyOn(console, 'error');\nspy.mockImplementationOnce(() => undefined);", PASSTHROUGH)).toBe(0);
    expect(count("let spy;\nbeforeEach(() => { spy = vi.spyOn(console, 'log'); spy.mockReturnValueOnce(undefined); });", PASSTHROUGH)).toBe(
      0,
    );
  });

  it('stays silent where the spy goes somewhere it cannot follow', () => {
    expect(count("const spy = vi.spyOn(console, 'error');\nsilence(spy);", PASSTHROUGH)).toBe(0);
    expect(count("const spies = [vi.spyOn(console, 'error')];", PASSTHROUGH)).toBe(0);
    expect(count("beforeEach(() => vi.spyOn(console, 'error'));", PASSTHROUGH)).toBe(0);
    expect(count("const { mock } = vi.spyOn(console, 'error');", PASSTHROUGH)).toBe(0);
    expect(count("this.spy = vi.spyOn(console, 'error');", PASSTHROUGH)).toBe(0);
    expect(count("spy = vi.spyOn(console, 'error');", PASSTHROUGH)).toBe(0);
    expect(count("const spy = vi.spyOn(console, 'error');\nconst alias = spy;", PASSTHROUGH)).toBe(0);
    expect(count("const spy = vi.spyOn(console, 'error');\nconst impl = spy.mockImplementation;", PASSTHROUGH)).toBe(1);
  });

  it('leaves a method that prints nothing, a method it cannot name, and anything but the global console alone', () => {
    expect(count("vi.spyOn(console, 'time');", PASSTHROUGH)).toBe(0);
    expect(count('vi.spyOn(console, method);', PASSTHROUGH)).toBe(0);
    expect(count('vi.spyOn(console, 1);', PASSTHROUGH)).toBe(0);
    expect(count('vi.spyOn();', PASSTHROUGH)).toBe(0);
    expect(count("vi.spyOn(logger, 'error');", PASSTHROUGH)).toBe(0);
    expect(count("vi.spyOn(this.console, 'error');", PASSTHROUGH)).toBe(0);
    expect(count("vi.spyOn(globalThis['console'], 'error');", PASSTHROUGH)).toBe(0);
    expect(count("vi.spyOn(host.console, 'error');", PASSTHROUGH)).toBe(0);
    expect(count("const console = makeLogger();\nvi.spyOn(console, 'error');", PASSTHROUGH)).toBe(0);
    expect(count("const window = frame;\nvi.spyOn(window.console, 'error');", PASSTHROUGH)).toBe(0);
    expect(count("sinon.spyOn(console, 'error');", PASSTHROUGH)).toBe(0);
  });

  it('treats a console the config declares as a global as the global one', () => {
    expect(verify("vi.spyOn(console, 'error');", PASSTHROUGH, { console: 'readonly' })).toHaveLength(1);
  });
});

describe(IN_SPEC, () => {
  it('reports a spec that prints', () => {
    expect(count("console.log('debug');", IN_SPEC)).toBe(1);
    expect(count('subscribe({ error: (error) => console.error(error) });', IN_SPEC)).toBe(1);
    expect(count("globalThis.console.warn('x');", IN_SPEC)).toBe(1);
    expect(count('window.console.table(rows);', IN_SPEC)).toBe(1);
    expect(count('console.assert(ok);', IN_SPEC)).toBe(1);
  });

  it('reports a console method replaced by assignment, whatever the member', () => {
    const [report] = verify('console.error = vi.fn();', IN_SPEC);

    expect(report?.message).toMatch(/replaces `console\.error` by assignment[\s\S]*isolate: false[\s\S]*installConsoleSpies\(\)/);
    expect(count('console.time = () => undefined;', IN_SPEC)).toBe(1);
    expect(verify("console['warn'] = noop;", IN_SPEC)[0]?.message).toContain('replaces `console.method`');
  });

  it('says a printing spec either left a line behind or should absorb it', () => {
    expect(verify("console.info('x');", IN_SPEC)[0]?.message).toMatch(/debugging line[\s\S]*vitest-auto-spy\/console/);
  });

  it('leaves reads, non-printing methods and non-global consoles alone', () => {
    expect(count('expect(console.error).toHaveBeenCalled();', IN_SPEC)).toBe(0);
    expect(count('register(console.warn);', IN_SPEC)).toBe(0);
    expect(count("console.time('t');\nconsole.groupEnd();\nconsole.countReset();", IN_SPEC)).toBe(0);
    expect(count("console['log']('x');", IN_SPEC)).toBe(0);
    expect(count("logger.console.log('x');", IN_SPEC)).toBe(0);
    expect(count("const console = fake;\nconsole.log('x');\nconsole.log = noop;", IN_SPEC)).toBe(0);
    expect(count("log('x');", IN_SPEC)).toBe(0);
    expect(count('spy.mock = x;', IN_SPEC)).toBe(0);
    expect(count('value = 1;', IN_SPEC)).toBe(0);
  });
});

describe(IMPORT_TIME, () => {
  it('reports an import that leans on the install the entry does when it is first imported', () => {
    expect(count("import 'vitest-auto-spy/console';", IMPORT_TIME)).toBe(1);
    expect(count("import { consoleErrorSpy } from 'vitest-auto-spy/console';", IMPORT_TIME)).toBe(1);
    expect(count("import * as consoleEntry from 'vitest-auto-spies/console';", IMPORT_TIME)).toBe(1);
  });

  it('names the per-test install as the repair', () => {
    const [report] = verify("import { consoleWarnSpy } from 'vitest-auto-spy/console';", IMPORT_TIME);

    expect(report?.message).toMatch(/once per worker[\s\S]*installConsoleSpies\(\)[\s\S]*restoreConsole\(\)/);
  });

  it('stays silent once the file installs the spies itself, however it reaches the call', () => {
    expect(
      count(
        "import { consoleErrorSpy, installConsoleSpies } from 'vitest-auto-spy/console';\nbeforeEach(() => installConsoleSpies());",
        IMPORT_TIME,
      ),
    ).toBe(0);
    expect(count("import * as entry from 'vitest-auto-spy/console';\nentry.installConsoleSpies();", IMPORT_TIME)).toBe(0);
  });

  it('leaves imports of the helpers, of types, and of other modules alone', () => {
    expect(count("import { installConsoleSpies, restoreConsole, type ConsoleSpies } from 'vitest-auto-spy/console';", IMPORT_TIME)).toBe(0);
    expect(
      count(
        "import { consoleErrorSpy } from './console';\nimport 'vitest-auto-spy';\nfetch(url).then(done);\n(() => undefined)();",
        IMPORT_TIME,
      ),
    ).toBe(0);
  });
});
