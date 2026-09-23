/**
 * Dispatch and exit codes. The exit code is the whole contract with CI: `doctor` is read-only and
 * says so by exiting 1 without having changed anything, and `init --check` is the same shape for
 * an instruction block that has drifted from the installed version.
 */
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pathExists, readTextFile, writeTextFile } from './fs-scan';
import { guardBrokenPipe, runCli } from './main';
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

  it('rejects a misspelled flag with exit code 2 rather than running without it', () => {
    const root = createTempRepo(HEALTHY);
    const io = recorder();

    expect(runCli(['init', '--dryrun', '--cwd', root], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Unknown flag for `init`: --dryrun');
    expect(io.stderr.join('\n')).toContain('--dry-run');
    expect(readTextFile(join(root, 'AGENTS.md'))).toBe(HEALTHY['AGENTS.md']);
    expect(runCli(['perf', '--gat', '--cwd', root], recorder())).toBe(2);
    expect(runCli(['codemod', '--wirte', '--cwd', root], recorder())).toBe(2);
  });

  it('refuses a --cwd that is not a directory instead of reporting a clean repository', () => {
    const root = createTempRepo(HEALTHY);
    const io = recorder();

    expect(runCli(['doctor', '--cwd', join(root, 'nope')], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('is not a directory');
    // A file is the other way to get an empty scan out of a path that exists.
    expect(runCli(['perf', '--cwd', join(root, 'package.json')], recorder())).toBe(2);
    expect(runCli(['doctor', '--cwd', root], recorder())).toBe(0);
  });

  it('takes every flag its own command documents, and the common ones on any command', () => {
    const root = createTempRepo(HEALTHY);

    expect(runCli(['init', '--check', '--dry-run', '--uninstall', '--cwd', root], recorder())).toBe(0);
    expect(runCli(['codemod', '--verify', '--list', '--from', 'auto', '--cwd', root], recorder())).toBe(0);
    expect(runCli(['doctor', '--min-severity', 'error', '--cwd', root], recorder())).toBe(0);
  });

  it('closes quietly when the pipe it was writing to is gone, and rethrows anything else', () => {
    const listeners: ((error: { code?: string }) => void)[] = [];
    const stream = { on: (_event: 'error', listener: (error: { code?: string }) => void) => listeners.push(listener) };
    let exited = 0;

    guardBrokenPipe(stream, () => {
      exited += 1;
    });

    listeners[0]?.({ code: 'EPIPE' });

    expect(exited).toBe(1);
    expect(() => listeners[0]?.({ code: 'EACCES' })).toThrow();
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

  it('leaves the checks named by --ignore out of the report and the exit code', () => {
    const io = recorder();
    const root = createTempRepo({ ...HEALTHY, 'tsconfig.json': JSON.stringify({ include: ['src*.ts'] }) });

    expect(runCli(['doctor', '--cwd', root, '--ignore', 'no-agent-instructions, tsconfig-glob-matches-nothing'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('No problems found.');
  });

  it('exits 0 when the only finding is the note suggesting init', () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}' });

    expect(runCli(['doctor', '--cwd', root], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('no-agent-instructions');
  });

  it('--min-severity hides the quieter findings and keeps the tally that counts them', () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}' });

    expect(runCli(['doctor', '--cwd', root, '--min-severity', 'warning'], io)).toBe(0);
    expect(io.stdout.join('\n')).not.toContain('no-agent-instructions');
    expect(io.stdout.join('\n')).toContain('1 note');

    const abbreviated = recorder();

    expect(runCli(['doctor', '--cwd', root, '--min-severity', 'warn'], abbreviated)).toBe(0);
    expect(abbreviated.stdout.join('\n')).not.toContain('no-agent-instructions');
  });

  it('takes an unknown --min-severity as no filter at all, rather than as a stricter one', () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}' });

    expect(runCli(['doctor', '--cwd', root, '--min-severity', 'loud'], io)).toBe(0);
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

  it('writes only the files --only names', () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(runCli(['init', '--cwd', root, '--only', 'CLAUDE.md, .claude'], io)).toBe(0);
    expect(io.stdout.join('\n')).not.toContain('AGENTS.md');
    expect(pathExists(join(root, 'CLAUDE.md'))).toBe(true);
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
          ...Array.from({ length: 9 }, (_unused, index) => ({ ...measured(`ordinary-${index}.spec.ts`, 100), testCount: 40 })),
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
      ...Array.from({ length: 9 }, (_unused, index) => ({ ...measured(root, `src/ordinary-${index}.spec.ts`, 100), testCount: 40 })),
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

  it('--min-severity error leaves perf with the tally alone, and the exit code where it was', () => {
    const { root, json } = repo();
    const io = recorder();

    expect(runCli(['perf', '--cwd', root, '--json', json, '--gate', '--min-severity', 'error'], io)).toBe(0);

    const out = io.stdout.join('\n');

    expect(out).not.toContain('perf-gate-slow-file');
    expect(out).toContain('0 errors, 1 warning, 0 notes');
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
        [
          'perf',
          '--cwd',
          root,
          '--json',
          join(root, 'perf.json'),
          '--gate',
          '--max-file-ms=0',
          '--max-file-tests=0',
          '--factor=0',
          '--top=3',
          '--no-confirm',
        ],
        io,
      ),
    ).toBe(1);

    const out = io.stdout.join('\n');

    expect(out).toContain('perf-gate-slow-file src/ran.spec.ts');
    expect(out).not.toContain('src/empty.spec.ts');
  });
});

describe('--format json', () => {
  it('prints doctor as one JSON document with every finding, whatever --min-severity hides from the text', () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}', 'src/a.spec.ts': '' });

    expect(runCli(['doctor', '--cwd', root, '--format', 'json', '--min-severity', 'error'], io)).toBe(0);

    const document: unknown = JSON.parse(io.stdout.join('\n'));

    expect(document).toMatchObject({
      schema: 1,
      command: 'doctor',
      cwd: root,
      exitCode: 0,
      scanned: { specFiles: 1, truncated: false },
      tally: { errors: 0, warnings: 0, notes: 1 },
      findings: [{ check: 'no-agent-instructions', severity: 'info' }],
    });
  });

  it('prints perf as one JSON document: the run, the budgets, the gate and the findings', () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);
    const files = [
      ...Array.from({ length: 9 }, (_unused, index) => ({ file: `${root}/o-${index}.spec.ts`, tests: 100, testCount: 40 })),
      { file: `${root}/slow.spec.ts`, tests: 9_000, testCount: 4 },
    ];

    writeTextFile(join(root, 'perf.json'), JSON.stringify({ version: 2, root, transform: 0, wall: 1_000, failed: 0, files }));

    expect(runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate', '--no-confirm', '--format', 'json'], io)).toBe(1);
    expect(io.stdout).toHaveLength(1);

    const document: unknown = JSON.parse(io.stdout.join(''));

    expect(document).toMatchObject({
      command: 'perf',
      exitCode: 1,
      run: { files: 10, tests: 364, failed: false, wallMs: 1_000 },
      budgets: { maxTestMs: 1_000, maxWallMs: null },
      gate: { status: 'judged', confirmation: 'single-reading', verdicts: [{ file: 'slow.spec.ts', outcome: 'single reading' }] },
      tally: { errors: 1 },
    });
  });

  it('still prints a document, with the error, when there is no report to read', () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(runCli(['perf', '--cwd', root, '--json', join(root, 'nowhere.json'), '--format', 'json', '--gate'], io)).toBe(2);
    expect(JSON.parse(io.stdout.join(''))).toMatchObject({
      exitCode: 2,
      run: null,
      gate: { status: 'skipped', confirmation: 'unavailable' },
    });
    expect(io.stderr.join('\n')).toContain('Not a perf report');
  });

  it('refuses a format it does not know, before anything runs', () => {
    const io = recorder();

    expect(runCli(['doctor', '--format', 'xml'], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Unknown --format value: xml');
    expect(runCli(['doctor', '--format', 'TEXT', '--cwd', createTempRepo(HEALTHY)], recorder())).toBe(0);
  });
});

describe('--format markdown', () => {
  it('prints doctor as a findings table and the tally', () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}', 'src/a.spec.ts': '' });

    expect(runCli(['doctor', '--cwd', root, '--format', 'markdown'], io)).toBe(0);

    const out = io.stdout.join('\n');

    expect(out).toContain('### vitest-auto-spy doctor');
    expect(out).toContain('| Severity | Check | File | Message | Fix |');
    expect(out).toContain('| info | `no-agent-instructions` |');
    expect(out).toContain('**0 errors, 0 warnings, 1 notes**');
  });

  it('prints perf with the phases, the slowest files and the gate, and keeps the suite off stdout', () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);
    const files = [
      ...Array.from({ length: 9 }, (_unused, index) => ({ file: `${root}/o-${index}.spec.ts`, tests: 100, testCount: 40 })),
      { file: `${root}/slow.spec.ts`, tests: 9_000, testCount: 4 },
    ];

    writeTextFile(join(root, 'perf.json'), JSON.stringify({ version: 2, root, transform: 0, wall: 1_000, failed: 0, files }));

    expect(
      runCli(
        ['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate', '--no-confirm', '--format', 'markdown', '--top', '1'],
        io,
      ),
    ).toBe(1);
    expect(io.stdout).toHaveLength(1);

    const out = io.stdout.join('');

    expect(out).toContain('| Phase | Time | Share |');
    expect(out).toContain('#### Slowest files');
    expect(out).toContain('| slow.spec.ts | 9.00s | 4 |');
    expect(out).toContain('#### Gate: judged');
    expect(out).toContain('| single reading | `perf-gate-slow-file` | slow.spec.ts |');
  });
});

