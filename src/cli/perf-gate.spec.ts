/**
 * The gate, rule by rule.
 *
 * Two properties are pinned harder than the rest, because they are the ones that decide whether
 * anybody leaves the gate switched on. A finding must be **relative to the run it is in** — the
 * same file on a loaded runner and on an idle laptop must not change verdict — and it must
 * **survive a second measurement**, or it is reported as not reproduced rather than as somebody's
 * defect. Every test below is one of those two, or the arithmetic they rest on.
 *
 * The `renderPerf --gate` sections at the end are the same rules end to end — exit codes, printed
 * lines, the confirmation pass faked — which is what a CI job actually runs.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type GateRequest, renderPerf } from './perf';
import type { PerfCase, PerfFile, PerfRun } from './perf-data';
import { cleanRepo, file, ordinary, recorder, run } from './perf-fixtures';
import {
  GATE_DEFAULTS,
  type GateOptions,
  gateCandidates,
  gateVerdict,
  isJudged,
  measuredFiles,
  medianFileMs,
  medianTestMs,
  suspectFiles,
} from './perf-gate';
import type { PerfSource } from './perf-run';
import { readProfile } from './profile';

const ROOT = '/repo';

const slowBody = (name: string, ms: number): PerfCase[] => [{ name, ms }];

describe('measuredFiles', () => {
  it('keys by repository-relative path and drops anything outside the repository', () => {
    const measured = measuredFiles(run({ files: [file(join(ROOT, 'src/a.spec.ts')), file('/elsewhere/b.spec.ts'), file(ROOT)] }), ROOT);

    expect([...measured.keys()]).toEqual(['src/a.spec.ts']);
  });
});

describe('isJudged', () => {
  it('judges everything when nothing was named', () => {
    expect(isJudged('libs/a/x.spec.ts', [])).toBe(true);
  });

  it('judges a named file, anything under a named directory, and nothing else', () => {
    expect(isJudged('libs/a/x.spec.ts', ['libs/a/x.spec.ts'])).toBe(true);
    expect(isJudged('libs/a/x.spec.ts', ['libs/a'])).toBe(true);
    expect(isJudged('libs/a/x.spec.ts', ['libs/a/'])).toBe(true);
    expect(isJudged('libs/ab/x.spec.ts', ['libs/a'])).toBe(false);
    expect(isJudged('libs/a/x.spec.ts', ['apps/web'])).toBe(false);
  });
});

describe('medianFileMs', () => {
  it('is the middle file, and the mean of the middle two when the count is even', () => {
    expect(
      medianFileMs([file(join(ROOT, 'a'), { tests: 10 }), file(join(ROOT, 'b'), { tests: 30 }), file(join(ROOT, 'c'), { tests: 50 })]),
    ).toBe(30);
    expect(medianFileMs([file(join(ROOT, 'a'), { tests: 10 }), file(join(ROOT, 'b'), { tests: 30 })])).toBe(20);
    expect(medianFileMs([])).toBe(0);
  });

  it('ignores a file that ran nothing: an empty file is not evidence that the suite is fast', () => {
    expect(
      medianFileMs([
        file(join(ROOT, 'a'), { tests: 10 }),
        file(join(ROOT, 'b'), { tests: 30 }),
        file(join(ROOT, 'c'), { tests: 0, testCount: 0 }),
      ]),
    ).toBe(20);
  });
});

describe('medianTestMs', () => {
  it("is the middle of every file's cost per test, so one large file does not outvote the small ones", () => {
    expect(
      medianTestMs([
        file(join(ROOT, 'a'), { tests: 10, testCount: 10 }),
        file(join(ROOT, 'b'), { tests: 60, testCount: 20 }),
        file(join(ROOT, 'c'), { tests: 5_000, testCount: 1_000 }),
      ]),
    ).toBe(3);
  });

  it('ignores a file that finished no test, which has no cost per test to offer', () => {
    expect(medianTestMs([file(join(ROOT, 'a'), { tests: 10, testCount: 10 }), file(join(ROOT, 'b'), { tests: 400, testCount: 0 })])).toBe(
      1,
    );
    expect(medianTestMs([])).toBe(0);
  });
});

describe('gateCandidates', () => {
  it('finds a body over the budget and names the test rather than the file', () => {
    const subject = file(join(ROOT, 'src/slow.spec.ts'), { tests: 4_000, cases: slowBody('suite > waits', 3_500) });
    const [candidate, ...rest] = gateCandidates(run({ files: [...ordinary(ROOT), subject] }), ROOT, GATE_DEFAULTS);

    expect(rest).toEqual([]);
    expect(candidate).toMatchObject({ check: 'perf-gate-slow-test', file: 'src/slow.spec.ts', name: 'suite > waits', ms: 3_500 });
  });

  it('reports the file only when no single body in it is the problem', () => {
    const subject = file(join(ROOT, 'src/heavy.spec.ts'), { tests: 9_000, testCount: 40 });
    const [candidate] = gateCandidates(run({ files: [...ordinary(ROOT), subject] }), ROOT, GATE_DEFAULTS);

    expect(candidate).toMatchObject({ check: 'perf-gate-slow-file', file: 'src/heavy.spec.ts', ms: 9_000 });
    expect(candidate?.budgetNote).toContain('10×');
  });

  it('says nothing about a file that is slow the way the whole run is slow', () => {
    const even = Array.from({ length: 10 }, (_unused, index) => file(join(ROOT, `src/even-${index}.spec.ts`), { tests: 6_000 }));

    expect(gateCandidates(run({ files: even }), ROOT, GATE_DEFAULTS)).toEqual([]);
  });

  it('says nothing about a large file of ordinary tests, however long it adds up to', () => {
    const large = file(join(ROOT, 'src/large.spec.ts'), { tests: 30_000, testCount: 4_000 });

    expect(gateCandidates(run({ files: [...ordinary(ROOT), large] }), ROOT, GATE_DEFAULTS)).toEqual([]);
  });

  it('gives the same verdict on a machine nine times slower, because every limit is counted in the run itself', () => {
    const slower = (files: readonly PerfFile[], by: number): PerfFile[] => files.map((entry) => ({ ...entry, tests: entry.tests * by }));
    const heavyButSmall = file(join(ROOT, 'src/heavy-small.spec.ts'), { tests: 1_800, testCount: 38 });
    const heavyAndBig = file(join(ROOT, 'src/heavy-big.spec.ts'), { tests: 6_000, testCount: 60 });
    const verdict = (by: number): string[] =>
      suspectFiles(gateCandidates(run({ files: slower([...ordinary(ROOT), heavyButSmall, heavyAndBig], by) }), ROOT, GATE_DEFAULTS));

    expect(verdict(1)).toEqual(['src/heavy-big.spec.ts']);
    expect(verdict(9)).toEqual(['src/heavy-big.spec.ts']);
  });

  it('applies the absolute floor when the median is tiny, and never below it', () => {
    const tiny = Array.from({ length: 9 }, (_unused, index) => file(join(ROOT, `src/tiny-${index}.spec.ts`), { tests: 1 }));
    const subject = file(join(ROOT, 'src/heavy.spec.ts'), { tests: 4_900 });

    expect(gateCandidates(run({ files: [...tiny, subject] }), ROOT, GATE_DEFAULTS)).toEqual([]);
    expect(
      gateCandidates(run({ files: [...tiny, file(join(ROOT, 'src/heavy.spec.ts'), { tests: 5_100 })] }), ROOT, GATE_DEFAULTS),
    ).toHaveLength(1);
  });

  it('judges only the files it was pointed at', () => {
    const mine = file(join(ROOT, 'libs/mine/slow.spec.ts'), { tests: 9_000 });
    const theirs = file(join(ROOT, 'libs/theirs/slow.spec.ts'), { tests: 9_000 });
    const scoped = gateCandidates(run({ files: [...ordinary(ROOT), mine, theirs] }), ROOT, { ...GATE_DEFAULTS, only: ['libs/mine'] });

    expect(suspectFiles(scoped)).toEqual(['libs/mine/slow.spec.ts']);
  });

  it('adds the whole-run budget only when one was asked for', () => {
    const fast = run({ files: ordinary(ROOT), wall: 30_000 });

    expect(gateCandidates(fast, ROOT, GATE_DEFAULTS)).toEqual([]);
    expect(gateCandidates(fast, ROOT, { ...GATE_DEFAULTS, maxWallMs: 10_000 })).toMatchObject([{ check: 'perf-gate-wall', ms: 30_000 }]);
    expect(gateCandidates(fast, ROOT, { ...GATE_DEFAULTS, maxWallMs: 40_000 })).toEqual([]);
  });
});

describe('suspectFiles', () => {
  it('is every file a candidate named, once each, and never the whole-run finding', () => {
    const candidates = gateCandidates(
      run({
        files: [
          ...ordinary(ROOT),
          file(join(ROOT, 'src/a.spec.ts'), { tests: 9_000, cases: [...slowBody('one', 2_000), ...slowBody('two', 1_500)] }),
        ],
        wall: 30_000,
      }),
      ROOT,
      { ...GATE_DEFAULTS, maxWallMs: 10_000 },
    );

    expect(suspectFiles(candidates)).toEqual(['src/a.spec.ts']);
  });
});

describe('gateVerdict', () => {
  const candidatesFor = (subject: PerfFile, options = GATE_DEFAULTS) =>
    gateCandidates(run({ files: [...ordinary(ROOT), subject] }), ROOT, options);

  it('fails on a candidate the second measurement reproduces, and prints both numbers', () => {
    const candidates = candidatesFor(file(join(ROOT, 'src/slow.spec.ts'), { tests: 4_000, cases: slowBody('suite > waits', 3_500) }));
    const second = run({ files: [file(join(ROOT, 'src/slow.spec.ts'), { tests: 3_100, cases: slowBody('suite > waits', 3_000) })] });
    const verdict = gateVerdict(candidates, second, ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0]?.severity).toBe('error');
    expect(verdict.findings[0]?.message).toContain('3.50s');
    expect(verdict.findings[0]?.message).toContain('Re-measured on its own: 3.00s');
  });

  it('reports a candidate the second measurement does not reproduce as no defect at all', () => {
    const candidates = candidatesFor(file(join(ROOT, 'src/slow.spec.ts'), { tests: 4_000, cases: slowBody('suite > waits', 3_500) }));
    const verdict = gateVerdict(candidates, run({ files: [file(join(ROOT, 'src/slow.spec.ts'), { tests: 90, cases: [] })] }), ROOT, false);

    expect(verdict.failed).toBe(false);
    expect(verdict.findings[0]?.severity).toBe('info');
    expect(verdict.findings[0]?.message).toContain('0ms or less');
    expect(verdict.findings[0]?.message).toContain('sharing a worker');
  });

  it('treats a file the second run did not measure as unconfirmed rather than as confirmed', () => {
    const candidates = candidatesFor(file(join(ROOT, 'src/slow.spec.ts'), { tests: 9_000 }));
    const verdict = gateVerdict(candidates, run({ files: [file(join(ROOT, 'src/elsewhere.spec.ts'), { tests: 10 })] }), ROOT, false);

    expect(verdict.failed).toBe(false);
    expect(verdict.findings[0]?.severity).toBe('warning');
    expect(verdict.findings[0]?.message).toContain('never confirmed');
  });

  it('fails on one reading when the caller said that is enough', () => {
    const candidates = candidatesFor(file(join(ROOT, 'src/slow.spec.ts'), { tests: 9_000 }));
    const verdict = gateVerdict(candidates, undefined, ROOT, true);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0]?.severity).toBe('error');
  });

  it('fails the whole-run budget without a second measurement, and says why there is none', () => {
    const candidates = gateCandidates(run({ files: ordinary(ROOT), wall: 30_000 }), ROOT, { ...GATE_DEFAULTS, maxWallMs: 10_000 });
    const verdict = gateVerdict(candidates, undefined, ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0]).toMatchObject({ check: 'perf-gate-wall', severity: 'error' });
    expect(verdict.findings[0]?.file).toBeUndefined();
    expect(verdict.findings[0]?.message).toContain('the same suite again');
  });

  it('names a fix that fits the rule that fired', () => {
    const body = gateVerdict(
      candidatesFor(file(join(ROOT, 'src/a.spec.ts'), { tests: 4_000, cases: slowBody('waits', 3_500) })),
      undefined,
      ROOT,
      true,
    );
    const whole = gateVerdict(candidatesFor(file(join(ROOT, 'src/b.spec.ts'), { tests: 9_000 })), undefined, ROOT, true);

    expect(body.findings[0]?.fix).toContain('vi.useFakeTimers()');
    expect(whole.findings[0]?.fix).toContain('the cost is per test');
  });
});

describe('gateVerdict, the paths the confirmation pass takes', () => {
  it('confirms a file finding against the file total, not against a body', () => {
    const subject = file(join(ROOT, 'src/heavy.spec.ts'), { tests: 9_000, testCount: 40 });
    const candidates = gateCandidates(run({ files: [...ordinary(ROOT), subject] }), ROOT, GATE_DEFAULTS);
    const verdict = gateVerdict(candidates, run({ files: [file(join(ROOT, 'src/heavy.spec.ts'), { tests: 8_000 })] }), ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0]?.message).toContain('Re-measured on its own: 8.00s');
  });

  it('leaves the whole-run finding alone even when a second measurement exists', () => {
    const candidates = gateCandidates(run({ files: ordinary(ROOT), wall: 30_000 }), ROOT, { ...GATE_DEFAULTS, maxWallMs: 10_000 });
    const verdict = gateVerdict(candidates, run({ files: ordinary(ROOT), wall: 100 }), ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0]?.message).toContain('is not re-measured');
  });
});

describe('gateVerdict, the wording of a candidate that did not reproduce', () => {
  it('prints the second reading plainly when the report still carried the body', () => {
    const subject = file(join(ROOT, 'src/slow.spec.ts'), { tests: 4_000, cases: slowBody('suite > waits', 3_500) });
    const candidates = gateCandidates(run({ files: [...ordinary(ROOT), subject] }), ROOT, GATE_DEFAULTS);
    const verdict = gateVerdict(
      candidates,
      run({ files: [file(join(ROOT, 'src/slow.spec.ts'), { tests: 700, cases: slowBody('suite > waits', 600) })] }),
      ROOT,
      false,
    );

    expect(verdict.findings[0]?.severity).toBe('info');
    expect(verdict.findings[0]?.message).toContain('Re-measured on its own: 600ms, under budget');
    expect(verdict.findings[0]?.message).not.toContain('or less');
  });
});

describe('a file finding and a body finding in the same file', () => {
  const heavy = (bodyMs: number): PerfFile =>
    file(join(ROOT, 'src/heavy.spec.ts'), { tests: 60_000, testCount: 40, cases: [{ name: 'suite > borderline', ms: bodyMs }] });

  it('keeps the file finding when the body it would have been suppressed by did not reproduce', () => {
    const candidates = gateCandidates(run({ files: [...ordinary(ROOT), heavy(1_000)] }), ROOT, GATE_DEFAULTS);
    const second = run({
      files: [file(join(ROOT, 'src/heavy.spec.ts'), { tests: 58_000, cases: [{ name: 'suite > borderline', ms: 900 }] })],
    });
    const verdict = gateVerdict(candidates, second, ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings.map((finding) => `${finding.severity} ${finding.check}`)).toEqual([
      'info perf-gate-slow-test',
      'error perf-gate-slow-file',
    ]);
  });

  it('reports the body alone when the body is the confirmed problem', () => {
    const candidates = gateCandidates(run({ files: [...ordinary(ROOT), heavy(9_000)] }), ROOT, GATE_DEFAULTS);
    const second = run({
      files: [file(join(ROOT, 'src/heavy.spec.ts'), { tests: 58_000, cases: [{ name: 'suite > borderline', ms: 8_000 }] })],
    });
    const verdict = gateVerdict(candidates, second, ROOT, false);

    expect(verdict.failed).toBe(true);
    expect(verdict.findings.map((finding) => finding.check)).toEqual(['perf-gate-slow-test']);
  });

  it('judges a regression against the same second measurement a file total gets', () => {
    const candidates = [
      {
        check: 'perf-gate-regression' as const,
        file: 'src/grew.spec.ts',
        ms: 4_000,
        budget: 2_000,
        grewBy: 3.2,
        budgetNote: '2× its recorded share of the run, from perf-baseline.json',
      },
    ];
    const confirmed = gateVerdict(candidates, run({ files: [file(join(ROOT, 'src/grew.spec.ts'), { tests: 3_000 })] }), ROOT, false);
    const dropped = gateVerdict(candidates, run({ files: [file(join(ROOT, 'src/grew.spec.ts'), { tests: 400 })] }), ROOT, false);

    expect(confirmed.failed).toBe(true);
    expect(confirmed.findings[0]?.message).toContain('3.2× the share of the run');
    expect(confirmed.findings[0]?.fix).toContain('--update-baseline');
    expect(dropped.failed).toBe(false);
  });
});

describe('renderPerf --gate', () => {
  const GATE: GateOptions = { ...GATE_DEFAULTS };

  /**
   * Nine ordinary files and the ones the test is about. The file rule is relative to the median of
   * the run it is in, so a one-file run has no outlier in it by construction — which is the rule
   * working, and the reason every fixture here has a suite around its subject.
   */
  const gateRun = (root: string, files: readonly PerfFile[], wall = 1_000): PerfRun =>
    run({
      root,
      wall,
      files: [...ordinary(root), ...files],
    });

  const gateOf = (over: Partial<GateRequest> = {}): GateRequest => ({
    options: GATE,
    remeasure: undefined,
    trustSingle: false,
    ...over,
  });

  const spec = (root: string, name: string, over: Partial<PerfFile>): PerfFile => file(join(root, name), over);

  it('says so and exits 0 when nothing is over budget', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source: PerfSource = { ok: true, run: gateRun(root, [spec(root, 'src/case-0.spec.ts', { tests: 200 })]), runFailed: false };

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf() })).toBe(0);
    expect(io.stdout.join('\n')).toContain('perf gate: nothing over budget');
  });

  it('fails on a slow test body that is still slow when it is re-measured on its own', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = spec(root, 'src/case-0.spec.ts', { tests: 4_000, testCount: 3, cases: [{ name: 'suite > waits', ms: 3_900 }] });
    const source: PerfSource = { ok: true, run: gateRun(root, [slow]), runFailed: false };
    const remeasure = (): PerfSource => ({
      ok: true,
      run: run({ root, files: [spec(root, 'src/case-0.spec.ts', { tests: 3_800, cases: [{ name: 'suite > waits', ms: 3_700 }] })] }),
      runFailed: false,
    });

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf({ remeasure }) })).toBe(1);

    const out = io.stdout.join('\n');

    expect(out).toContain('perf gate: re-measuring 1 file');
    expect(out).toContain('error  perf-gate-slow-test src/case-0.spec.ts');
    expect(out).toContain('`suite > waits` spent 3.90s in its body');
    expect(out).toContain('Re-measured on its own: 3.70s, still over budget');
  });

  it('drops a candidate the second measurement does not reproduce, and exits 0', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = spec(root, 'src/case-0.spec.ts', { tests: 4_000, cases: [{ name: 'suite > unlucky', ms: 3_900 }] });
    const source: PerfSource = { ok: true, run: gateRun(root, [slow]), runFailed: false };
    const remeasure = (): PerfSource => ({
      ok: true,
      run: run({ root, files: [spec(root, 'src/case-0.spec.ts', { tests: 120, cases: [] })] }),
      runFailed: false,
    });

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf({ remeasure }) })).toBe(0);

    const out = io.stdout.join('\n');

    expect(out).toContain('info   perf-gate-slow-test');
    expect(out).toContain('not reported as a defect');
    expect(out).toContain('sharing a worker');
  });

  it('warns rather than fails when there was no way to confirm, unless --no-confirm said to trust it', () => {
    const root = cleanRepo(1);
    const slow = spec(root, 'src/case-0.spec.ts', { tests: 9_000, testCount: 4 });
    const source: PerfSource = { ok: true, run: gateRun(root, [slow]), runFailed: false };
    const warned = recorder();
    const trusted = recorder();

    expect(renderPerf(source, readProfile(root), warned, { gate: gateOf() })).toBe(0);
    expect(warned.stdout.join('\n')).toContain('warn   perf-gate-slow-file src/case-0.spec.ts');
    expect(warned.stdout.join('\n')).toContain('never confirmed');

    expect(renderPerf(source, readProfile(root), trusted, { gate: gateOf({ trustSingle: true }) })).toBe(1);
    expect(trusted.stdout.join('\n')).toContain('error  perf-gate-slow-file');
    expect(trusted.stdout.join('\n')).toContain('--no-confirm said that is enough');
  });

  it('says the confirmation pass itself failed, and confirms nothing', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = spec(root, 'src/case-0.spec.ts', { tests: 9_000 });
    const source: PerfSource = { ok: true, run: gateRun(root, [slow]), runFailed: false };
    const broken = (): PerfSource => ({ ok: false, error: 'no vitest here' });

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf({ remeasure: broken }) })).toBe(0);
    expect(io.stderr.join('\n')).toContain('The confirmation pass could not run');
    expect(io.stdout.join('\n')).toContain('never confirmed');
  });

  it('treats a confirmation pass that failed or ran nothing as no confirmation', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = spec(root, 'src/case-0.spec.ts', { tests: 9_000 });
    const source: PerfSource = { ok: true, run: gateRun(root, [slow]), runFailed: false };
    const red = (): PerfSource => ({
      ok: true,
      run: run({ root, files: [spec(root, 'src/case-0.spec.ts', { tests: 10 })] }),
      runFailed: true,
    });

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf({ remeasure: red }) })).toBe(0);
    expect(io.stderr.join('\n')).toContain('The confirmation pass did not pass');
  });

  it('refuses to judge a run that did not pass, and exits 2', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source: PerfSource = { ok: true, run: gateRun(root, [spec(root, 'src/case-0.spec.ts', { tests: 100 })]), runFailed: true };

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf() })).toBe(2);
    expect(io.stderr.join('\n')).toContain('does not judge a run that did not pass');
  });

  it('fails on an explicit whole-run budget without re-measuring anything', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source: PerfSource = {
      ok: true,
      run: gateRun(root, [spec(root, 'src/case-0.spec.ts', { tests: 100 })], 30_000),
      runFailed: false,
    };

    expect(renderPerf(source, readProfile(root), io, { gate: gateOf({ options: { ...GATE, maxWallMs: 10_000 } }) })).toBe(1);
    expect(io.stdout.join('\n')).toContain('error  perf-gate-wall');
    expect(io.stdout.join('\n')).toContain('is not re-measured');
  });
});

