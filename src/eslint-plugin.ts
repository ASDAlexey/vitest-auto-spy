/**
 * `vitest-auto-spy/eslint-plugin` — the lint rules that keep a suite on the library's API.
 *
 * ```js
 * // eslint.config.js (flat config)
 * import autoSpy from 'vitest-auto-spy/eslint-plugin';
 *
 * export default [
 *   { files: ['**\/*.spec.ts'], ...autoSpy.configs.recommended },
 * ];
 * ```
 *
 * Scope the config to spec files yourself: every rule here is about test code, and `Object.
 * defineProperty` or an object of `vi.fn()`s is perfectly reasonable in application code.
 *
 * Flat config only. The legacy `.eslintrc` `plugins: ['…']` form resolves plugin names to
 * `eslint-plugin-*` packages, which a subpath export of this package can never be.
 */
import type { RuleModule } from './lib/eslint/rule-types';
import { rules } from './lib/eslint/rules';

/** Severity map shared by the shipped configs. */
export type RuleSeverity = 'error' | 'off' | 'warn';

/** A flat-config object: the plugin under its name, plus the rules it turns on. */
export interface FlatConfig {
  plugins: Record<string, unknown>;
  rules: Record<string, RuleSeverity>;
}

/** The plugin object, as ESLint consumes it. */
export interface AutoSpyEslintPlugin {
  rules: Record<string, RuleModule>;
  configs: { recommended: FlatConfig };
}

const PLUGIN_NAME = 'vitest-auto-spy';

/**
 * Every rule, every one of them an **error** (4.0.0). Before that the config was a graded mix of
 * `error` / `warn` / `off`, which meant the plugin decided how much each project cared.
 *
 * A `warn` is a finding a build does not stop for, so in a repository that does not read lint
 * output it is the same as `off` with extra noise. Choosing that for someone else is the part that
 * was wrong: which findings block a merge is a project's call, and it is one line of config either
 * way. So the default is the strict end, and the docs carry the dial —
 * `docs-site/utilities/eslint-plugin.md` → *Tuning it for your project*.
 *
 * **Three of these can report on code that is correct, and each one is listed there with what to do
 * about it.** They are not mistakes in the rules; they are the limit of what one file can know, and
 * only one of the three has an option, which is worth knowing before reaching for a severity:
 *
 * - `jasmine-namespace-without-entry` decides on a fact usually written in a *setup* file the linted
 *   spec never imports: does this project install the jasmine layer? `setupModules` is how a project
 *   answers — `['error', { setupModules: ['./test-setup'] }]` — and it is the fix, not the severity.
 * - `no-unregistered-inject-spy` has **no** option, and needs none in most projects: it silences
 *   itself whenever it cannot read a file's registrations in full (no `provideAutoSpy` at all, a
 *   spread or an unknown factory in `providers`, `createWithAutoSpies`, `renderShallow`,
 *   `TestBed.overrideProvider`). What is left over is the narrow case it cannot model — a file that
 *   registers some doubles in the readable shape and obtains another through a helper this scan does
 *   not follow — and there the answer is a scoped `'off'` or a per-line disable.
 * - `prefer-native-spy-api` reports code that *works*: the compatibility layer is what a suite runs
 *   on while it is being migrated, so on day one of a migration it fires on every line of the
 *   bridge. That is the correct time to switch it off for a while — the migration is finished when
 *   it is silent, and `eslint --fix` plus the codemod do most of the rewrite.
 */
// Spelled out rather than generated from `rules`, so that a rule added without a line here fails
// the "ships every rule it recommends" test instead of being silently switched on.
const recommendedRules: Record<string, RuleSeverity> = {
  [`${PLUGIN_NAME}/prefer-provide-auto-spy`]: 'error',
  [`${PLUGIN_NAME}/prefer-create-spy-from-class`]: 'error',
  [`${PLUGIN_NAME}/prefer-inject-spy`]: 'error',
  [`${PLUGIN_NAME}/prefer-as-spy`]: 'error',
  [`${PLUGIN_NAME}/no-object-define-property`]: 'error',
  [`${PLUGIN_NAME}/no-expect-in-subscribe`]: 'error',
  [`${PLUGIN_NAME}/no-shared-module-level-mock`]: 'error',
  [`${PLUGIN_NAME}/no-mocked-for-spy`]: 'error',
  [`${PLUGIN_NAME}/no-done-callback`]: 'error',
  [`${PLUGIN_NAME}/no-floating-assertion`]: 'error',
  [`${PLUGIN_NAME}/no-bare-called-with`]: 'error',
  [`${PLUGIN_NAME}/no-overridden-provider`]: 'error',
  [`${PLUGIN_NAME}/no-inject-before-override`]: 'error',
  [`${PLUGIN_NAME}/no-import-time-spread`]: 'error',
  [`${PLUGIN_NAME}/no-unregistered-inject-spy`]: 'error',
  [`${PLUGIN_NAME}/jasmine-namespace-without-entry`]: 'error',
  [`${PLUGIN_NAME}/no-jasmine-globals`]: 'error',
  [`${PLUGIN_NAME}/no-save-arguments-by-value`]: 'error',
  [`${PLUGIN_NAME}/prefer-native-spy-api`]: 'error',
};

const plugin: AutoSpyEslintPlugin = {
  rules,
  configs: { recommended: { plugins: {}, rules: recommendedRules } },
};

// Flat config names the plugin object itself, so the config can only be completed once the plugin
// exists — hence the assignment rather than a literal.
plugin.configs.recommended.plugins[PLUGIN_NAME] = plugin;

export default plugin;
