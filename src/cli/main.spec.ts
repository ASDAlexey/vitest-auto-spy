/**
 * Dispatch and exit codes. The exit code is the whole contract with CI: `doctor` is read-only and
 * says so by exiting 1 without having changed anything, and `init --check` is the same shape for
 * an instruction block that has drifted from the installed version.
 */
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pathExists, readTextFile, writeTextFile } from './fs-scan';
import { guardBrokenPipe, runCli, settle } from './main';
import type { CliIo } from './main';
import { doctorArgs, initArgs, initCheckArgs, ordinaryPerfFiles, perfReportJson } from './main.mock';
import { ESC, TERMINAL } from './paint';
import * as perf from './perf';
import { createTempRepo, removeTempRepos } from './temp-repo';

// Under isolate: false `main` may already be evaluated against the real `perf`; a fresh graph lets the spy reach it.
vi.hoisted(() => vi.resetModules());
afterAll(() => vi.resetModules());

vi.mock('./perf', async (importOriginal) => {
  const original = await importOriginal<typeof perf>();

  return { ...original, renderPerf: vi.fn(original.renderPerf) };
});

// Golden text: color is off here whatever terminal or CI runs the suite.
beforeEach(() => {
  vi.stubEnv('NO_COLOR', '1');
});

afterEach(() => {
  vi.unstubAllEnvs();
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
  it('says a command is missing in one line, with the short usage, and exits 2', async () => {
    const io = recorder();

    expect(await runCli([], io)).toBe(2);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual([
      'Missing command. Usage: npx vitest-auto-spy <doctor|perf|init|codemod|ng-test> [options]. Run `npx vitest-auto-spy --help` for the options.',
    ]);
  });

  it('treats an explicit help request as a success', async () => {
    expect(await runCli(['help'], recorder())).toBe(0);
    expect(await runCli(['doctor', '--help'], recorder())).toBe(0);
    expect(await runCli(['--help'], recorder())).toBe(0);
  });

  it('prints the installed version', async () => {
    const io = recorder();

    expect(await runCli(['--version'], io)).toBe(0);
    expect(io.stdout[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('rejects an unknown command on stderr', async () => {
    const io = recorder();

    expect(await runCli(['dcotor'], io)).toBe(2);
    expect(io.stderr).toEqual(['Unknown command: dcotor. Did you mean `doctor`? Run `npx vitest-auto-spy --help` for the commands.']);

    const far = recorder();

    expect(await runCli(['deploy'], far)).toBe(2);
    expect(far.stderr).toEqual([
      'Unknown command: deploy. Usage: npx vitest-auto-spy <doctor|perf|init|codemod|ng-test> [options]. Run `npx vitest-auto-spy --help` for the options.',
    ]);
  });

  it('rejects a misspelled flag with exit code 2 rather than running without it', async () => {
    const root = createTempRepo(HEALTHY);
    const io = recorder();

    expect(await runCli(['init', '--dryrun', '--cwd', root], io)).toBe(2);
    expect(io.stderr).toEqual(['Unknown flag for `init`: --dryrun. Nothing ran.', 'Did you mean `--dry-run`?']);
    expect(readTextFile(join(root, 'AGENTS.md'))).toBe(HEALTHY['AGENTS.md']);
    expect(await runCli(['perf', '--gat', '--cwd', root], recorder())).toBe(2);
    expect(await runCli(['codemod', '--wirte', '--cwd', root], recorder())).toBe(2);
  });

  it('points a --json or --markdown on doctor at --format, and says nothing of it where --format is not taken', async () => {
    const root = createTempRepo(HEALTHY);
    const doctor = recorder();
    const init = recorder();

    expect(await runCli(['doctor', '--json', '--cwd', root], doctor)).toBe(2);
    expect(doctor.stderr.at(-1)).toBe('Did you mean `--format json`?');
    expect(await runCli(['doctor', '--markdown', '--jsn', '--cwd', root], doctor)).toBe(2);
    expect(doctor.stderr.at(-2)).toContain('`doctor` accepts --code-quality');
    expect(doctor.stderr.at(-1)).toBe('Did you mean `--format markdown`?');
    expect(await runCli(['init', '--markdown', '--cwd', root], init)).toBe(2);
    expect(init.stderr.join('\n')).not.toContain('Did you mean');
  });

  it('refuses a --cwd that is not a directory instead of reporting a clean repository', async () => {
    const root = createTempRepo(HEALTHY);
    const io = recorder();

    expect(await runCli(['doctor', '--cwd', join(root, 'nope')], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('is not a directory');
    // A file is the other way to get an empty scan out of a path that exists.
    expect(await runCli(['perf', '--cwd', join(root, 'package.json')], recorder())).toBe(2);
    expect(await runCli(doctorArgs(root), recorder())).toBe(0);
  });

  it('refuses an empty value rather than reading it as no flag at all', async () => {
    const root = createTempRepo(HEALTHY);

    for (const argv of [
      ['init', `--cwd=${root}`, '--only='],
      ['init', `--cwd=${root}`, '--check', '--only=,'],
      ['doctor', '--cwd='],
    ]) {
      const io = recorder();

      expect(await runCli(argv, io)).toBe(2);
      expect(io.stderr).toEqual([`${argv.at(-1)?.split('=')[0] ?? ''} needs a value, and got an empty one. Nothing ran.`]);
    }

    expect(pathExists(join(root, 'CLAUDE.md'))).toBe(false);
  });

  it('turns a crash into exit 2 with the reason, a thrown value and a rejection alike', async () => {
    const io = recorder();

    expect(await settle(() => 0, io)).toBe(0);
    expect(
      await settle(() => {
        throw new Error('boom');
      }, io),
    ).toBe(2);
    expect(await settle(() => Promise.reject('gone'), io)).toBe(2);
    expect(io.stderr[0]).toBe('vitest-auto-spy crashed: boom');
    expect(io.stderr[1]).toBe('vitest-auto-spy crashed: gone');
  });

  it('takes every flag its own command documents, and the common ones on any command', async () => {
    const root = createTempRepo(HEALTHY);

    expect(await runCli(['init', '--check', '--dry-run', '--uninstall', '--cwd', root], recorder())).toBe(0);
    expect(await runCli(['codemod', '--verify', '--list', '--from', 'auto', '--cwd', root], recorder())).toBe(0);
    expect(await runCli(['doctor', '--min-severity', 'error', '--cwd', root], recorder())).toBe(0);
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
  it('exits 0 and says so on a healthy repository', async () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(await runCli(doctorArgs(root), io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('No problems found.');
    expect(io.stdout.join('\n')).toContain('runner: vitest');
  });

  it('exits 1 and prints the tally when something is wrong', async () => {
    const io = recorder();
    const root = createTempRepo({ ...HEALTHY, 'tsconfig.json': JSON.stringify({ include: ['src*.ts'] }) });

    expect(await runCli(doctorArgs(root), io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('1 error, 0 warnings, 0 notes');
  });

  it('leaves the checks named by --ignore out of the report and the exit code', async () => {
    const io = recorder();
    const root = createTempRepo({ ...HEALTHY, 'tsconfig.json': JSON.stringify({ include: ['src*.ts'] }) });

    expect(await runCli(['doctor', '--cwd', root, '--ignore', 'no-agent-instructions, tsconfig-glob-matches-nothing'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('No problems found.');
  });

  it('exits 0 when the only finding is the note suggesting init', async () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}' });

    expect(await runCli(doctorArgs(root), io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('no-agent-instructions');
  });

  it('--min-severity hides the quieter findings and keeps the tally that counts them', async () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}' });

    expect(await runCli(['doctor', '--cwd', root, '--min-severity', 'warning'], io)).toBe(0);
    expect(io.stdout.join('\n')).not.toContain('no-agent-instructions');
    expect(io.stdout.join('\n')).toContain('1 note');

    const abbreviated = recorder();

    expect(await runCli(['doctor', '--cwd', root, '--min-severity', 'warn'], abbreviated)).toBe(0);
    expect(abbreviated.stdout.join('\n')).not.toContain('no-agent-instructions');
  });

  it('refuses an unknown --min-severity before running anything, with the accepted values', async () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}' });

    expect(await runCli(['doctor', '--cwd', root, '--min-severity', 'loud'], io)).toBe(2);
    expect(io.stdout).toEqual([]);
    expect(io.stderr).toEqual(['Unknown --min-severity value: loud. Accepted values: error, warning, info. Nothing ran.']);
  });

  it('refuses an unknown check id in --ignore, and suggests the one it most likely meant', async () => {
    const root = createTempRepo({ 'package.json': '{}' });
    const near = recorder();
    const far = recorder();

    expect(await runCli(['doctor', '--cwd', root, '--ignore', 'no-agent-instruction'], near)).toBe(2);
    expect(near.stderr).toEqual(['Unknown check id for --ignore: no-agent-instruction. Did you mean no-agent-instructions? Nothing ran.']);
    expect(await runCli(['doctor', '--cwd', root, '--ignore', 'everything'], far)).toBe(2);
    expect(far.stderr[0]).toContain(
      'Unknown check id for --ignore: everything. Known ids: analog-behind-angular-build, analog-fast-compile-ctor-injection,',
    );
    expect(await runCli(['doctor', '--cwd', root, '--ignore', 'no-agent-instructions,'], recorder())).toBe(0);
    expect(far.stderr[0]).toContain(
      'vitest-5-removed, vitest-5-report-path, vitest-5-vite-peer, vitest-entry-without-vitest. Nothing ran.',
    );
    expect(await runCli(['doctor', '--cwd', root, '--ignore', 'vitest-5-available,fs-module-cache-not-persisted'], recorder())).toBe(0);
  });
});

describe('flag values', () => {
  it('refuses a value flag with no value, a value flag followed by another flag included', async () => {
    const io = recorder();

    expect(await runCli(['doctor', '--code-quality', '--min-severity', 'error'], io)).toBe(2);
    expect(io.stderr).toEqual(['--code-quality needs a value, as in `--code-quality <value>`. Nothing ran.']);
  });

  it('refuses a number flag that is not a number of zero or more, and takes a zero', async () => {
    const root = createTempRepo(HEALTHY);
    const word = recorder();
    const negative = recorder();

    expect(await runCli(['perf', '--cwd', root, '--max-test-ms', 'abc'], word)).toBe(2);
    expect(word.stderr).toEqual(['--max-test-ms takes a number of zero or more, and got abc. Nothing ran.']);
    expect(await runCli(['perf', '--cwd', root, '--top', '-3'], negative)).toBe(2);
    expect(negative.stderr).toEqual(['--top takes a number of zero or more, and got -3. Nothing ran.']);
    expect(await runCli(['perf', '--cwd', root, '--factor=Infinity'], recorder())).toBe(2);
    expect(await runCli(['perf', '--cwd', root, '--factor', ' '], recorder())).toBe(2);
  });
});

describe('ng-test', () => {
  it('refuses a shard it cannot split by, and a --target with no value', async () => {
    const shard = recorder();
    const target = recorder();

    expect(await runCli(['ng-test', '--shard', '0/4'], shard)).toBe(2);
    expect(shard.stderr).toEqual(['--shard takes <index>/<count>, as in `--shard 1/4`, and got 0/4. Nothing ran.']);
    expect(await runCli(['ng-test', '--target'], target)).toBe(2);
    expect(target.stderr).toEqual(['--target needs a value, as in `--target <value>`. Nothing ran.']);
  });

  it('takes a bare --changed, and says when the workspace has no unit-test target', async () => {
    const root = createTempRepo(HEALTHY);
    const io = recorder();

    expect(await runCli(['ng-test', '--cwd', root, '--changed', '--shard', '1/2', '--related', 'src/app.ts', '--', '--coverage'], io)).toBe(
      2,
    );
    expect(io.stderr[0]).toContain('No @angular/build:unit-test target in this workspace.');
    expect(await runCli(['ng-test', '--cwd', root], recorder())).toBe(2);
  });

  it('refuses a spec path a bare --changed swallowed, and a ref git would read as an option', async () => {
    const root = createTempRepo({ ...HEALTHY, 'src/a.spec.ts': '' });
    const output = join(root, 'diff.txt');

    for (const command of ['ng-test', 'perf']) {
      const swallowed = recorder();
      const option = recorder();

      expect(await runCli([command, '--cwd', root, '--changed', 'src/a.spec.ts'], swallowed)).toBe(2);
      expect(swallowed.stderr).toEqual([
        '--changed src/a.spec.ts names a file, not a git ref. Write --changed=<ref>, or put a bare --changed after the paths. Nothing ran.',
      ]);
      expect(await runCli([command, '--cwd', root, `--changed=--output=${output}`], option)).toBe(2);
      expect(option.stderr).toEqual([`--changed takes a git ref, and got --output=${output}. Nothing ran.`]);
    }

    expect(pathExists(output)).toBe(false);
  });

  it('refuses arguments after -- for every other command', async () => {
    const io = recorder();

    expect(await runCli(['perf', '--', '--coverage'], io)).toBe(2);
    expect(io.stderr).toEqual(['Only `ng-test` takes arguments after `--`. Nothing ran.']);
  });
});

describe('init', () => {
  it('writes the block, then reports it as up to date', async () => {
    const root = createTempRepo(HEALTHY);
    const first = recorder();
    const second = recorder();

    expect(await runCli(initArgs(root), first)).toBe(0);
    expect(first.stdout.join('\n')).toContain('created  ');
    expect(await runCli(initCheckArgs(root), second)).toBe(0);
    expect(second.stdout.join('\n')).toContain('Up to date.');
  });

  it('exits 1 from --check when the block is missing', async () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(await runCli(initCheckArgs(root), io)).toBe(1);
    expect(io.stderr.at(-1)).toMatch(/^\nAGENTS\.md, CLAUDE\.md, .* are out of date\. Run `npx vitest-auto-spy init` to update them\.$/);

    const one = recorder();

    expect(await runCli(['init', '--cwd', root, '--check', '--only', 'AGENTS.md'], one)).toBe(1);
    expect(one.stderr.at(-1)).toBe('\nAGENTS.md is out of date. Run `npx vitest-auto-spy init` to update it.');
  });

  it('tells how to replace a stale copy of the shipped skill, and fails --check on it', async () => {
    const skill = '.claude/skills/vitest-auto-spy/SKILL.md';
    const root = createTempRepo({ ...HEALTHY, [skill]: '---\nname: vitest-auto-spy\n---\n\nAn old copy.\n' });
    const plain = recorder();
    const check = recorder();

    expect(await runCli(initArgs(root), plain)).toBe(0);
    expect(plain.stdout.join('\n')).toContain(`stale     ${skill}`);
    expect(plain.stderr.join('\n')).toContain('Delete it and re-run `npx vitest-auto-spy init`');
    expect(await runCli(initCheckArgs(root), check)).toBe(1);
    expect(check.stdout.join('\n')).not.toContain('Up to date.');
    expect(check.stderr).not.toContainEqual(expect.stringContaining('out of date'));
    expect(check.stderr.at(-1)).toBe(`\n${skill} is a stale copy of the shipped skill. Delete it, then run \`npx vitest-auto-spy init\`.`);
  });

  it('writes only the files --only names', async () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(await runCli(['init', '--cwd', root, '--only', 'CLAUDE.md, .claude'], io)).toBe(0);
    expect(io.stdout.join('\n')).not.toContain('AGENTS.md');
    expect(pathExists(join(root, 'CLAUDE.md'))).toBe(true);
  });

  it('prints the budget warning on stderr', async () => {
    const io = recorder();
    const root = createTempRepo({ ...HEALTHY, 'AGENTS.md': 'x'.repeat(33_000) });

    expect(await runCli(initArgs(root), io)).toBe(0);
    expect(io.stderr.join('\n')).toContain('warning');
  });

  it('defaults the working directory to the process one', async () => {
    const io = recorder();

    expect(await runCli(['init', '--dry-run'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain(process.cwd());
  });
});

/** Nine ordinary files and one far over the file budget, which the gate warns about and `--no-confirm` fails. */
function slowRepo(): string {
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

  return root;
}

describe('perf', () => {
  /** The rules and the rendering are pinned in `perf.spec.ts`; this is the dispatch and the flags. */
  it('reads the report --json names and exits 0', async () => {
    const io = recorder();
    const root = createTempRepo({
      ...HEALTHY,
      'perf.json': JSON.stringify({ version: 1, root: '/r', transform: 0, wall: 0, files: [{ file: '/r/a.spec.ts', tests: 1 }] }),
    });

    expect(await runCli(['perf', '--cwd', root, '--json', `${root}/perf.json`], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('vitest-auto-spy perf —');
  });

  it('exits 2 when there is no report to read: nothing was judged, which is not the same as passing', async () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(await runCli(['perf', '--cwd', root, '--json', `${root}/nowhere.json`], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Cannot read the perf report: nowhere.json does not exist.');
  });

  it('gates a report it was handed, and fails only when told one reading is enough', async () => {
    const io = recorder();
    const root = slowRepo();

    expect(await runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('warn   perf-gate-slow-file slow.spec.ts');

    const trusted = recorder();

    expect(await runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate', '--no-confirm'], trusted)).toBe(1);
    expect(trusted.stdout.join('\n')).toContain('error  perf-gate-slow-file slow.spec.ts');
  });

  it('re-measures a handed report under the config it recorded, and says so when that config is not here', async () => {
    const root = slowRepo();
    const report = join(root, 'perf.json');
    const io = recorder();

    writeTextFile(
      report,
      JSON.stringify({
        ...(JSON.parse(readTextFile(report) ?? '{}') as Record<string, unknown>),
        version: 6,
        configFile: 'libs/tooling/vitest.config.ts',
      }),
    );

    expect(await runCli(['perf', '--cwd', root, '--json', report, '--gate', '--profile-dir', 'profiles'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('perf gate: re-measuring 1 file on its own before failing anything.');
    expect(io.stderr.join('\n')).toContain('The report was measured with the Vitest config libs/tooling/vitest.config.ts');
    expect(io.stderr.join('\n')).not.toContain('--profile-dir keeps the profiles');
  });

  it('runs the suite when there is no report to read, and says --profile-dir needs a gate', async () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(await runCli(['perf', '--cwd', root, '--profile-dir', 'profiles'], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('--profile-dir keeps the profiles');
    expect(io.stderr.join('\n')).toContain('No Vitest is installed');
  });

  it('warns that --profile-dir has nothing to keep when the handed report recorded no config', async () => {
    const io = recorder();
    const root = slowRepo();

    expect(await runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate', '--profile-dir', 'profiles'], io)).toBe(0);
    expect(io.stderr.join('\n')).toContain('--profile-dir keeps the profiles');
    expect(io.stdout.join('\n')).not.toContain('re-measuring');
  });
});

describe('color in a CI job log', () => {
  const inGitLab = (): void => {
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', undefined);
    vi.stubEnv('TERM', 'xterm');
    vi.stubEnv('GITLAB_CI', 'true');
  };

  it('paints doctor findings by severity, and keeps the JSON and the Code Quality report free of escapes', async () => {
    inGitLab();

    const root = createTempRepo({ ...HEALTHY, 'tsconfig.json': JSON.stringify({ include: ['src*.ts'] }) });
    const text = recorder();
    const json = recorder();

    expect(await runCli(doctorArgs(root), text)).toBe(1);
    expect(text.stdout.join('\n')).toContain(`${TERMINAL.red('error')}  tsconfig-glob-matches-nothing`);

    expect(await runCli(['doctor', '--cwd', root, '--format', 'json', '--code-quality', 'quality.json'], json)).toBe(1);
    expect(json.stdout.join('\n')).not.toContain(ESC);
    expect(readTextFile(join(root, 'quality.json'))).not.toContain(ESC);
  });

  it('paints the gate: warning yellow, error red, a failing verdict red, and nothing in its JSON', async () => {
    inGitLab();

    const root = slowRepo();
    const report = join(root, 'perf.json');
    const warned = recorder();
    const failed = recorder();
    const json = recorder();

    expect(await runCli(['perf', '--cwd', root, '--json', report, '--gate'], warned)).toBe(0);
    expect(warned.stdout.join('\n')).toContain(`${TERMINAL.yellow('warn')}   perf-gate-slow-file slow.spec.ts`);

    expect(await runCli(['perf', '--cwd', root, '--json', report, '--gate', '--no-confirm'], failed)).toBe(1);
    expect(failed.stdout.join('\n')).toContain(`${TERMINAL.red('error')}  perf-gate-slow-file slow.spec.ts`);
    expect(failed.stdout.join('\n')).toContain(TERMINAL.red('perf gate verdict — 1 judged, 1 fails the run'));

    expect(
      await runCli(
        ['perf', '--cwd', root, '--json', report, '--gate', '--no-confirm', '--format', 'json', '--code-quality', 'quality.json'],
        json,
      ),
    ).toBe(1);
    expect(json.stdout.join('\n')).not.toContain(ESC);
    expect(readTextFile(join(root, 'quality.json'))).not.toContain(ESC);
  });
});

describe('perf flags', () => {
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

    writeTextFile(join(root, 'perf.json'), perfReportJson(root, files));

    return { root, json: join(root, 'perf.json') };
  };

  it('strips a leading ./ from a scope, since a generated list is where that spelling comes from', async () => {
    const { root, json } = repo();
    const io = recorder();

    expect(await runCli(['perf', '--cwd', root, '--json', json, '--gate', '--gate-only', './src', '--no-confirm'], io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('perf-gate-slow-file src/slow.spec.ts');
  });

  it('records the baseline next to the repository when --update-baseline names no path', async () => {
    const { root, json } = repo();
    const io = recorder();

    expect(await runCli(['perf', '--cwd', root, '--json', json, '--update-baseline'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('perf-baseline.json');
    expect(pathExists(join(root, 'perf-baseline.json'))).toBe(true);
  });

  it('--min-severity error leaves perf with the tally alone, and the exit code where it was', async () => {
    const { root, json } = repo();
    const io = recorder();

    expect(await runCli(['perf', '--cwd', root, '--json', json, '--gate', '--min-severity', 'error'], io)).toBe(0);

    const out = io.stdout.join('\n');

    expect(out).not.toContain('perf-gate-slow-file');
    expect(out).toContain('0 errors, 1 warning, 0 notes');
  });

  it('clamps a zero budget off the floor, so a file that ran nothing is never a finding', async () => {
    const root = createTempRepo(HEALTHY);

    writeTextFile(
      join(root, 'perf.json'),
      perfReportJson(root, [measured(root, 'src/ran.spec.ts', 100), { ...measured(root, 'src/empty.spec.ts', 0), testCount: 0 }]),
    );

    const io = recorder();

    expect(
      await runCli(
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
  it('prints doctor as one JSON document with every finding, whatever --min-severity hides from the text', async () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}', 'src/a.spec.ts': '' });

    expect(await runCli(['doctor', '--cwd', root, '--format', 'json', '--min-severity', 'error'], io)).toBe(0);

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

  it('prints perf as one JSON document: the run, the budgets, the gate and the findings', async () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);
    const files = [...ordinaryPerfFiles(root), { file: `${root}/slow.spec.ts`, tests: 9_000, testCount: 4 }];

    writeTextFile(join(root, 'perf.json'), perfReportJson(root, files));

    expect(await runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate', '--no-confirm', '--format', 'json'], io)).toBe(
      1,
    );
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

  it('still prints a document, with the error, when there is no report to read', async () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(await runCli(['perf', '--cwd', root, '--json', join(root, 'nowhere.json'), '--format', 'json', '--gate'], io)).toBe(2);
    expect(JSON.parse(io.stdout.join(''))).toMatchObject({
      exitCode: 2,
      run: null,
      gate: { status: 'skipped', confirmation: 'unavailable' },
    });
    expect(io.stderr.join('\n')).toContain('Cannot read the perf report: nowhere.json does not exist.');
  });

  it('refuses a format it does not know, before anything runs', async () => {
    const io = recorder();

    expect(await runCli(['doctor', '--format', 'xml'], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Unknown --format value: xml');
    expect(await runCli(['doctor', '--format', 'TEXT', '--cwd', createTempRepo(HEALTHY)], recorder())).toBe(0);
  });
});

describe('--format markdown', () => {
  it('prints doctor as a findings table and the tally', async () => {
    const io = recorder();
    const root = createTempRepo({ 'package.json': '{}', 'src/a.spec.ts': '' });

    expect(await runCli(['doctor', '--cwd', root, '--format', 'markdown'], io)).toBe(0);

    const out = io.stdout.join('\n');

    expect(out).toContain('### vitest-auto-spy doctor');
    expect(out).toContain('| Severity | Check | File | Message | Fix |');
    expect(out).toContain('| info | `no-agent-instructions` |');
    expect(out).toContain('**0 errors, 0 warnings, 1 notes**');
  });

  it('prints perf with the phases, the slowest files and the gate, and keeps the suite off stdout', async () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);
    const files = [...ordinaryPerfFiles(root), { file: `${root}/slow.spec.ts`, tests: 9_000, testCount: 4 }];

    writeTextFile(join(root, 'perf.json'), perfReportJson(root, files));

    expect(
      await runCli(
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
  it('says how much it read, and ends in the tally even when nothing was found', async () => {
    const io = recorder();
    const root = createTempRepo({ ...HEALTHY, 'src/a.spec.ts': '' });

    expect(await runCli(doctorArgs(root), io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('4 files scanned, 1 of them spec files — runner: vitest');
    expect(io.stdout.at(-1)).toBe('0 errors, 0 warnings, 0 notes');
  });

  it('warns when the scan stopped at its cap, because every other check then read part of the tree', async () => {
    vi.stubEnv('VITEST_AUTO_SPY_SCAN_CAP', '1');

    const io = recorder();
    const root = createTempRepo(HEALTHY);

    expect(await runCli(doctorArgs(root), io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('warn   scan-cap-reached');
  });
});

describe('perf budgets without --gate', () => {
  it('draws the tables against the budgets on the command line, which is what a later --gate judges', async () => {
    const io = recorder();
    const root = createTempRepo(HEALTHY);
    const files = [
      ...ordinaryPerfFiles(root),
      { file: `${root}/busy.spec.ts`, tests: 600, testCount: 4, cases: [{ name: 'waits', ms: 400 }] },
    ];

    writeTextFile(join(root, 'perf.json'), perfReportJson(root, files));

    expect(await runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--max-test-ms', '300'], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('test bodies over budget — 1, each over --max-test-ms 300ms');
  });
});

describe('perf gate attribution flags', () => {
  const gateOf = async (argv: readonly string[], io: CliIo = recorder()): Promise<perf.GateRequest | undefined> => {
    const root = slowRepo();

    await runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate', '--no-confirm', ...argv], io);

    return vi.mocked(perf.renderPerf).mock.lastCall?.[3]?.gate;
  };

  it('leaves every one of them out of the gate when none was given', async () => {
    expect(await gateOf([])).not.toHaveProperty('scope');
    expect(await gateOf([])).not.toHaveProperty('debt');
    expect(await gateOf([])).not.toHaveProperty('margin');
    expect(await gateOf([])).not.toHaveProperty('confirmRuns');
  });

  it('refuses a --debt it does not know out loud, and judges known debt as a failure', async () => {
    const io = recorder();

    expect(await gateOf(['--debt', 'warm'], io)).not.toHaveProperty('debt');
    expect(io.stderr.join('\n')).toContain('warning  --debt takes warn or fail, not warm; judging known debt as a failure.');
  });

  it('passes --debt warn on, and takes --debt fail silently as the default', async () => {
    const io = recorder();

    expect(await gateOf(['--debt', 'warn'])).toMatchObject({ debt: 'warn' });
    expect(await gateOf(['--debt=fail'], io)).not.toHaveProperty('debt');
    expect(io.stderr.join('\n')).not.toContain('--debt takes');
  });

  it('never lets --gate-margin go under 1', async () => {
    expect(await gateOf(['--gate-margin', '0.5'])).toMatchObject({ margin: 1 });
    expect(await gateOf(['--gate-margin', '1.5'])).toMatchObject({ margin: 1.5 });
  });

  it('keeps --confirm-runs a whole number between 1 and 5', async () => {
    expect(await gateOf(['--confirm-runs', '0'])).toMatchObject({ confirmRuns: 1 });
    expect(await gateOf(['--confirm-runs', '2.7'])).toMatchObject({ confirmRuns: 2 });
    expect(await gateOf(['--confirm-runs', '9'])).toMatchObject({ confirmRuns: 5 });
  });

  it('judges every file, and says why, when --changed is given outside a git repository', async () => {
    const io = recorder();

    vi.stubEnv('GIT_CEILING_DIRECTORIES', tmpdir());

    expect(await gateOf(['--changed'], io)).not.toHaveProperty('scope');
    expect(io.stderr.join('\n')).toContain('warning  --changed HEAD:');
    expect(io.stderr.join('\n')).toContain('The gate judges every file instead.');
  });

  it('scopes the gate to what --changed reaches, so a file the change never touched fails nothing', async () => {
    const root = slowRepo();
    const io = recorder();
    const git = (...args: string[]): void => {
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root, stdio: 'ignore' });
    };

    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');

    expect(
      await runCli(['perf', '--cwd', root, '--json', join(root, 'perf.json'), '--gate', '--no-confirm', '--changed', 'HEAD'], io),
    ).toBe(0);
    expect(vi.mocked(perf.renderPerf).mock.lastCall?.[3]?.gate?.scope).toMatchObject({ ref: 'HEAD', all: false, changed: 0 });
    expect(io.stdout.join('\n')).toContain('perf gate: nothing changed against HEAD');
    expect(io.stdout.join('\n')).toContain('warn   perf-gate-slow-file slow.spec.ts');
  });
});