describe('renderPerf, the wording of the two plurals', () => {
  it('does not open a confirmation pass for a finding that names no file', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source: PerfSource = {
      ok: true,
      run: run({ root, wall: 30_000, files: [file(join(root, 'src/case-0.spec.ts'), { tests: 100 })] }),
      runFailed: false,
    };
    const remeasure = (): PerfSource => {
      throw new Error('the whole-run finding must not be re-measured');
    };

    expect(
      renderPerf(source, readProfile(root), io, {
        gate: { options: { ...GATE_DEFAULTS, maxWallMs: 10_000 }, remeasure, trustSingle: false },
      }),
    ).toBe(1);
    expect(io.stdout.join('\n')).not.toContain('re-measuring');
  });

  it('counts the re-measured files in the plural', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = ['src/a.spec.ts', 'src/b.spec.ts'].map((path) => file(join(root, path), { tests: 9_000 }));
    const source: PerfSource = { ok: true, run: run({ root, files: [...ordinary(root), ...slow] }), runFailed: false };
    const remeasure = (): PerfSource => ({ ok: true, run: run({ root, files: slow }), runFailed: false });

    expect(renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } })).toBe(1);
    expect(io.stdout.join('\n')).toContain('re-measuring 2 files on their own');
  });
});

describe('renderPerf, a report measured somewhere else', () => {
  const elsewhere = (prefix: string): PerfRun =>
    run({
      root: prefix,
      wall: 1_000,
      files: [`${prefix}/src/case-0.spec.ts`, `${prefix}/src/case-1.spec.ts`].map((path) => file(path, { tests: 100 })),
    });

  it('re-bases the paths onto the working directory, because CI clones somewhere else than a laptop', () => {
    const root = cleanRepo(2);
    const io = recorder();
    const source: PerfSource = { ok: true, run: elsewhere('/builds/group/project'), runFailed: false };

    expect(renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure: undefined, trustSingle: false } })).toBe(
      0,
    );
    expect(io.stdout.join('\n')).toContain('perf gate: nothing over budget');
  });

  it('refuses when even the report’s own root does not place the files here, instead of printing an all-clear', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const orphan = run({ root: '', wall: 1_000, files: [file('/elsewhere/src/a.spec.ts', { tests: 9_000 })] });

    expect(
      renderPerf({ ok: true, run: orphan, runFailed: false }, readProfile(root), io, {
        gate: { options: GATE_DEFAULTS, remeasure: undefined, trustSingle: false },
      }),
    ).toBe(2);
    expect(io.stderr.join('\n')).toContain('None of the 1 measured files is inside');
    expect(io.stderr.join('\n')).toContain('records no root of its own');
    expect(io.stdout).toEqual([]);
  });
});

