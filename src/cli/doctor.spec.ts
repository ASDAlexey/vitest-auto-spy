/**
 * The `doctor` checks. Every one of them looks for a defect that **nothing consumes**: the suite
 * is green, `tsc --noEmit` reports zero errors, and the only reader of the stale thing is a person
 * opening the file. That is also what makes them easy to get wrong in the other direction, so each
 * check is pinned from both sides — the defect it must report, and the healthy shape it must not.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { checkAgentInstructions } from './checks/agent-instructions';
import { checkAngularBuild, compareVersions, isAffectedVersion, parseVersion } from './checks/angular-build';
import { checkForeignPragma, findPragmas } from './checks/foreign-pragma';
import { buildGraph, extractSpecifiers, resolveRelative } from './checks/graph';
import { checkOrphanRunnerConfig, referencedPaths } from './checks/orphan-runner-config';
import { checkSpecImports } from './checks/spec-imports';
import { checkTsconfigGlobs, expandInclude, globToRegExp, isExemptPattern } from './checks/tsconfig-globs';
import { runDoctor } from './doctor';
import type { Profile } from './profile';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const checks = (findings: readonly { check: string }[]): string[] => findings.map((finding) => finding.check);

/**
 * The pragma strings are assembled rather than written out. Vitest scans every spec file for
 * exactly these docblock comments and JSON-parses what follows the options one — a fixture that
 * spelled them literally would reconfigure, and then crash, the run that is testing them.
 */
const pragma = (name: string): string => `@${'jest'}-${name}`;

const profileWith = (over: Partial<Profile>): Profile => ({
  cwd: '/repo',
  runner: 'vitest',
  framework: 'none',
  entry: 'vitest-auto-spy',
  hasRxjs: false,
  hasAngular: false,
  setupFiles: [],
  dependencies: {},
  scripts: {},
  files: [],
  ...over,
});

describe('globToRegExp', () => {
  it('translates the four constructs TypeScript understands', () => {
    expect(globToRegExp('src/**/*.ts').test('src/a/b.ts')).toBe(true);
    expect(globToRegExp('src/**/*.ts').test('src/b.ts')).toBe(true);
    expect(globToRegExp('src/**').test('src/a/b.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/a/b.ts')).toBe(false);
    expect(globToRegExp('src/?.ts').test('src/a.ts')).toBe(true);
    expect(globToRegExp('src/a+b.ts').test('src/a+b.ts')).toBe(true);
  });
});

describe('expandInclude', () => {
  it('leaves a pattern that names an extension alone', () => {
    expect(expandInclude('src/**/*.spec.ts')).toEqual(['src/**/*.spec.ts']);
  });

  it('expands a directory, a trailing star and a trailing globstar over the known extensions', () => {
    expect(expandInclude('src/')).toContain('src/**/*.ts');
    expect(expandInclude('src/**/*')).toContain('src/**/*.tsx');
    expect(expandInclude('src/**')).toContain('src/**/*.ts');
  });
});

describe('isExemptPattern', () => {
  it('exempts a declaration-only glob and anything rooted in a directory the scan never enters', () => {
    expect(isExemptPattern('src/**/*.d.ts')).toBe(true);
    expect(isExemptPattern('out-tsc/**/*.ts')).toBe(true);
    expect(isExemptPattern('src/**/*.ts')).toBe(false);
  });
});

describe('checkTsconfigGlobs', () => {
  it('reports the glob a codemod ate, and stays quiet about the one that works', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'src/app.spec.ts': '',
      'tsconfig.spec.json': JSON.stringify({ include: ['src*.spec.ts', 'src/**/*.spec.ts'] }),
    });
    const findings = checkTsconfigGlobs(readProfile(root));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('"src*.spec.ts"');
  });

  it('reports a "files" entry that no longer exists', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'tsconfig.json': JSON.stringify({ files: ['src/main.ts'], include: [] }),
    });

    expect(checks(checkTsconfigGlobs(readProfile(root)))).toEqual(['tsconfig-file-missing']);
  });

  it('resolves a pattern against the config it came from, not the repository root', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'packages/app/src/main.ts': '',
      'packages/app/tsconfig.json': JSON.stringify({ include: ['src/**/*.ts'], files: ['src/main.ts'] }),
    });

    expect(checkTsconfigGlobs(readProfile(root))).toEqual([]);
  });

  it('skips an interpolated or absolute pattern, and a config it cannot parse', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'tsconfig.json': JSON.stringify({ include: ['${srcRoot}/**/*.ts', '/abs/**/*.ts', 'src/**/*.d.ts'] }),
      'tsconfig.broken.json': '{ not json',
    });

    expect(checkTsconfigGlobs(readProfile(root))).toEqual([]);
  });

  it('ignores a config that vanished between the scan and the read', () => {
    expect(checkTsconfigGlobs(profileWith({ files: ['tsconfig.json'] }))).toEqual([]);
  });
});

