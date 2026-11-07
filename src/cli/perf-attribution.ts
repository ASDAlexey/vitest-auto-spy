/**
 * Whose a gate finding is, decided before anything is re-measured.
 *
 * The gate fails a merge request, so the person it fails has to be the one who can fix what it
 * names. A budget alone cannot tell them apart: a spec that has been over budget on the default
 * branch for a month fails every merge request opened since, and the author of each one is handed a
 * file they never opened. Two facts settle it, and each one is opt-in because each needs something
 * the report does not carry:
 *
 * - **The change** (`--changed <ref>`): which spec files the diff reaches through the import graph.
 *   A finding in a file it does not reach is not this change's, whatever the file costs.
 * - **The reference** (`--debt warn` with `--baseline`): what the file and its slow bodies cost when
 *   the baseline or history was recorded. A finding that was already there is debt, not news.
 *
 * Both only ever turn a failure into a warning, never the other way round, and a finding they excuse
 * is still printed, with the reason — a gate that hides the slow file is as useless as one that
 * blames the wrong person for it. A regression against the reference is never debt: growing is
 * exactly what the reference exists to catch.
 */
import { posix } from 'node:path';

import { type Capture, changedFiles, workspaceSetupFiles } from './ng-test';
import { affectedSpecs } from './ng-test-select';
import type { GateRequest } from './perf';
import type { PerfBaseline } from './perf-baseline';
import { readBaseline } from './perf-baseline';
import { formatMs, medianOf } from './perf-data';
import type { PerfRun } from './perf-data';
import type { GateCandidate, VerdictPolicy } from './perf-gate';
import { measuredFiles, medianFileMs } from './perf-gate';
import { isHistoryPath, readHistory } from './perf-history';
import type { HistoryEntry } from './perf-history';
import type { Profile } from './profile';

/** The spec files a change reaches, or the reason every file is judged. */
export type GateScope =
  | { readonly ref: string; readonly all: false; readonly changed: number; readonly specs: ReadonlySet<string> }
  | { readonly ref: string; readonly all: true; readonly reason: string };

/** What a file and its slow bodies cost in the reference, as shares of that run's median file. */
export interface DebtReference {
  readonly path: string;
  readonly files: Readonly<Record<string, number>>;
  readonly tests: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export type Excuse = { readonly outcome: 'known debt' | 'outside change'; readonly note: string };

/**
 * A finding is debt when the reference already had it within this distance of the budget. Not at
 * the budget: a file that sat at 95 % of it on the default branch and reads 105 % here moved with
 * the runner, not with the diff, and the regression check is what catches a file that really grew.
 */
export const DEBT_SHARE = 0.8;

/**
 * The commit the change is measured from. Against a branch that moved on, a plain diff also lists
 * every file the branch changed since — the right direction to be wrong in, so a merge base that
 * cannot be computed (a shallow clone) falls back to the ref itself.
 */
function baseOf(capture: Capture, cwd: string, ref: string): string {
  if (ref === 'HEAD') {
    return ref;
  }

  const result = capture('git', ['merge-base', ref, 'HEAD'], cwd);
  const sha = result.stdout.trim();

  return result.status === 0 && sha !== '' ? sha : ref;
}

/**
 * What `--changed` makes of the repository. `undefined`, with the reason on `io`'s error side, when
 * git could not say: then the gate judges every file, because a scope that failed must not read as
 * a change that touched nothing.
 */
export function gateScope(profile: Profile, ref: string, capture: Capture, err: (line: string) => void): GateScope | undefined {
  const changed = changedFiles(capture, profile.cwd, baseOf(capture, profile.cwd, ref));

  if (typeof changed === 'string') {
    err(
      `\nwarning  --changed ${ref}: ${changed}\nThe gate judges every file instead. In CI, fetch the base commit — a clone of depth 1 does not have it.`,
    );

    return undefined;
  }

  if (profile.filesTruncated) {
    err(
      `\nwarning  --changed ${ref}: the scan stopped at its file limit, so the import graph may miss the spec a change reaches. The gate judges every file instead.`,
    );

    return { ref, all: true, reason: 'the import graph is incomplete' };
  }

  const affected = affectedSpecs(
    profile,
    changed.map((file) => posix.normalize(file)),
    workspaceSetupFiles(profile),
  );

  return affected.all ? { ref, all: true, reason: affected.reason } : { ref, all: false, changed: changed.length, specs: affected.specs };
}

/** One line before the verdict, so a reader knows which files the gate was allowed to fail on. */
export function describeScope(scope: GateScope): string {
  if (scope.all) {
    return `perf gate: every file is judged — against ${scope.ref}, ${scope.reason}.`;
  }

  if (scope.changed === 0) {
    return `perf gate: nothing changed against ${scope.ref}, so no finding is this change's — each one is reported, none fails the run.`;
  }

  return `perf gate: judging the ${scope.specs.size} spec ${scope.specs.size === 1 ? 'file' : 'files'} that ${scope.changed} changed ${scope.changed === 1 ? 'file reaches' : 'files reach'} against ${scope.ref}; a finding anywhere else is reported, not failed.`;
}

function medianRecord(records: readonly Readonly<Record<string, number>>[]): Record<string, number> {
  const values = new Map<string, number[]>();

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      values.set(key, [...(values.get(key) ?? []), value]);
    }
  }

  return Object.fromEntries([...values].map(([key, list]) => [key, medianOf(list)]));
}

