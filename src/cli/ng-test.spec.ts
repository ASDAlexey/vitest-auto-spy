import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { CliIo } from './main';
import type { Captured, NgTestOptions, NgTestTools } from './ng-test';
import { captureProcess, changedRef, resolveNg, runNgTest } from './ng-test';
import type { SpawnRequest } from './perf-run';
import { readProfile } from './profile';
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

function workspace(targets: Record<string, Record<string, unknown>>): Record<string, string> {
  return {
    'angular.json': JSON.stringify({
      projects: Object.fromEntries(Object.entries(targets).map(([project, architect]) => [project, { root: '', architect }])),
    }),
    'src/test-setup.ts': "import './testing/stub';\n",
    'src/testing/stub.ts': 'export const stub = 1;\n',
    'src/app/user.service.ts': 'export class UserService {}\n',
    'src/app/user.service.spec.ts': "import { UserService } from './user.service';\n",
    'src/app/clock.spec.ts': '',
    'src/app/dates.spec.ts': '',
  };
}

const APP = { app: { test: { builder: '@angular/build:unit-test', options: { setupFiles: ['./src/test-setup.ts'] } } } };
const LISTED = 'Discovered test files:\n  src/app/clock.spec.ts\n  src/app/dates.spec.ts\n  src/app/user.service.spec.ts\n';

interface Harness {
  readonly tools: NgTestTools;
  readonly captured: { command: string; args: readonly string[] }[];
  readonly spawned: SpawnRequest[];
}

function harness(answers: Record<string, Captured> = {}, ng: string | null = '/ws/node_modules/@angular/cli/bin/ng.js'): Harness {
  const captured: { command: string; args: readonly string[] }[] = [];
  const spawned: SpawnRequest[] = [];
  const ok = (stdout: string): Captured => ({ status: 0, stdout, stderr: '' });

  return {
    captured,
    spawned,
    tools: {
      capture: (command, args) => {
        captured.push({ command, args });

        const key = command === 'git' ? String(args[0]) : 'list';

        return answers[key] ?? (key === 'list' ? ok(LISTED) : ok(''));
      },
      spawn: (request) => {
        spawned.push(request);

        return { status: 3 };
      },
      resolveNg: () => ng ?? undefined,
    },
  };
}

function options(root: string, overrides: Partial<NgTestOptions> = {}): NgTestOptions {
  return {
    cwd: root,
    profile: readProfile(root),
    target: undefined,
    shard: undefined,
    changed: undefined,
    related: [],
    dryRun: false,
    passthrough: [],
    ...overrides,
  };
}

function includes(request: SpawnRequest | undefined): string[] {
  return (request?.args ?? []).filter((arg) => arg.startsWith('--include=')).map((arg) => arg.slice('--include='.length));
}

