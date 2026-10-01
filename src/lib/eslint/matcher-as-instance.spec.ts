import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { fixRule, runRule } from './run-rule';

const RULE = 'no-redundant-as-instance';
const IMPORT = "import { asInstance } from 'vitest-auto-spy';\n";

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** The lines the rule reports, each under the import the wrapper needs. A line that does not parse fails the test rather than passing as a report. */
const reported = (lines: string[], preamble = IMPORT): string[] =>
  lines.filter((line) => {
    const messages = verify(`${preamble}${line}`);

    expect(messages.filter((message) => message.ruleId === null)).toEqual([]);

    return messages.length > 0;
  });

/** Run the rule the way `eslint --fix` does, repeated passes and all. */
function autofix(code: string): string {
  return fixRule(RULE, code).output;
}

describe(RULE, () => {
  it('reports the wrapper under each comparing matcher', () => {
    const wrapped = [
      'expect(service.open()).toBe(asInstance(ref));',
      'expect(service.open()).toEqual(asInstance(ref));',
      'expect(service.open()).toStrictEqual(asInstance(ref));',
      'expect(service.open()).not.toBe(asInstance(ref));',
      'expect(service.open()).toBe(asInstance<CartStore>(store));',
      'expect(cart).toEqual(asInstance(store), asInstance(catalog));',
    ];

    expect(reported(wrapped)).toEqual(wrapped);
  });

  it('names the matcher and the plain spelling', () => {
    const [report] = verify(`${IMPORT}expect(service.open()).toBe(asInstance(ref));`);

    expect(report?.message).toMatch(/^`asInstance\(ref\)` buys nothing under `\.toBe\(\)`/);
    expect(report?.message).toContain('Pass `ref` directly');
    expect(report?.message).toContain('/utilities/eslint-rules#no-redundant-as-instance');
  });

  it('stays silent where the unwrap is load-bearing or the wrapper is not the argument', () => {
    expect(
      reported([
        'expect(service.register).toHaveBeenCalledWith(asInstance(cart));',
        'expect(result).toMatchObject({ store: asInstance(store) });',
        'expect(result).toEqual([asInstance(store)]);',
        'expect(result).toBe(asInstance(store).id);',
        'expect(service.load(...asInstances(store, catalog))).toBe(1);',
        'expect(result).toBe(asInstance());',
        'expect(result).toBe(asInstance(store, catalog));',
        'expect(result).toBe(refresh(store));',
        'await expect(promise).resolves.toBe(asInstance(ref));',
        'await expect(promise).rejects.toEqual(asInstance(ref));',
        'expect.soft(result).toBe(asInstance(ref));',
        'expect(result);',
        'expect(result).not;',
        'assert(result).toBe(asInstance(ref));',
      ]),
    ).toEqual([]);
  });

  it('stays silent on a name the file declares, renames or never imports', () => {
    const local = 'function asInstance<T>(value: T): T {\n  return value;\n}\n';
    const aliased = "import { asInstance as view } from 'vitest-auto-spy';\n";

    expect(reported(['expect(result).toBe(asInstance(ref));'], '')).toEqual([]);
    expect(reported(['expect(result).toBe(asInstance(ref));'], local)).toEqual([]);
    expect(reported(['expect(result).toBe(view(ref));'], aliased)).toEqual([]);
  });

  it('drops the wrapper and the import with it, and only once the import is orphaned', () => {
    expect(autofix(`${IMPORT}expect(service.open()).toBe(asInstance(ref));`)).toBe('\nexpect(service.open()).toBe(ref);');
    expect(autofix(`${IMPORT}expect(service.open()).toBe(asInstance<CartStore>(store));`)).toBe('\nexpect(service.open()).toBe(store);');
    expect(
      autofix("import { asInstance, createSpyFromClass } from 'vitest-auto-spy';\nexpect(service.open()).toBe(asInstance(ref));"),
    ).toBe("import { createSpyFromClass } from 'vitest-auto-spy';\nexpect(service.open()).toBe(ref);");
    expect(autofix(`${IMPORT}expect(a()).toBe(asInstance(x));\nexpect(b()).toEqual(asInstance(y));`)).toBe(
      `${IMPORT}expect(a()).toBe(x);\nexpect(b()).toEqual(y);`,
    );
    expect(autofix("import autoSpy, { asInstance } from 'vitest-auto-spy';\nexpect(service.open()).toBe(asInstance(ref));")).toBe(
      "import autoSpy, { asInstance } from 'vitest-auto-spy';\nexpect(service.open()).toBe(ref);",
    );
  });
});
