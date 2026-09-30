/**
 * The flags a bare run adds by the installed Vitest's major. Vitest rejects an option it does not
 * know, so a flag of a newer major must never reach an older one. And the confirmation pass of a
 * handed-over report, which re-runs each suspect under the config its report recorded.
 */
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeTextFile } from './fs-scan';
import type { PerfRun } from './perf-data';
import { PERF_OUTPUT_ENV } from './perf-data';
import { file, run } from './perf-fixtures';
import { mergeRuns } from './perf-merge';
import type { PerfRunOptions, Spawn, SpawnRequest } from './perf-run';
import { perfRemeasure, readPerfRun } from './perf-run';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

beforeEach(() => {
  vi.stubEnv(PERF_OUTPUT_ENV, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  removeTempRepos();
});

function argsWith(manifest: string | undefined): readonly string[] {
  const root = createTempRepo({
    'package.json': '{}',
    'vitest.config.ts': 'export default {};\n',
    'node_modules/vitest/vitest.mjs': '',
    'dist/perf-reporter.js': '',
    ...(manifest === undefined ? {} : { 'node_modules/vitest/package.json': manifest }),
  });
  let seen: SpawnRequest | undefined;

  readPerfRun(
    { cwd: root, profile: readProfile(root), json: undefined, out: undefined, command: undefined, paths: ['a.spec.ts'] },
    (request) => {
      seen = request;

      return { status: 0 };
    },
    root,
  );

  return seen?.args ?? [];
}

describe('readPerfRun, a bare run', () => {
  it("turns Vitest 5's own performance hints off, so its advice is not printed twice", () => {
    expect(argsWith('{"version": "5.0.0"}').slice(-2)).toEqual(['--experimental.diagnostics=false', 'a.spec.ts']);
    expect(argsWith('{"version": "6.1.0-beta.1"}')).toContain('--experimental.diagnostics=false');
  });

  it('adds nothing for Vitest 4, or when the installed version cannot be read', () => {
    for (const manifest of ['{"version": "4.1.11"}', '{"version": 5}', '{}', 'not json', undefined]) {
      expect(argsWith(manifest)).not.toContain('--experimental.diagnostics=false');
    }
  });
});

describe('perfRemeasure, a report handed over without --command', () => {
  const repo = (): string =>
    createTempRepo({
      'package.json': '{}',
      'vitest.config.ts': 'export default {};\n',
      'libs/tooling/vitest.config.ts': 'export default {};\n',
      'node_modules/vitest/vitest.mjs': '',
      'dist/perf-reporter.js': '',
    });

  const options = (root: string, over: Partial<PerfRunOptions> = {}): PerfRunOptions => ({
    cwd: root,
    profile: readProfile(root),
    json: 'reports/perf-*.json',
    out: undefined,
    command: undefined,
    paths: [],
    ...over,
  });

  /** Two suites of one repository, each under its own config, as the two reports a CI job writes. */
  const twoSuites = (root: string, measuredIn = root): PerfRun =>
    mergeRuns([
      {
        path: 'reports/perf-libs.json',
        run: run({ root: measuredIn, configFile: 'vitest.config.ts', files: [file(`${measuredIn}/libs/a.spec.ts`, { tests: 3_000 })] }),
      },
      {
        path: 'reports/perf-tooling.json',
        run: run({
          root: measuredIn,
          configFile: 'libs/tooling/vitest.config.ts',
          files: [file(`${measuredIn}/libs/tooling/b.spec.ts`), file(`${measuredIn}/libs/tooling/c.spec.ts`)],
        }),
      },
    ]).run;

  /** A Vitest that measures every file it is handed at `tests` milliseconds, and records how it was started. */
  const vitest = (root: string, seen: string[][], tests = 10, status = 0): Spawn => {
    return (request: SpawnRequest) => {
      const paths = request.args.filter((arg) => arg.endsWith('.spec.ts'));

      seen.push([...request.args]);
      writeTextFile(
        request.env[PERF_OUTPUT_ENV] ?? '',
        JSON.stringify(run({ root, files: paths.map((path) => file(join(root, path), { tests, cases: [{ name: 'body', ms: tests }] })) })),
      );

      return { status };
    };
  };

  it('is nothing for a report that recorded no config, which is what a report from before it did was', () => {
    const root = repo();

    expect(perfRemeasure(options(root), vitest(root, []), root)).toBeUndefined();
    expect(perfRemeasure(options(root), vitest(root, []), root, run({ root, files: [file(`${root}/a.spec.ts`)] }))).toBeUndefined();
  });

  it('runs Vitest once per recorded config, each over its own suspects only, without coverage, and reads them back as one run', () => {
    const root = repo();
    const seen: string[][] = [];
    const remeasure = perfRemeasure(options(root), vitest(root, seen), root, twoSuites(root));
    const second = remeasure?.(['libs/a.spec.ts', 'libs/tooling/c.spec.ts']);

    expect(seen.map((args) => args.slice(1, 5))).toEqual([
      ['run', '--config', 'vitest.config.ts', '--coverage.enabled=false'],
      ['run', '--config', 'libs/tooling/vitest.config.ts', '--coverage.enabled=false'],
    ]);
    expect(seen.map((args) => args.at(-1))).toEqual(['libs/a.spec.ts', 'libs/tooling/c.spec.ts']);
    expect(second).toMatchObject({ ok: true, runFailed: false });
    expect(second?.ok === true ? second.run.files.map((each) => each.file) : []).toEqual([
      join(root, 'libs/a.spec.ts'),
      join(root, 'libs/tooling/c.spec.ts'),
    ]);
  });

  it('finds the config in this checkout when the report was written in another one', () => {
    const root = repo();
    const seen: string[][] = [];

    perfRemeasure(options(root), vitest(root, seen), root, twoSuites(root, '/builds/group/project'))?.(['libs/tooling/b.spec.ts']);

    expect(seen.map((args) => args.slice(2, 4))).toEqual([['--config', 'libs/tooling/vitest.config.ts']]);
  });

  it('leaves --command in charge when one is given', () => {
    const root = repo();
    const seen: SpawnRequest[] = [];
    const spawn: Spawn = (request) => {
      seen.push(request);

      return vitest(root, [])(request);
    };

    perfRemeasure(options(root, { command: 'npm test -- {paths}' }), spawn, root, twoSuites(root))?.(['libs/a.spec.ts']);

    expect(seen.map((request) => [request.shell, request.command])).toEqual([[true, "npm test -- 'libs/a.spec.ts'"]]);
  });

  it('says why when the recorded config is not in this checkout, and runs nothing', () => {
    const root = createTempRepo({ 'package.json': '{}', 'node_modules/vitest/vitest.mjs': '', 'dist/perf-reporter.js': '' });
    const seen: string[][] = [];
    const second = perfRemeasure(options(root), vitest(root, seen), root, twoSuites(root))?.(['libs/a.spec.ts']);

    expect(seen).toEqual([]);
    expect(second?.ok === false ? second.error : '').toContain(
      `The report was measured with the Vitest config vitest.config.ts, and there is no such file in ${root}.`,
    );
  });

  it('refuses a suspect whose report recorded no config, and stops at the first run that could not', () => {
    const root = repo();
    const mixed = mergeRuns([
      { path: 'old.json', run: run({ root, files: [file(`${root}/old.spec.ts`)] }) },
      { path: 'new.json', run: run({ root, configFile: 'missing.config.ts', files: [file(`${root}/new.spec.ts`)] }) },
      { path: 'libs.json', run: run({ root, configFile: 'vitest.config.ts', files: [file(`${root}/libs.spec.ts`)] }) },
    ]).run;
    const seen: string[][] = [];
    const remeasure = perfRemeasure(options(root), vitest(root, seen), root, mixed);

    expect(remeasure?.(['old.spec.ts'])).toMatchObject({
      ok: false,
      error: expect.stringContaining('None of the files to re-measure is in a report that recorded its Vitest config.'),
    });
    expect(remeasure?.(['new.spec.ts', 'libs.spec.ts'])).toMatchObject({ ok: false, error: expect.stringContaining('missing.config.ts') });
    expect(seen).toEqual([]);
  });

  it('marks the merged second reading red when any of its runs failed', () => {
    const root = repo();

    expect(
      perfRemeasure(options(root), vitest(root, [], 10, 1), root, twoSuites(root))?.(['libs/a.spec.ts', 'libs/tooling/b.spec.ts']),
    ).toMatchObject({ ok: true, runFailed: true });
  });
});
