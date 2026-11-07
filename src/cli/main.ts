/**
 * Command dispatch and rendering. Kept separate from `src/cli.ts` so the executable is three lines
 * and everything under test is a function that takes an argv and a sink and returns an exit code.
 */
import { resolve } from 'node:path';

import type { ParsedArgs } from './args';
import { LIST_FLAGS, OPTIONAL_VALUE_FLAGS, VALUE_FLAGS, flagEnabled, flagList, flagValue, parseArgs } from './args';
import { failOnOf, formatOf, minSeverityOf } from './cli-options';
import { DOCTOR_CHECKS } from './docs';
import { isDirectory } from './fs-scan';
import { HELP } from './help';
import type { InitAction, InitResult } from './init';
import { parseShard } from './ng-test-select';
import { ownVersion } from './self';
import { nearest } from './suggest';

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const STATUS_WIDTH = 10;

function rejectFormat(args: ParsedArgs, io: CliIo): boolean {
  if (formatOf(args) !== undefined) {
    return false;
  }

  io.err(`Unknown --format value: ${String(flagValue(args, 'format'))}. Accepted values: text, json, markdown. Nothing ran.`);

  return true;
}

function formatAction(action: InitAction): string {
  return `${action.status.padEnd(STATUS_WIDTH)}${action.path}  — ${action.note}`;
}

function reportInit(result: InitResult, check: boolean, io: CliIo): number {
  for (const action of result.actions) {
    io.out(formatAction(action));
  }

  for (const warning of result.warnings) {
    io.err(`\nwarning  ${warning}`);
  }

  if (!result.ok) {
    const stale = result.actions
      .filter((action) => action.status === 'created' || action.status === 'updated')
      .map((action) => action.path);

    if (stale.length > 0) {
      io.err(
        `\n${stale.join(', ')} ${stale.length === 1 ? 'is' : 'are'} out of date. Run \`npx vitest-auto-spy init\` to update ${stale.length === 1 ? 'it' : 'them'}.`,
      );
    }

    for (const action of result.actions.filter((candidate) => candidate.status === 'stale')) {
      io.err(`\n${action.path} is a stale copy of the shipped skill. Delete it, then run \`npx vitest-auto-spy init\`.`);
    }

    return 1;
  }

  io.out(check ? '\nUp to date.' : '\nDone. Re-run after upgrading the package; the block between the markers is regenerated.');

  return 0;
}

async function initCommand(cwd: string, argv: readonly string[], io: CliIo): Promise<number> {
  const args = parseArgs(argv);
  const check = flagEnabled(args, 'check');
  const [{ runInit }, { readProfile }] = await Promise.all([import('./init'), import('./profile')]);
  const profile = readProfile(cwd);
  const result = runInit(profile, ownVersion(), {
    check,
    dryRun: flagEnabled(args, 'dry-run'),
    uninstall: flagEnabled(args, 'uninstall'),
    ...(flagValue(args, 'only') === undefined ? {} : { only: flagList(args, 'only') }),
  });

  io.out(`vitest-auto-spy init — ${cwd}`);
  io.out(`runner: ${profile.runner}, framework: ${profile.framework}, entry: ${profile.entry}\n`);

  return reportInit(result, check, io);
}

async function codemodCommand(cwd: string, argv: readonly string[], io: CliIo): Promise<number> {
  const args = parseArgs(argv);
  const { runCodemod } = await import('./codemod/run');

  return runCodemod(
    cwd,
    {
      write: flagEnabled(args, 'write'),
      verify: flagEnabled(args, 'verify'),
      list: flagEnabled(args, 'list'),
      only: flagValue(args, 'only'),
      skip: flagValue(args, 'skip'),
      from: flagValue(args, 'from'),
      paths: args.positionals,
      format: formatOf(args),
    },
    io,
  );
}

async function ngTestCommand(cwd: string, argv: readonly string[], io: CliIo): Promise<number> {
  const args = parseArgs(argv);
  const shard = flagValue(args, 'shard');
  const [{ captureProcess, changedRef, changedRefProblem, resolveNg, runNgTest }, { spawnProcess }, { readProfile }] = await Promise.all([
    import('./ng-test'),
    import('./perf-run'),
    import('./profile'),
  ]);
  const ref = changedRef(args.flags['changed']);
  const refProblem = ref === undefined ? undefined : changedRefProblem(captureProcess, cwd, ref);

  if (refProblem !== undefined) {
    io.err(`${refProblem} Nothing ran.`);

    return 2;
  }

  return runNgTest(
    {
      cwd,
      profile: readProfile(cwd),
      target: flagValue(args, 'target'),
      shard: shard === undefined ? undefined : parseShard(shard),
      changed: ref,
      related: flagList(args, 'related'),
      dryRun: flagEnabled(args, 'dry-run'),
      passthrough: args.passthrough,
    },
    { capture: captureProcess, spawn: spawnProcess, resolveNg },
    io,
  );
}

