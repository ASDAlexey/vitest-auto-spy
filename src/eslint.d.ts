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
    /**
     * What a flat config's `files` patterns are matched against.
     *
     * Declared because one rule spec lints fixtures from a throwaway directory outside the
     * repository: without it every fixture comes back as a single `No matching configuration found`
     * message instead of the rule's own reports — which reads as a green `[]` in every "must not
     * report" assertion and fails only the ones that must.
     */
    cwd?: string;
  }

  export class Linter {
    constructor(options?: LinterOptions);
    verify(code: string, config: unknown, filename?: string): LintMessage[];
    verifyAndFix(code: string, config: unknown, filename?: string): FixReport;
  }
}
