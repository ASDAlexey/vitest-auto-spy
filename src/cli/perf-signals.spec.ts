/**
 * What `perf` makes of the data a Vitest 5 report adds: the resolved config, start-up, per-file
 * transform wait, workers and lanes, retries and an unfinished run. A report without it must read
 * exactly as before, so each rule is pinned from both sides.
 */
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildGraph } from './checks/graph';
import { flakyFindings, heapFindings } from './checks/perf-flaky';
import { analysePerf, renderPerf } from './perf';
import { domEngineFindings, isolationFindings, transformFindings, vitestDoctorFindings, workerFindings } from './perf-config';
import type { PerfFile, PerfRun, Phase } from './perf-data';
import { PERF_OUTPUT_ENV, PERF_PROFILE_ENV, PERF_REPORTER_ENV } from './perf-data';
import { file, ordinary, recorder, run } from './perf-fixtures';
import { GATE_DEFAULTS, gateCandidates, gateVerdict } from './perf-gate';
import { formatLanes, lanesOf, longPoleFindings } from './perf-lanes';
import type { PerfDocument } from './perf-report';
import { readProfile } from './profile';
import { perfMarkdown } from './report-markdown';
import { createTempRepo, removeTempRepos } from './temp-repo';

beforeEach(() => {
  vi.stubEnv('NO_COLOR', '1');
  vi.stubEnv(PERF_OUTPUT_ENV, undefined);
  vi.stubEnv(PERF_PROFILE_ENV, undefined);
  vi.stubEnv(PERF_REPORTER_ENV, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  removeTempRepos();
});

const checks = (findings: readonly { check: string }[]): string[] => findings.map((finding) => finding.check);

const phase = (name: Phase['name'], share: number): Phase => ({ name, ms: share * 10_000, share });

const repo = (config = 'export default {};\n'): string =>
  createTempRepo({ 'package.json': JSON.stringify({ devDependencies: { vitest: '^5' } }), 'vitest.config.ts': config });

const graphOf = (root: string): ReturnType<typeof buildGraph> => buildGraph(readProfile(root));

const onFive = (over: Partial<PerfRun> = {}): PerfRun => run({ vitest: '5.0.0', ...over });

const map = (entries: readonly (readonly [string, Partial<PerfFile>])[]): Map<string, PerfFile> =>
  new Map(entries.map(([path, over]) => [path, file(`/repo/${path}`, over)]));

describe('isolationFindings with the resolved config', () => {
  const overhead = [phase('environment', 0.5), phase('tests', 0.5)];

  it('stays quiet on a resolved `isolate: false`, an `isolate` the user set, and a vm pool', () => {
    const root = repo();
    const graph = graphOf(root);
    const profile = readProfile(root);

    expect(isolationFindings(overhead, graph, profile, onFive({ config: { isolate: false } }))).toEqual([]);
    expect(isolationFindings(overhead, graph, profile, onFive({ config: { isolate: true, provided: ['isolate'] } }))).toEqual([]);
    expect(isolationFindings(overhead, graph, profile, onFive({ config: { isolate: true, pool: 'vmThreads' } }))).toEqual([]);
  });

  it('trusts the resolved config over a config text that disables isolation somewhere else', () => {
    const root = repo('export default { test: { isolate: false } };\n');
    const [finding] = isolationFindings(overhead, graphOf(root), readProfile(root), onFive({ config: { isolate: true, pool: 'forks' } }));

    expect(finding?.check).toBe('perf-isolation');
    expect(finding?.message).not.toContain('workers were spawned');
  });

  it('prices the start-up the way Vitest 5 does when more workers were spawned than there are lanes', () => {
    const root = repo();
    const files = Array.from({ length: 40 }, (_unused, index) => file(`/repo/src/${index}.spec.ts`));
    const measured = onFive({ files, config: { isolate: true, maxWorkers: 4 }, startup: { ms: 40_000, workers: 40 } });
    const [finding] = isolationFindings(overhead, graphOf(root), readProfile(root), measured);

    expect(finding?.message).toContain('40 workers were spawned, 40.00s of start-up summed over them');
    expect(finding?.message).toContain('saves at least ~9.00s of wall clock');
    expect(finding?.message).toContain('spread over 4 lanes');
  });

  it('names the spawns without a saving when every lane had one worker, and falls back to the cores for the lanes', () => {
    const root = repo();
    const files = [file('/repo/src/a.spec.ts'), file('/repo/src/b.spec.ts')];
    const measured = onFive({ files, config: { isolate: true }, startup: { ms: 900, workers: 2 } });
    const [finding] = isolationFindings(overhead, graphOf(root), readProfile(root), measured, 4);

    expect(finding?.message).toContain('2 workers were spawned, 900ms of start-up');
    expect(finding?.message).not.toContain('saves at least');
  });

  it('adds nothing for a report that spawned no worker', () => {
    const root = repo();
    const [finding] = isolationFindings(overhead, graphOf(root), readProfile(root), onFive({ startup: { ms: 0, workers: 0 } }));

    expect(finding?.message).not.toContain('spawned');
  });
});

describe('workerFindings with the resolved config', () => {
  it('stays quiet when the resolved count is already at or under half the cores', () => {
    const root = repo();

    expect(workerFindings(120_000, graphOf(root), onFive({ config: { maxWorkers: 4 } }), 8)).toEqual([]);
  });

  it('counts the lanes the run used when the resolved config leaves `maxWorkers` out', () => {
    const root = repo();
    const files = [file('/repo/a.spec.ts', { lane: 2 }), file('/repo/b.spec.ts', { lane: 7 }), file('/repo/c.spec.ts')];

    expect(workerFindings(120_000, graphOf(root), onFive({ files }), 8)[0]?.message).toContain('up to 7 workers');
    expect(workerFindings(120_000, graphOf(root), onFive({ files: files.slice(0, 1) }), 8)).toEqual([]);
  });

  it('names the resolved count instead of one per core', () => {
    const root = repo();
    const [finding] = workerFindings(120_000, graphOf(root), onFive({ config: { maxWorkers: 7 } }), 8);

    expect(finding?.message).toContain("Vitest starts up to 7 workers on this machine's 8 cores");
    expect(finding?.fix).toContain('`maxWorkers: 4`');
  });
});

describe('domEngineFindings with the resolved config', () => {
  const dominant = [phase('environment', 0.6), phase('tests', 0.4)];

  it('names the config text that sets jsdom, or the runner config when the text does not show it', () => {
    const named = repo("export default { test: { environment: 'jsdom' } };\n");
    const unnamed = repo();

    expect(domEngineFindings(dominant, graphOf(named), onFive({ config: { environment: 'jsdom' } }))[0]?.message).toMatch(
      /^vitest\.config\.ts sets/,
    );
    expect(domEngineFindings(dominant, graphOf(unnamed), onFive({ config: { environment: 'jsdom' } }))[0]?.message).toMatch(
      /^vitest\.config\.ts sets/,
    );
  });

  it('stays quiet when the run resolved another environment, whatever the text says', () => {
    const root = repo("export default { test: { environment: 'jsdom' } };\n");

    expect(domEngineFindings(dominant, graphOf(root), onFive({ config: { environment: 'happy-dom' } }))).toEqual([]);
  });
});

describe('transformFindings', () => {
  const dominant = [phase('transform', 0.5), phase('import', 0.5)];
  const waited = (over: Partial<PerfRun> = {}): PerfRun =>
    onFive({ files: [file('/repo/src/a.spec.ts', { fetch: 3_000 }), file('/repo/src/b.spec.ts', { fetch: 1_500 })], ...over });

  it('advises the module cache with the seconds this run waited, and the CI cache directory', () => {
    const root = repo();
    const [finding] = transformFindings(dominant, graphOf(root), waited({ config: { fsModuleCache: false } }));

    expect(finding?.check).toBe('perf-transform');
    expect(finding?.message).toContain('50.0% of the measured CPU time — 4.50s over 2 files');
    expect(finding?.fix).toContain('Set `fsModuleCache: true` in vitest.config.ts');
    expect(finding?.fix).toContain('up to 4.50s of that wait');
    expect(finding?.fix).toContain('node_modules/.vitest-cache is kept between pipelines');
  });

  it('spells the option the Vitest 5 way when the report does not name the version', () => {
    const root = repo();
    const [finding] = transformFindings(dominant, graphOf(root), run({ files: waited().files }));

    expect(finding?.fix).toContain('Set `fsModuleCache: true`');
  });

  it('spells the option the Vitest 4 way on a Vitest 4 report', () => {
    const root = repo();
    const [finding] = transformFindings(dominant, graphOf(root), waited({ vitest: '4.1.11' }));

    expect(finding?.fix).toContain('`experimental.fsModuleCache: true`');
    expect(finding?.fix).toContain('node_modules/.experimental-vitest-cache');
  });

  it('stays quiet when the cache is on, the option was set on purpose, the phase is small, or not every file measured its wait', () => {
    const root = repo();
    const graph = graphOf(root);

    expect(transformFindings(dominant, graph, waited({ config: { fsModuleCache: true } }))).toEqual([]);
    expect(transformFindings(dominant, graph, waited({ config: { fsModuleCache: false, provided: ['fsModuleCache'] } }))).toEqual([]);
    expect(transformFindings([phase('transform', 0.1), phase('import', 0.9)], graph, waited())).toEqual([]);
    expect(transformFindings(dominant, graph, onFive({ files: [file('/repo/a.spec.ts', { fetch: 1 }), file('/repo/b.spec.ts')] }))).toEqual(
      [],
    );
    expect(transformFindings(dominant, graph, onFive({ files: [file('/repo/a.spec.ts')] }))).toEqual([]);
  });

  it('reads the config text when the report carries no resolved config', () => {
    const root = repo('export default { fsModuleCache: true };\n');

    expect(transformFindings(dominant, graphOf(root), waited())).toEqual([]);
  });
});

describe('vitestDoctorFindings', () => {
  const isolation = [{ check: 'perf-isolation', severity: 'info' as const, message: '', fix: '' }];

  it("points a Vitest 5 run at `npx vitest doctor` once, as Vitest's command", () => {
    const [finding] = vitestDoctorFindings(onFive({ vitest: '5.0.2' }), isolation);

    expect(finding?.check).toBe('perf-vitest-doctor');
    expect(finding?.message).toContain('Vitest 5.0.2');
    expect(finding?.message).toContain("It is Vitest's command, not this package's `doctor`.");
  });

  it('says nothing before Vitest 5, without a version, or without a switch to confirm', () => {
    expect(vitestDoctorFindings(run({ vitest: '4.1.11' }), isolation)).toEqual([]);
    expect(vitestDoctorFindings(run(), isolation)).toEqual([]);
    expect(vitestDoctorFindings(onFive(), [{ check: 'perf-environment', severity: 'info', message: '', fix: '' }])).toEqual([]);
  });
});

describe('lanesOf and the long pole', () => {
  it('is undefined for a report that places no file on a lane', () => {
    expect(lanesOf(map([['a.spec.ts', {}]]))).toBeUndefined();
  });

  it('measures how busy the lanes were and who ran alone at the end', () => {
    const summary = lanesOf(
      map([
        ['a.spec.ts', { lane: 1, start: 0, tests: 1_000 }],
        ['b.spec.ts', { lane: 1, start: 1_000, tests: 1_000 }],
        ['c.spec.ts', { lane: 2, start: 0, tests: 10_000 }],
      ]),
    );

    expect(summary).toEqual({ lanes: 2, spanMs: 10_000, busy: 0.6, longPole: { file: 'c.spec.ts', aloneMs: 8_000 } });
    expect(formatLanes(summary as NonNullable<typeof summary>)).toBe(
      '2 lanes busy 60.0% of the 10.00s span; c.spec.ts ran alone for the last 8.00s',
    );

    const [finding] = longPoleFindings(summary);

    expect(finding?.check).toBe('perf-long-pole');
    expect(finding?.file).toBe('c.spec.ts');
    expect(finding?.message).toContain('80.0% of the run');
  });

  it('has no long pole on one lane, or when the lanes finished together, and no finding under the floors', () => {
    const single = lanesOf(map([['a.spec.ts', { lane: 1, start: 5, prepare: 0 }]]));
    const even = lanesOf(
      map([
        ['a.spec.ts', { lane: 1, start: 0, tests: 1_000 }],
        ['b.spec.ts', { lane: 2, start: 0, tests: 1_000 }],
      ]),
    );
    const short = lanesOf(
      map([
        ['a.spec.ts', { lane: 1, start: 0, tests: 100 }],
        ['b.spec.ts', { lane: 2, start: 0, tests: 1_500 }],
      ]),
    );
    const shared = lanesOf(
      map([
        ['a.spec.ts', { lane: 1, start: 0, tests: 9_000 }],
        ['b.spec.ts', { lane: 2, start: 0, tests: 12_000 }],
      ]),
    );

    expect(single).toEqual({ lanes: 1, spanMs: 0, busy: 1 });
    expect(formatLanes(single as NonNullable<typeof single>)).toBe('1 lane busy 100.0% of the 0ms span');
    expect(even?.longPole).toBeUndefined();
    expect(longPoleFindings(even)).toEqual([]);
    expect(longPoleFindings(short)).toEqual([]);
    expect(longPoleFindings(shared)).toEqual([]);
    expect(longPoleFindings(undefined)).toEqual([]);
  });
});

describe('heapFindings per worker', () => {
  it('lists what each file added to its worker under `isolate: false`, largest first, lane by lane', () => {
    const mb = 1_048_576;
    const [finding] = heapFindings(
      map([
        ['a.spec.ts', { lane: 1, start: 0, heap: 100 * mb }],
        ['b.spec.ts', { lane: 1, start: 10, heap: 160 * mb }],
        ['c.spec.ts', { lane: 1, start: 20, heap: 150 * mb }],
        ['d.spec.ts', { lane: 2, start: 0, heap: 300 * mb }],
        ['e.spec.ts', { lane: 2, start: 5, heap: 320 * mb }],
      ]),
      true,
    );

    expect(finding?.message).toBe(
      'Heap each file added to its worker, over the file that ran before it there, largest first: b.spec.ts +60 MB, e.spec.ts +20 MB.',
    );
    expect(finding?.fix).toContain('stays for every file after it');
  });

  it('orders files that grew the heap by the same amount by path', () => {
    const [finding] = heapFindings(
      map([
        ['b.spec.ts', { lane: 1, start: 0, heap: 0 }],
        ['z.spec.ts', { lane: 1, start: 1, heap: 1_048_576 }],
        ['c.spec.ts', { lane: 2, start: 0, heap: 0 }],
        ['y.spec.ts', { lane: 2, start: 1, heap: 1_048_576 }],
      ]),
      true,
    );

    expect(finding?.message).toContain('y.spec.ts +1 MB, z.spec.ts +1 MB.');
  });

  it('falls back to the heap after each file when no file grew it, or no worker ran two files', () => {
    const shrinking = heapFindings(
      map([
        ['a.spec.ts', { lane: 1, start: 0, heap: 2_097_152 }],
        ['b.spec.ts', { lane: 1, start: 1, heap: 1_048_576 }],
      ]),
      true,
    );
    const isolated = heapFindings(
      map([
        ['a.spec.ts', { lane: 1, start: 0, heap: 1_048_576 }],
        ['b.spec.ts', { lane: 1, start: 1, heap: 2_097_152 }],
      ]),
    );
    const separate = heapFindings(
      map([
        ['a.spec.ts', { lane: 1, start: 0, heap: 1_048_576 }],
        ['b.spec.ts', { lane: 2, start: 0, heap: 2_097_152 }],
      ]),
      true,
    );

    expect(shrinking[0]?.message).toBe('Heap used after the file, largest first: a.spec.ts 2 MB, b.spec.ts 1 MB.');
    expect(separate[0]?.message).toBe('Heap used after the file, largest first: b.spec.ts 2 MB, a.spec.ts 1 MB.');
    expect(isolated[0]?.message).toBe('Heap used after the file, largest first: b.spec.ts 2 MB, a.spec.ts 1 MB.');
  });
});

describe('flakyFindings with retries', () => {
  it('counts the failed attempts, and prices the one retried test when its body was recorded', () => {
    const [one] = flakyFindings(map([['a.spec.ts', { flaky: ['a > x'], retries: 2, cases: [{ name: 'a > x', ms: 2_100 }] }]]), false);
    const [single] = flakyFindings(map([['a.spec.ts', { flaky: ['a > x'], retries: 1 }]]), false);
    const [two] = flakyFindings(
      map([['a.spec.ts', { flaky: ['a > x', 'a > y'], retries: 3, cases: [{ name: 'a > x', ms: 900 }] }]]),
      false,
    );
    const [unknown] = flakyFindings(map([['a.spec.ts', { flaky: ['a > x'], cases: [{ name: 'a > x', ms: 900 }] }]]), false);

    expect(one?.message).toBe('1 test passed only after a retry: `a > x`. It took 2.10s across its 3 attempts.');
    expect(one?.fix).toContain("Its 2 failed attempts are counted in this file's time");
    expect(single?.message).not.toContain('attempts');
    expect(single?.fix).toContain("Its 1 failed attempt is counted in this file's time");
    expect(two?.message).not.toContain('It took');
    expect(unknown?.message).not.toContain('It took');
    expect(unknown?.fix).toContain("Its failed attempts are counted in this file's time");
  });
});

describe('the gate, on retried tests', () => {
  const judged = (over: Partial<PerfFile>): string[] => {
    const measured = run({ files: [...ordinary('/repo'), file('/repo/src/a.spec.ts', { testCount: 1, ...over })] });

    return gateVerdict(gateCandidates(measured, '/repo', GATE_DEFAULTS), undefined, '/repo', false).findings.map(
      (finding) => finding.message,
    );
  };

  it('says a slow body that passed on a retry is timed over every attempt', () => {
    const [message] = judged({ tests: 1_500, cases: [{ name: 'x', ms: 1_500 }], flaky: ['x'], retries: 1 });

    expect(message).toContain('It passed only on a retry, and that time covers every attempt.');
  });

  it('counts the failed attempts inside a slow file', () => {
    const many = judged({ tests: 9_000, retries: 3 }).join(' ');
    const one = judged({ tests: 9_000, retries: 1 }).join(' ');
    const none = judged({ tests: 9_000, retries: 0 }).join(' ');

    expect(many).toContain('3 failed attempts of tests that passed on a retry are inside that time.');
    expect(one).toContain('1 failed attempt of tests that passed on a retry');
    expect(none).not.toContain('failed attempt');
  });
});

describe('analysePerf and renderPerf on a Vitest 5 report', () => {
  const specs = (root: string, over: (index: number) => Partial<PerfFile>): PerfFile[] =>
    Array.from({ length: 3 }, (_unused, index) => file(join(root, `src/case-${index}.spec.ts`), { tests: 10, ...over(index) }));

  it('groups environments by lane and value, so two workers that land on the same float are two environments', () => {
    const root = createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '^5' } }),
      'src/add.ts': 'export const add = (a: number, b: number): number => a + b;\n',
      'src/case-0.spec.ts':
        "import { expect, it } from 'vitest';\nimport { add } from './add';\nit('adds', () => expect(add(1, 2)).toBe(3));\n",
      'src/case-1.spec.ts':
        "import { expect, it } from 'vitest';\nimport { add } from './add';\nit('adds', () => expect(add(1, 2)).toBe(3));\n",
      'src/dom.spec.ts': "it('reads', () => document.body);\n",
    });
    const measured = onFive({
      root,
      files: [
        file(join(root, 'src/case-0.spec.ts'), { environment: 6_000, lane: 1, tests: 10 }),
        file(join(root, 'src/case-1.spec.ts'), { environment: 6_000, lane: 2, tests: 10 }),
        file(join(root, 'src/dom.spec.ts'), { environment: 6_000, lane: 2, tests: 10 }),
      ],
    });
    const summary = analysePerf(measured, readProfile(root)).findings.find((finding) => finding.check === 'perf-environment');

    expect(summary?.message).toContain('moving them frees 6.00s');
  });

  it('says `import` is evaluation alone once every file measured its transform wait', () => {
    const root = createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '^5' } }),
      'src/lib/a.ts': 'export const a = 1;\n',
      'src/lib/b.ts': 'export const b = 2;\n',
      'src/lib/index.ts': "export * from './a';\nexport * from './b';\n",
      'src/case-0.spec.ts': "import { a } from './lib';\nit('a', () => expect(a).toBe(1));\n",
    });
    const measured = onFive({ root, files: [file(join(root, 'src/case-0.spec.ts'), { imports: 9_000, fetch: 100, tests: 10 })] });
    const finding = analysePerf(measured, readProfile(root)).findings.find((entry) => entry.check === 'perf-import');

    expect(finding?.message).toMatch(/^Evaluating imported modules — the wait for their transforms is counted under `transform` — is /);
  });

  it('reads heap growth per lane only when the resolved config shares workers', () => {
    const root = repo();
    const files = [
      file(join(root, 'src/a.spec.ts'), { lane: 1, start: 0, heap: 0 }),
      file(join(root, 'src/b.spec.ts'), { lane: 1, start: 1, heap: 1_048_576 }),
    ];
    const heap = (config?: PerfRun['config']): string | undefined =>
      analysePerf(onFive({ root, files, ...(config === undefined ? {} : { config }) }), readProfile(root)).findings.find(
        (finding) => finding.check === 'perf-heap',
      )?.message;

    expect(heap({ isolate: false })).toBe(
      'Heap each file added to its worker, over the file that ran before it there, largest first: src/b.spec.ts +1 MB.',
    );
    expect(heap({ isolate: true })).toMatch(/^Heap used after the file/);
    expect(heap()).toMatch(/^Heap used after the file/);
  });

  it('adds the long pole and the pointer to `vitest doctor` on a heavy run', () => {
    const root = repo();
    const measured = onFive({
      root,
      files: [
        file(join(root, 'src/a.spec.ts'), { lane: 1, start: 0, setup: 6_000, tests: 1_000 }),
        file(join(root, 'src/b.spec.ts'), { lane: 2, start: 0, setup: 6_000, tests: 20_000 }),
      ],
    });

    expect(checks(analysePerf(measured, readProfile(root)).findings)).toEqual(
      expect.arrayContaining(['perf-isolation', 'perf-long-pole', 'perf-vitest-doctor']),
    );
  });

  it('prints the lanes under the header, and nothing new for a report without them', () => {
    const root = repo();
    const io = recorder();
    const plain = recorder();

    renderPerf(
      { ok: true, runFailed: false, run: onFive({ root, files: specs(root, (index) => ({ lane: index + 1, start: 0 })) }) },
      readProfile(root),
      io,
    );
    renderPerf({ ok: true, runFailed: false, run: run({ root, files: specs(root, () => ({})) }) }, readProfile(root), plain);

    expect(io.stdout[2]).toBe('median test 10ms, median file 10ms\n3 lanes busy 100.0% of the 10ms span\n');
    expect(plain.stdout[2]).toBe('median test 10ms, median file 10ms\n');
  });

  it('warns that an unfinished run is partial, and the gate refuses it like a red one', () => {
    const root = repo();
    const io = recorder();
    const source = { ok: true as const, runFailed: false, run: onFive({ root, partial: true, files: specs(root, () => ({})) }) };
    const code = renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure: undefined, trustSingle: false } });

    expect(code).toBe(2);
    expect(io.stderr[0]).toContain('The run did not finish: this report was written before its end and holds the 3 files that completed.');
    expect(io.stderr.join('\n')).toContain('The gate does not judge a run that did not finish');
  });

  it('carries the version, the config, start-up, lanes, partial and the per-file transform in --format json', () => {
    const root = repo();
    const io = recorder();
    const measured = onFive({
      root,
      partial: true,
      config: { isolate: true, maxWorkers: 2 },
      startup: { ms: 300, workers: 3 },
      files: specs(root, (index) => ({
        lane: 1,
        start: index * 10,
        imports: 50,
        setup: 20,
        fetch: 30,
        ...(index === 0 ? {} : { setupFetch: 5 }),
      })),
    });

    renderPerf({ ok: true, runFailed: false, run: measured }, readProfile(root), io, { format: 'json' });

    const document = JSON.parse(io.stdout.join('')) as PerfDocument;

    expect(document.run).toMatchObject({
      vitest: '5.0.0',
      partial: true,
      config: { isolate: true, maxWorkers: 2 },
      startup: { ms: 300, workers: 3 },
      lanes: { lanes: 1 },
    });
    expect(document.run?.slowestFiles[0]?.phases).toMatchObject({ import: 20, setup: 20, transform: 30 });
    expect(document.run?.slowestFiles[1]?.phases).toMatchObject({ import: 25, setup: 15, transform: 30 });
  });

  it('leaves every new field out of --format json for a report without them', () => {
    const root = repo();
    const io = recorder();

    renderPerf({ ok: true, runFailed: false, run: run({ root, files: specs(root, () => ({})) }) }, readProfile(root), io, {
      format: 'json',
    });

    const document = JSON.parse(io.stdout.join('')) as PerfDocument;

    expect(document.run).not.toHaveProperty('vitest');
    expect(document.run).not.toHaveProperty('partial');
    expect(document.run).not.toHaveProperty('lanes');
    expect(document.run?.slowestFiles[0]?.phases).not.toHaveProperty('transform');
  });
});

