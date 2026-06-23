'use strict';

/*
 * ESLint config for the `vitest-auto-spy` library.
 *
 * Distilled from the strict ruleset of the meta-pdm-admin-frontend project,
 * keeping ONLY the rules that make sense for a framework-light TypeScript
 * library: the @typescript-eslint rules, rxjs hygiene, eslint-comments
 * discipline, regex optimisation and import de-duplication.
 *
 * Angular-/ngrx-/template-specific plugins (component selectors, change
 * detection, ngrx store conventions, html templates, project-local rules)
 * are intentionally dropped — they do not apply to this package.
 *
 * `any` is banned by default. The handful of places where `any` is genuinely
 * load-bearing for generic spy inference use an inline disable WITH a
 * description (see `require-description`). Disables are allowed but must be
 * justified — they are not silently permitted everywhere.
 */

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json', './tsconfig.spec.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'rxjs', 'optimize-regex', 'import', '@eslint-community/eslint-plugin-eslint-comments'],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.cjs', '*.mts', '*.config.ts'],
  overrides: [
    // ===== Library source =====
    {
      files: ['src/**/*.ts'],
      excludedFiles: ['**/*.spec.ts'],
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/no-deprecated': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-inferrable-types': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
        '@typescript-eslint/no-empty-function': ['error', { allow: ['methods'] }],
        '@typescript-eslint/no-unused-expressions': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
        '@typescript-eslint/prefer-includes': 'error',
        '@typescript-eslint/prefer-optional-chain': 'error',
        '@typescript-eslint/prefer-nullish-coalescing': 'error',
        '@typescript-eslint/sort-type-constituents': 'error',
        'dot-notation': 'off',
        '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],
        'no-restricted-syntax': [
          'error',
          {
            selector: 'MethodDefinition[accessibility="private"]',
            message: 'Use #private methods instead of the `private` keyword.',
          },
          {
            selector: 'PropertyDefinition[accessibility="private"]',
            message: 'Use #private fields instead of the `private` keyword.',
          },
          {
            selector: 'TSAsExpression > TSUnknownKeyword',
            message: '`as unknown` is banned. Find the correct typing.',
          },
        ],
        'padding-line-between-statements': ['error', { blankLine: 'always', prev: '*', next: 'if' }],
        'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
        'object-shorthand': 'error',
        curly: 'error',
        eqeqeq: ['error', 'always'],
        'no-console': 'error',
        'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
        'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
        'optimize-regex/optimize-regex': 'error',
        'import/no-duplicates': ['error', { considerQueryString: true }],
        'rxjs/no-ignored-observable': 'error',
        'rxjs/no-nested-subscribe': 'error',
        'rxjs/no-unbound-methods': 'error',
        'rxjs/throw-error': 'error',
        'rxjs/no-unsafe-takeuntil': 'error',
        'rxjs/no-create': 'error',
        'rxjs/no-explicit-generics': 'error',
        'rxjs/no-ignored-replay-buffer': 'error',
        'rxjs/no-unsafe-catch': 'error',
        '@eslint-community/eslint-comments/disable-enable-pair': 'error',
        '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
        '@eslint-community/eslint-comments/no-duplicate-disable': 'error',
        '@eslint-community/eslint-comments/no-unused-disable': 'error',
        '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      },
    },

    // ===== Tests =====
    {
      files: ['src/**/*.spec.ts', 'src/test-setup.ts'],
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/no-deprecated': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-unused-expressions': 'off',
        'no-restricted-properties': [
          'error',
          { object: 'describe', property: 'skip', message: 'Do not commit skipped tests (describe.skip).' },
          { object: 'it', property: 'skip', message: 'Do not commit skipped tests (it.skip).' },
          { object: 'test', property: 'skip', message: 'Do not commit skipped tests (test.skip).' },
        ],
        'object-shorthand': 'error',
        curly: 'error',
        eqeqeq: ['error', 'always'],
        '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
        '@eslint-community/eslint-comments/no-duplicate-disable': 'error',
        '@eslint-community/eslint-comments/no-unused-disable': 'error',
      },
    },
  ],
};
