/**
 * Type-level tests for the published shape of `vitest-auto-spy/eslint-plugin`.
 *
 * The plugin is typed without importing ESLint, so nothing but this file notices when its shape
 * stops fitting ESLint's own `Plugin` and flat-config types — and a consumer who types
 * `eslint.config.ts` meets that as a `TS2322` on the one line that registers the plugin.
 */
import type { ConfigObject, Plugin } from '@eslint/core';
import { describe, expectTypeOf, it } from 'vitest';

import autoSpy from '../eslint-plugin';

describe('the eslint-plugin default export', () => {
  it('is an ESLint Plugin', () => {
    expectTypeOf(autoSpy).toExtend<Plugin>();
  });

  it('drops into a flat config under its name, or spread from a shipped config', () => {
    expectTypeOf({ files: ['**/*.spec.ts'], plugins: { 'vitest-auto-spy': autoSpy } }).toExtend<ConfigObject>();
    expectTypeOf({ files: ['**/*.spec.ts'], ...autoSpy.configs.recommended }).toExtend<ConfigObject>();
    expectTypeOf(autoSpy.configs.strict).toExtend<ConfigObject>();
    expectTypeOf(autoSpy.configs.typeErrors).toExtend<ConfigObject>();
  });
});
