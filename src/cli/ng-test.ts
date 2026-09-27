/**
 * `ng-test`: `ng test` with the Vitest levers the unit-test builder does not pass through — a shard,
 * the specs a change reaches — computed here and handed to the builder as `--include` paths.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';

import { isSpecFile } from './checks/graph';
import { unitTestTargets } from './checks/unit-test-targets';
import type { UnitTestTarget } from './checks/unit-test-targets';
import { toPosix } from './fs-scan';
import type { CliIo } from './main';
import type { Shard } from './ng-test-select';
import { affectedSpecs, compressIncludes, discoveredFiles, shardFiles, withoutInclude } from './ng-test-select';
import type { Spawn } from './perf-run';
import type { Profile } from './profile';

export interface Captured {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type Capture = (command: string, args: readonly string[], cwd: string) => Captured;

export const captureProcess: Capture = (command, args, cwd) => {
  const result = spawnSync(command, [...args], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

  if (result.error !== undefined) {
    return { status: 1, stdout: '', stderr: result.error.message };
  }

  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
};

/** `@angular/cli`'s own entry, run with this Node: no `npx`, no `.cmd` shim, no shell. */
export function resolveNg(cwd: string): string | undefined {
  try {
    return createRequire(join(cwd, 'package.json')).resolve('@angular/cli/bin/ng.js');
  } catch {
    return undefined;
  }
}

/** `--changed` alone diffs against `HEAD`, as Vitest's own flag does; `--changed=false` is off. */
export function changedRef(value: string | true | undefined): string | undefined {
  if (value === undefined || value === 'false') {
    return undefined;
  }

  return value === true || value === 'true' ? 'HEAD' : value;
}

export interface NgTestOptions {
  readonly cwd: string;
  readonly profile: Profile;
  /** `project` or `project:target`. */
  readonly target: string | undefined;
  readonly shard: Shard | undefined;
  /** The git ref `--changed` diffs against; `HEAD` for uncommitted work. */
  readonly changed: string | undefined;
  readonly related: readonly string[];
  readonly dryRun: boolean;
  /** Everything after `--`, handed to `ng` as typed. */
  readonly passthrough: readonly string[];
}

export interface NgTestTools {
  readonly capture: Capture;
  readonly spawn: Spawn;
  readonly resolveNg: (cwd: string) => string | undefined;
  /** `process.platform` unless a spec says otherwise: it decides the command-line limit. */
  readonly platform?: string;
}

/** CreateProcess caps a command line at 32 767 characters; POSIX allows about 1 MB of arguments. */
export function commandLineLimit(platform: string): number {
  return platform === 'win32' ? 32_767 : 1_000_000;
}

function commandLength(args: readonly string[]): number {
  return [process.execPath, ...args].reduce((total, arg) => total + arg.length + 3, 0);
}

const BUILDER = '@angular/build:unit-test';

function pickTarget(profile: Profile, wanted: string | undefined, io: CliIo): UnitTestTarget | undefined {
  const targets = unitTestTargets(profile).filter((target) => target.builder === BUILDER);
  const names = targets.map((target) => `${target.project}:${target.name}`);
  const [project, name] = (wanted ?? '').split(':');
  const matching =
    wanted === undefined ? targets : targets.filter((target) => target.project === project && (name === undefined || target.name === name));

  if (matching.length === 1) {
    return matching[0];
  }

  if (targets.length === 0) {
    io.err(
      `No ${BUILDER} target in this workspace. ng-test drives that builder only; any other Vitest takes --shard and --changed itself. Nothing ran.`,
    );
  } else if (matching.length === 0) {
    io.err(`No ${BUILDER} target ${String(wanted)}. Known: ${names.join(', ')}. Nothing ran.`);
  } else {
    io.err(`Several ${BUILDER} targets: ${names.join(', ')}. Pick one with --target <project:target>. Nothing ran.`);
  }

  return undefined;
}

