import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-unasserted-console-spy';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

const ENTRY = "import { consoleErrorSpy, consoleWarnSpy, useConsoleSpies } from 'vitest-auto-spy/console';";

describe('no-unasserted-console-spy, the library spies', () => {
  it('flags an imported spy the file only resets or configures', () => {
    const messages = verify(
      `${ENTRY}\nafterEach(() => { consoleErrorSpy.mockClear(); consoleErrorSpy.mockImplementation(() => undefined); });`,
    );

    expect(messages.map((message) => message.ruleId)).toEqual(['vitest-auto-spy/no-unasserted-console-spy']);
    expect(messages[0]?.message).toContain('`consoleErrorSpy` is only ever reset or configured');
  });

  it('flags a destructured spy under its local name', () => {
    const code = [
      "import { useConsoleSpies } from 'vitest-auto-spy/console';",
      'const { consoleErrorSpy: errors, ...rest } = useConsoleSpies();',
      'beforeEach(() => errors.mockReset());',
    ].join('\n');

    expect(verify(code)[0]?.message).toContain('`errors`');
  });

  it('leaves an asserted, unused or foreign spy alone', () => {
    expect(
      lint(`${ENTRY}\nafterEach(() => consoleErrorSpy.mockClear());\nit('x', () => expect(consoleErrorSpy).toHaveBeenCalled());`),
    ).toEqual([]);
    expect(lint(`${ENTRY}\nit('x', () => expect(consoleWarnSpy.mock.calls).toEqual([]));`)).toEqual([]);
    expect(lint(`${ENTRY}\nuseConsoleSpies();`)).toEqual([]);
    expect(lint("import { consoleErrorSpy } from './spies';\nconsoleErrorSpy.mockClear();")).toEqual([]);
    expect(lint("import * as spies from 'vitest-auto-spy/console';\nspies.consoleErrorSpy.mockClear();")).toEqual([]);
    expect(lint('const { a } = build();\nconst spies = useConsoleSpies();\nconst b = make.thing();\nlet c;\na.mockClear();')).toEqual([]);
  });

  it('trusts a file that reads the console some other way', () => {
    expect(lint(`${ENTRY}\nconsoleErrorSpy.mockClear();\nit('x', () => expect(consoleOutput().error).toEqual([]));`)).toEqual([]);
    expect(lint(`${ENTRY}\nconsoleErrorSpy.mockClear();\nit('x', () => expect(console.error).not.toHaveBeenCalled());`)).toEqual([]);
  });
});

describe('no-unasserted-console-spy, vi.spyOn(console)', () => {
  it('flags a silencer nothing holds or asserts', () => {
    const messages = verify("beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });");

    expect(messages.map((message) => message.ruleId)).toEqual(['vitest-auto-spy/no-unasserted-console-spy']);
    expect(messages[0]?.message).toContain('`console.error` is never asserted');
  });

  it('flags a bound silencer whose only uses are upkeep', () => {
    expect(lint("const spy = vi.spyOn(console, 'warn').mockReturnValue(undefined);\nafterEach(() => spy.mockRestore());")).toHaveLength(1);
    expect(lint("let spy;\nbeforeEach(() => { spy = vi.spyOn(console, 'warn'); spy.mockImplementation(() => {}); });")).toHaveLength(1);
    expect(lint("const spy = vi.spyOn(console, 'log').mockName('log').mockImplementation(() => {});")).toHaveLength(1);
  });

  it('leaves an asserted or calling-through spy alone', () => {
    expect(
      lint("const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});\nit('x', () => expect(spy).toHaveBeenCalled());"),
    ).toEqual([]);
    expect(lint("vi.spyOn(console, 'warn');")).toEqual([]);
    expect(lint("const spy = vi.spyOn(console, 'warn');\nafterEach(() => spy.mockClear());")).toEqual([]);
    expect(lint("spies.push(vi.spyOn(console, 'warn').mockImplementation(() => {}));")).toEqual([]);
    expect(lint("holder.spy = vi.spyOn(console, 'warn').mockImplementation(() => {});")).toEqual([]);
    expect(lint("vi.spyOn(logger, 'warn').mockImplementation(() => {});\nvi.spyOn(console, method).mockImplementation(() => {});")).toEqual(
      [],
    );
    expect(
      lint("vi.spyOn(console, 'warn').mockImplementation(() => {});\nit('x', () => expect(vi.mocked(console.warn)).toHaveBeenCalled());"),
    ).toEqual([]);
  });

  it('does not count a call or a replacement of a console method as a read', () => {
    const code = "vi.spyOn(console, 'warn').mockImplementation(() => {});\nconsole.info('x');\nconsole.debug = noop;";

    expect(lint(code)).toHaveLength(1);
  });
});

describe('no-unasserted-console-spy, an implementation that records the calls', () => {
  it.each([
    [`${ENTRY}\nbeforeEach(() => consoleWarnSpy.mockImplementation((message) => { warnings.push(String(message)); }));`],
    ["it('x', () => { vi.spyOn(console, 'warn').mockImplementation((message: unknown) => { warnings.push(String(message)); }); });"],
    [
      "const warn = vi.spyOn(console, 'warn').mockImplementation((message) => void warnings.push(message));\nafterAll(() => warn.mockRestore());",
    ],
    ["const warn = vi.spyOn(console, 'warn');\nbeforeEach(() => warn.mockImplementationOnce(function (message) { last = message; }));"],
  ])('leaves a spy asserted through what its implementation kept: %s', (code) => {
    expect(lint(code)).toEqual([]);
  });

  it.each([
    [`${ENTRY}\nbeforeEach(() => consoleWarnSpy.mockImplementation((message) => undefined));`],
    [`${ENTRY}\nbeforeEach(() => consoleWarnSpy.mockImplementation(({ message }) => undefined));`],
    [`${ENTRY}\nbeforeEach(() => consoleWarnSpy.mockImplementation(silence));`],
    [`${ENTRY}\nbeforeEach(() => consoleWarnSpy.mockImplementation());`],
    [`${ENTRY}\nbeforeEach(() => consoleWarnSpy.mockClear());`],
    ["it('x', () => { vi.spyOn(console, 'warn').mockImplementation((message) => undefined); });"],
    ["const warn = vi.spyOn(console, 'warn');\nbeforeEach(() => warn.mockImplementation(() => undefined));"],
  ])('still flags a silencer that drops what was logged: %s', (code) => {
    expect(lint(code)).toEqual(['vitest-auto-spy/no-unasserted-console-spy']);
  });
});
