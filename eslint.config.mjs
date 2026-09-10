/*
 * ESLint config for the `vitest-auto-spy` library.
 *
 * Distilled from the strict ruleset of a production Angular application,
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
import comments from '@eslint-community/eslint-plugin-eslint-comments';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importX from 'eslint-plugin-import-x';
import optimizeRegex from 'eslint-plugin-optimize-regex';
import rxjs from 'eslint-plugin-rxjs-x';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

const languageOptions = {
  globals: globals.node,
  parser: tsParser,
  parserOptions: {
    // `tsconfig.types.json` is here for one file: `src/type-tests/rxjs-seam.test-d.ts` describes a
    // program without `vitest-auto-spy/rxjs` in it and is excluded from `tsconfig.json` for that
    // reason, which would otherwise leave it unlintable ("The file was not found in any of the
    // provided project(s)").
    project: ['./tsconfig.json', './tsconfig.spec.json', './tsconfig.types.json'],
    tsconfigRootDir: import.meta.dirname,
  },
};

const plugins = {
  '@eslint-community/eslint-comments': comments,
  '@typescript-eslint': tseslint,
  'import-x': importX,
  'optimize-regex': optimizeRegex,
  'rxjs-x': rxjs,
};

export default defineConfig([
  // `--ext .ts` is gone in flat config, and `eslint .` would otherwise pick up every `.js`/`.mjs`
  // in the repository — scripts and generated packages that no ruleset here was ever written for.
  globalIgnores(['dist', 'coverage', 'alias', 'bench', '**/*.cjs', '**/*.js', '**/*.mjs', '**/*.mts', '**/*.config.ts']),

  // ===== Library source =====
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts', 'src/bun-tests/**/*.ts', 'src/node-tests/**/*.ts', 'src/rstest-tests/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs['flat/recommended']],
    languageOptions,
    // Replaces `@eslint-community/eslint-comments/no-unused-disable`, which the core option
    // supersedes; keeping both reports every stale disable twice.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins,
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
      // `plugin:@typescript-eslint/recommended` switches `no-var` off; the `globalThis`
      // augmentations disable it by name, so it has to be on for those directives to mean anything.
      'no-var': 'error',
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'optimize-regex/optimize-regex': 'error',
      'import-x/no-duplicates': ['error', { considerQueryString: true }],
      'rxjs-x/no-floating-observables': 'error',
      'rxjs-x/no-nested-subscribe': 'error',
      'rxjs-x/no-unbound-methods': 'error',
      'rxjs-x/throw-error': 'error',
      'rxjs-x/no-unsafe-takeuntil': 'error',
      'rxjs-x/no-create': 'error',
      'rxjs-x/no-explicit-generics': 'error',
      'rxjs-x/no-ignored-replay-buffer': 'error',
      'rxjs-x/no-unsafe-catch': 'error',
      '@eslint-community/eslint-comments/disable-enable-pair': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/no-duplicate-disable': 'error',
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
    },
  },

  // ===== Tests =====
  {
    files: ['src/**/*.spec.ts', 'src/bun-tests/**/*.ts', 'src/node-tests/**/*.ts', 'src/rstest-tests/**/*.ts', 'src/test-setup.ts'],
    extends: [js.configs.recommended, tseslint.configs['flat/recommended']],
    languageOptions,
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins,
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
    },
  },
]);