describe('runNgTest', () => {
  it('without a selection flag runs the target as is and returns its exit code', () => {
    const root = createTempRepo(workspace(APP));
    const { tools, captured, spawned } = harness();

    expect(runNgTest(options(root, { passthrough: ['--coverage'] }), tools, recorder())).toBe(3);
    expect(captured).toEqual([]);
    expect(spawned[0]).toMatchObject({
      command: process.execPath,
      args: ['/ws/node_modules/@angular/cli/bin/ng.js', 'run', 'app:test', '--watch=false', '--coverage'],
      shell: false,
    });
  });

  it('runs one shard of what the builder discovered, and every file lands in exactly one shard', () => {
    const root = createTempRepo(workspace(APP));
    const parts = [1, 2].map((index) => {
      const { tools, captured, spawned } = harness();
      const io = recorder();

      expect(runNgTest(options(root, { shard: { index, count: 2 }, passthrough: ['--include', 'src/app', '--coverage'] }), tools, io)).toBe(
        3,
      );
      expect(captured[0]?.args).toEqual([
        '/ws/node_modules/@angular/cli/bin/ng.js',
        'run',
        'app:test',
        '--list-tests',
        '--include',
        'src/app',
        '--coverage',
      ]);
      expect(spawned[0]?.args.slice(0, 5)).toEqual([
        '/ws/node_modules/@angular/cli/bin/ng.js',
        'run',
        'app:test',
        '--watch=false',
        '--coverage',
      ]);
      expect(io.stdout[0]).toMatch(new RegExp(`^ng-test — 3 spec files; shard ${index}/2 runs \\d of them$`));

      return includes(spawned[0]);
    });

    expect(parts.flat().sort()).toEqual(['src/app/clock.spec.ts', 'src/app/dates.spec.ts', 'src/app/user.service.spec.ts']);
  });

  it('prints the command instead of running it under --dry-run', () => {
    const root = createTempRepo(workspace(APP));
    const { tools, spawned } = harness();
    const io = recorder();

    expect(runNgTest(options(root, { related: ['./src/app/user.service.ts'], dryRun: true }), tools, io)).toBe(0);
    expect(spawned).toEqual([]);
    expect(io.stdout).toEqual([
      'ng-test — 1 of 3 spec files, reached by 1 changed file',
      'ng run app:test --watch=false --include=src/app/user.service.spec.ts',
    ]);
  });

  it('asks git what changed, untracked files included, and runs the specs they reach', () => {
    const root = createTempRepo(workspace(APP));
    const { tools, captured, spawned } = harness({
      diff: { status: 0, stdout: 'src/app/user.service.ts\n', stderr: '' },
      'ls-files': { status: 0, stdout: 'src/app/clock.spec.ts\n\n', stderr: '' },
    });
    const io = recorder();

    expect(runNgTest(options(root, { changed: 'origin/main' }), tools, io)).toBe(3);
    expect(captured.slice(1)).toEqual([
      { command: 'git', args: ['diff', '--name-only', '--diff-filter=ACMR', '--relative', 'origin/main'] },
      { command: 'git', args: ['ls-files', '--others', '--exclude-standard'] },
    ]);
    expect(includes(spawned[0])).toEqual(['src/app/clock.spec.ts', 'src/app/user.service.spec.ts']);
    expect(io.stdout[0]).toBe('ng-test — 2 of 3 spec files, reached by 2 changed files');
  });

  it('runs everything, the user include kept, when a change reaches the setup files', () => {
    const root = createTempRepo(workspace(APP));
    const { tools, spawned } = harness({ diff: { status: 0, stdout: 'src/testing/stub.ts\n', stderr: '' } });
    const io = recorder();

    expect(runNgTest(options(root, { changed: 'HEAD', passthrough: ['--include=src/app'] }), tools, io)).toBe(3);
    expect(spawned[0]?.args.slice(3)).toEqual(['--watch=false', '--include=src/app']);
    expect(io.stdout[0]).toBe('ng-test — all 3 spec files: src/testing/stub.ts changed, and every spec loads it through the setup files');
  });

  it('runs nothing and exits 0 when no spec is reached', () => {
    const root = createTempRepo(workspace(APP));
    const { tools, spawned } = harness({ diff: { status: 0, stdout: 'README.md\n', stderr: '' } });
    const io = recorder();

    expect(runNgTest(options(root, { changed: 'HEAD' }), tools, io)).toBe(0);
    expect(spawned).toEqual([]);
    expect(io.stdout).toEqual(['ng-test — 0 of 3 spec files, reached by 1 changed file', 'Nothing to run.']);
  });

  it('stops with exit 2 when git cannot answer', () => {
    const root = createTempRepo(workspace(APP));
    const diff = recorder();
    const untracked = recorder();

    expect(
      runNgTest(options(root, { changed: 'nope' }), harness({ diff: { status: 128, stdout: '', stderr: 'bad revision\n' } }).tools, diff),
    ).toBe(2);
    expect(diff.stderr).toEqual(['`git diff --name-only --diff-filter=ACMR --relative nope` failed: bad revision Nothing ran.']);
    expect(
      runNgTest(
        options(root, { changed: 'HEAD' }),
        harness({ 'ls-files': { status: 128, stdout: '', stderr: 'not a repo' } }).tools,
        untracked,
      ),
    ).toBe(2);
    expect(untracked.stderr[0]).toContain('`git ls-files --others --exclude-standard` failed: not a repo');
  });

  it('stops with exit 2 when the builder prints no list of spec files', () => {
    const root = createTempRepo(workspace(APP));
    const failed = recorder();
    const silent = recorder();

    expect(
      runNgTest(
        options(root, { shard: { index: 1, count: 2 } }),
        harness({ list: { status: 1, stdout: '', stderr: 'Unknown argument: list-tests' } }).tools,
        failed,
      ),
    ).toBe(2);
    expect(failed.stderr).toEqual([
      '`ng run app:test --list-tests` gave no list of spec files — it needs @angular/build 21 or newer. Nothing ran.',
      'Unknown argument: list-tests',
    ]);
    expect(
      runNgTest(
        options(root, { shard: { index: 1, count: 2 } }),
        harness({ list: { status: 0, stdout: 'done', stderr: '' } }).tools,
        silent,
      ),
    ).toBe(2);
  });

  it('says when @angular/cli does not resolve', () => {
    const root = createTempRepo(workspace(APP));
    const io = recorder();

    expect(runNgTest(options(root), harness({}, null).tools, io)).toBe(2);
    expect(io.stderr[0]).toContain('@angular/cli is not installed in this workspace');
  });

  it('picks the one unit-test target, or asks which one', () => {
    const two = createTempRepo(
      workspace({ ...APP, lib: { test: { builder: '@angular/build:unit-test' }, spec: { builder: '@angular/build:unit-test' } } }),
    );
    const none = createTempRepo(workspace({ app: { test: { builder: '@angular/build:karma' } } }));
    const several = recorder();
    const unknown = recorder();
    const missing = recorder();

    expect(runNgTest(options(two), harness().tools, several)).toBe(2);
    expect(several.stderr).toEqual([
      'Several @angular/build:unit-test targets: app:test, lib:test, lib:spec. Pick one with --target <project:target>. Nothing ran.',
    ]);
    expect(runNgTest(options(two, { target: 'lib:nope' }), harness().tools, unknown)).toBe(2);
    expect(unknown.stderr[0]).toBe('No @angular/build:unit-test target lib:nope. Known: app:test, lib:test, lib:spec. Nothing ran.');
    expect(runNgTest(options(none), harness().tools, missing)).toBe(2);
    expect(missing.stderr[0]).toContain('No @angular/build:unit-test target in this workspace.');

    const { tools, spawned } = harness();

    expect(runNgTest(options(two, { target: 'app' }), tools, recorder())).toBe(3);
    expect(runNgTest(options(two, { target: 'lib:spec' }), tools, recorder())).toBe(3);
    expect(spawned.map((request) => request.args[2])).toEqual(['app:test', 'lib:spec']);
  });
});