describe('doctor text', () => {
  it('says how much it read, and ends in the tally even when nothing was found', () => {
    const io = recorder();
    const root = createTempRepo({ ...HEALTHY, 'src/a.spec.ts': '' });

    expect(runCli(['doctor', '--cwd', root], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('4 files scanned, 1 of them spec files — runner: vitest');
    expect(io.stdout.at(-1)).toBe('0 errors, 0 warnings, 0 notes');
  });

  it('warns when the scan stopped at its cap, because every other check then read part of the tree', () => {
    vi.stubEnv('VITEST_AUTO_SPY_SCAN_CAP', '1');

    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(runCli(['doctor', '--cwd', root], io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('warn   scan-cap-reached');

    vi.unstubAllEnvs();
  });
});

describe('perf budgets without --gate', () => {
  it('draws the tables against the budgets on the command line, which is what a later --gate judges', () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);
    const files = [
      ...Array.from({ length: 9 }, (_unused, index) => ({ file: `${root}/o-${index}.spec.ts`, tests: 100, testCount: 40 })),
      { file: `${root}/busy.spec.ts`, tests: 600, testCount: 4, cases: [{ name: 'waits', ms: 400 }] },
    ];

    writeTextFile(join(root, 'perf.json'), JSON.stringify({ version: 2, root, transform: 0, wall: 1_000, failed: 0, files }));

    expect(runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--max-test-ms', '300'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('test bodies over budget — 1, each over --max-test-ms 300ms');
  });
});
