/**
 * What `perf` makes of the version 5 report and of the flags that came with it: a hung process,
 * coverage after the run, per-test heap steps, the library's hook time, time outside Vitest,
 * `pool: 'vmThreads'`, the setup-file split, `--ab-isolate`, `--out`, `--profile-dir`, and a
 * baseline that refuses an unfinished run.
 */
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildGraph } from './checks/graph';
import { writeTextFile } from './fs-scan';
import { runCli } from './main';
import { analysePerf, renderPerf } from './perf';
import { abIsolateFindings } from './perf-ab';
import { BASELINE_DEFAULTS } from './perf-baseline';
import { poolFindings } from './perf-config';
import type { PerfFile, PerfRun, Phase } from './perf-data';
import { PERF_ISOLATE_ENV, PERF_OUTPUT_ENV, PERF_PROFILE_ENV, PERF_REPORTER_ENV } from './perf-data';
import { cleanRepo, file, ordinary, recorder, run } from './perf-fixtures';
import { GATE_DEFAULTS } from './perf-gate';
import type { PerfDocument } from './perf-report';
import type { PerfMeasured, PerfRunOptions, PerfSource, Spawn } from './perf-run';
import { OUT_FILE_NAME, outPath, perfAbIsolate, readPerfRun } from './perf-run';
import { coverageFindings, heapStepFindings, hungFindings, libraryHooksLine, outsideLine } from './perf-run-signals';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

