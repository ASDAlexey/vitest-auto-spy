/**
 * Dispatch and exit codes. The exit code is the whole contract with CI: `doctor` is read-only and
 * says so by exiting 1 without having changed anything, and `init --check` is the same shape for
 * an instruction block that has drifted from the installed version.
 */
import { afterEach, describe, expect, it } from 'vitest';

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

  it('exits 1 when there is no report to read', () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(runCli(['perf', '--cwd', root, '--json', `${root}/nowhere.json`], io)).toBe(1);
    expect(io.stderr.join('\n')).toContain('Not a perf report');
  });
});
