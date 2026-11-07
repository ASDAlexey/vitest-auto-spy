import { resolve } from 'node:path';

import type { ParsedArgs } from './args';
import { flagEnabled, flagList, flagNumber, flagValue, parseArgs } from './args';
import { failOnOf, formatOf, minSeverityOf } from './cli-options';
import type { CliIo } from './main';
import { captureProcess, changedRef, changedRefProblem } from './ng-test';
import type { BaselineRequest, GateRequest } from './perf';
import { renderPerf } from './perf';
import { gateScope } from './perf-attribution';
import { BASELINE_DEFAULTS, DEFAULT_BASELINE_FILE } from './perf-baseline';
import { CASE_FLOOR_MS } from './perf-data';
import type { GateOptions } from './perf-gate';
import { GATE_DEFAULTS } from './perf-gate';
import type { PerfRunOptions } from './perf-run';
import { perfAbIsolate, perfRemeasure, readPerfRun, spawnProcess, spawnToStderr } from './perf-run';
import type { Profile } from './profile';
import { readProfile } from './profile';
import { ownPackageRoot } from './self';

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

/**
 * `--changed`, `--debt`, `--gate-margin` and `--confirm-runs`: who a finding belongs to, and how sure
 * the gate has to be. A `--debt` it does not know is refused out loud rather than read as `fail`,
 * because the person who typed `--debt=warm` meant the opposite of what silence would give them.
 */
function attributionOptions(args: ParsedArgs, profile: Profile, io: CliIo): Pick<GateRequest, 'confirmRuns' | 'debt' | 'margin' | 'scope'> {
  const ref = changedRef(args.flags['changed']);
  const scope = ref === undefined ? undefined : gateScope(profile, ref, captureProcess, io.err);
  const debt = flagValue(args, 'debt');
  const margin = flagNumber(args, 'gate-margin');
  const confirmRuns = flagNumber(args, 'confirm-runs');

  if (debt !== undefined && debt !== 'warn' && debt !== 'fail') {
    io.err(`warning  --debt takes warn or fail, not ${debt}; judging known debt as a failure.\n`);
  }

  return {
    ...(scope === undefined ? {} : { scope }),
    ...(debt === 'warn' ? { debt: 'warn' as const } : {}),
    ...(margin === undefined ? {} : { margin: Math.max(margin, 1) }),
    ...(confirmRuns === undefined ? {} : { confirmRuns: Math.min(Math.max(Math.floor(confirmRuns), 1), MAX_CONFIRM_RUNS) }),
  };
}

/** Each pass re-runs the suspects once more; past this the gate costs more than the suite it judges. */
const MAX_CONFIRM_RUNS = 5;

const PROFILE_DIR_UNUSED =
  "warning  --profile-dir keeps the profiles the gate's confirmation pass records, and this run has no such pass: add --gate, without --no-confirm, on a source it can run again — a run, a --command with {paths}, or a report that recorded its Vitest config.\n";

function rejectChangedRef(args: ParsedArgs, cwd: string, io: CliIo): boolean {
  const ref = changedRef(args.flags['changed']);
  const problem = ref === undefined ? undefined : changedRefProblem(captureProcess, cwd, ref);

  if (problem !== undefined) {
    io.err(`${problem} Nothing ran.`);
  }

  return problem !== undefined;
}

export function perfCommand(cwd: string, argv: readonly string[], io: CliIo): number {
  const args = parseArgs(argv);

  return rejectChangedRef(args, cwd, io) ? 2 : measure(cwd, args, io);
}

function measure(cwd: string, args: ParsedArgs, io: CliIo): number {
  const format = formatOf(args);
  const spawn = format === 'json' || format === 'markdown' ? spawnToStderr : spawnProcess;
  const profile = readProfile(cwd);
  const keepProfiles = flagValue(args, 'profile-dir');
  const options: PerfRunOptions = {
    cwd,
    profile,
    json: flagValue(args, 'json'),
    out: flagValue(args, 'out'),
    command: flagValue(args, 'command'),
    paths: args.positionals,
    ...(keepProfiles === undefined ? {} : { keepProfiles: resolve(cwd, keepProfiles) }),
  };
  const trustSingle = flagEnabled(args, 'no-confirm');
  // A handed-over report is read before the gate is built: the configs it recorded decide whether it can be re-measured.
  const handed = options.json === undefined ? undefined : readPerfRun(options, spawn);
  const recorded = handed?.ok === true ? handed.run : undefined;
  const gate: GateRequest | undefined = flagEnabled(args, 'gate')
    ? {
        options: gateOptions(args),
        remeasure: trustSingle ? undefined : perfRemeasure(options, spawn, ownPackageRoot(), recorded),
        trustSingle,
        ...attributionOptions(args, profile, io),
      }
    : undefined;

  if (keepProfiles !== undefined && gate?.remeasure === undefined) {
    io.err(PROFILE_DIR_UNUSED);
  }

  const baseline = baselineRequest(args, cwd);
  const top = flagNumber(args, 'top');
  const minSeverity = minSeverityOf(args);
  const failOn = failOnOf(args);
  const codeQuality = flagValue(args, 'code-quality');

  return renderPerf(handed ?? readPerfRun(options, spawn), profile, io, {
    budgets: gateOptions(args),
    ...(format === 'json' || format === 'markdown' ? { format } : {}),
    ...(gate === undefined ? {} : { gate }),
    ...(baseline === undefined ? {} : { baseline }),
    ...(top === undefined ? {} : { top }),
    ...(minSeverity === undefined ? {} : { minSeverity }),
    ...(codeQuality === undefined ? {} : { codeQuality: resolve(cwd, codeQuality) }),
    ...(flagEnabled(args, 'fail-on-flaky') ? { failOnFlaky: true } : {}),
    ...(flagEnabled(args, 'fail-on-red') ? { failOnRed: true } : {}),
    ...(failOn === undefined ? {} : { failOn }),
    ...(flagEnabled(args, 'ab-isolate') ? { abIsolate: { rerun: perfAbIsolate(options, spawn) } } : {}),
  });
}