beforeEach(() => {
  vi.stubEnv('NO_COLOR', '1');
  vi.stubEnv(PERF_OUTPUT_ENV, undefined);
  vi.stubEnv(PERF_PROFILE_ENV, undefined);
  vi.stubEnv(PERF_REPORTER_ENV, undefined);
  vi.stubEnv(PERF_ISOLATE_ENV, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  removeTempRepos();
});

const MB = 1024 * 1024;

const checks = (findings: readonly { check: string }[]): string[] => findings.map((finding) => finding.check);

const measured = (over: Partial<PerfRun> = {}, source: Partial<PerfMeasured> = {}): PerfMeasured => ({
  ok: true,
  run: run({ files: [file('/repo/src/a.spec.ts', { tests: 10 })], wall: 1_000, ...over }),
  runFailed: false,
  ...source,
});

describe('hungFindings', () => {
  it('warns about a process Vitest had to force out, and stays quiet otherwise', () => {
    expect(checks(hungFindings(run({ hung: true })))).toEqual(['perf-hung']);
    expect(hungFindings(run({ hung: true }))[0]?.severity).toBe('warning');
    expect(hungFindings(run())).toEqual([]);
  });
});

describe('coverageFindings', () => {
  it('names coverage time that is large on its own and against the run, with the provider when known', () => {
    const [finding] = coverageFindings(run({ wall: 4_000, coverage: 2_000, config: { coverage: 'istanbul' } }));

    expect(finding?.check).toBe('perf-coverage');
    expect(finding?.message).toBe(
      'Coverage took 2.00s with the istanbul provider after the last test file finished, against 4.00s for the run, and none of it is in the phases above.',
    );
    expect(coverageFindings(run({ wall: 4_000, coverage: 2_000 }))[0]?.message).toContain('Coverage took 2.00s after the last');
  });

  it('says nothing about coverage under a second, under a fifth of the run, or absent', () => {
    expect(coverageFindings(run({ wall: 1_000, coverage: 900 }))).toEqual([]);
    expect(coverageFindings(run({ wall: 100_000, coverage: 5_000 }))).toEqual([]);
    expect(coverageFindings(run({ wall: 1_000 }))).toEqual([]);
  });
});

describe('heapStepFindings', () => {
  it('lists the tests that kept their heap, largest first, and nothing when none did', () => {
    const files = new Map<string, PerfFile>([
      ['src/a.spec.ts', file('/repo/src/a.spec.ts', { heapStep: { test: 'a > keeps', bytes: 3 * MB } })],
      ['src/b.spec.ts', file('/repo/src/b.spec.ts', { heapStep: { test: 'b > keeps more', bytes: 9 * MB } })],
      ['src/c.spec.ts', file('/repo/src/c.spec.ts', { heapStep: { test: 'c > same', bytes: 3 * MB } })],
      ['src/d.spec.ts', file('/repo/src/d.spec.ts')],
    ]);

    expect(heapStepFindings(files)[0]?.message).toBe(
      'Tests whose heap growth the next test did not give back, largest first: `b > keeps more` in src/b.spec.ts +9 MB, `a > keeps` in src/a.spec.ts +3 MB, `c > same` in src/c.spec.ts +3 MB.',
    );
    expect(heapStepFindings(new Map([['src/d.spec.ts', file('/repo/src/d.spec.ts')]]))).toEqual([]);
  });
});

describe('libraryHooksLine', () => {
  it("prints setupAutoSpy's share of the tests phase, only when a file recorded it", () => {
    expect(libraryHooksLine([file('/a', { tests: 900, autoSpy: 90 }), file('/b', { tests: 100 })])).toBe(
      "setupAutoSpy hooks 90ms, 9.0% of the tests phase — the library's per-test work, not your tests'",
    );
    expect(libraryHooksLine([file('/a', { autoSpy: 0 })])).toContain('0.0% of the tests phase');
    expect(libraryHooksLine([file('/a')])).toBeUndefined();
  });
});

describe('outsideLine', () => {
  it('prints the end-to-end wall and the part outside Vitest, naming the command that ran', () => {
    expect(outsideLine(measured({ wall: 5_200 }, { endToEnd: 8_700, command: 'ng test' }))).toBe(
      '`ng test` took 8.70s end to end, 3.50s of it outside the run Vitest timed: building, bundling, starting and exiting.',
    );
    expect(outsideLine(measured({ wall: 1_000 }, { endToEnd: 2_500 }))).toContain('`vitest run` took 2.50s end to end');
  });

  it('says nothing under a second outside, or when this process did not run the suite', () => {
    expect(outsideLine(measured({ wall: 1_000 }, { endToEnd: 1_900 }))).toBeUndefined();
    expect(outsideLine(measured())).toBeUndefined();
  });
});

describe('poolFindings', () => {
  const overhead: Phase[] = [
    { name: 'environment', ms: 6_000, share: 0.6 },
    { name: 'tests', ms: 4_000, share: 0.4 },
  ];
  const graph = buildGraph(readProfile(cleanRepo(1)));
  const onFive = (config: PerfRun['config']): PerfRun => run({ vitest: '5.0.2', ...(config === undefined ? {} : { config }) });

  it("suggests `pool: 'vmThreads'` to a Vitest 5 DOM suite on the default pool, with the measured win", () => {
    const [finding] = poolFindings(overhead, graph, onFive({ environment: 'jsdom', pool: 'forks', isolate: true, provided: [] }));

    expect(finding?.check).toBe('perf-pool');
    expect(finding?.message).toContain('measured on 30 jsdom files, 1.4–1.85 s went to 0.83–0.88 s');
    expect(finding?.fix).toContain("Try `pool: 'vmThreads'` in your Vitest config");
    expect(checks(poolFindings(overhead, graph, onFive({ environment: 'happy-dom' })))).toEqual(['perf-pool']);
  });

  it('stays quiet on Vitest 4, a node suite, a pool or isolate already chosen, a cheap overhead, and no resolved config', () => {
    expect(poolFindings(overhead, graph, run({ vitest: '4.1.0', config: { environment: 'jsdom' } }))).toEqual([]);
    expect(poolFindings(overhead, graph, run({ config: { environment: 'jsdom' } }))).toEqual([]);
    expect(poolFindings(overhead, graph, onFive(undefined))).toEqual([]);
    expect(poolFindings(overhead, graph, onFive({}))).toEqual([]);
    expect(poolFindings(overhead, graph, onFive({ environment: 'node' }))).toEqual([]);
    expect(poolFindings(overhead, graph, onFive({ environment: 'jsdom', pool: 'threads' }))).toEqual([]);
    expect(poolFindings(overhead, graph, onFive({ environment: 'jsdom', isolate: false }))).toEqual([]);
    expect(poolFindings(overhead, graph, onFive({ environment: 'jsdom', provided: ['pool'] }))).toEqual([]);
    expect(
      poolFindings(
        [
          { name: 'tests', ms: 9_000, share: 0.9 },
          { name: 'environment', ms: 1_000, share: 0.1 },
        ],
        graph,
        onFive({ environment: 'jsdom' }),
      ),
    ).toEqual([]);
  });
});

describe('the setup-file split', () => {
  const setupRepo = (over: Readonly<Record<string, string>>): string =>
    cleanRepo(1, {
      'vitest.config.ts': "export default { test: { setupFiles: ['./src/test-setup.ts'] } };\n",
      'src/test-setup.ts': "document.title = '';\n",
      ...over,
    });

  it('says the split frees nothing yet when a DOM spec shares the worker', () => {
    const root = setupRepo({ 'src/dom.spec.ts': "it('x', () => { document.title = 'a'; });\n" });
    const shared = run({
      root,
      wall: 1_000,
      files: [
        file(join(root, 'src/case-0.spec.ts'), { environment: 9_000, tests: 10 }),
        file(join(root, 'src/dom.spec.ts'), { environment: 9_000, tests: 10 }),
      ],
    });

    expect(analysePerf(shared, readProfile(root)).findings[0]?.fix).toContain(
      'With the DOM part moved out, 1 spec file reaches no DOM and could move to `node`, though none of them would yet fill a worker of its own.',
    );
  });

  it('counts several freed specs and what moving them frees', () => {
    const root = setupRepo({ 'src/case-1.spec.ts': "it('x', () => {});\n" });
    const apart = run({
      root,
      wall: 1_000,
      files: [
        file(join(root, 'src/case-0.spec.ts'), { environment: 4_000, tests: 10 }),
        file(join(root, 'src/case-1.spec.ts'), { environment: 5_000, tests: 10 }),
      ],
    });

    expect(analysePerf(apart, readProfile(root)).findings[0]?.fix).toContain(
      'With the DOM part moved out, 2 spec files reach no DOM and could move to `node`, freeing 9.00s of environment.',
    );
  });

  it('says the split frees nothing when every spec reaches a DOM of its own', () => {
    const root = setupRepo({ 'src/case-0.spec.ts': "it('x', () => { document.title = 'a'; });\n" });
    const heavy = run({ root, wall: 1_000, files: [file(join(root, 'src/case-0.spec.ts'), { environment: 9_000, tests: 10 })] });

    expect(analysePerf(heavy, readProfile(root)).findings[0]?.fix).toContain(
      'With the DOM part moved out, still no spec would be free of the DOM, so the split frees nothing yet.',
    );
  });
});

describe('abIsolateFindings', () => {
  const second = (over: Partial<PerfRun>, runFailed = false): PerfSource => ({
    ok: true,
    run: run({ files: [file('/repo/src/a.spec.ts', { tests: 10 })], ...over }),
    runFailed,
  });

  it('runs the suite again with isolate flipped and reports which way is faster', () => {
    const io = recorder();
    const asked: boolean[] = [];
    const [finding] = abIsolateFindings(
      measured({ wall: 1_250, config: { isolate: true } }),
      (isolate) => {
        asked.push(isolate);

        return second({ wall: 630 });
      },
      io,
    );

    expect(asked).toEqual([false]);
    expect(io.stdout).toEqual(['\nperf ab: running the suite again with `isolate: false`.']);
    expect(finding?.check).toBe('perf-isolation-ab');
    expect(finding?.message).toBe(
      'Measured both ways, one run each: `isolate: true` 1.25s wall clock (10ms of CPU), `isolate: false` 630ms wall clock (10ms of CPU): `isolate: false` is 49.6% faster on the wall clock.',
    );
    expect(finding?.fix).toMatch(/^Set `isolate: false` and keep it only if peak memory stays acceptable/);
  });

  it('keeps the current setting when it is the faster one, or when the difference is noise', () => {
    const slower = abIsolateFindings(measured({ wall: 1_000 }), () => second({ wall: 1_500 }), recorder())[0];
    const noise = abIsolateFindings(measured({ wall: 1_000 }), () => second({ wall: 1_020 }), recorder())[0];
    const fromOff = abIsolateFindings(measured({ wall: 1_000, config: { isolate: false } }), () => second({ wall: 500 }), recorder())[0];
    const zero = abIsolateFindings(measured({ wall: 0 }), () => second({ wall: 0 }), recorder())[0];

    expect(slower?.fix).toMatch(/^Keep `isolate: true`\. One reading each/);
    expect(noise?.message).toContain('within what one run of each can tell apart');
    expect(noise?.fix).toBe('Keep `isolate: true`: flipping it bought nothing measurable on this machine.');
    expect(fromOff?.fix).toMatch(/^Set `isolate: true`\. One reading/);
    expect(zero?.message).toContain('within what one run of each');
  });

  it('turns a flipped run that fails into the finding, whichever way it was flipped', () => {
    const offFails = abIsolateFindings(measured(), () => second({}, true), recorder())[0];
    const onFails = abIsolateFindings(measured({ config: { isolate: false } }), () => second({ files: [] }), recorder())[0];

    expect(offFails?.severity).toBe('warning');
    expect(offFails?.message).toContain('a fresh module graph and environment of its own');
    expect(onFails?.message).toContain('state another file leaves behind');
    expect(onFails?.fix).toContain('passes only after another one ran');
  });

  it('explains why nothing was compared: no suite to rerun, a vm pool, a rerun that could not be read', () => {
    const io = recorder();

    expect(abIsolateFindings(measured(), undefined, io)).toEqual([]);
    expect(abIsolateFindings(measured({ config: { pool: 'vmThreads' } }), () => second({}), io)).toEqual([]);
    expect(abIsolateFindings(measured(), () => ({ ok: false, error: 'no report' }), io)).toEqual([]);
    expect(io.stderr.join('\n')).toContain('--json alone is a past run');
    expect(io.stderr.join('\n')).toContain("under `pool: 'vmThreads'` every file gets a fresh context");
    expect(io.stderr.join('\n')).toContain('could not be measured, so nothing was compared.\nno report');
  });
});

/** A run heavy enough for the advice: ten files, environment dominating, isolation on. */
function isolatedRun(root: string, over: Partial<PerfRun> = {}): PerfRun {
  return run({
    root,
    wall: 2_000,
    vitest: '4.1.0',
    config: { isolate: true, pool: 'forks' },
    files: Array.from({ length: 10 }, (_unused, index) =>
      file(join(root, `src/f-${index}.spec.ts`), { environment: 900 - index, tests: 100 }),
    ),
    ...over,
  });
}

describe('renderPerf with the version 5 signals', () => {
  it('replaces the predicted isolation advice with the measured one under --ab-isolate', () => {
    const root = cleanRepo(1);
    const source: PerfSource = { ok: true, run: isolatedRun(root), runFailed: false };
    const predicted = recorder();
    const io = recorder();

    renderPerf(source, readProfile(root), predicted);
    renderPerf(source, readProfile(root), io, {
      abIsolate: { rerun: () => ({ ok: true, run: isolatedRun(root, { wall: 1_000 }), runFailed: false }) },
    });

    expect(predicted.stdout.join('\n')).toMatch(/info {3}perf-isolation\n/);
    expect(io.stdout.join('\n')).not.toMatch(/info {3}perf-isolation\n/);
    expect(io.stdout.join('\n')).toContain('perf-isolation-ab');

    const unmeasured = recorder();

    renderPerf(source, readProfile(root), unmeasured, { abIsolate: { rerun: undefined } });

    expect(unmeasured.stdout.join('\n')).toMatch(/info {3}perf-isolation\n/);
  });

  it('prints the time outside Vitest and the library hook share under the phase table', () => {
    const root = cleanRepo(1);
    const files = [file(join(root, 'src/case-0.spec.ts'), { tests: 100, autoSpy: 10 })];
    const io = recorder();

    renderPerf(
      { ok: true, run: run({ root, wall: 1_000, files }), runFailed: false, endToEnd: 4_000, command: 'ng test' },
      readProfile(root),
      io,
    );

    const out = io.stdout.join('\n');

    expect(out).toContain('`ng test` took 4.00s end to end, 3.00s of it outside the run Vitest timed');
    expect(out).toContain('setupAutoSpy hooks 10ms, 10.0% of the tests phase');
  });

  it('says an interrupted run was interrupted', () => {
    const root = cleanRepo(1);
    const io = recorder();

    renderPerf(
      {
        ok: true,
        run: run({ root, partial: true, end: 'interrupted', files: [file(join(root, 'src/case-0.spec.ts'), { tests: 1 })] }),
        runFailed: true,
      },
      readProfile(root),
      io,
    );

    expect(io.stderr.join('\n')).toContain('warning  The run was interrupted — Ctrl-C, a signal or `--bail` —: this report');
  });

  it('neither records nor compares a baseline from a run that did not finish', () => {
    const root = cleanRepo(1);
    const path = join(root, 'perf-baseline.json');
    const source: PerfSource = {
      ok: true,
      run: run({ root, partial: true, files: [file(join(root, 'src/case-0.spec.ts'), { tests: 1 })] }),
      runFailed: false,
    };
    const recording = recorder();
    const comparing = recorder();

    expect(renderPerf(source, readProfile(root), recording, { baseline: { path, update: true, options: BASELINE_DEFAULTS } })).toBe(2);
    expect(recording.stderr.join('\n')).toContain('The baseline is not recorded from a run that did not finish');
    expect(renderPerf(source, readProfile(root), comparing, { baseline: { path, update: false, options: BASELINE_DEFAULTS } })).toBe(0);
    expect(comparing.stderr.join('\n')).toContain('The baseline is not compared with a run that did not finish');
    expect(comparing.stderr.join('\n')).not.toContain('No baseline to compare against');
  });

  it('puts the new run fields into the JSON document', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const files = [file(join(root, 'src/case-0.spec.ts'), { tests: 100, autoSpy: 7 }), file(join(root, 'src/other.spec.ts'), { tests: 1 })];

    renderPerf(
      { ok: true, run: run({ root, wall: 1_000, files, end: 'passed', hung: true, coverage: 1_500 }), runFailed: false, endToEnd: 3_000 },
      readProfile(root),
      io,
      { format: 'json' },
    );

    const document = JSON.parse(io.stdout.join('\n')) as PerfDocument;

    expect(document.run).toMatchObject({ end: 'passed', hung: true, coverageMs: 1_500, libraryHooksMs: 7, endToEndMs: 3_000 });

    const bare = recorder();

    renderPerf({ ok: true, run: run({ root, files }), runFailed: false }, readProfile(root), bare, { format: 'json' });

    const plain = JSON.parse(bare.stdout.join('\n')) as PerfDocument;

    expect(plain.run).not.toHaveProperty('end');
    expect(plain.run).not.toHaveProperty('endToEndMs');
  });

  it("shows the setup files' imports and each import's self time on a confirmed finding's card", () => {
    const root = createTempRepo({ 'package.json': '{}', 'src/slow.spec.ts': 'test("x", () => {});\n' });
    const specPath = join(root, 'src/slow.spec.ts');
    const source: PerfSource = {
      ok: true,
      run: run({ root, files: [...ordinary(root), file(specPath, { tests: 9_000, testCount: 30 })] }),
      runFailed: false,
    };
    const remeasure = (): PerfSource => ({
      ok: true,
      runFailed: false,
      run: run({
        root,
        files: [
          file(specPath, {
            tests: 8_000,
            testCount: 30,
            slowImports: [
              { module: join(root, 'src/widget.ts'), ms: 400, self: 20 },
              { module: join(root, 'src/tiny.ts'), ms: 10, self: 10 },
              { module: join(root, 'src/plain.ts'), ms: 5 },
              { module: join(root, 'src/also-plain.ts'), ms: 5 },
            ],
            setupImports: [{ module: join(root, 'node_modules/zone.js/fesm2015/zone.js'), ms: 600, self: 600 }],
          }),
        ],
      }),
    });
    const io = recorder();

    renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } });

    const out = io.stdout.join('\n');

    expect(out).toMatch(/600ms {2}zone\.js · setup file\n/);
    expect(out).toMatch(/400ms {2}src\/widget\.ts · self 20ms\n/);
    expect(out).toMatch(/10ms {2}src\/tiny\.ts\n/);
    expect(out).toMatch(/5ms {2}src\/also-plain\.ts\n.*5ms {2}src\/plain\.ts\n/s);
  });
});

