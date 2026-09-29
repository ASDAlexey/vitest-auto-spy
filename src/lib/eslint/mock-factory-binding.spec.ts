import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-outer-binding-in-mock-factory';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code, { globals: { vi: 'readonly' } });
}

function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

describe('no-outer-binding-in-mock-factory', () => {
  it('flags a top-level const the hoisted factory reads while it runs', () => {
    const code = ['const user = { id: 1 };', "vi.mock('./api', () => ({ load: vi.fn(() => user) , current: user }));"].join('\n');
    const messages = verify(code);

    expect(messages.map((message) => message.ruleId)).toEqual(['vitest-auto-spy/no-outer-binding-in-mock-factory']);
    expect(messages[0]?.message).toContain("Cannot access 'user' before initialization");
    expect(messages[0]?.line).toBe(2);
  });

  it('flags let, var, an exported const and a class, once per binding', () => {
    const code = [
      'let a = 1;',
      'var b = 2;',
      'export const c = 3;',
      'class D {}',
      "vi.mock('./x', async () => ({ a, b, c, d: new D(), again: a }));",
    ].join('\n');

    expect(lint(code)).toHaveLength(4);
    expect(lint("const e = 1;\nvitest.mock('./x', function () { return { e }; });")).toHaveLength(1);
  });

  it('leaves vi.hoisted bindings, deferred reads and inner declarations alone', () => {
    expect(lint("const { load } = vi.hoisted(() => ({ load: vi.fn() }));\nvi.mock('./api', () => ({ load }));")).toEqual([]);
    expect(lint("const mocks = await vi.hoisted(async () => ({ load: vi.fn() }));\nvi.mock('./api', () => mocks);")).toEqual([]);
    expect(lint("const user = { id: 1 };\nvi.mock('./api', () => ({ load: () => user }));")).toEqual([]);
    expect(lint("vi.mock('./api', () => { const user = 1; return { user }; });")).toEqual([]);
    expect(lint("function make() { return 1; }\nvi.mock('./api', () => ({ value: make() }));")).toEqual([]);
    expect(lint("import { helper } from './helper';\nvi.mock('./api', () => ({ helper }));")).toEqual([]);
  });

  it('treats an instance field initialiser as deferred, a static field or a computed key as eager', () => {
    const declare = 'const config = { on: true };\nconst listen = vi.fn();\n';

    expect(
      lint(`${declare}vi.mock('./api', () => ({ Client: class { config = config.on ? {} : undefined; listen = listen; accessor x = config; } }));`),
    ).toEqual([]);
    expect(lint(`${declare}vi.mock('./api', () => ({ Client: class { static config = config; } }));`)).toEqual([
      'vitest-auto-spy/no-outer-binding-in-mock-factory',
    ]);
    expect(lint(`${declare}vi.mock('./api', () => ({ Client: class { [config.on ? 'a' : 'b'] = 1; } }));`)).toEqual([
      'vitest-auto-spy/no-outer-binding-in-mock-factory',
    ]);
  });

  it('reads only values, and only bindings declared at the top level', () => {
    expect(
      lint("type User = { id: number };\nconst user = {};\nvi.mock('./api', () => ({ load: (): User => null as unknown as User }));"),
    ).toEqual([]);
    expect(lint("interface Row { id: number }\nvi.mock('./api', (): { row?: Row } => ({}));")).toEqual([]);
    expect(lint("describe('x', () => { const user = 1; vi.mock('./api', () => ({ user })); });")).toEqual([]);
    expect(lint("for (const item of list) { vi.mock('./api', () => ({ item })); }")).toEqual([]);
    expect(lint("let count = 0;\nvi.mock('./api', () => { count = 1; return {}; });")).toEqual([]);
    expect(lint("const user = 1;\nvi.mock('./api');\nvi.doMock('./api', () => ({ user }));\nvi.mock('./api', factory);")).toEqual([]);
    expect(runRule(RULE, "vi.mock('./api', () => ({ user }));", { globals: { vi: 'readonly', user: 'readonly' } })).toEqual([]);
  });
});
