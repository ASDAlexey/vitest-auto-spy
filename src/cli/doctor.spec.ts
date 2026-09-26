/**
 * The `doctor` checks. Every one of them looks for a defect that **nothing consumes**: the suite
 * is green, `tsc --noEmit` reports zero errors, and the only reader of the stale thing is a person
 * opening the file. That is also what makes them easy to get wrong in the other direction, so each
 * check is pinned from both sides — the defect it must report, and the healthy shape it must not.
 */
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkAgentInstructions } from './checks/agent-instructions';
import { checkAngularBuild, compareVersions, isAffectedVersion, parseVersion } from './checks/angular-build';
import { checkBuilderSetup } from './checks/builder-setup';
import {
  arrayPatterns,
  canMatchBundleChunk,
  checkCoverageConfig,
  coverageBlock,
  declaresKey,
  includePatterns,
} from './checks/coverage-config';
import { checkForeignPragma, findPragmas } from './checks/foreign-pragma';
import { buildGraph, extractSpecifiers, resolveRelative } from './checks/graph';
import { checkJasmineEra } from './checks/jasmine-era';
import { checkOrphanRunnerConfig, referencedPaths } from './checks/orphan-runner-config';
import { checkSpecImports } from './checks/spec-imports';
import { checkTsconfigGlobs, expandInclude, globToRegExp, isExemptPattern, literalTail } from './checks/tsconfig-globs';
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
  filesTruncated: false,
  isIgnoredDirectory: () => false,
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
    expect(isExemptPattern('.bun/**/*.ts')).toBe(true);
    expect(isExemptPattern('src/**/*.ts')).toBe(false);
  });

  it('exempts a pattern inside a skipped directory below the root, or inside a gitignored one', () => {
    expect(isExemptPattern('libs/app/out-tsc/**/*.ts')).toBe(true);
    expect(isExemptPattern('src/**/dist/*.ts')).toBe(false);
    const generated = (directory: string): boolean => directory === 'src/generated';

    expect(isExemptPattern('src/generated/**/*.ts', generated)).toBe(true);
    expect(isExemptPattern('src/generated', generated)).toBe(true);
    expect(isExemptPattern('src/generated-types/**/*.ts', generated)).toBe(false);
  });
});

describe('literalTail', () => {
  it('takes the file-name ending after the final wildcard', () => {
    expect(literalTail('src/**/*.spec.ts')).toBe('.spec.ts');
    // The codemod's shape: the same ending, so both globs are measured against the same files.
    expect(literalTail('src*.spec.ts')).toBe('.spec.ts');
    expect(literalTail('src/a?.ts')).toBe('.ts');
  });

  it('has none for a segment that names one file, or ends in a wildcard', () => {
    expect(literalTail('src/polyfills.ts')).toBeUndefined();
    expect(literalTail('src/**/*')).toBeUndefined();
  });
});

