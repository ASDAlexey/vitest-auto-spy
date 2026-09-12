/**
 * Command dispatch and rendering. Kept separate from `src/cli.ts` so the executable is three lines
 * and everything under test is a function that takes an argv and a sink and returns an exit code.
 */
import { resolve } from 'node:path';

import type { ParsedArgs } from './args';
import { flagEnabled, flagList, flagNumber, flagValue, parseArgs } from './args';
import { runCodemod } from './codemod/run';
import { runDoctor } from './doctor';
import { HELP } from './help';
import { runInit } from './init';
import type { InitAction, InitResult } from './init';
import type { BaselineRequest, GateRequest } from './perf';
import { renderPerf } from './perf';
import { BASELINE_DEFAULTS, DEFAULT_BASELINE_FILE } from './perf-baseline';
import { CASE_FLOOR_MS } from './perf-data';
import type { GateOptions } from './perf-gate';
import { GATE_DEFAULTS } from './perf-gate';
import type { PerfRunOptions } from './perf-run';
import { perfRemeasure, readPerfRun } from './perf-run';
import { readProfile } from './profile';
import { formatFindings, hasFailures, summarize } from './report';
import { ownVersion } from './self';

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const STATUS_WIDTH = 10;

function doctorCommand(cwd: string, io: CliIo): number {
  const profile = readProfile(cwd);
  const findings = runDoctor(profile);

  io.out(`vitest-auto-spy doctor — ${cwd}`);
  io.out(`${profile.files.length} files, runner: ${profile.runner}, entry: ${profile.entry}\n`);

  if (findings.length === 0) {
    io.out('No problems found.');

    return 0;
  }

  io.out(formatFindings(findings));
  io.out(`\n${summarize(findings)}`);

  return hasFailures(findings) ? 1 : 0;
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
    ? { options: gateOptions(args), remeasure: trustSingle ? undefined : perfRemeasure(options), trustSingle }
    : undefined;
  const baseline = baselineRequest(args, cwd);
  const top = flagNumber(args, 'top');

  return renderPerf(readPerfRun(options), profile, io, {
    ...(gate === undefined ? {} : { gate }),
    ...(baseline === undefined ? {} : { baseline }),
    ...(top === undefined ? {} : { top }),
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
    io.err('\nThe agent instructions are out of date. Run `npx vitest-auto-spy init`.');

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

export function runCli(argv: readonly string[], io: CliIo): number {
  const args = parseArgs(argv);
  const cwd = resolve(flagValue(args, 'cwd') ?? process.cwd());

  if (flagEnabled(args, 'version')) {
    io.out(ownVersion());

    return 0;
  }

  if (args.command === undefined || args.command === 'help' || flagEnabled(args, 'help')) {
    io.out(HELP);

    return args.command === undefined && !flagEnabled(args, 'help') ? 2 : 0;
  }

  if (args.command === 'doctor') {
    return doctorCommand(cwd, io);
  }

  if (args.command === 'init') {
    return initCommand(cwd, argv, io);
  }

  if (args.command === 'perf') {
    return perfCommand(cwd, argv, io);
  }

  if (args.command === 'codemod') {
    return codemodCommand(cwd, argv, io);
  }

  io.err(`Unknown command: ${args.command}\n`);
  io.err(HELP);

  return 2;
}
