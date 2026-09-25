/**
 * Command dispatch and rendering. Kept separate from `src/cli.ts` so the executable is three lines
 * and everything under test is a function that takes an argv and a sink and returns an exit code.
 */
import { resolve } from 'node:path';

import type { ParsedArgs } from './args';
import { VALUE_FLAGS, flagEnabled, flagList, flagNumber, flagValue, parseArgs } from './args';
import { isSpecFile } from './checks/graph';
import { writeCodeQuality } from './code-quality';
import { runCodemod } from './codemod/run';
import { DOCTOR_CHECKS } from './docs';
import { doctorDocument, runDoctor } from './doctor';
import { isDirectory } from './fs-scan';
import { HELP } from './help';
import { runInit } from './init';
import type { InitAction, InitResult } from './init';
import type { BaselineRequest, GateRequest, OutputFormat } from './perf';
import { renderPerf } from './perf';
import { BASELINE_DEFAULTS, DEFAULT_BASELINE_FILE } from './perf-baseline';
import { CASE_FLOOR_MS } from './perf-data';
import type { GateOptions } from './perf-gate';
import { GATE_DEFAULTS } from './perf-gate';
import type { PerfRunOptions } from './perf-run';
import { perfRemeasure, readPerfRun, spawnProcess, spawnToStderr } from './perf-run';
import { readProfile } from './profile';
import { type Severity, formatFindings, hasFailures, summarize } from './report';
import { doctorMarkdown } from './report-markdown';
import { ownVersion } from './self';
import { nearest } from './suggest';

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const STATUS_WIDTH = 10;

const SEVERITIES: Readonly<Record<string, Severity>> = { error: 'error', warning: 'warning', warn: 'warning', info: 'info' };

function minSeverityOf(args: ParsedArgs): Severity | undefined {
  const raw = flagValue(args, 'min-severity')?.trim().toLowerCase();

  return raw === undefined ? undefined : SEVERITIES[raw];
}

/** `--format`: `text` unless asked otherwise, and `undefined` for a word that is neither. */
function formatOf(args: ParsedArgs): OutputFormat | undefined {
  const raw = flagValue(args, 'format')?.trim().toLowerCase() ?? 'text';

  return raw === 'json' || raw === 'markdown' || raw === 'text' ? raw : undefined;
}

function rejectFormat(args: ParsedArgs, io: CliIo): boolean {
  if (formatOf(args) !== undefined) {
    return false;
  }

  io.err(`Unknown --format value: ${String(flagValue(args, 'format'))}. Accepted values: text, json, markdown. Nothing ran.`);

  return true;
}

function doctorCommand(cwd: string, argv: readonly string[], io: CliIo): number {
  const args = parseArgs(argv);
  const profile = readProfile(cwd);
  const ignored = new Set(flagList(args, 'ignore'));
  const findings = runDoctor(profile).filter((finding) => !ignored.has(finding.check));
  const minSeverity = minSeverityOf(args);
  const codeQuality = flagValue(args, 'code-quality');
  const exitCode = hasFailures(findings) ? 1 : 0;
  const specFiles = profile.files.filter(isSpecFile).length;

  if (codeQuality !== undefined) {
    writeCodeQuality(resolve(cwd, codeQuality), findings, minSeverity);
  }

  const format = formatOf(args);

  if (format === 'json' || format === 'markdown') {
    const document = doctorDocument(profile, findings, exitCode);

    io.out(format === 'markdown' ? doctorMarkdown(document) : JSON.stringify(document, undefined, 2));

    return exitCode;
  }

  io.out(`vitest-auto-spy doctor — ${cwd}`);
  io.out(`${profile.files.length} files scanned, ${specFiles} of them spec files — runner: ${profile.runner}, entry: ${profile.entry}\n`);

  const report = findings.length === 0 ? 'No problems found.' : formatFindings(findings, minSeverity);

  if (report !== '') {
    io.out(`${report}\n`);
  }

  io.out(summarize(findings, minSeverity));

  return exitCode;
}

/**
 * `perf`, including the gate. The options are read here rather than inside the command so that the
 * profile is scanned once and handed to both the run and the report.
 *
 * Every budget is clamped rather than trusted. A zero or a negative one is not a stricter gate, it
 * is a gate that reports every file in the repository — including the ones that ran nothing — and
 * the person who typed it would then switch the whole thing off rather than debug the flag.
 */