describe('readPerfRun, --out and the end-to-end clock', () => {
  const options = (root: string, over: Partial<PerfRunOptions> = {}): PerfRunOptions => ({
    cwd: root,
    profile: readProfile(root),
    json: undefined,
    out: undefined,
    command: 'npm test',
    paths: [],
    ...over,
  });
  const writing =
    (seen: SpawnRecord[]): Spawn =>
    (request) => {
      seen.push({ env: request.env });
      writeTextFile(request.env[PERF_OUTPUT_ENV] ?? '', JSON.stringify(run({ files: [file('/repo/a.spec.ts', { tests: 1 })] })));

      return { status: 0 };
    };

  interface SpawnRecord {
    readonly env: Readonly<Record<string, string>>;
  }

  it('resolves --out against --cwd and writes into a directory it names, so the harness and perf agree on one file', () => {
    const root = createTempRepo({ 'package.json': '{}', 'dist/perf-reporter.js': '', 'reports/': '' });
    const seen: SpawnRecord[] = [];
    const source = readPerfRun(options(root, { out: 'reports' }), writing(seen), root);

    expect(seen[0]?.env[PERF_OUTPUT_ENV]).toBe(join(root, 'reports', OUT_FILE_NAME));
    expect(source.ok && source.endToEnd !== undefined && source.endToEnd >= 0).toBe(true);
    expect(outPath('new-dir/', root)).toBe(join(root, 'new-dir', OUT_FILE_NAME));
    expect(outPath('perf.json', root)).toBe(join(root, 'perf.json'));
    expect(outPath('/elsewhere/perf.json', root)).toBe('/elsewhere/perf.json');
  });

  it('hands --ab-isolate its setting through the environment, and has no second run for a report that is only read', () => {
    const root = createTempRepo({ 'package.json': '{}', 'dist/perf-reporter.js': '' });
    const seen: SpawnRecord[] = [];
    const rerun = perfAbIsolate(options(root, { out: 'kept.json' }), writing(seen), root);

    expect(rerun?.(false).ok).toBe(true);
    expect(seen[0]?.env[PERF_ISOLATE_ENV]).toBe('false');
    expect(seen[0]?.env[PERF_OUTPUT_ENV]).not.toBe(join(root, 'kept.json'));
    expect(perfAbIsolate(options(root, { command: undefined, json: 'perf.json' }), writing(seen), root)).toBeUndefined();
    expect(perfAbIsolate(options(root, { json: 'perf.json' }), writing(seen), root)).toBeDefined();
  });
});

describe('runCli perf, the new flags', () => {
  const reportRepo = (): string => {
    const root = cleanRepo(1);

    writeTextFile(join(root, 'perf.json'), JSON.stringify(run({ root, files: [file(join(root, 'src/case-0.spec.ts'), { tests: 10 })] })));

    return root;
  };

  it('warns that --profile-dir keeps nothing without a confirmation pass', () => {
    const io = recorder();

    expect(runCli(['perf', '--cwd', reportRepo(), '--json', 'perf.json', '--profile-dir', 'profiles'], io)).toBe(0);
    expect(io.stderr.join('\n')).toContain("--profile-dir keeps the profiles the gate's confirmation pass records");
  });

  it('accepts --ab-isolate and says a read report has no suite to run again', () => {
    const io = recorder();

    expect(runCli(['perf', '--cwd', reportRepo(), '--json', 'perf.json', '--ab-isolate'], io)).toBe(0);
    expect(io.stderr.join('\n')).toContain('--ab-isolate needs a suite to run again');
  });
});
