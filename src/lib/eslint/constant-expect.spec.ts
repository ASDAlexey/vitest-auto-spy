import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'no-constant-expect';

const linter = new Linter({ configType: 'flat' });

function verify(code: string): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${RULE}`]: 'error' },
      },
    ],
    'public-api.spec.ts',
  );
}

/** The lines the rule reports. A line that does not parse fails the test rather than passing as a report. */
const reported = (lines: string[]): string[] =>
  lines.filter((line) => {
    const messages = verify(line);

    expect(messages.filter((message) => message.ruleId === null)).toEqual([]);

    return messages.length > 0;
  });

describe(RULE, () => {
  it('reports a spelled-out value compared with a spelled-out value', () => {
    const decided = [
      'expect(true).toBe(true);',
      'expect(true).toBe(false);',
      "expect('ready').toEqual('ready');",
      'expect(`ready`).toStrictEqual(`ready`);',
      'expect(-1).toBe(-1);',
      'expect(undefined).toBe(undefined);',
      'expect(null).toBe();',
      'expect([1, , { a: [2] }]).toEqual([1, , { a: [2] }]);',
      "expect({ id: 1, 'name': 'a', m() {} }).toEqual({ id: 1 });",
      'expect(() => 1).toEqual(() => 1);',
      'expect(true as boolean).not.toBe(<boolean>false);',
    ];

    expect(reported(decided)).toEqual(decided);
  });

  it('reports a literal asked what kind of value it is, whatever it holds', () => {
    const decided = [
      'expect(true).toBeTruthy();',
      'expect(0).toBeFalsy();',
      'expect({ service }).toBeDefined();',
      'expect([items]).not.toBeNull();',
      'expect(() => service.load()).toBeDefined();',
      'expect(function load() {}).toBeTruthy();',
      'expect(class {}).not.toBeUndefined();',
      'expect(1).not.toBeNaN();',
      'expect(undefined).toBeUndefined();',
    ];

    expect(reported(decided)).toEqual(decided);
  });

  it('names the matcher and the way out for a line that marks an unreachable branch', () => {
    const [report] = verify('expect(true).not.not.toBe(true);');

    expect(report?.message).toMatch(/`toBe` gives the same answer[\s\S]*expect\.fail/);
    expect(report?.message).toContain('#how-to-mock-a-promise-a-test-forgets-to-await');
  });

  it('stays silent where either side depends on the code under test', () => {
    const live = [
      'expect(service.ready).toBe(true);',
      'expect(true).toBe(service.ready);',
      'expect([service.a, service.b]).toEqual([1, 2]);',
      'expect({ url: probe.url, seen }).toEqual({ url: undefined, seen: [] });',
      'expect({ ...defaults }).toEqual({});',
      'expect({ [key]: 1 }).toEqual({});',
      'expect({ get url() { return probe.url; } }).toEqual({});',
      'expect([...items]).toEqual([]);',
      'expect(`${prefix}-id`).toBe("a-id");',
      'expect(typeof value).toBe("string");',
      'expect(1 + 1).toBe(2);',
      'expect(service).toBeDefined();',
      'expect(`${prefix}`).toBeTruthy();',
    ];

    expect(reported(live)).toEqual([]);
  });

  it('stays silent on a matcher whose answer is not fixed by the value', () => {
    const live = [
      'expect(() => service.load()).toThrow();',
      "expect(() => service.load()).toThrowError('offline');",
      'expect(true).toSatisfy(isValid);',
      'await expect(Promise.resolve(1)).resolves.toBe(1);',
      'await expect(1).resolves.toBe(1);',
    ];

    expect(reported(live)).toEqual([]);
  });

  it('stays silent on a chain that never reaches a matcher', () => {
    expect(
      reported([
        'expect(true);',
        'expect(true).not;',
        'expect(true)(1);',
        'expect();',
        'expect().toBe(undefined);',
        'expect.soft(true).toBe(true);',
        'assert(true).toBe(true);',
      ]),
    ).toEqual([]);
  });
});
