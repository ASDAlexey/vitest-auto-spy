import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { toCodeQuality } from './code-quality';
import { readTextFile, writeTextFile } from './fs-scan';
import type { CliIo } from './main';
import { runCli } from './main';
import { renderPerf } from './perf';
import { BASELINE_DEFAULTS } from './perf-baseline';
import type { PerfFile, PerfRun } from './perf-data';
import { GATE_DEFAULTS } from './perf-gate';
import { readProfile } from './profile';
import type { Finding } from './report';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const io: CliIo = { out: () => undefined, err: () => undefined };

const finding = (over: Partial<Finding> = {}): Finding => ({
  check: 'perf-gate-slow-test',
  severity: 'error',
  file: 'src/a.spec.ts',
  message: '`suite > waits` spent 3.90s in its body, over the 1.00s budget.',
  fix: 'Advance the timer.',
  ...over,
});

const repositoryWide: Finding = { check: 'perf-workers', severity: 'info', message: 'No cap.', fix: 'Cap it.' };

const parsed = (path: string): unknown => JSON.parse(readTextFile(path) ?? 'null');

describe('toCodeQuality', () => {
  it('maps a finding onto the fields GitLab reads, the fix included', () => {
    const [issue] = toCodeQuality([finding()]);

    expect(issue).toEqual({
      description: '`suite > waits` spent 3.90s in its body, over the 1.00s budget. Fix: Advance the timer.',
      check_name: 'perf-gate-slow-test',
      fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      severity: 'critical',
      location: { path: 'src/a.spec.ts', lines: { begin: 1 } },
    });
  });

  it('grades warnings as major and notes as info, and files a repository-wide finding under package.json', () => {
    const issues = toCodeQuality([finding({ severity: 'warning' }), repositoryWide]);

    expect(issues.map((issue) => issue.severity)).toEqual(['major', 'info']);
    expect(issues[1]?.location.path).toBe('package.json');
  });

  it('keeps a fingerprint across runs whose numbers moved, and tells two findings in one file apart', () => {
    const [first] = toCodeQuality([finding()]);
    const [again] = toCodeQuality([finding({ message: '`suite > waits` spent 4.12s in its body, over the 1.00s budget.' })]);
    const [other] = toCodeQuality([finding({ message: '`suite > renders` spent 3.90s in its body, over the 1.00s budget.' })]);

    expect(again?.fingerprint).toBe(first?.fingerprint);
    expect(other?.fingerprint).not.toBe(first?.fingerprint);
  });

  it('tells two parametrised cases apart, whose names differ only in a number', () => {
    const [first] = toCodeQuality([finding({ message: '`suite > returns 200` spent 3.90s in its body, over the 1.00s budget.' })]);
    const [other] = toCodeQuality([finding({ message: '`suite > returns 404` spent 1.20s in its body, over the 1.00s budget.' })]);

    expect(other?.fingerprint).not.toBe(first?.fingerprint);
  });

  it('leaves out what --min-severity hides from the printed report', () => {
    expect(toCodeQuality([finding(), finding({ severity: 'info' })], 'warning')).toHaveLength(1);
  });
});

describe('--code-quality', () => {
  it('writes the doctor findings, and an empty list on a clean repository', () => {
    const broken = createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }),
      'AGENTS.md': 'read node_modules/vitest-auto-spy/AGENTS.md\n',
      'tsconfig.json': JSON.stringify({ include: ['src*.ts'] }),
      'src/app.ts': '',
    });

    expect(runCli(['doctor', '--cwd', broken, '--code-quality', 'out/cq.json'], io)).toBe(1);
    expect(parsed(join(broken, 'out/cq.json'))).toEqual([
      expect.objectContaining({ check_name: 'tsconfig-glob-matches-nothing', location: { path: 'tsconfig.json', lines: { begin: 1 } } }),
    ]);

    const clean = createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }),
      'AGENTS.md': 'read node_modules/vitest-auto-spy/AGENTS.md\n',
      'src/app.ts': '',
    });

    expect(runCli(['doctor', '--cwd', clean, '--code-quality', 'cq.json'], io)).toBe(0);
    expect(parsed(join(clean, 'cq.json'))).toEqual([]);
  });

  const perfRepo = (): string => createTempRepo({ 'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }) });

  const measured = (root: string, slow: Partial<PerfFile>): PerfRun => ({
    version: 2,
    root,
    transform: 0,
    wall: 1_000,
    failed: 0,
    files: [
      ...Array.from({ length: 9 }, (_unused, index) => ({
        file: join(root, `src/ordinary-${index}.spec.ts`),
        environment: 0,
        prepare: 0,
        setup: 0,
        imports: 0,
        tests: 100,
        testCount: 10,
        cases: [],
      })),
      {
        file: join(root, 'src/slow.spec.ts'),
        environment: 0,
        prepare: 0,
        setup: 0,
        imports: 0,
        tests: 100,
        testCount: 10,
        cases: [],
        ...slow,
      },
    ],
  });

  it('writes what the gate found, through runCli, next to the working directory', () => {
    const root = perfRepo();

    writeTextFile(join(root, 'perf.json'), JSON.stringify(measured(root, { cases: [{ name: 'slow > waits', ms: 3_000 }] })));

    expect(runCli(['perf', '--cwd', root, '--json', 'perf.json', '--gate', '--no-confirm', '--code-quality', 'cq.json'], io)).toBe(1);
    expect(parsed(join(root, 'cq.json'))).toEqual([
      expect.objectContaining({
        check_name: 'perf-gate-slow-test',
        severity: 'critical',
        location: { path: 'src/slow.spec.ts', lines: { begin: 1 } },
      }),
    ]);
  });

  it('writes a baseline regression that fails nothing, nothing without a report, and what was analysed of a red run', () => {
    const root = perfRepo();
    const baseline = join(root, 'perf-baseline.json');
    const path = join(root, 'cq.json');

    renderPerf({ ok: true, run: measured(root, { tests: 100 }), runFailed: false }, readProfile(root), io, {
      baseline: { path: baseline, update: true, options: BASELINE_DEFAULTS },
      codeQuality: path,
    });

    expect(parsed(path)).toEqual([]);

    renderPerf({ ok: true, run: measured(root, { tests: 3_000 }), runFailed: false }, readProfile(root), io, {
      baseline: { path: baseline, update: false, options: BASELINE_DEFAULTS },
      codeQuality: path,
    });

    expect(parsed(path)).toEqual([expect.objectContaining({ check_name: 'perf-gate-regression', severity: 'major' })]);

    const untouched = join(root, 'untouched.json');

    renderPerf({ ok: false, error: 'no report' }, readProfile(root), io, { codeQuality: untouched });

    expect(readTextFile(untouched)).toBeUndefined();

    renderPerf({ ok: true, run: { ...measured(root, {}), failed: 1 }, runFailed: true }, readProfile(root), io, {
      gate: { options: GATE_DEFAULTS, remeasure: undefined, trustSingle: false },
      codeQuality: untouched,
    });

    expect(readTextFile(untouched)).toBe('[]\n');
  });
});