describe('checkTsconfigGlobs', () => {
  it('reports a library with no specs yet as info, not as a defect', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'libs/fresh/src/index.ts': '',
      'libs/fresh/tsconfig.spec.json': JSON.stringify({ include: ['src/**/*.spec.ts'] }),
      // A spec elsewhere in the repository is no evidence that this glob is broken.
      'libs/other/src/a.spec.ts': '',
    });
    const findings = checkTsconfigGlobs(readProfile(root));

    expect(findings.map((finding) => finding.severity)).toEqual(['info']);
    expect(findings[0]?.message).toContain('no "*.spec.ts" beside this config');
  });

  it('keeps a glob pointed at the wrong directory an error, while the specs sit next to it', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'libs/app/src/a.spec.ts': '',
      'libs/app/tsconfig.spec.json': JSON.stringify({ include: ['lib/**/*.spec.ts'] }),
    });

    expect(checkTsconfigGlobs(readProfile(root)).map((finding) => finding.severity)).toEqual(['error']);
  });

  it('keeps a named file that does not exist an error, whatever else the tree holds', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'tsconfig.json': JSON.stringify({ include: ['src/polyfills.ts'] }),
    });

    expect(checkTsconfigGlobs(readProfile(root)).map((finding) => finding.severity)).toEqual(['error']);
  });

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

  it('does not report a pattern or a "files" entry inside a directory the root .gitignore excludes', () => {
    const root = createTempRepo({
      'package.json': '{}',
      '.gitignore': 'src/generated/\n',
      'src/main.ts': '',
      'src/generated/api.ts': '',
      'tsconfig.json': JSON.stringify({ include: ['src/**/*.ts', 'src/generated/**/*.ts'], files: ['src/generated/api.ts'] }),
    });

    expect(checkTsconfigGlobs(readProfile(root))).toEqual([]);
  });

  it('does not report a pattern into gitignored output that has not been generated yet, or one a nested .gitignore excludes', () => {
    const root = createTempRepo({
      'package.json': '{}',
      '.gitignore': '/src/generated/\n',
      'libs/app/.gitignore': 'gen/\n',
      'src/main.ts': '',
      'tsconfig.json': JSON.stringify({
        include: ['src/**/*.ts', 'src/generated/**/*.ts', 'libs/app/gen/**/*.ts'],
        files: ['src/generated/api.ts'],
      }),
    });

    expect(checkTsconfigGlobs(readProfile(root))).toEqual([]);
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
    expect(findings[0]?.message).toBe(
      `Line 1: \`${pragma('environment')} jsdom\` is a Jest docblock pragma, which this runner never reads.`,
    );
    expect(findings[0]?.fix).toBe('Write `@vitest-environment jsdom` instead.');
  });

  it('names every line a pragma is on, and says to delete one that names no environment', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'src/a.spec.ts': `/** ${pragma('config')} */\n\n/** ${pragma('config')} */\n/** ${pragma('environment')} */`,
    });
    const findings = checkForeignPragma(buildGraph(readProfile(root)));

    expect(findings.map((finding) => [finding.message, finding.fix])).toEqual([
      [
        `Lines 1, 3: \`${pragma('config')}\` is a Jest docblock pragma, which this runner never reads.`,
        'Delete it: the runner config decides this.',
      ],
      [
        `Line 4: \`${pragma('environment')}\` is a Jest docblock pragma, which this runner never reads.`,
        'Delete it: the runner config decides this.',
      ],
    ]);
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

  it('names the unit-test targets the fix is for', () => {
    const target = { builder: '@angular/build:unit-test' };
    const projects = Object.fromEntries(['a', 'b', 'c', 'd'].map((name) => [name, { architect: { test: target } }]));
    const fixOf = (files: Record<string, string>): string | undefined =>
      checkAngularBuild(
        readProfile(
          createTempRepo({
            'package.json': '{}',
            'node_modules/@angular/build/package.json': JSON.stringify({ version: '22.1.5' }),
            ...files,
          }),
        ),
      )[0]?.fix;

    const upgrade = 'Upgrade @angular/build to 22.1.7 or newer, where splitting is on by default, and remove any `"splitting": false` from';

    expect(fixOf({})).toBe(`${upgrade} the unit-test target.`);
    expect(fixOf({ 'angular.json': JSON.stringify({ projects: { app: projects['a'] } }) })).toBe(
      `${upgrade} \`app:test\` in angular.json.`,
    );
    expect(fixOf({ 'angular.json': JSON.stringify({ projects }) })).toBe(
      `${upgrade} \`a:test\` in angular.json, \`b:test\` in angular.json, \`c:test\` in angular.json and 1 more targets.`,
    );
  });

  it('says nothing when the builder is not installed or its manifest is unreadable', () => {
    expect(checkAngularBuild(readProfile(createTempRepo({ 'package.json': '{}' })))).toEqual([]);
    expect(
      checkAngularBuild(readProfile(createTempRepo({ 'node_modules/@angular/build/package.json': JSON.stringify({ version: 22 }) }))),
    ).toEqual([]);
  });

  describe('with Analog beside it', () => {
    const manifests = (builder: string | undefined, analog: string | undefined): string =>
      createTempRepo({
        'package.json': '{}',
        ...(builder === undefined ? {} : { 'node_modules/@angular/build/package.json': JSON.stringify({ version: builder }) }),
        ...(analog === undefined ? {} : { 'node_modules/@analogjs/vite-plugin-angular/package.json': JSON.stringify({ version: analog }) }),
      });

    it('reports an Analog plugin older than 2.7.5 next to @angular/build 22.2.0 or newer', () => {
      const [finding, ...rest] = checkAngularBuild(readProfile(manifests('22.2.0', '2.7.4')));

      expect(rest).toEqual([]);
      expect(finding).toEqual({
        check: 'analog-behind-angular-build',
        severity: 'error',
        file: 'node_modules/@analogjs/vite-plugin-angular/package.json',
        message:
          "@analogjs/vite-plugin-angular 2.7.4 is too old for @angular/build 22.2.0: the run dies at startup with `TypeError: cache.has is not a function`, because from 22.2.0 the builder's `SourceFileCache` no longer extends `Map`.",
        fix: 'Upgrade `@analogjs/vite-plugin-angular` and `@analogjs/vitest-angular` to 2.7.5 or newer.',
      });
      expect(checks(checkAngularBuild(readProfile(manifests('23.0.0-next.1', '2.6.0'))))).toEqual(['analog-behind-angular-build']);
    });

    it('stays quiet on a fixed Analog, on an older builder, and when either version is missing or unreadable', () => {
      expect(checkAngularBuild(readProfile(manifests('22.2.0', '2.7.5')))).toEqual([]);
      expect(checkAngularBuild(readProfile(manifests('22.1.9', '2.7.4')))).toEqual([]);
      expect(checkAngularBuild(readProfile(manifests('22.2.0', undefined)))).toEqual([]);
      expect(checkAngularBuild(readProfile(manifests(undefined, '2.7.4')))).toEqual([]);
      expect(checkAngularBuild(readProfile(manifests('22.2.0', 'nonsense')))).toEqual([]);
      expect(checkAngularBuild(readProfile(manifests('nonsense', '2.7.4')))).toEqual([]);
    });
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

describe('checkCoverageConfig', () => {
  const workspace = (runnerConfig: string): string =>
    JSON.stringify({ projects: { app: { architect: { test: { builder: '@angular/build:unit-test', options: { runnerConfig } } } } } });

  const vitest = (version: string): Record<string, string> => ({ 'node_modules/vitest/package.json': JSON.stringify({ version }) });

  it('reports `coverage.all` once Vitest is the version that stopped reading it', () => {
    const config = 'export default { test: { coverage: { provider: "v8", all: true } } };';
    const four = readProfile(createTempRepo({ 'package.json': '{}', 'vitest.config.ts': config, ...vitest('4.1.9') }));
    const three = readProfile(createTempRepo({ 'package.json': '{}', 'vitest.config.ts': config, ...vitest('3.2.4') }));

    expect(checks(checkCoverageConfig(four))).toEqual(['coverage-all-removed']);
    expect(checkCoverageConfig(three)).toEqual([]);
  });

  it('says nothing without a coverage block, without Vitest on disk, or on a manifest it cannot read', () => {
    const noBlock = { 'package.json': '{}', 'vitest.config.ts': 'export default { test: { globals: true } };', ...vitest('4.1.9') };
    const noVitest = { 'package.json': '{}', 'vitest.config.ts': 'export default { test: { coverage: { all: true } } };' };
    const unreadable = { ...noVitest, 'node_modules/vitest/package.json': JSON.stringify({ version: 4 }) };

    expect(checkCoverageConfig(readProfile(createTempRepo(noBlock)))).toEqual([]);
    expect(checkCoverageConfig(readProfile(createTempRepo(noVitest)))).toEqual([]);
    expect(checkCoverageConfig(readProfile(createTempRepo(unreadable)))).toEqual([]);
  });

  it('reports a source-only `coverage.include` in the runner config of a unit-test target', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'angular.json': workspace('./tools/vitest-runner.config.ts'),
      'tools/vitest-runner.config.ts': 'export default { test: { coverage: { include: ["libs/**/*.ts", "apps/**/*.html"] } } };',
    });

    expect(checks(checkCoverageConfig(readProfile(root)))).toEqual(['coverage-include-misses-bundle']);
  });

  it('reads the runner config an Nx unit-test target names the same way', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'libs/ui/project.json': JSON.stringify({
        targets: { test: { executor: '@nx/angular:unit-test', options: { runnerConfig: 'libs/ui/vitest-runner.config.ts' } } },
      }),
      'libs/ui/vitest-runner.config.ts': 'export default { test: { coverage: { include: ["libs/ui/**/*.ts"] } } };',
    });

    expect(checks(checkCoverageConfig(readProfile(root)))).toEqual(['coverage-include-misses-bundle']);
  });

  it('stays quiet when the list can reach a chunk, and when the same list is not a runner config', () => {
    const reachable = createTempRepo({
      'package.json': '{}',
      'project.json': workspace('vitest-runner.config.ts'),
      'vitest-runner.config.ts': 'export default { test: { coverage: { include: ["spec-*.js", "chunk-*.js", "libs/**/*.ts"] } } };',
    });
    const plain = createTempRepo({
      'package.json': '{}',
      'vitest.config.ts': 'export default { test: { coverage: { include: ["src/**/*.ts"] } } };',
    });

    expect(checkCoverageConfig(readProfile(reachable))).toEqual([]);
    expect(checkCoverageConfig(readProfile(plain))).toEqual([]);
  });

  it('ignores a workspace file that names no unit-test target, and one that is not JSON', () => {
    const other = createTempRepo({
      'package.json': '{}',
      'angular.json': JSON.stringify({
        projects: {
          app: { architect: { test: { builder: '@angular-devkit/build-angular:karma', options: { assets: [{ glob: '*' }] } } } },
        },
      }),
      'project.json': 'not json at all',
      'vitest-runner.config.ts': 'export default { test: { coverage: { include: ["src/**/*.ts"] } } };',
    });

    expect(checkCoverageConfig(readProfile(other))).toEqual([]);
  });

  it('ignores an Nx-style target that names no runner config of its own', () => {
    const nxStyle = createTempRepo({
      'package.json': '{}',
      'project.json': JSON.stringify({ targets: { test: { executor: '@angular/build:unit-test', options: { runnerConfig: true } } } }),
    });

    expect(checkCoverageConfig(readProfile(nxStyle))).toEqual([]);
  });

  it('reads the vitest-base config that `runnerConfig: true` resolves, project root first', () => {
    const sourceOnly = 'export default { test: { coverage: { include: ["src/**/*.ts"] } } };';
    const trueTarget = (root: string): string =>
      JSON.stringify({
        projects: { app: { root, architect: { test: { builder: '@angular/build:unit-test', options: { runnerConfig: true } } } } },
      });
    const findings = (files: Record<string, string>): { check: string; file?: string }[] =>
      checkCoverageConfig(readProfile(createTempRepo({ 'package.json': '{}', ...files })));

    expect(findings({ 'angular.json': trueTarget(''), 'vitest-base.config.mts': sourceOnly })).toEqual([
      expect.objectContaining({ check: 'coverage-include-misses-bundle', file: 'vitest-base.config.mts' }),
    ]);
    expect(findings({ 'angular.json': trueTarget('projects/app/'), 'vitest-base.config.ts': sourceOnly })).toEqual([
      expect.objectContaining({ check: 'coverage-include-misses-bundle', file: 'vitest-base.config.ts' }),
    ]);
    expect(
      findings({
        'angular.json': trueTarget('projects/app'),
        'projects/app/vitest-base.config.mts': sourceOnly,
        'vitest-base.config.mts': 'export default { test: { coverage: { include: ["spec-*.js"] } } };',
      }),
    ).toEqual([expect.objectContaining({ check: 'coverage-include-misses-bundle', file: 'projects/app/vitest-base.config.mts' })]);
  });

  it('reads a workspace file that vanished as empty', () => {
    expect(checkCoverageConfig(profileWith({ files: ['angular.json'] }))).toEqual([]);
  });

  it('reports a coverage scope large enough that matching it costs more than collecting it', () => {
    const globs = (prefix: string, count: number): string[] => Array.from({ length: count }, (_, index) => `${prefix}${index}/**/*.ts`);
    const scope = `export default { test: { coverage: { include: ${JSON.stringify(globs('libs/a', 30))}, exclude: ${JSON.stringify(globs('libs/b', 25))} } } };`;
    const wide = createTempRepo({ 'package.json': '{}', 'vitest.config.ts': scope, ...vitest('4.1.9') });
    const [finding] = checkCoverageConfig(readProfile(wide));

    expect(checks(checkCoverageConfig(readProfile(wide)))).toEqual(['coverage-include-recompiles-globs']);
    expect(finding?.message).toBe(
      'The coverage scope here is 55 globs, and Vitest 4 compiles every one of them again for every file it checks, so matching can cost more than the coverage itself.',
    );
    expect(finding?.fix).toBe(
      'Upgrade to Vitest 5, which compiles them once. To stay on 4, use the custom-provider recipe: https://asdalexey.github.io/vitest-auto-spy/adapters/angular#coverage-matching-costs-more-than-coverage',
    );
  });

  it('says nothing about the same scope on the version that compiles the globs once', () => {
    const globs = (prefix: string, count: number): string[] => Array.from({ length: count }, (_, index) => `${prefix}${index}/**/*.ts`);
    const scope = `export default { test: { coverage: { include: ${JSON.stringify(globs('libs/a', 30))}, exclude: ${JSON.stringify(globs('libs/b', 25))} } } };`;
    const five = createTempRepo({ 'package.json': '{}', 'vitest.config.ts': scope, ...vitest('5.0.0') });
    const unknown = createTempRepo({ 'package.json': '{}', 'vitest.config.ts': scope });

    expect(checkCoverageConfig(readProfile(five))).toEqual([]);
    expect(checkCoverageConfig(readProfile(unknown))).toEqual([]);
  });

  it('counts the globs a unit-test target declares towards the same scope', () => {
    const target = (coverageInclude: string[], coverageExclude: string[]): string =>
      JSON.stringify({
        projects: {
          app: {
            architect: {
              test: {
                builder: '@angular/build:unit-test',
                options: { runnerConfig: './vitest-runner.config.ts', coverageInclude, coverageExclude },
              },
            },
          },
        },
      });
    const wide = Array.from({ length: 60 }, (_, index) => `libs/p${index}/**/*.ts`);
    const root = createTempRepo({
      'package.json': '{}',
      'angular.json': target(['spec-*.js', ...wide], ['**/*.spec.ts']),
      'vitest-runner.config.ts': 'export default { test: { coverage: { provider: "v8" } } };',
      ...vitest('4.1.9'),
    });

    const [finding] = checkCoverageConfig(readProfile(root));

    expect(checks(checkCoverageConfig(readProfile(root)))).toEqual(['coverage-include-recompiles-globs']);
    expect(finding?.fix).toBe(
      'Upgrade to Vitest 5, which compiles them once. Under `@angular/build:unit-test`, Vitest 5 needs @angular/build 22.2.0 or newer. To stay on 4, use the custom-provider recipe: https://asdalexey.github.io/vitest-auto-spy/adapters/angular#coverage-matching-costs-more-than-coverage',
    );
  });

  it('stays quiet on a scope a person could have written by hand', () => {
    const narrow = createTempRepo({
      'package.json': '{}',
      'vitest.config.ts': 'export default { test: { coverage: { include: ["src/**/*.ts"], exclude: ["**/*.spec.ts"] } } };',
    });

    expect(checkCoverageConfig(readProfile(narrow))).toEqual([]);
  });

  it('reads an array-valued coverage key, and ignores one nested a level deeper', () => {
    expect(arrayPatterns('coverage: { exclude: ["a", "b"] }', 'exclude')).toEqual(['a', 'b']);
    expect(arrayPatterns('coverage: { thresholds: { exclude: ["a"] } }', 'exclude')).toEqual([]);
  });

  it('reads a target whose coverage options are not arrays as declaring no globs', () => {
    const odd = createTempRepo({
      'package.json': '{}',
      'project.json': JSON.stringify({
        targets: { test: { executor: '@angular/build:unit-test', options: { coverageInclude: 'libs/**/*.ts' } } },
      }),
      'vitest.config.ts': 'export default { test: { coverage: { include: ["src/**/*.ts"] } } };',
    });

    expect(checkCoverageConfig(readProfile(odd))).toEqual([]);
  });

  it('reads the coverage block lexically, and gives up rather than guess on an unbalanced one', () => {
    expect(coverageBlock('a: 1, coverage: { provider: "v8" }, b: 2')).toBe('coverage: { provider: "v8" }');
    expect(coverageBlock('coverage: { thresholds: { lines: 100 } }')).toBe('coverage: { thresholds: { lines: 100 } }');
    expect(coverageBlock('test: { globals: true }')).toBeUndefined();
    expect(coverageBlock('coverage: { provider: "v8"')).toBeUndefined();
  });

  it('separates the own keys of the block from a nested literal', () => {
    expect(declaresKey('coverage: { all: true }', 'all')).toBe(true);
    expect(declaresKey('coverage: { thresholds: { all: true } }', 'all')).toBe(false);
    expect(includePatterns('coverage: { include: ["a.ts", "b.ts"] }')).toEqual(['a.ts', 'b.ts']);
    expect(includePatterns('coverage: { exclude: ["a.ts"] }')).toEqual([]);
  });

  it('treats an extension-free pattern as able to reach a chunk and a pinned one as not', () => {
    expect(canMatchBundleChunk('spec-*.js')).toBe(true);
    expect(canMatchBundleChunk('dist/*.mjs')).toBe(true);
    expect(canMatchBundleChunk('src/**/*.{ts,js}')).toBe(true);
    expect(canMatchBundleChunk('src/**/*.*')).toBe(true);
    expect(canMatchBundleChunk('libs/**')).toBe(true);
    expect(canMatchBundleChunk('src/**/*.ts')).toBe(false);
    expect(canMatchBundleChunk('src/**/*.{ts,tsx}')).toBe(false);
  });
});