describe('renderPerf --gate, the scope and the confirmation it was given', () => {
  const runWith = (root: string, files: readonly PerfFile[]): PerfRun => run({ root, wall: 1_000, files });

  it('refuses a --gate-only that matches nothing this run measured', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const source: PerfSource = { ok: true, run: runWith(root, ordinary(root)), runFailed: false };

    expect(
      renderPerf(source, readProfile(root), io, {
        gate: { options: { ...GATE_DEFAULTS, only: ['libs/nothing-here'] }, remeasure: undefined, trustSingle: false },
      }),
    ).toBe(2);
    expect(io.stderr.join('\n')).toContain('libs/nothing-here');
    expect(io.stdout.join('\n')).not.toContain('nothing over budget');
  });

  it('confirms nothing when the command ignored the paths and re-ran the whole suite', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const slow = file(join(root, 'src/slow.spec.ts'), { tests: 9_000 });
    const whole = runWith(root, [...ordinary(root), slow]);
    const source: PerfSource = { ok: true, run: whole, runFailed: false };
    const remeasure = (): PerfSource => ({ ok: true, run: whole, runFailed: false });

    expect(renderPerf(source, readProfile(root), io, { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } })).toBe(0);
    expect(io.stderr.join('\n')).toContain('ignored the paths it was given');
    expect(io.stdout.join('\n')).toContain('never confirmed');
  });
});

