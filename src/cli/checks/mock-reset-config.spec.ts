import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { literalSpans } from './literals';
import { checkMockResetConfig, closingBracket, unflaggedConfigFiles, unreadableCallee } from './mock-reset-config';

afterEach(() => {
  removeTempRepos();
});

const findings = (files: Record<string, string>): ReturnType<typeof checkMockResetConfig> => {
  const profile = readProfile(createTempRepo({ 'package.json': '{}', ...files }));

  return checkMockResetConfig(profile, buildGraph(profile));
};

const lintConfig = (options: string): string =>
  `export default [{ rules: { 'vitest-auto-spy/no-redundant-mock-reset': ['error', ${options}] } }];`;

describe('unflaggedConfigFiles', () => {
  it('returns the configFile of a rule entry that writes no flag beside it', () => {
    expect(unflaggedConfigFiles(lintConfig("{ configFile: 'vitest.config.ts' }"))).toEqual(['vitest.config.ts']);
    expect(unflaggedConfigFiles(lintConfig("{ configFile: 'vitest.config.ts', clearMocks: true }"))).toEqual([]);
    expect(unflaggedConfigFiles(lintConfig("{ configFile: 'vitest.config.ts', restoreMocks: false }"))).toEqual([]);
    expect(unflaggedConfigFiles(lintConfig('{ clearMocks: true }'))).toEqual([]);
    expect(unflaggedConfigFiles(lintConfig('{ configFile: path }'))).toEqual([]);
  });

  it('reads past strings and comments that hold brackets or option names', () => {
    const text = lintConfig("{ configFile: 'tools/[x].config.ts' /* clearMocks: true */, note: 'mockReset: true ]' }");

    expect(unflaggedConfigFiles(text)).toEqual(['tools/[x].config.ts']);
  });

  it('ignores the rule name inside a comment or another string', () => {
    const text = [
      "// 'vitest-auto-spy/no-redundant-mock-reset': ['error', { configFile: 'a.config.ts' }]",
      'const note = "see \'x/no-redundant-mock-reset\': [";',
    ].join('\n');

    expect(unflaggedConfigFiles(text)).toEqual([]);
  });
});

describe('closingBracket', () => {
  it('stops at the end of the text when the array never closes', () => {
    const text = "['error', { configFile: 'a' }";

    expect(closingBracket(text, literalSpans(text), 0)).toBe(text.length);
  });
});

describe('unreadableCallee', () => {
  it('names a factory or mergeConfig default export that writes no flag', () => {
    expect(unreadableCallee('export default createProjectConfig({ alias: [] });')).toBe('createProjectConfig');
    expect(unreadableCallee('export default mergeConfig(base, defineConfig({ test: {} }));')).toBe('mergeConfig');
    expect(unreadableCallee('module.exports = tooling.vitest<Options>({});')).toBe('tooling.vitest');
  });

  it('leaves alone what the rule reads as written', () => {
    expect(unreadableCallee('export default defineConfig({ test: {} });')).toBeUndefined();
    expect(unreadableCallee('export default defineProject({ test: {} });')).toBeUndefined();
    expect(unreadableCallee('export default createProjectConfig({ clearMocks: false });')).toBeUndefined();
    expect(unreadableCallee('export default { test: {} };')).toBeUndefined();
  });
});

describe('checkMockResetConfig', () => {
  it('reports the lint config whose configFile names a factory-built runner config', () => {
    const [finding, ...rest] = findings({
      'eslint.config.mjs': lintConfig("{ configFile: 'vitest.config.ts' }"),
      'vitest.config.ts': 'export default createProjectConfig({ alias: [] });',
    });

    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ check: 'mock-reset-config-unread', severity: 'info', file: 'eslint.config.mjs' });
    expect(finding?.message).toBe(
      "`no-redundant-mock-reset` reads `vitest.config.ts`, whose default export is a `createProjectConfig(…)` call: the rule reads the file as text, finds no `clearMocks` / `mockReset` / `restoreMocks`, and decides on the runner's defaults instead of what `createProjectConfig` sets.",
    );
    expect(finding?.fix).toBe(
      'Write the flags that config ends up with beside `configFile` in the rule options, e.g. `{ configFile, clearMocks: true }`; a flag written there wins over the file.',
    );
  });

  it('stays quiet for a readable config, flags beside configFile, or a configFile that is not there', () => {
    expect(
      findings({
        'eslint.config.mjs': lintConfig("{ configFile: 'vitest.config.ts' }"),
        'vitest.config.ts': 'export default defineConfig({ test: { clearMocks: true } });',
      }),
    ).toEqual([]);
    expect(
      findings({
        'eslint.config.mjs': lintConfig("{ configFile: 'vitest.config.ts', clearMocks: true }"),
        'vitest.config.ts': 'export default createProjectConfig({});',
      }),
    ).toEqual([]);
    expect(findings({ 'eslint.config.mjs': lintConfig("{ configFile: 'missing.config.ts' }") })).toEqual([]);
  });
});