describe('the import graph', () => {
  it('finds every specifier form', () => {
    const specifiers = extractSpecifiers(
      `import a from './a';\nexport * from './b';\nimport './c';\nconst d = await import('./d');\nconst e = require('./e');`,
    );

    expect(specifiers.sort()).toEqual(['./a', './b', './c', './d', './e']);
  });

  it('resolves the extensionless, the .js-suffixed and the directory forms', () => {
    const files = new Set(['src/a.ts', 'src/dir/index.ts']);

    expect(resolveRelative('src/main.ts', './a', files)).toBe('src/a.ts');
    expect(resolveRelative('src/main.ts', './a.js', files)).toBe('src/a.ts');
    expect(resolveRelative('src/main.ts', './dir', files)).toBe('src/dir/index.ts');
    expect(resolveRelative('src/main.ts', './missing', files)).toBeUndefined();
    expect(resolveRelative('src/main.ts', 'rxjs', files)).toBeUndefined();
  });

  it('records both directions once per pair', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'src/a.ts': `import { x } from './b';\nimport { y } from './b.js';\nimport './c';\nimport './a';`,
      'src/b.ts': 'export const x = 1;\nexport const y = 2;',
      'src/c.ts': '',
    });
    const graph = buildGraph(readProfile(root));

    expect(graph.imports.get('src/a.ts')).toEqual(['src/b.ts', 'src/c.ts']);
    expect(graph.importedBy.get('src/b.ts')).toEqual(['src/a.ts']);
    expect(graph.texts.has('src/b.ts')).toBe(true);
  });

  it('skips a file it cannot read and a declaration file', () => {
    const root = createTempRepo({ 'package.json': '{}', 'src/types.d.ts': `import './a';` });
    const graph = buildGraph({ ...readProfile(root), files: ['src/types.d.ts', 'ghost.ts'] });

    expect(graph.sources).toEqual(['ghost.ts']);
    expect(graph.texts.size).toBe(0);
  });
});

describe('checkSpecImports', () => {
  it('separates the non-spec importer from the spec-to-spec fixture case', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'src/fixtures.spec.ts': 'export const user = {};',
      'src/helper.ts': `export { user } from './fixtures.spec';`,
      'src/app.spec.ts': `import { user } from './fixtures.spec';`,
      'src/clean.spec.ts': `import { user } from './helper';`,
    });

    expect(checks(checkSpecImports(buildGraph(readProfile(root)))).sort()).toEqual(['spec-exports-fixture', 'spec-imported-by-non-spec']);
  });
});

describe('checkForeignPragma', () => {
  it('reports each distinct pragma once, and only inside a spec', () => {
    const source = `${pragma('environment-options')} {} ${pragma('environment')} node ${pragma('environment')} node`;

    expect(findPragmas(source)).toEqual([pragma('environment-options'), pragma('environment')]);

    const root = createTempRepo({
      'package.json': '{}',
      'src/a.spec.ts': `/** ${pragma('environment')} jsdom */`,
      'src/setup.ts': `/** ${pragma('config')} */`,
      'src/b.spec.ts': '/** @vitest' + '-environment jsdom */',
    });
    const findings = checkForeignPragma(buildGraph(readProfile(root)));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe('src/a.spec.ts');
  });
});

