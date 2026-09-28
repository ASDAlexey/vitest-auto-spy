/**
 * The one spec here that has to know what the checker really does with Angular's brand.
 *
 * A signal is branded through a symbol-keyed property, which the checker lists as `__@SIGNAL@53` —
 * the trailing number differs per program — and `getProperty('ɵSIGNAL')` by plain name finds none of
 * them. So the fixtures import the real `@angular/core` through a symlinked `node_modules`, and the
 * false-positive cases carry the weight: a method, a plain function, a getter and a non-matcher
 * assertion must all stay silent, because a syntactic version of this rule would report every
 * `expect(x()).toBe(…)` in a suite.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fixRule, runRule } from './run-rule';

/** Single-run inference off, for the reason `private-access.spec.ts` spells out. */
const TYPED = { disallowAutomaticSingleRunInference: true } as const;

const RULE = 'prefer-to-have-signal-value';

const REPO_NODE_MODULES = join(process.cwd(), 'node_modules');

const COUNTER = `
import { computed, signal } from '@angular/core';

export class Counter {
  readonly total = signal(3);
  readonly doubled = computed(() => this.total() * 2);

  label(): string {
    return 'three';
  }
}
`;

/** The fixtures, by file name — all written before the first lint, so one program covers them. */
const FIXTURES: Record<string, string> = {
  'counter.ts': COUNTER,
  'signal-to-be.spec.ts': "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total()).toBe(3);\n",
  'signal-to-equal.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.doubled()).toEqual(6);\n",
  'signal-to-strict-equal.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total()).toStrictEqual(3);\n",
  'negated.spec.ts': "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total()).not.toBe(3);\n",
  'generic-type-arguments.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total<number>()).toBe(3);\n",
  'strict-equal-no-arguments.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total()).toStrictEqual();\n",
  'method-call.spec.ts': "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.label()).toBe('three');\n",
  'plain-function.spec.ts': 'declare const read: () => number;\nexpect(read()).toBe(1);\n',
  'not-expect.spec.ts':
    "import { Counter } from './counter';\n" +
    'declare const counter: Counter;\n' +
    'declare const checked: { toBe(expected: unknown): void };\n' +
    'declare const verify: (value: unknown, note: string) => { toBe(expected: unknown): void };\n' +
    'declare const library: { expect(value: unknown): { toBe(expected: unknown): void } };\n' +
    'checked.toBe(counter.total());\n' +
    "verify(counter.total(), 'note').toBe(3);\n" +
    'library.expect(counter.total()).toBe(3);\n',
  'non-matcher.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total()).toBeTruthy();\nexpect(counter.total()).toHaveBeenCalled();\n",
  'plain-value.spec.ts': 'declare const box: { value: number };\nexpect(box.value).toBe(1);\n',
};

let root: string;

/** A linter bound to the fixture root, where `files` patterns and the program both resolve. */
let linter: Linter;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'vas-signal-value-'));
  linter = new Linter({ configType: 'flat', cwd: root });
  symlinkSync(REPO_NODE_MODULES, join(root, 'node_modules'), 'dir');

  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
      include: ['*.ts'],
    }),
  );

  Object.entries(FIXTURES).forEach(([name, code]) => writeFileSync(join(root, name), code));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Read per call: both are assigned in `beforeAll`, which module scope runs first. */
const typedOptions = (): { linter: Linter; languageOptions: object } => ({
  linter,
  languageOptions: { parser: tsParser, parserOptions: { ...TYPED, project: ['./tsconfig.json'], tsconfigRootDir: root } },
});

const lintTyped = (fixture: string): LintMessage[] => runRule(RULE, FIXTURES[fixture] ?? '', { filename: fixture, ...typedOptions() });

describe('prefer-to-have-signal-value — the shapes it must report', () => {
  it.each([
    ['signal-to-be.spec.ts', 'counter.total'],
    ['signal-to-equal.spec.ts', 'counter.doubled'],
    ['signal-to-strict-equal.spec.ts', 'counter.total'],
    ['negated.spec.ts', 'counter.total'],
    ['generic-type-arguments.spec.ts', 'counter.total'],
    ['strict-equal-no-arguments.spec.ts', 'counter.total'],
  ])('reports the signal read inline in %s', (fixture, signal) => {
    const [message] = lintTyped(fixture);

    expect(message?.message).toContain(`expect(${signal})`);
    expect(message?.ruleId).toBe(`vitest-auto-spy/${RULE}`);
  });

  it('stays silent on a method call, a plain function, a non-matcher assertion, a plain value and a matcher on something that is not expect', () => {
    expect(lintTyped('method-call.spec.ts')).toStrictEqual([]);
    expect(lintTyped('plain-function.spec.ts')).toStrictEqual([]);
    expect(lintTyped('not-expect.spec.ts')).toStrictEqual([]);
    expect(lintTyped('non-matcher.spec.ts')).toStrictEqual([]);
    expect(lintTyped('plain-value.spec.ts')).toStrictEqual([]);
  });

  it('reports nothing without parser services, rather than guessing from the name', () => {
    const messages = runRule(RULE, FIXTURES['signal-to-be.spec.ts'] ?? '', {
      filename: 'signal-to-be.spec.ts',
      languageOptions: { parser: tsParser },
    });

    expect(messages).toStrictEqual([]);
  });
});

describe('prefer-to-have-signal-value — the fix', () => {
  const autofix = (fixture: string): ReturnType<typeof fixRule> =>
    fixRule(RULE, FIXTURES[fixture] ?? '', { filename: fixture, ...typedOptions() });

  it('rewrites toBe and toEqual into toHaveSignalValue over the signal itself', () => {
    expect(autofix('signal-to-be.spec.ts').output).toBe(
      "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total).toHaveSignalValue(3);\n",
    );
    expect(autofix('signal-to-equal.spec.ts').output).toBe(
      "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.doubled).toHaveSignalValue(6);\n",
    );
    expect(autofix('negated.spec.ts').output).toBe(
      "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total).not.toHaveSignalValue(3);\n",
    );
  });

  it('keeps the strict comparison a toStrictEqual had', () => {
    expect(autofix('signal-to-strict-equal.spec.ts').output).toBe(
      "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total).toHaveSignalValue(3, { strict: true });\n",
    );
    expect(autofix('strict-equal-no-arguments.spec.ts').output).toBe(
      "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total).toHaveSignalValue();\n",
    );
  });

  it('reports but leaves a received call that carries type arguments of its own', () => {
    const fixed = autofix('generic-type-arguments.spec.ts');

    expect(fixed.output).toBe(FIXTURES['generic-type-arguments.spec.ts']);
    expect(fixed.messages).toHaveLength(1);
  });
});
