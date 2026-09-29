import { afterEach, describe, expect, it } from 'vitest';

import type { Profile } from '../profile';
import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { checkVitest5Traps, inlineProjects, nestedHoistedCalls } from './vitest-5-traps';

afterEach(() => {
  removeTempRepos();
});

const repo = (vitest: string | undefined, files: Record<string, string> = {}, packageJson: object = {}): Profile =>
  readProfile(
    createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '*', vite: '*' }, ...packageJson }),
      ...(vitest === undefined ? {} : { 'node_modules/vitest/package.json': JSON.stringify({ version: vitest }) }),
      ...files,
    }),
  );

const trapsIn = (profile: Profile): Finding[] => checkVitest5Traps(profile, buildGraph(profile));
const summary = (findings: readonly Finding[]): [string, string, string | undefined][] =>
  findings.map((finding) => [finding.check, finding.severity, finding.file]);

describe('checkVitest5Traps', () => {
  it('stays out of a repository without Vitest, or on Vitest 3', () => {
    const files = { 'src/a.spec.ts': "import { JestExtend } from '@vitest/expect';" };

    expect(trapsIn(repo(undefined, files))).toEqual([]);
    expect(trapsIn(repo('3.2.0', files))).toEqual([]);
  });

  it('reports an import or an augmentation of a package Vitest 5 bundles, and not a quoted one', () => {
    const findings = trapsIn(
      repo('5.0.2', {
        'src/matchers.ts': "import { JestExtend } from '@vitest/expect';\nimport { getCurrentTest } from '@vitest/runner/utils';",
        'src/types.d.ts': "declare module '@vitest/expect' { interface Assertion<T> { toBeFoo(): T } }",
        'src/doc.ts': 'const text = "import { x } from \'@vitest/expect\'";',
      }),
    );

    expect(summary(findings)).toEqual([
      ['vitest-5-bundled-package', 'error', 'src/matchers.ts'],
      ['vitest-5-bundled-package', 'error', 'src/matchers.ts'],
      ['vitest-5-bundled-package', 'error', 'src/types.d.ts'],
    ]);
    expect(findings[0]?.message).toMatch(/^Imports `@vitest\/expect`: on Vitest 5 `vitest` bundles its own copy/);
    expect(findings[1]?.fix).toContain('getCurrentTest');
    expect(findings[2]?.message).toMatch(/^Augments `@vitest\/expect`/);
  });

  it('passes over a declaration file that vanished after the scan', () => {
    const profile = repo('5.0.2');

    expect(checkVitest5Traps({ ...profile, files: [...profile.files, 'gone.d.ts'] }, buildGraph(profile))).toEqual([]);
  });

  it('is a note for the upgrade on Vitest 4', () => {
    const [finding] = trapsIn(repo('4.1.11', { 'src/a.ts': "import '@vitest/runner';" }));

    expect(finding?.severity).toBe('info');
    expect(finding?.message).toContain(': after the upgrade to Vitest 5 `vitest` bundles');
  });

  it('reports a one-parameter Matchers augmentation of vitest, and one of the global jest namespace', () => {
    const findings = trapsIn(
      repo('5.0.2', {
        'src/vitest.d.ts': "import 'vitest';\ndeclare module 'vitest' {\n  interface Matchers<T = any> { toBeFoo(): T }\n}",
        'src/jest.d.ts': 'declare global {\n  namespace jest {\n    interface Matchers<R> { toBeBar(): R }\n  }\n}',
        'src/fine.d.ts': "declare module 'vitest' {\n  interface Matchers<R, T> { toBeBaz(): R }\n}",
        'src/other.d.ts': 'interface Matchers<T> { mine(): T }',
      }),
    );

    expect(summary(findings)).toEqual([
      ['vitest-5-matchers-augmentation', 'error', 'src/jest.d.ts'],
      ['vitest-5-matchers-augmentation', 'error', 'src/vitest.d.ts'],
    ]);
    expect(findings[0]?.message).toContain('Augments the global `jest.Matchers` (line 2)');
    expect(findings[1]?.message).toContain('`interface Matchers<T>` (line 3)');
  });

  it('reports vi.mock and vi.hoisted inside a block, and leaves module scope and in-source tests alone', () => {
    const findings = trapsIn(
      repo('5.0.2', {
        'src/a.spec.ts': [
          "vi.mock('./top', () => ({ a: 1 }));",
          'const { x } = vi.hoisted(() => ({ x: 1 }));',
          "describe('a', () => {",
          "  vi.mock('./inner');",
          "  it('b', () => { vitest.hoisted(() => 1); });",
          '});',
        ].join('\n'),
        'src/in-source.ts': "if (import.meta.vitest) { vi.mock('./x'); }",
        'src/quoted.spec.ts': "const code = `describe('a', () => { vi.mock('x') })`;",
      }),
    );

    expect(summary(findings)).toEqual([['vitest-5-nested-hoist', 'error', 'src/a.spec.ts']]);
    expect(findings[0]?.message).toContain('Calls `vi.mock`, `vi.hoisted` inside a block (lines 4, 5)');
  });

  it('reads nesting off braces in code only', () => {
    expect(nestedHoistedCalls("const s = '{';\nvi.mock('a');")).toEqual([]);
    expect(nestedHoistedCalls("{ vi.unmock('a'); }")).toEqual([{ name: 'vi.unmock', line: 1 }]);
  });

  it("reports toThrow('') either way round, and names the negated form when there is one", () => {
    const findings = trapsIn(
      repo('5.0.2', {
        'src/a.spec.ts': 'expect(f).toThrow(\'\');\nexpect(g).not.toThrow("");',
        'src/b.spec.ts': "expect(f).toThrowError('');\nexpect(f).toThrow('boom');",
      }),
    );

    expect(summary(findings)).toEqual([
      ['vitest-5-empty-throw-message', 'warning', 'src/a.spec.ts'],
      ['vitest-5-empty-throw-message', 'warning', 'src/b.spec.ts'],
    ]);
    expect(findings[0]?.message).toContain("Asserts `.not.toThrow('')` (lines 1, 2)");
    expect(findings[1]?.message).toContain("Asserts `.toThrow('')` (line 1)");
  });

  it('reports the registry pruning as inert on Vitest 5 only, and only where the library is imported', () => {
    const files = {
      'src/setup.ts': "import { setupAutoSpy } from 'vitest-auto-spy/setup';\nsetupAutoSpy({ pruneMockRegistry: true });",
      'src/own.ts': 'export function trackMockRegistry() {}\ntrackMockRegistry();',
    };

    expect(summary(trapsIn(repo('5.0.2', files)))).toEqual([['vitest-5-prune-mock-registry', 'info', 'src/setup.ts']]);
    expect(trapsIn(repo('4.1.11', files))).toEqual([]);
  });

  it('reports an inline project that gets a Vite server of its own, and a restated extends: true', () => {
    const config = [
      'export default defineConfig({',
      '  test: {',
      '    projects: [',
      "      { extends: true, plugins: [angular()], test: { name: 'ng' } },",
      "      { plugins: [], define: { X: 1 }, test: { name: 'plain', environment: 'node' } },",
      "      { test: { name: 'aliased', alias: { a: 'b' } } },",
      "      'packages/*',",
      '      { extends: true },',
      '    ],',
      '  },',
      '});',
    ].join('\n');
    const findings = trapsIn(repo('5.0.2', { 'vitest.config.ts': config }));

    expect(findings.map((finding) => [finding.check, finding.message.split(',')[0]])).toEqual([
      ['vitest-5-project-own-server', 'The inline project "ng" sets `plugins`'],
      ['vitest-5-extends-restated', 'The inline project "ng" sets `extends: true`'],
      ['vitest-5-project-own-server', 'The inline project "aliased" sets `test.alias`'],
      ['vitest-5-extends-restated', 'The inline project on line 8 sets `extends: true`'],
    ]);
    expect(trapsIn(repo('4.1.11', { 'vitest.config.ts': config }))).toEqual([]);
  });

  it('reports only the restated extends when sharing the server is off anyway', () => {
    const config = 'export default { test: { sharedViteServer: false, projects: [{ extends: true, plugins: [a()] }] } };';

    expect(trapsIn(repo('5.0.2', { 'vitest.config.ts': config })).map((finding) => finding.check)).toEqual(['vitest-5-extends-restated']);
  });

  it('reads the direct keys of each inline project, past nested objects and strings', () => {
    const [project] = inlineProjects("projects: [{ resolve: { alias: { x: 'y:z' } }, test: { name: `a`, deps: {} } }]");

    expect([...(project?.keys.keys() ?? [])]).toEqual(['resolve', 'test']);
    expect([...(project?.testKeys.keys() ?? [])]).toEqual(['name', 'deps']);
    expect(project?.name).toBe('a');
    expect(inlineProjects('projects: [{ test: someVariable }]')[0]?.testKeys.size).toBe(0);
    expect(inlineProjects('projects: [{ a: 1 }')).toHaveLength(1);
  });

  it('reports a json or junit reporter without an output file, in a script and in CI', () => {
    const findings = trapsIn(
      repo(
        '5.0.2',
        {
          '.github/workflows/ci.yml': [
            'steps:',
            '  - run: npx vitest run --reporter=junit > junit.xml',
            '  - run: npx vitest run --reporter=json --outputFile.json=r.json',
            '  - run: echo --reporter=json',
          ].join('\n'),
        },
        { scripts: { 'test:ci': 'vitest run --reporter json' } },
      ),
    );

    expect(summary(findings)).toEqual([
      ['vitest-5-report-path', 'warning', 'package.json'],
      ['vitest-5-report-path', 'warning', '.github/workflows/ci.yml'],
    ]);
    expect(findings[0]?.message).toContain('The `test:ci` script passes `--reporter=json` without `--outputFile`');
    expect(findings[0]?.message).toContain('`.vitest/json/output.json`');
    expect(findings[1]?.message).toContain('Line 2 passes `--reporter=junit`');
    expect(findings[1]?.message).toContain('`.vitest/junit/output.xml`');
  });

  it('reports the old blob-report directory, unless something still writes there', () => {
    const ci = { '.github/workflows/ci.yml': 'steps:\n  - run: npx vitest --merge-reports .vitest-reports\n' };
    const stale = trapsIn(repo('5.0.2', ci));
    const kept = trapsIn(
      repo('5.0.2', ci, { scripts: { shard: 'vitest run --reporter=blob --outputFile.blob=.vitest-reports/blob.json' } }),
    );

    expect(summary(stale)).toEqual([['vitest-5-report-path', 'warning', '.github/workflows/ci.yml']]);
    expect(stale[0]?.message).toContain('Names `.vitest-reports`');
    expect(kept).toEqual([]);
  });

  it('reports a Yarn repository that leaves vite to chance, harder when none is installed', () => {
    const manifest = { devDependencies: { vitest: '*' } };
    const missing = trapsIn(repo('5.0.2', { 'yarn.lock': '' }, manifest));
    const hoisted = trapsIn(repo('5.0.2', { 'yarn.lock': '', 'node_modules/vite/package.json': '{"version":"7.1.0"}' }, manifest));

    expect(summary(missing)).toEqual([['vitest-5-vite-peer', 'error', 'package.json']]);
    expect(missing[0]?.message).toContain('no copy is installed');
    expect(summary(hoisted)).toEqual([['vitest-5-vite-peer', 'warning', 'package.json']]);
    expect(hoisted[0]?.message).toContain('the installed 7.1.0');
    expect(trapsIn(repo('5.0.2', { 'yarn.lock': '' }))).toEqual([]);
    expect(trapsIn(repo('5.0.2', {}, manifest))).toEqual([]);
    expect(trapsIn(repo('4.1.11', { 'yarn.lock': '' }, manifest))).toEqual([]);
  });
});