/**
 * A body missing from a run that did record the file's bodies ran under `CASE_FLOOR_MS` there, so it
 * counts as 0 rather than dropping out — or one slow run among fast ones would become the median.
 */
function medianTests(entries: readonly HistoryEntry[], spec: string): Record<string, number> {
  const runs = entries.filter((entry) => entry.tests !== undefined && (entry.files[spec] !== undefined || entry.tests[spec] !== undefined));
  const names = new Set(runs.flatMap((entry) => Object.keys(entry.tests?.[spec] ?? {})));

  return Object.fromEntries([...names].map((name) => [name, medianOf(runs.map((entry) => entry.tests?.[spec]?.[name] ?? 0))]));
}

function fromBaseline(path: string, baseline: PerfBaseline): DebtReference {
  return { path, files: baseline.files, tests: baseline.tests ?? {} };
}

/**
 * The reference debt is read from: a committed baseline as recorded, or a history as the median of
 * its runs — the typical cost, so neither one unlucky run nor one lucky one decides what is debt.
 */
export function debtReference(path: string): DebtReference | undefined {
  if (!isHistoryPath(path)) {
    const baseline = readBaseline(path);

    return baseline === undefined ? undefined : fromBaseline(path, baseline);
  }

  const entries = readHistory(path);

  if (entries.length === 0) {
    return undefined;
  }

  const paths = new Set(entries.flatMap((entry) => Object.keys(entry.tests ?? {})));
  const tests = Object.fromEntries([...paths].map((spec) => [spec, medianTests(entries, spec)]));

  return { path, files: medianRecord(entries.map((entry) => entry.files)), tests };
}

/** What the reference recorded for this candidate, in this run's milliseconds. */
function referenceMs(candidate: GateCandidate, reference: DebtReference, medianFile: number): number | undefined {
  if (candidate.check === 'perf-gate-slow-file') {
    const share = reference.files[candidate.file];

    return share === undefined ? undefined : share * medianFile;
  }

  if (candidate.check === 'perf-gate-slow-test') {
    const share = reference.tests[candidate.file]?.[candidate.name];

    return share === undefined ? undefined : share * medianFile;
  }

  return undefined;
}

export interface Attribution {
  readonly scope?: GateScope;
  readonly debt?: DebtReference;
  /** This run's median file, which turns the reference's shares into this run's milliseconds. */
  readonly medianFile: number;
}

/**
 * Why a candidate fails nothing before it is measured again, or `undefined` when it is judged. The
 * change comes first: a file the diff does not reach is not this change's, debt or not.
 */
export function excuseOf(candidate: GateCandidate, attribution: Attribution): Excuse | undefined {
  if (candidate.check === 'perf-gate-wall') {
    return undefined;
  }

  const scope = attribution.scope;

  if (scope !== undefined && !scope.all && !scope.specs.has(candidate.file)) {
    return {
      outcome: 'outside change',
      note: `This change does not reach the file — nothing changed against ${scope.ref} is imported by it — so it is reported, not failed.`,
    };
  }

  const was = attribution.debt === undefined ? undefined : referenceMs(candidate, attribution.debt, attribution.medianFile);

  if (attribution.debt !== undefined && was !== undefined && was >= candidate.budget * DEBT_SHARE) {
    return {
      outcome: 'known debt',
      note: `It was already this slow in ${attribution.debt.path} — ${formatMs(was)} there, on this run's scale — so it is known debt, reported and not failed.`,
    };
  }

  return undefined;
}

/** The excuses `--changed` and `--debt warn` allow, and the margin, as the verdict takes them. */
export function verdictPolicy(
  run: PerfRun,
  cwd: string,
  gate: Pick<GateRequest, 'debt' | 'margin' | 'scope'>,
  baselinePath: string | undefined,
  err: (line: string) => void,
): VerdictPolicy {
  const debt = gate.debt === 'warn' && baselinePath !== undefined ? debtReference(baselinePath) : undefined;

  if (gate.debt === 'warn' && debt === undefined) {
    err(
      `\nwarning  --debt warn has nothing to read debt from: ${baselinePath === undefined ? 'pass --baseline with it' : `no readable baseline or history at ${baselinePath}`}. Every finding is judged as new.`,
    );
  }

  const attribution: Attribution = {
    ...(gate.scope === undefined ? {} : { scope: gate.scope }),
    ...(debt === undefined ? {} : { debt }),
    medianFile: medianFileMs(measuredFiles(run, cwd).values()),
  };

  return {
    ...(gate.scope === undefined && debt === undefined ? {} : { excuse: (candidate: GateCandidate) => excuseOf(candidate, attribution) }),
    ...(gate.margin === undefined ? {} : { margin: gate.margin }),
  };
}