/** Flags every command takes. `--help` and `--version` are handled before dispatch. */
const COMMON_FLAGS: readonly string[] = ['cwd', 'help', 'version'];

/**
 * Which flags each command accepts.
 *
 * Nothing rejected a flag before this table, and a parser that accepts everything makes a typo
 * invisible: `init --dryrun` wrote the files, `perf --gat` passed with no gate. Both read as green.
 */
const COMMAND_FLAGS: Readonly<Record<string, readonly string[]>> = {
  codemod: ['format', 'from', 'list', 'only', 'skip', 'verify', 'write'],
  doctor: ['code-quality', 'fail-on', 'format', 'ignore', 'min-severity'],
  init: ['check', 'dry-run', 'only', 'uninstall'],
  'ng-test': ['changed', 'dry-run', 'related', 'shard', 'target'],
  perf: [
    'ab-isolate',
    'baseline',
    'baseline-factor',
    'baseline-floor-ms',
    'changed',
    'code-quality',
    'command',
    'confirm-runs',
    'debt',
    'factor',
    'fail-on',
    'fail-on-flaky',
    'fail-on-red',
    'format',
    'gate',
    'gate-margin',
    'gate-only',
    'json',
    'max-file-ms',
    'max-file-tests',
    'max-test-ms',
    'max-wall-ms',
    'min-severity',
    'no-confirm',
    'out',
    'profile-dir',
    'top',
    'update-baseline',
  ],
};

function rejectFlags(args: ParsedArgs, command: string, accepted: readonly string[], io: CliIo): boolean {
  const unknown = Object.keys(args.flags).filter((name) => !accepted.includes(name) && !COMMON_FLAGS.includes(name));

  if (unknown.length === 0) {
    return false;
  }

  const known = [...accepted, ...COMMON_FLAGS].sort((a, b) => a.localeCompare(b));
  const guesses = unknown.map((name) =>
    accepted.includes('format') && (name === 'json' || name === 'markdown') ? `format ${name}` : nearest(name, known),
  );

  io.err(`Unknown flag for \`${command}\`: ${unknown.map((name) => `--${name}`).join(', ')}. Nothing ran.`);

  const found = guesses.filter((guess) => guess !== undefined);

  if (found.length < guesses.length) {
    io.err(`\`${command}\` accepts ${known.map((name) => `--${name}`).join(', ')}.`);
  }

  if (found.length > 0) {
    io.err(`Did you mean ${found.map((guess) => `\`--${guess}\``).join(', ')}?`);
  }

  return true;
}

const NUMBER_FLAGS: readonly string[] = [
  'baseline-factor',
  'baseline-floor-ms',
  'factor',
  'max-file-ms',
  'max-file-tests',
  'max-test-ms',
  'max-wall-ms',
  'top',
];

function isCount(value: string): boolean {
  const number = Number(value);

  return value.trim() !== '' && Number.isFinite(number) && number >= 0;
}

/** Why a flag's value cannot be used, or `undefined` when it can. */
function valueProblem(args: ParsedArgs, name: string, command: string): string | undefined {
  const value = args.flags[name];

  if (value === true && VALUE_FLAGS.has(name) && !OPTIONAL_VALUE_FLAGS.has(name)) {
    return `--${name} needs a value, as in \`--${name} <value>\`.`;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  if (VALUE_FLAGS.has(name) && (value.trim() === '' || (LIST_FLAGS.has(name) && flagList(args, name).length === 0))) {
    return `--${name} needs a value, and got an empty one.`;
  }

  if (NUMBER_FLAGS.includes(name) && !isCount(value)) {
    return `--${name} takes a number of zero or more, and got ${value}.`;
  }

  if (name === 'shard' && parseShard(value) === undefined) {
    return `--shard takes <index>/<count>, as in \`--shard 1/4\`, and got ${value}.`;
  }

  if (name === 'fail-on' && failOnOf(args) === undefined) {
    return `Unknown --fail-on value: ${value}. Accepted values: error, warning, info.`;
  }

  if (name === 'min-severity' && minSeverityOf(args) === undefined) {
    return `Unknown --min-severity value: ${value}. Accepted values: error, warning, info.`;
  }

  const unknownChecks =
    name === 'ignore' && command === 'doctor' ? flagList(args, 'ignore').filter((check) => !DOCTOR_CHECKS.includes(check)) : [];

  if (unknownChecks.length === 0) {
    return undefined;
  }

  const guesses = unknownChecks.map((check) => nearest(check, DOCTOR_CHECKS));

  return guesses.every((guess) => guess !== undefined)
    ? `Unknown check id for --ignore: ${unknownChecks.join(', ')}. Did you mean ${guesses.join(', ')}?`
    : `Unknown check id for --ignore: ${unknownChecks.join(', ')}. Known ids: ${DOCTOR_CHECKS.join(', ')}.`;
}

