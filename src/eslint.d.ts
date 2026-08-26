/**
 * Minimal ambient typing for `eslint` (v8 ships none, and `@types/eslint` is not a dependency of
 * this library). Only the `Linter` surface the rule specs use is declared — the plugin itself
 * declares its own ESTree shapes in `lib/eslint/rule-types.ts` and imports nothing from ESLint.
 */
declare module 'eslint' {
  export interface LintMessage {
    ruleId: string | null;
    message: string;
    line: number;
  }

  export interface LinterOptions {
    configType?: 'eslintrc' | 'flat';
  }

  export class Linter {
    constructor(options?: LinterOptions);
    verify(code: string, config: unknown, filename?: string): LintMessage[];
  }
}
