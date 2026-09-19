/**
 * The one ESLint harness the specs lint through: a flat-config `Linter` with the TypeScript parser
 * and this plugin registered under its name, one rule enabled at a time.
 *
 * The knobs are the ones a spec needs — `options` behind the severity, a `filename` the rule may
 * read, `globals` and `severity` where the spec spells the config a consumer writes. The type-aware
 * specs hand over their own `languageOptions` (a parser with a real program) and the `linter` bound
 * to their fixture root, because neither is a per-rule choice.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';

import plugin from '../../eslint-plugin';

type RuleConfig = Parameters<Linter['verify']>[1];
type FixReport = ReturnType<Linter['verifyAndFix']>;

/** How a rule is turned on: the severity, the options after it, and the environment it reads. */
export interface RuleRun {
  severity?: 'error' | 'warn' | undefined;
  options?: object | undefined;
  filename?: string | undefined;
  globals?: Record<string, 'readonly'> | undefined;
  /** Replaces the default `{ parser, globals }` — the type-aware specs pass a parser with a program. */
  languageOptions?: object | undefined;
  /** The Linter to verify through — the fs-backed specs bind one to their fixture root's cwd. */
  linter?: Linter | undefined;
}

const linter = new Linter({ configType: 'flat' });

function configFor(rule: string, run: RuleRun): RuleConfig {
  const severity = run.severity ?? 'error';

  return [
    {
      files: ['**/*.ts'],
      languageOptions: run.languageOptions ?? { parser: tsParser, globals: run.globals ?? {} },
      plugins: { 'vitest-auto-spy': plugin },
      rules: { [`vitest-auto-spy/${rule}`]: run.options ? [severity, run.options] : severity },
    },
  ];
}

/** Lint a snippet with a single rule of the plugin enabled, configured when options are given. */
export function runRule(rule: string, code: string, run: RuleRun = {}): LintMessage[] {
  return (run.linter ?? linter).verify(code, configFor(rule, run), run.filename ?? 'component.spec.ts');
}

/** Run the rule the way `eslint --fix` does, repeated passes and all. */
export function fixRule(rule: string, code: string, run: RuleRun = {}): FixReport {
  return (run.linter ?? linter).verifyAndFix(code, configFor(rule, run), run.filename ?? 'component.spec.ts');
}