function setupFilesOf(target: UnitTestTarget, profile: Profile): string[] {
  const declared = target.optionBlocks.flatMap((block) => [block['setupFiles'], block['providersFile']].flat());

  return [...declared.filter((entry): entry is string => typeof entry === 'string'), ...profile.setupFiles].map((file) =>
    toPosix(file).replace(/^\.\//, ''),
  );
}

function gitLines(capture: Capture, cwd: string, args: readonly string[]): string[] | string {
  const result = capture('git', args, cwd);

  if (result.status !== 0) {
    return `\`git ${args.join(' ')}\` failed: ${result.stderr.trim()}`;
  }

  return result.stdout.split(/\r?\n/).filter((line) => line.trim() !== '');
}

/** What git says changed against `ref`, untracked files included, as Vitest's `--changed` reads it. */
function changedFiles(capture: Capture, cwd: string, ref: string): string[] | string {
  const diff = gitLines(capture, cwd, ['diff', '--name-only', '--diff-filter=ACMR', '--relative', ref]);
  const untracked = gitLines(capture, cwd, ['ls-files', '--others', '--exclude-standard']);

  if (typeof diff === 'string') {
    return diff;
  }

  return typeof untracked === 'string' ? untracked : [...new Set([...diff, ...untracked])];
}

interface Selection {
  readonly files: readonly string[];
  /** Every discovered spec is in `files`, so no `--include` is needed. */
  readonly everything: boolean;
  readonly why: string;
}

function select(options: NgTestOptions, target: UnitTestTarget, discovered: readonly string[], tools: NgTestTools): Selection | string {
  let files = discovered;
  let why = `${discovered.length} spec files`;

  if (options.changed !== undefined || options.related.length > 0) {
    const fromGit = options.changed === undefined ? [] : changedFiles(tools.capture, options.cwd, options.changed);

    if (typeof fromGit === 'string') {
      return fromGit;
    }

    const named = options.related.map((file) => toPosix(relative(options.cwd, resolve(options.cwd, file))));
    const changed = [...new Set([...fromGit, ...named])];
    const affected = affectedSpecs(options.profile, changed, setupFilesOf(target, options.profile));

    files = affected.all ? discovered : discovered.filter((file) => affected.specs.has(file));
    why = affected.all
      ? `all ${discovered.length} spec files: ${affected.reason}`
      : `${files.length} of ${discovered.length} spec files, reached by ${changed.length} changed file${changed.length === 1 ? '' : 's'}`;
  }

  if (options.shard !== undefined) {
    files = shardFiles(files, options.shard);
    why = `${why}; shard ${options.shard.index}/${options.shard.count} runs ${files.length} of them`;
  }

  return { files, everything: files.length === discovered.length, why };
}

function listSpecs(
  base: readonly string[],
  target: UnitTestTarget,
  options: NgTestOptions,
  tools: NgTestTools,
  io: CliIo,
): string[] | undefined {
  const listed = tools.capture(process.execPath, [...base, '--list-tests', ...options.passthrough], options.cwd);
  const discovered = listed.status === 0 ? discoveredFiles(listed.stdout) : undefined;

  if (discovered === undefined) {
    io.err(
      `\`ng run ${target.project}:${target.name} --list-tests\` gave no list of spec files — it needs @angular/build 21 or newer. Nothing ran.`,
    );
    io.err(`${listed.stdout}${listed.stderr}`.trim());
  }

  return discovered;
}

/** The run with one `--include` per file, folded into directory globs only when the line is too long. */
function includeRun(
  head: readonly string[],
  files: readonly string[],
  discovered: readonly string[],
  options: NgTestOptions,
  tools: NgTestTools,
  io: CliIo,
): string[] | undefined {
  const limit = commandLineLimit(tools.platform ?? process.platform);
  const plain = [...head, ...files.map((file) => `--include=${file}`)];

  if (commandLength(plain) <= limit) {
    return plain;
  }

  const universe = [...new Set([...discovered, ...options.profile.files.filter(isSpecFile)])];
  const folded = [...head, ...compressIncludes(files, universe).map((entry) => `--include=${entry}`)];

  if (commandLength(folded) <= limit) {
    return folded;
  }

  io.err(
    `${files.length} spec files make a ${commandLength(folded)}-character command line even with whole directories folded into globs, over this platform's ${limit}. Split the run into more shards, or set \`test.shard\` in the runner config, which has no length limit. Nothing ran.`,
  );

  return undefined;
}

export function runNgTest(options: NgTestOptions, tools: NgTestTools, io: CliIo): number {
  const target = pickTarget(options.profile, options.target, io);

  if (target === undefined) {
    return 2;
  }

  const ng = tools.resolveNg(options.cwd);

  if (ng === undefined) {
    io.err('@angular/cli is not installed in this workspace: node_modules/@angular/cli/bin/ng.js does not resolve. Nothing ran.');

    return 2;
  }

  const base = [ng, 'run', `${target.project}:${target.name}`];
  const selecting = options.shard !== undefined || options.changed !== undefined || options.related.length > 0;
  let run = [...base, '--watch=false', ...options.passthrough];

  if (selecting) {
    const discovered = listSpecs(base, target, options, tools, io);

    if (discovered === undefined) {
      return 2;
    }

    const selection = select(options, target, discovered, tools);

    if (typeof selection === 'string') {
      io.err(`${selection} Nothing ran.`);

      return 2;
    }

    io.out(`ng-test — ${selection.why}`);

    if (selection.files.length === 0) {
      io.out('Nothing to run.');

      return 0;
    }

    if (!selection.everything) {
      const narrowed = includeRun(
        [...base, '--watch=false', ...withoutInclude(options.passthrough)],
        selection.files,
        discovered,
        options,
        tools,
        io,
      );

      if (narrowed === undefined) {
        return 2;
      }

      run = narrowed;
    }
  }

  if (options.dryRun) {
    io.out(['ng', ...run.slice(1)].join(' '));

    return 0;
  }

  return tools.spawn({ command: process.execPath, args: run, cwd: options.cwd, env: {}, shell: false }).status;
}