describe('perfMarkdown on a Vitest 5 report', () => {
  const base: NonNullable<PerfDocument['run']> = {
    files: 2,
    tests: 2,
    failed: true,
    wallMs: 100,
    cpuMs: 200,
    medianTestMs: 1,
    medianFileMs: 1,
    phases: [],
    slowestFiles: [
      { file: 'a.spec.ts', totalMs: 10, tests: 1, phases: { environment: 1, prepare: 1, setup: 1, import: 1, tests: 1, transform: 5 } },
      { file: 'b.spec.ts', totalMs: 5, tests: 1, phases: { environment: 1, prepare: 1, setup: 1, import: 1, tests: 1 } },
    ],
  };
  const document = (run: NonNullable<PerfDocument['run']>): PerfDocument => ({
    schema: 1,
    command: 'perf',
    version: '0.0.0',
    cwd: '/r',
    exitCode: 0,
    run,
    budgets: { maxTestMs: 1_000, maxFileMs: 5_000, maxFileTests: 2_000, factor: 10, maxWallMs: null, only: [] },
    gate: null,
    tally: { errors: 0, warnings: 0, notes: 0 },
    findings: [],
  });

  it('says the run did not finish over the red flag, names the version, prints the lanes and a transform column', () => {
    const text = perfMarkdown(document({ ...base, vitest: '5.0.0', partial: true, lanes: { lanes: 2, spanMs: 1_000, busy: 0.5 } }));

    expect(text).toContain('of CPU time on Vitest 5.0.0 — **the run did not finish**');
    expect(text).not.toContain('did not pass');
    expect(text).toContain('2 lanes busy 50.0% of the 1.00s span');
    expect(text).toContain('| File | Total | Tests | Environment | Setup | Transform | Import | Bodies |');
    expect(text).toContain('| b.spec.ts | 5ms | 1 | 1ms | 1ms | 0ms | 1ms | 1ms |');
  });

  it('prints a finished, green run of an older report as before', () => {
    const text = perfMarkdown(document({ ...base, failed: false, slowestFiles: base.slowestFiles.slice(1) }));

    expect(text).toContain('2 test files, 2 tests, 100ms wall clock, 200ms of CPU time\n');
    expect(text).toContain('| File | Total | Tests | Environment | Setup | Import | Bodies |');
  });
});