describe('the command-line limit', () => {
  const SHARED = { 'src/shared.ts': 'export const shared = 1;\n', 'src/other/other.spec.ts': '' };

  function bigWorkspace(extra: Record<string, string>): { root: string; listed: Captured } {
    const files = { ...workspace(APP), ...SHARED, ...extra };
    const specs = Object.keys(files).filter((file) => file.endsWith('.spec.ts'));

    return { root: createTempRepo(files), listed: { status: 0, stdout: `Discovered test files:\n${specs.join('\n')}\n`, stderr: '' } };
  }

  const reaching = "import { shared } from '../../shared';\n";

  it('folds a fully selected directory into one glob when the Windows line would be too long, and only then', () => {
    const files = Object.fromEntries(
      Array.from({ length: 700 }, (_, index) => [
        `src/features/feature-number-${index}/feature-number-${index}.component.spec.ts`,
        reaching,
      ]),
    );
    const { root, listed } = bigWorkspace(files);
    const windows = harness({ list: listed });
    const posix = harness({ list: listed });

    expect(runNgTest(options(root, { related: ['src/shared.ts'] }), { ...windows.tools, platform: 'win32' }, recorder())).toBe(3);
    expect(includes(windows.spawned[0])).toEqual(['src/features/**/*.spec.ts']);
    expect(runNgTest(options(root, { related: ['src/shared.ts'] }), { ...posix.tools, platform: 'linux' }, recorder())).toBe(3);
    expect(includes(posix.spawned[0])).toHaveLength(700);
  });

  it('stops with exit 2, the count and the fixes, when even the folded line is too long', () => {
    const files = Object.fromEntries(
      Array.from({ length: 700 }, (_, index) => [
        [`src/features/feature-number-${index}/feature-number-${index}.component.spec.ts`, reaching],
        [`src/features/feature-number-${index}/unrelated.spec.ts`, ''],
      ]).flat(),
    );
    const { root, listed } = bigWorkspace(files);
    const { tools, spawned } = harness({ list: listed });
    const io = recorder();

    expect(runNgTest(options(root, { related: ['src/shared.ts'] }), { ...tools, platform: 'win32' }, io)).toBe(2);
    expect(spawned).toEqual([]);
    expect(io.stderr[0]).toMatch(
      /^700 spec files make a \d+-character command line even with whole directories folded into globs, over this platform's 32767\. Split the run into more shards, or set `test\.shard` in the runner config, which has no length limit\. Nothing ran\.$/,
    );
  });
});

describe('changedRef', () => {
  it('reads a bare flag as HEAD and false as off', () => {
    expect(changedRef(undefined)).toBeUndefined();
    expect(changedRef('false')).toBeUndefined();
    expect(changedRef(true)).toBe('HEAD');
    expect(changedRef('true')).toBe('HEAD');
    expect(changedRef('origin/main')).toBe('origin/main');
  });
});

describe('the real process helpers', () => {
  it('captures output, and turns a program that cannot start into a failure', () => {
    expect(captureProcess(process.execPath, ['-e', 'process.stdout.write("listed")'], process.cwd())).toEqual({
      status: 0,
      stdout: 'listed',
      stderr: '',
    });

    expect(captureProcess(process.execPath, ['-e', 'process.kill(process.pid, "SIGKILL")'], process.cwd()).status).toBe(1);

    const missing = captureProcess('definitely-not-a-program-here', [], process.cwd());

    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('ENOENT');
  });

  it("resolves the workspace's own ng entry, or nothing", () => {
    const root = createTempRepo({
      'package.json': '{}',
      'node_modules/@angular/cli/package.json': JSON.stringify({ name: '@angular/cli' }),
      'node_modules/@angular/cli/bin/ng.js': '',
    });

    expect(resolveNg(root)).toBe(join(realpathSync(root), 'node_modules/@angular/cli/bin/ng.js'));
    expect(resolveNg(createTempRepo({ 'package.json': '{}' }))).toBeUndefined();
  });
});