describe('checkAgentInstructions', () => {
  it('suggests init exactly once, and not at all once any instruction file names the package', () => {
    const silent = readProfile(createTempRepo({ 'package.json': '{}' }));
    const told = readProfile(createTempRepo({ 'package.json': '{}', 'CLAUDE.md': 'read node_modules/vitest-auto-spy/AGENTS.md' }));

    expect(checks(checkAgentInstructions(silent))).toEqual(['no-agent-instructions']);
    expect(checkAgentInstructions(told)).toEqual([]);
  });

  it('names the instruction files git tracks in --only, and --ignore only when git tracks none of them', () => {
    const home = createTempRepo({ 'git/ignore': '' });

    vi.stubEnv('GIT_CONFIG_GLOBAL', join(home, 'none'));
    vi.stubEnv('XDG_CONFIG_HOME', home);

    const fixOf = (files: Record<string, string>): string | undefined =>
      checkAgentInstructions(readProfile(createTempRepo({ 'package.json': '{}', ...files })))[0]?.fix;

    try {
      expect(fixOf({})).toBe('Run `npx vitest-auto-spy init` to point them at `node_modules/vitest-auto-spy/AGENTS.md`.');
      expect(fixOf({ '.gitignore': 'AGENTS.md\n', 'CLAUDE.md': '# rules\n', '.claude/CLAUDE.md': '# more\n' })).toBe(
        'Run `npx vitest-auto-spy init --only CLAUDE.md,.claude` to point the tracked ones at `node_modules/vitest-auto-spy/AGENTS.md`.',
      );
      expect(fixOf({ '.gitignore': 'AGENTS.md\n' })).toBe(
        'Run `npx vitest-auto-spy init` to point them at `node_modules/vitest-auto-spy/AGENTS.md`.',
      );
      expect(fixOf({ '.gitignore': '*.md\n.claude/\n' })).toBe(
        'Run `npx vitest-auto-spy init` on your machine. CI never sees these files, because .gitignore keeps them out of git: pass `--ignore no-agent-instructions` there.',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('counts a `.claude/CLAUDE.md` a repository keeps out of version control', () => {
    const local = readProfile(createTempRepo({ 'package.json': '{}', '.claude/CLAUDE.md': 'vitest-auto-spy' }));

    expect(checkAgentInstructions(local)).toEqual([]);
  });
});

describe('checkBuilderSetup and the vitest-base config', () => {
  it('reports setup files a vitest-base config lists when the target never reads it', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'angular.json': JSON.stringify({ projects: { app: { root: '', architect: { test: { builder: '@angular/build:unit-test' } } } } }),
      'vitest-base.config.mts': "export default { test: { setupFiles: ['src/test-setup.ts'] } };",
    });

    expect(checkBuilderSetup(readProfile(root)).map((finding) => finding.message)).toEqual([
      expect.stringContaining('`src/test-setup.ts`, listed in the `setupFiles` of vitest-base.config.mts, never runs there'),
    ]);
  });
});

describe('checkJasmineEra', () => {
  it('gathers every trace into one line and names the two steps out, in order', () => {
    const root = createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { 'jasmine-core': '^5', 'karma-jasmine': '^5', 'jasmine-auto-spies': '^7' } }),
      'karma.conf.js': 'module.exports = {};',
      'tsconfig.spec.json': JSON.stringify({ compilerOptions: { types: ['jasmine', 'node'] } }),
    });
    const findings = checkJasmineEra(readProfile(root));

    expect(checks(findings)).toEqual(['jasmine-era-project']);
    expect(findings[0]?.severity).toBe('info');
    expect(findings[0]?.message).toContain('jasmine-auto-spies, jasmine-core, karma-jasmine, karma.conf.js, tsconfig.spec.json');
    expect(findings[0]?.fix).toContain('vitest-auto-spy/jasmine');
    expect(findings[0]?.fix).toContain('codemod --from jasmine');
  });

  it('fires on the observer-spy package and on the jasmine types alone', () => {
    const bySpy = readProfile(createTempRepo({ 'package.json': JSON.stringify({ devDependencies: { '@hirez_io/observer-spy': '^2' } }) }));
    const byTypes = readProfile(
      createTempRepo({ 'package.json': '{}', 'tsconfig.json': JSON.stringify({ compilerOptions: { types: ['jasmine'] } }) }),
    );

    expect(checks(checkJasmineEra(bySpy))).toEqual(['jasmine-era-project']);
    expect(checks(checkJasmineEra(byTypes))).toEqual(['jasmine-era-project']);
  });

  it('stays quiet on a repository that carries none of it', () => {
    const clean = createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { types: ['node'] } }),
      'tsconfig.spec.json': JSON.stringify({ include: ['src/**/*.spec.ts'] }),
      'tsconfig.broken.json': '{ not json',
      'src/karma.conf.md': '',
    });

    expect(checkJasmineEra(readProfile(clean))).toEqual([]);
  });

  it('reads a tsconfig that vanished, and one whose compilerOptions is not an object, as saying nothing', () => {
    const odd = createTempRepo({ 'package.json': '{}', 'tsconfig.json': JSON.stringify({ compilerOptions: 'inherited' }) });

    expect(checkJasmineEra(profileWith({ files: ['tsconfig.json'] }))).toEqual([]);
    expect(checkJasmineEra(readProfile(odd))).toEqual([]);
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
