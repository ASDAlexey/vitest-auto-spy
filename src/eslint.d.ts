/**
 * Minimal ambient typing for `eslint` (v8 ships none, and `@types/eslint` is not a dependency of
 * this library). Only the `Linter` surface the rule specs use is declared — the plugin itself
 * declares its own ESTree shapes in `lib/eslint/rule-types.ts` and imports nothing from ESLint.
 */
declare module 'eslint' {
  /** One edit ESLint computed, as it comes back out of a report. */
  export interface LintFix {
    range: [number, number];
    text: string;
  }

  /** An edit offered rather than applied — what an editor lists under "Quick fix". */
  export interface LintSuggestion {
    desc: string;
    fix: LintFix;
  }

  export interface LintMessage {
    ruleId: string | null;
    message: string;
    line: number;
    suggestions?: LintSuggestion[];
  }

  /** What `verifyAndFix` reports: the source after every applied pass, and what is left over. */
  export interface FixReport {
    fixed: boolean;
    output: string;
    messages: LintMessage[];
  }

  export interface LinterOptions {
    configType?: 'eslintrc' | 'flat';
  }

  export class Linter {
    constructor(options?: LinterOptions);
    verify(code: string, config: unknown, filename?: string): LintMessage[];
    verifyAndFix(code: string, config: unknown, filename?: string): FixReport;
  }
}
