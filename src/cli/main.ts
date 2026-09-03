/**
 * Command dispatch and rendering. Kept separate from `src/cli.ts` so the executable is three lines
 * and everything under test is a function that takes an argv and a sink and returns an exit code.
 */
import { resolve } from 'node:path';

import { flagEnabled, flagValue, parseArgs } from './args';
import { runCodemod } from './codemod/run';
import { runDoctor } from './doctor';
import { HELP } from './help';
import { runInit } from './init';
import type { InitAction, InitResult } from './init';
import { renderPerf } from './perf';
import { readPerfRun } from './perf-run';
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

function perfCommand(cwd: string, argv: readonly string[], io: CliIo): number {
  const args = parseArgs(argv);
  const source = readPerfRun({ cwd, json: flagValue(args, 'json'), out: flagValue(args, 'out'), paths: args.positionals });

  return renderPerf(source, cwd, io);
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
