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

import { FIXTURES } from './prefer-to-have-signal-value.mock';
import { fixRule, runRule } from './run-rule';

/** Single-run inference off, for the reason `private-access.spec.ts` spells out. */
const TYPED = { disallowAutomaticSingleRunInference: true } as const;

const RULE = 'prefer-to-have-signal-value';

const REPO_NODE_MODULES = join(process.cwd(), 'node_modules');

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
    ['signal-to-be-null.spec.ts', 'counter.items'],
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

  it('stays silent on a toBe that checks the identity of an object, which toHaveSignalValue compares deeply', () => {
    expect(lintTyped('object-to-be.spec.ts')).toStrictEqual([]);
    expect(lintTyped('object-to-equal.spec.ts')).toHaveLength(1);
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

  it('rewrites a toBe whose signal holds a primitive or whose expected value is a primitive literal', () => {
    expect(autofix('primitive-to-be.spec.ts').output).toBe(
      "import { Counter } from './counter';\n" +
        'declare const counter: Counter;\n' +
        'declare const three: number;\n' +
        'expect(counter.total).toHaveSignalValue(three);\n' +
        'expect(counter.loose).toHaveSignalValue(-1);\n' +
        'expect(counter.loose).toHaveSignalValue(undefined);\n' +
        'expect(counter.loose).toHaveSignalValue(`a`);\n',
    );
  });

  it('rewrites toBeNull and toBeUndefined into toHaveSignalValue with the value they assert, .not included', () => {
    const fixed = autofix('signal-to-be-null.spec.ts');

    expect(fixed.messages).toStrictEqual([]);
    expect(fixed.output).toBe(
      "import { Counter } from './counter';\n" +
        'declare const counter: Counter;\n' +
        'expect(counter.items).toHaveSignalValue(null);\n' +
        'expect(counter.items).not.toHaveSignalValue(undefined);\n',
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