describe('checkOrphanRunnerConfig', () => {
  const withJestConfig = (extra: Record<string, string>): string =>
    createTempRepo({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
      'jest.config.js': `module.exports = { setupFilesAfterEach: ['<rootDir>/src/jest-extras.ts'], preset: 'jest-preset-angular' };`,
      'src/jest-extras.ts': '',
      ...extra,
    });

  it('reports the dead config and the file only it referenced', () => {
    const root = withJestConfig({});
    const profile = readProfile(root);

    expect(checks(checkOrphanRunnerConfig(profile, buildGraph(profile))).sort()).toEqual(['dead-runner-config', 'orphan-runner-file']);
  });

  it('stays quiet when the runner is still installed, by dependency or by script', () => {
    const byDependency = readProfile(
      createTempRepo({ 'package.json': JSON.stringify({ devDependencies: { jest: '^29' } }), 'jest.config.js': '' }),
    );
    const byScript = readProfile(
      createTempRepo({ 'package.json': JSON.stringify({ scripts: { test: 'jest --ci' } }), 'jest.config.js': '' }),
    );

    expect(checkOrphanRunnerConfig(byDependency, buildGraph(byDependency))).toEqual([]);
    expect(checkOrphanRunnerConfig(byScript, buildGraph(byScript))).toEqual([]);
  });

  it('does not call a file orphaned when the live config or another module still uses it', () => {
    const live = readProfile(
      createTempRepo({
        'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
        'vitest.config.ts': `export default { test: { setupFiles: ['./src/jest-extras.ts'] } };`,
        'jest.config.js': `module.exports = { setupFiles: ['<rootDir>/src/jest-extras.ts'] };`,
        'src/jest-extras.ts': '',
      }),
    );
    const imported = readProfile(withJestConfig({ 'src/main.ts': `import './jest-extras';` }));

    expect(checks(checkOrphanRunnerConfig(live, buildGraph(live)))).toEqual(['dead-runner-config']);
    expect(checks(checkOrphanRunnerConfig(imported, buildGraph(imported)))).toEqual(['dead-runner-config']);
  });

  it('covers karma the same way', () => {
    const profile = readProfile(
      createTempRepo({ 'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }), 'karma.conf.js': 'module.exports = {};' }),
    );

    expect(checks(checkOrphanRunnerConfig(profile, buildGraph(profile)))).toEqual(['dead-runner-config']);
  });

  it('reads a config that vanished as empty', () => {
    const profile = profileWith({ files: ['jest.config.js'] });

    expect(checks(checkOrphanRunnerConfig(profile, buildGraph(profile)))).toEqual(['dead-runner-config']);
  });
});

describe('referencedPaths', () => {
  it('keeps the rooted module paths and drops the bare specifiers', () => {
    expect(referencedPaths(`{ a: '<rootDir>/src/setup.ts', b: './local.js', c: 'jest-preset-angular', d: '@scope/pkg/file.ts' }`)).toEqual([
      'src/setup.ts',
      'local.js',
    ]);
  });
});

describe('checkAngularBuild', () => {
  const withVersion = (version: string): string =>
    createTempRepo({ 'package.json': '{}', 'node_modules/@angular/build/package.json': JSON.stringify({ version }) });

  it('fires only inside the window where the unit-test build has splitting off', () => {
    expect(checkAngularBuild(readProfile(withVersion('22.1.5')))).toHaveLength(1);
    expect(checkAngularBuild(readProfile(withVersion('22.1.6')))).toHaveLength(1);
    expect(checkAngularBuild(readProfile(withVersion('22.1.7')))).toEqual([]);
    expect(checkAngularBuild(readProfile(withVersion('22.1.4')))).toEqual([]);
    expect(checkAngularBuild(readProfile(withVersion('nonsense')))).toEqual([]);
  });

  it('says nothing when the builder is not installed or its manifest is unreadable', () => {
    expect(checkAngularBuild(readProfile(createTempRepo({ 'package.json': '{}' })))).toEqual([]);
    expect(
      checkAngularBuild(readProfile(createTempRepo({ 'node_modules/@angular/build/package.json': JSON.stringify({ version: 22 }) }))),
    ).toEqual([]);
  });

  it('compares versions the way semver would, prerelease suffix ignored', () => {
    expect(parseVersion('22.1.5-next.0')).toEqual([22, 1, 5]);
    expect(parseVersion('22.1')).toBeUndefined();
    expect(compareVersions([22, 2], [22, 1, 9])).toBeGreaterThan(0);
    expect(compareVersions([22, 1, 9], [22, 2])).toBeLessThan(0);
    expect(compareVersions([22, 1], [22, 1])).toBe(0);
    expect(compareVersions([22, 1, 5], [22, 1, 5])).toBe(0);
    expect(isAffectedVersion([22, 1, 6])).toBe(true);
  });
});

describe('checkAgentInstructions', () => {
  it('suggests init exactly once, and not at all once any instruction file names the package', () => {
    const silent = readProfile(createTempRepo({ 'package.json': '{}' }));
    const told = readProfile(createTempRepo({ 'package.json': '{}', 'CLAUDE.md': 'read node_modules/vitest-auto-spy/AGENTS.md' }));

    expect(checks(checkAgentInstructions(silent))).toEqual(['no-agent-instructions']);
    expect(checkAgentInstructions(told)).toEqual([]);
  });
});

describe('runDoctor', () => {
  it('runs every check over one repository', () => {
    const root = createTempRepo({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
      'tsconfig.spec.json': JSON.stringify({ include: ['src*.spec.ts'] }),
      'jest.config.js': 'module.exports = {};',
      'src/a.spec.ts': `/** ${pragma('environment')} jsdom */\nimport './fixtures.spec';`,
      'src/fixtures.spec.ts': 'export const user = {};',
      'src/helper.ts': `import './fixtures.spec';`,
    });

    expect(new Set(checks(runDoctor(readProfile(root))))).toEqual(
      new Set([
        'tsconfig-glob-matches-nothing',
        'dead-runner-config',
        'foreign-runner-pragma',
        'spec-exports-fixture',
        'spec-imported-by-non-spec',
        'no-agent-instructions',
      ]),
    );
  });
});
