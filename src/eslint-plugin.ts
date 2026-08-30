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

/** Everything on: the five "there is a helper for this" rules plus the nine guards. */
const recommendedRules: Record<string, RuleSeverity> = {
  [`${PLUGIN_NAME}/prefer-provide-auto-spy`]: 'warn',
  [`${PLUGIN_NAME}/prefer-create-spy-from-class`]: 'warn',
  [`${PLUGIN_NAME}/prefer-inject-spy`]: 'warn',
  [`${PLUGIN_NAME}/prefer-as-spy`]: 'warn',
  [`${PLUGIN_NAME}/no-object-define-property`]: 'error',
  [`${PLUGIN_NAME}/no-expect-in-subscribe`]: 'error',
  [`${PLUGIN_NAME}/no-shared-module-level-mock`]: 'error',
  [`${PLUGIN_NAME}/no-mocked-for-spy`]: 'warn',
  [`${PLUGIN_NAME}/no-done-callback`]: 'error',
  [`${PLUGIN_NAME}/no-floating-assertion`]: 'error',
  [`${PLUGIN_NAME}/no-overridden-provider`]: 'error',
  [`${PLUGIN_NAME}/no-inject-before-override`]: 'warn',
  [`${PLUGIN_NAME}/no-import-time-spread`]: 'error',
  [`${PLUGIN_NAME}/no-unregistered-inject-spy`]: 'warn',
};

const plugin: AutoSpyEslintPlugin = {
  rules,
  configs: { recommended: { plugins: {}, rules: recommendedRules } },
};

// Flat config names the plugin object itself, so the config can only be completed once the plugin
// exists — hence the assignment rather than a literal.
plugin.configs.recommended.plugins[PLUGIN_NAME] = plugin;

export default plugin;