function gateOptions(args: ParsedArgs): GateOptions {
  return {
    maxTestMs: Math.max(flagNumber(args, 'max-test-ms') ?? GATE_DEFAULTS.maxTestMs, CASE_FLOOR_MS),
    maxFileMs: Math.max(flagNumber(args, 'max-file-ms') ?? GATE_DEFAULTS.maxFileMs, 1),
    maxFileTests: Math.max(flagNumber(args, 'max-file-tests') ?? GATE_DEFAULTS.maxFileTests, 0),
    factor: Math.max(flagNumber(args, 'factor') ?? GATE_DEFAULTS.factor, 1),
    maxWallMs: flagNumber(args, 'max-wall-ms'),
    only: flagList(args, 'gate-only').map((entry) => entry.replace(/^\.\//, '')),
  };
}

/**
 * The baseline is resolved against `--cwd`, not against wherever the shell happens to be.
 *
 * It is the repository's file — it is committed and diffed with the suite it describes — so a
 * `--cwd` run that wrote `perf-baseline.json` next to the caller instead would put one repository's
 * ratchet in another repository's tree. Which is exactly what it did once, into this package's own
 * root, during the run that found it.
 */
function baselineRequest(args: ParsedArgs, cwd: string): BaselineRequest | undefined {
  const update = flagEnabled(args, 'update-baseline');
  const named = flagValue(args, 'baseline') ?? (update ? DEFAULT_BASELINE_FILE : undefined);

  if (named === undefined) {
    return undefined;
  }

  return {
    path: resolve(cwd, named),
    update,
    options: {
      factor: Math.max(flagNumber(args, 'baseline-factor') ?? BASELINE_DEFAULTS.factor, 1),
      floorMs: Math.max(flagNumber(args, 'baseline-floor-ms') ?? BASELINE_DEFAULTS.floorMs, 1),
    },
  };
}

function perfCommand(cwd: string, argv: readonly string[], io: CliIo): number {
  const args = parseArgs(argv);
  const format = formatOf(args);
  const spawn = format === 'json' || format === 'markdown' ? spawnToStderr : spawnProcess;
  const profile = readProfile(cwd);
  const options: PerfRunOptions = {
    cwd,
    profile,
    json: flagValue(args, 'json'),
    out: flagValue(args, 'out'),
    command: flagValue(args, 'command'),
    paths: args.positionals,
  };
  const trustSingle = flagEnabled(args, 'no-confirm');
  const gate: GateRequest | undefined = flagEnabled(args, 'gate')
    ? { options: gateOptions(args), remeasure: trustSingle ? undefined : perfRemeasure(options, spawn), trustSingle }
    : undefined;
  const baseline = baselineRequest(args, cwd);
  const top = flagNumber(args, 'top');
  const minSeverity = minSeverityOf(args);
  const codeQuality = flagValue(args, 'code-quality');

  return renderPerf(readPerfRun(options, spawn), profile, io, {
    budgets: gateOptions(args),
    ...(format === 'json' || format === 'markdown' ? { format } : {}),
    ...(gate === undefined ? {} : { gate }),
    ...(baseline === undefined ? {} : { baseline }),
    ...(top === undefined ? {} : { top }),
    ...(minSeverity === undefined ? {} : { minSeverity }),
    ...(codeQuality === undefined ? {} : { codeQuality: resolve(cwd, codeQuality) }),
    ...(flagEnabled(args, 'fail-on-flaky') ? { failOnFlaky: true } : {}),
    ...(flagEnabled(args, 'fail-on-red') ? { failOnRed: true } : {}),
  });
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

    io.err(
      `\n${stale.join(', ')} ${stale.length === 1 ? 'is' : 'are'} out of date. Run \`npx vitest-auto-spy init\` to update ${stale.length === 1 ? 'it' : 'them'}.`,
    );

    return 1;
  }

  io.out(check ? '\nUp to date.' : '\nDone. Re-run after upgrading the package; the block between the markers is regenerated.');

  return 0;
}

function initCommand(cwd: string, argv: readonly string[], io: CliIo): number {
  const args = parseArgs(argv);
  const check = flagEnabled(args, 'check');
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

function codemodCommand(cwd: string, argv: readonly string[], io: CliIo): number {
  const args = parseArgs(argv);

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
    },
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
  codemod: ['from', 'list', 'only', 'skip', 'verify', 'write'],
  doctor: ['code-quality', 'format', 'ignore', 'min-severity'],
  init: ['check', 'dry-run', 'only', 'uninstall'],
  perf: [
    'baseline',
    'baseline-factor',
    'baseline-floor-ms',
    'code-quality',
    'command',
    'factor',
    'fail-on-flaky',
    'fail-on-red',
    'format',
    'gate',
    'gate-only',
    'json',
    'max-file-ms',
    'max-file-tests',
    'max-test-ms',
    'max-wall-ms',
    'min-severity',
    'no-confirm',
    'out',
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

  if (value === true && VALUE_FLAGS.has(name)) {
    return `--${name} needs a value, as in \`--${name} <value>\`.`;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  if (NUMBER_FLAGS.includes(name) && !isCount(value)) {
    return `--${name} takes a number of zero or more, and got ${value}.`;
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
  const problems = Object.keys(args.flags).flatMap((name) => valueProblem(args, name, command) ?? []);

  for (const problem of problems) {
    io.err(`${problem} Nothing ran.`);
  }

  return problems.length > 0;
}

const USAGE = 'Usage: npx vitest-auto-spy <doctor|perf|init|codemod> [options]. Run `npx vitest-auto-spy --help` for the options.';

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

export function runCli(argv: readonly string[], io: CliIo): number {
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

  if (command === 'doctor') {
    return doctorCommand(cwd, argv, io);
  }

  if (command === 'init') {
    return initCommand(cwd, argv, io);
  }

  return command === 'perf' ? perfCommand(cwd, argv, io) : codemodCommand(cwd, argv, io);
}