describe('renderPerf, the nothing-over-budget line', () => {
  it('says in one line that nothing is over budget, and leaves that line to the gate under --gate', () => {
    const root = cleanRepo(1);
    const plain = recorder();
    const gated = recorder();
    const quick: PerfSource = {
      ok: true,
      run: run({ root, wall: 900, files: [file(join(root, 'src/quick.spec.ts'), { tests: 40, testCount: 8 })] }),
      runFailed: false,
    };

    expect(renderPerf(quick, readProfile(root), plain)).toBe(0);
    expect(plain.stdout.join('\n')).toContain('Nothing over budget: no file over its budget and no test body over 1.00s');

    expect(
      renderPerf(quick, readProfile(root), gated, { gate: { options: GATE_DEFAULTS, remeasure: undefined, trustSingle: false } }),
    ).toBe(0);
    expect(gated.stdout.join('\n')).not.toContain('Nothing over budget:');
    expect(gated.stdout.join('\n')).toContain('perf gate: nothing over budget');
  });
});

describe('renderPerf --gate-only, a scope that is partly right', () => {
  it('says which entries matched nothing when some of them did match', () => {
    const root = cleanRepo(1);
    const io = recorder();
    const measured = run({
      root,
      wall: 1_000,
      files: [file(join(root, 'src/case-0.spec.ts'), { tests: 100 })],
    });

    expect(
      renderPerf({ ok: true, run: measured, runFailed: false }, readProfile(root), io, {
        gate: { options: { ...GATE_DEFAULTS, only: ['src', 'libs/gone'] }, remeasure: undefined, trustSingle: false },
      }),
    ).toBe(2);
    expect(io.stderr.join('\n')).toContain('paths this run did not measure: libs/gone');
  });
});
