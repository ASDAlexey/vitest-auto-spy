import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'no-redundant-smoke-test';

const linter = new Linter({ configType: 'flat' });

function verify(code: string): LintMessage[] {
  const messages = linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${RULE}`]: 'error' },
      },
    ],
    'pipe.spec.ts',
  );

  expect(messages.filter((message) => message.ruleId === null)).toEqual([]);

  return messages;
}

/** The test a spec of this file is built around: one that uses the subject rather than weighing it. */
const PROVING = "it('drops the empty entries', () => { expect(pipe.transform([])).toEqual([]); });";

/** The reported lines of a block, by the subject each report names. */
const subjects = (...tests: string[]): string[] =>
  verify(`describe('MyPipe', () => {\n${tests.join('\n')}\n});`).map(
    (message) => /`(.*?)` existing/.exec(message.message)?.[1] ?? message.message,
  );

describe(RULE, () => {
  it('reports a body that asks only whether the subject is there', () => {
    const smoke = [
      "it('should create', () => { expect(pipe).toBeTruthy(); });",
      "it('should create', () => expect(pipe).toBeTruthy());",
      "it('should create', () => { expect(pipe).toBeDefined(); });",
      "it('should create', () => { expect(pipe).toBeInstanceOf(MyPipe); });",
      "it('should create', () => { expect(pipe).not.toBeNull(); });",
      "it('should create', () => { expect(pipe).not.toBeUndefined(); });",
      "it('should create', () => { expect(pipe).not.toBeFalsy(); });",
      "it('should create', () => { expect(pipe).not.not.toBeTruthy(); });",
      "it('should create', function () { expect(pipe).toBeTruthy(); });",
      "test('should create', async () => { expect(pipe).toBeTruthy(); });",
      "it('should create', () => { expect(pipe).toBeTruthy(); expect(pipe.transform).toBeDefined(); });",
      "it.each([1, 2])('should create', () => { expect(pipe).toBeTruthy(); });",
      "it.skip('should create', () => { expect(pipe).toBeTruthy(); });",
      "fit('should create', () => { expect(pipe).toBeTruthy(); });",
    ];

    expect(subjects(PROVING, ...smoke)).toEqual(smoke.map(() => 'pipe'));
  });

  it('names the subject, the company it keeps and the way out', () => {
    const [report] = verify(`describe('MyPipe', () => {\n${PROVING}\nit('should create', () => { expect(pipe).toBeTruthy(); });\n});`);

    expect(report?.message).toContain(
      'The whole of this test is `pipe` existing, and another test under the same setup already runs against it',
    );
    expect(report?.message).toMatch(/Delete it\.[\s\S]*expect\(\(\) => new Subject\(null\)\)\.toThrow/);
    expect(report?.message).toContain('#how-to-mock-a-promise-a-test-forgets-to-await');
  });

  it('counts the tests that will actually run', () => {
    const [report] = verify(
      `describe('MyPipe', () => {\n${PROVING}\n${PROVING}\nit.skip('parses a date', () => { expect(pipe.transform('x')).toBe(1); });\nit('should create', () => { expect(pipe).toBeTruthy(); });\n});`,
    );

    expect(report?.message).toContain('2 other tests under the same setup');
  });

  it('offers to remove the test, blank line above it included', () => {
    const source = `describe('MyPipe', () => {\n  ${PROVING}\n\n  it('should create', () => { expect(pipe).toBeTruthy(); });\n});`;
    const [report] = verify(source);
    const [suggestion] = report?.suggestions ?? [];
    const fixed = suggestion
      ? source.slice(0, suggestion.fix.range[0]) + suggestion.fix.text + source.slice(suggestion.fix.range[1])
      : source;

    expect(suggestion?.desc).toBe('Remove this test');
    expect(fixed).toBe(`describe('MyPipe', () => {\n  ${PROVING}\n});`);
  });

  it('removes a test that opens the file, where there is nothing above it to keep', () => {
    const source = `it('should create', () => { expect(pipe).toBeTruthy(); });\n${PROVING}`;
    const [suggestion] = verify(source)[0]?.suggestions ?? [];

    expect(suggestion && source.slice(0, suggestion.fix.range[0]) + suggestion.fix.text + source.slice(suggestion.fix.range[1])).toBe(
      `\n${PROVING}`,
    );
  });

  it('reports without a suggestion where the test is not a statement of its own', () => {
    const [report] = verify(`describe('MyPipe', () => {\n${PROVING}\nvoid it('should create', () => { expect(pipe).toBeTruthy(); });\n});`);

    expect(report?.message).toContain('The whole of this test is `pipe` existing');
    expect(report?.suggestions ?? []).toEqual([]);
  });

  it('stays silent where the block has nothing else that runs', () => {
    expect(
      subjects(
        "it('should create', () => { expect(pipe).toBeTruthy(); });",
        "it('should create the service', () => { expect(service).toBeTruthy(); });",
        "it.skip('drops the empty entries', () => { expect(pipe.transform([])).toEqual([]); });",
        "xit('parses a date', () => { expect(pipe.transform('x')).toBe(1); });",
        "it.todo('rejects a bad pattern');",
        "it.each([1, 2])('should create', () => { expect(pipe).toBeTruthy(); });",
      ),
    ).toEqual([]);
  });

  it('counts the tests a nested block declares, which run the outer setup before their own', () => {
    const source = `describe('MyPipe', () => {
  it('should create', () => { expect(pipe).toBeTruthy(); });

  describe('transform', () => {
    ${PROVING}
  });
});`;

    expect(verify(source).map((message) => message.line)).toEqual([2]);
  });

  it('does not weigh a nested test against the block above it, whose setup it does not run', () => {
    const source = `describe('MyPipe', () => {
  ${PROVING}

  describe('transform', () => {
    it('should create', () => { expect(pipe).toBeTruthy(); });
  });
});`;

    expect(verify(source)).toEqual([]);
  });

  it('stays silent on a body that does anything besides asking for the subject', () => {
    const live = [
      "it('should create', () => { const local = new MyPipe(); expect(local).toBeTruthy(); });",
      "it('should create', () => { expect(pipe.transform([])).toBeTruthy(); expect(calls).toBe(1); });",
      "it('should create', () => { if (ready) { expect(pipe).toBeTruthy(); } });",
      "it('should create', () => {});",
      "it('should create', handler);",
    ];

    expect(subjects(PROVING, ...live)).toEqual([]);
  });

  it('stays silent on an assertion that asks more than whether the value is there', () => {
    const live = [
      "it('should create', () => { expect(pipe).toBe(created); });",
      "it('should create', () => { expect(pipe).not.toBeTruthy(); });",
      "it('should create', () => { expect(pipe).toBeNull(); });",
      "it('should create', () => { expect(pipe).resolves.toBeTruthy(); });",
      "it('should create', () => { expect(pipe); });",
      "it('should create', () => { expect().toBeTruthy(); });",
      "it('should create', () => { expect(pipe).toBeTruthy; });",
      "it('should create', () => { assert(pipe).toBeTruthy(); });",
      "it('should create', () => { expect(pipe)[matcher](); });",
      "it('should create', () => { check(pipe); });",
    ];

    expect(subjects(PROVING, ...live)).toEqual([]);
  });

  it('leaves alone every call that is not a test', () => {
    const live = [
      "describe('nested', () => { expect(pipe).toBeTruthy(); });",
      'beforeEach(() => { expect(pipe).toBeTruthy(); });',
      "runner[name]('should create', () => { expect(pipe).toBeTruthy(); });",
      "(0, it)('should create', () => { expect(pipe).toBeTruthy(); });",
      "suites.unit.it('should create', () => { expect(pipe).toBeTruthy(); });",
      'it(name, () => { expect(pipe).toBeTruthy(); });',
      'it();',
    ];

    expect(subjects(PROVING, ...live)).toEqual([]);
  });
});
