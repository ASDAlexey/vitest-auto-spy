/**
 * Dispatch and exit codes. The exit code is the whole contract with CI: `doctor` is read-only and
 * says so by exiting 1 without having changed anything, and `init --check` is the same shape for
 * an instruction block that has drifted from the installed version.
 */
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { pathExists, writeTextFile } from './fs-scan';
import { runCli } from './main';
import type { CliIo } from './main';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

interface Recorder extends CliIo {
  readonly stdout: string[];
  readonly stderr: string[];
}

function recorder(): Recorder {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return { stdout, stderr, out: (line) => stdout.push(line), err: (line) => stderr.push(line) };
}

const HEALTHY = {
  'package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^4' } }),
  'AGENTS.md': 'read node_modules/vitest-auto-spy/AGENTS.md\n',
  'src/app.ts': '',
};

describe('runCli', () => {
  it('prints the help screen with no command, and says so with exit code 2', () => {
    const io = recorder();

    expect(runCli([], io)).toBe(2);
    expect(io.stdout.join('\n')).toContain('npx vitest-auto-spy <command>');
  });

  it('treats an explicit help request as a success', () => {
    expect(runCli(['help'], recorder())).toBe(0);
    expect(runCli(['doctor', '--help'], recorder())).toBe(0);
    expect(runCli(['--help'], recorder())).toBe(0);
  });

  it('prints the installed version', () => {
    const io = recorder();

    expect(runCli(['--version'], io)).toBe(0);
    expect(io.stdout[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('rejects an unknown command on stderr', () => {
    const io = recorder();

    expect(runCli(['dcotor'], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Unknown command: dcotor');
  });
});

describe('doctor', () => {
  it('exits 0 and says so on a healthy repository', () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(runCli(['doctor', '--cwd', root], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('No problems found.');
    expect(io.stdout.join('\n')).toContain('runner: vitest');
  });

  it('exits 1 and prints the tally when something is wrong', () => {
    const io = recorder();
    const root = createTempRepo({ ...HEALTHY, 'tsconfig.json': JSON.stringify({ include: ['src*.ts'] }) });

    expect(runCli(['doctor', '--cwd', root], io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('1 error, 0 warnings, 0 notes');
  });

  it('exits 0 when the only finding is the note suggesting init', () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}' });

    expect(runCli(['doctor', '--cwd', root], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('no-agent-instructions');
  });
});

describe('init', () => {
  it('writes the block, then reports it as up to date', () => {
    const root = createTempRepo(HEALTHY);
    const first = recorder();
    const second = recorder();

    expect(runCli(['init', '--cwd', root], first)).toBe(0);
    expect(first.stdout.join('\n')).toContain('created  ');
    expect(runCli(['init', '--cwd', root, '--check'], second)).toBe(0);
    expect(second.stdout.join('\n')).toContain('Up to date.');
  });

  it('exits 1 from --check when the block is missing', () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(runCli(['init', '--cwd', root, '--check'], io)).toBe(1);
    expect(io.stderr.join('\n')).toContain('out of date');
  });

  it('prints the budget warning on stderr', () => {
    const io = recorder();
    const root = createTempRepo({ ...HEALTHY, 'AGENTS.md': 'x'.repeat(33_000) });

    expect(runCli(['init', '--cwd', root], io)).toBe(0);
    expect(io.stderr.join('\n')).toContain('warning');
  });

  it('defaults the working directory to the process one', () => {
    const io = recorder();

    expect(runCli(['init', '--dry-run'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain(process.cwd());
  });
});

describe('perf', () => {
  /** The rules and the rendering are pinned in `perf.spec.ts`; this is the dispatch and the flags. */
  it('reads the report --json names and exits 0', () => {
    const io = recorder();
    const root = createTempRepo({
      ...HEALTHY,
      'perf.json': JSON.stringify({ version: 1, root: '/r', transform: 0, wall: 0, files: [{ file: '/r/a.spec.ts', tests: 1 }] }),
    });

    expect(runCli(['perf', '--cwd', root, '--json', `${root}/perf.json`], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('vitest-auto-spy perf —');
  });

  it('exits 2 when there is no report to read: nothing was judged, which is not the same as passing', () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(runCli(['perf', '--cwd', root, '--json', `${root}/nowhere.json`], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Not a perf report');
  });

  it('gates a report it was handed, and fails only when told one reading is enough', () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);
    const measured = (name: string, tests: number): Record<string, unknown> => ({
      file: `${root}/${name}`,
      environment: 0,
      prepare: 0,
      setup: 0,
      imports: 0,
      tests,
      testCount: 4,
      cases: [],
    });

    writeTextFile(
      join(root, 'perf.json'),
      JSON.stringify({
        version: 2,
        root,
        transform: 0,
        wall: 1_000,
        files: [
          ...Array.from({ length: 9 }, (_unused, index) => measured(`ordinary-${index}.spec.ts`, 100)),
          measured('slow.spec.ts', 9_000),
        ],
      }),
    );

    expect(runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('warn   perf-gate-slow-file slow.spec.ts');

    const trusted = recorder();

    expect(runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate', '--no-confirm'], trusted)).toBe(1);
    expect(trusted.stdout.join('\n')).toContain('error  perf-gate-slow-file slow.spec.ts');
  });
});

describe('perf flags', () => {
  const report = (root: string, files: readonly Record<string, unknown>[]): string =>
    JSON.stringify({ version: 2, root, transform: 0, wall: 1_000, failed: 0, files });

  const measured = (root: string, name: string, tests: number): Record<string, unknown> => ({
    file: `${root}/${name}`,
    environment: 0,
    prepare: 0,
    setup: 0,
    imports: 0,
    tests,
    testCount: 4,
    cases: [],
  });

  const repo = (): { root: string; json: string } => {
    const root = createTempRepo(HEALTHY);
    const files = [
      ...Array.from({ length: 9 }, (_unused, index) => measured(root, `src/ordinary-${index}.spec.ts`, 100)),
      measured(root, 'src/slow.spec.ts', 9_000),
    ];

    writeTextFile(join(root, 'perf.json'), report(root, files));

    return { root, json: join(root, 'perf.json') };
  };

  it('strips a leading ./ from a scope, since a generated list is where that spelling comes from', () => {
    const { root, json } = repo();
    const io = recorder();

    expect(runCli(['perf', '--cwd', root, '--json', json, '--gate', '--gate-only', './src', '--no-confirm'], io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('perf-gate-slow-file src/slow.spec.ts');
  });

  it('records the baseline next to the repository when --update-baseline names no path', () => {
    const { root, json } = repo();
    const io = recorder();

    expect(runCli(['perf', '--cwd', root, '--json', json, '--update-baseline'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('perf-baseline.json');
    expect(pathExists(join(root, 'perf-baseline.json'))).toBe(true);
  });

  it('clamps a zero budget off the floor, so a file that ran nothing is never a finding', () => {
    const root = createTempRepo(HEALTHY);

    writeTextFile(
      join(root, 'perf.json'),
      report(root, [measured(root, 'src/ran.spec.ts', 100), { ...measured(root, 'src/empty.spec.ts', 0), testCount: 0 }]),
    );

    const io = recorder();

    expect(
      runCli(
        ['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate', '--max-file-ms=0', '--factor=0', '--top=3', '--no-confirm'],
        io,
      ),
    ).toBe(1);

    const out = io.stdout.join('\n');

    expect(out).toContain('perf-gate-slow-file src/ran.spec.ts');
    expect(out).not.toContain('src/empty.spec.ts');
  });
});