function rejectValues(args: ParsedArgs, command: string, io: CliIo): boolean {
  const passthrough = args.passthrough.length > 0 && command !== 'ng-test' ? ['Only `ng-test` takes arguments after `--`.'] : [];
  const problems = [...passthrough, ...Object.keys(args.flags).flatMap((name) => valueProblem(args, name, command) ?? [])];

  for (const problem of problems) {
    io.err(`${problem} Nothing ran.`);
  }

  return problems.length > 0;
}

const USAGE = 'Usage: npx vitest-auto-spy <doctor|perf|init|codemod|ng-test> [options]. Run `npx vitest-auto-spy --help` for the options.';

/** The flags a command takes, or `undefined` after saying the command is missing or unknown. */
function acceptedFlags(command: string | undefined, io: CliIo): readonly string[] | undefined {
  if (command === undefined) {
    io.err(`Missing command. ${USAGE}`);

    return undefined;
  }

  const accepted = COMMAND_FLAGS[command];

  if (accepted !== undefined) {
    return accepted;
  }

  const guess = nearest(command, Object.keys(COMMAND_FLAGS));

  io.err(
    guess === undefined
      ? `Unknown command: ${command}. ${USAGE}`
      : `Unknown command: ${command}. Did you mean \`${guess}\`? Run \`npx vitest-auto-spy --help\` for the commands.`,
  );

  return undefined;
}

/**
 * A pipe closed before the output ended — `… | head` — which Node reports as an unhandled `error`
 * event and a stack trace over a run that did exactly what it was asked.
 */
export function guardBrokenPipe(
  stream: { on(event: 'error', listener: (error: { code?: string }) => void): unknown },
  quit: () => void,
): void {
  stream.on('error', (error) => {
    if (error.code !== 'EPIPE') {
      throw error;
    }

    quit();
  });
}

/** A crash exits 2, like a refused flag: CI must not read a tool failure as the findings `--fail-on` exits 1 for. */
export async function settle(run: () => Promise<number> | number, io: CliIo): Promise<number> {
  try {
    return await run();
  } catch (error) {
    io.err(`vitest-auto-spy crashed: ${error instanceof Error ? error.message : String(error)}`);

    return 2;
  }
}

export function runCli(argv: readonly string[], io: CliIo): Promise<number> | number {
  const args = parseArgs(argv);
  const requested = flagValue(args, 'cwd');
  const cwd = resolve(requested ?? process.cwd());

  if (flagEnabled(args, 'version')) {
    io.out(ownVersion());

    return 0;
  }

  if (args.command === 'help' || flagEnabled(args, 'help')) {
    io.out(HELP);

    return 0;
  }

  const accepted = acceptedFlags(args.command, io);
  const command = String(args.command);

  if (accepted === undefined || rejectFlags(args, command, accepted, io) || rejectValues(args, command, io) || rejectFormat(args, io)) {
    return 2;
  }

  // A mistyped `--cwd` used to scan an empty tree and report "No problems found." with exit 0, which
  // reads exactly like a clean repository.
  if (requested !== undefined && !isDirectory(cwd)) {
    io.err(`--cwd ${requested} is not a directory (resolved to ${cwd}). Nothing ran.`);

    return 2;
  }

  return dispatch(command, cwd, argv, io);
}

// Each command is loaded on demand, so `--version`, `--help` and a rejected flag parse none of them.
async function dispatch(command: string, cwd: string, argv: readonly string[], io: CliIo): Promise<number> {
  if (command === 'doctor') {
    const { doctorCommand } = await import('./doctor-command');

    return doctorCommand(cwd, argv, io);
  }

  if (command === 'init') {
    return initCommand(cwd, argv, io);
  }

  if (command === 'ng-test') {
    return ngTestCommand(cwd, argv, io);
  }

  if (command === 'perf') {
    const { perfCommand } = await import('./perf-command');

    return perfCommand(cwd, argv, io);
  }

  return codemodCommand(cwd, argv, io);
}
