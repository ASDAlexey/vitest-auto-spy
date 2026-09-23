/**
 * The two halves of `perf` that read or write something besides the terminal: the baseline and the
 * `--format json` document.
 */
import type { CliIo } from './main';
import type { BaselineRequest, GateRequest, PerfAnalysis, PerfOptions } from './perf';
import type { PerfBaseline } from './perf-baseline';
import { baselineDrift, baselineRegressions, buildBaseline, readBaseline, writeBaseline } from './perf-baseline';
import type { PerfRun, Phase } from './perf-data';
import { formatMs, testsRunOf } from './perf-data';
import type { GateCandidate, GateOptions, GateRow } from './perf-gate';
import { GATE_DEFAULTS, measuredFiles, medianFileMs, medianTestMs } from './perf-gate';
import { HISTORY_LIMIT, appendHistory, historyCandidates, historyEntry, isHistoryPath } from './perf-history';
import type { PerfSource } from './perf-run';
import type { Profile } from './profile';
import { type Finding, REPORT_SCHEMA, type Tally, findingJson, sortFindings, tallyOf } from './report';
import { ownVersion } from './self';

/** Everything a run decided, collected while the text is printed so `--format json` can say the same. */
export interface Collected {
  readonly findings: Finding[];
  readonly rows: GateRow[];
  analysis?: PerfAnalysis;
  run?: PerfRun;
  gate?: 'judged' | 'refused' | 'skipped';
}

/**
 * The baseline half: record this run, or turn what grew since the last recording into candidates the
 * gate judges like any other.
 *
 * A regression arrives as milliseconds rather than as the ratio it was detected by, because the
 * confirmation pass measures a clock and a reader checks one. `wasRatio × factor × this run's median
 * file` is what the recorded share is worth here, and a file over that is a file that grew.
 */
export function baselineCandidates(run: PerfRun, cwd: string, request: BaselineRequest, io: CliIo): GateCandidate[] {
  if (isHistoryPath(request.path)) {
    return historyCandidates(run, cwd, request.path, request.options, io);
  }

  const baseline = readBaseline(request.path);

  if (baseline === undefined) {
    io.err(`\nwarning  No baseline to compare against at ${request.path}. Record one with --update-baseline.`);

    return [];
  }

  const median = medianFileMs(measuredFiles(run, cwd).values());
  const drift = baselineDrift(run, cwd, baseline);

  if (drift.added.length > 0 || drift.missing.length > 0) {
    io.out(
      `\nperf baseline: ${drift.added.length} files this run measured are not in it, ${drift.missing.length} it knows were not measured here. Neither is a finding.`,
    );
  }

  return baselineRegressions(run, cwd, baseline, request.options).map((regression) => ({
    check: 'perf-gate-regression' as const,
    file: regression.file,
    ms: regression.ms,
    budget: regression.wasRatio * request.options.factor * median,
    grewBy: regression.grewBy,
    budgetNote: `${request.options.factor}× its recorded share of the run, from ${request.path}`,
  }));
}

export function recordBaseline(run: PerfRun, cwd: string, path: string, io: CliIo): void {
  if (isHistoryPath(path)) {
    const entry = historyEntry(run, cwd, new Date(), process.env);
    const runs = appendHistory(path, entry);

    io.out(
      `\nperf history: recorded ${Object.keys(entry.files).length} files at a median of ${formatMs(entry.median)} into ${path}, which now holds ${runs} of the last ${HISTORY_LIMIT} runs. Keep it in the CI cache or an artifact; record only from the default branch.`,
    );

    return;
  }

  const baseline = buildBaseline(run, cwd);

  writeBaseline(path, baseline);
  io.out(
    `\nperf baseline: recorded ${Object.keys(baseline.files).length} files at a median of ${formatMs(baseline.median)} into ${path}. Commit it — it is only worth what the next reader can diff.`,
  );
}

export function budgetsOf(options: PerfOptions): GateOptions {
  return options.gate?.options ?? options.budgets ?? GATE_DEFAULTS;
}

/** How a candidate could be confirmed: re-measured on its own, taken on one reading, or neither. */
function confirmationOf(gate: GateRequest): 'remeasure' | 'single-reading' | 'unavailable' {
  if (gate.trustSingle) {
    return 'single-reading';
  }

  return gate.remeasure === undefined ? 'unavailable' : 'remeasure';
}

/** Rows of the report's own tables, so a CI summary need not parse the raw reporter file. */
const SLOWEST_FILES_DEFAULT = 10;

export interface SlowFile {
  readonly file: string;
  readonly totalMs: number;
  readonly tests: number;
  readonly phases: Readonly<Record<'environment' | 'import' | 'prepare' | 'setup' | 'tests', number>>;
}

/** The `--format json` document, which `--format markdown` renders too. */
export interface PerfDocument {
  readonly schema: number;
  readonly command: 'perf';
  readonly version: string;
  readonly cwd: string;
  readonly exitCode: number;
  readonly error?: string;
  readonly run: {
    readonly files: number;
    readonly tests: number;
    readonly failed: boolean;
    readonly wallMs: number;
    readonly cpuMs: number;
    readonly medianTestMs: number;
    readonly medianFileMs: number;
    readonly phases: readonly Phase[];
    readonly slowestFiles: readonly SlowFile[];
  } | null;
  readonly budgets: Omit<GateOptions, 'maxWallMs'> & { readonly maxWallMs: number | null };
  readonly gate: {
    readonly status: 'judged' | 'refused' | 'skipped';
    readonly confirmation: 'remeasure' | 'single-reading' | 'unavailable';
    readonly verdicts: readonly GateRow[];
  } | null;
  readonly tally: Tally;
  readonly findings: readonly Finding[];
}

function slowestFiles(run: PerfRun, cwd: string, top: number | undefined): SlowFile[] {
  return [...measuredFiles(run, cwd)]
    .map(([file, row]) => {
      const phases = { environment: row.environment, prepare: row.prepare, setup: row.setup, import: row.imports, tests: row.tests };

      return { file, totalMs: Object.values(phases).reduce((sum, ms) => sum + ms, 0), tests: row.testCount, phases };
    })
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, top ?? SLOWEST_FILES_DEFAULT);
}

/**
 * The `--format json` document. Its fields only ever grow; one that changes meaning or goes away
 * raises `schema`.
 */
export function perfJson(source: PerfSource, profile: Profile, options: PerfOptions, collected: Collected, exitCode: number): PerfDocument {
  const gate = budgetsOf(options);
  const measured = collected.run === undefined ? [] : [...measuredFiles(collected.run, profile.cwd).values()];

  return {
    schema: REPORT_SCHEMA,
    command: 'perf',
    version: ownVersion(),
    cwd: profile.cwd,
    exitCode,
    ...(source.ok ? {} : { error: source.error }),
    run:
      collected.run === undefined || collected.analysis === undefined
        ? null
        : {
            files: collected.analysis.fileCount,
            tests: testsRunOf(collected.run),
            failed: source.ok && source.runFailed,
            wallMs: collected.run.wall,
            cpuMs: collected.analysis.total,
            medianTestMs: medianTestMs(measured),
            medianFileMs: medianFileMs(measured),
            phases: collected.analysis.phases,
            slowestFiles: slowestFiles(collected.run, profile.cwd, options.top),
          },
    budgets: { ...gate, maxWallMs: gate.maxWallMs ?? null },
    gate:
      options.gate === undefined
        ? null
        : { status: collected.gate ?? 'skipped', confirmation: confirmationOf(options.gate), verdicts: collected.rows },
    tally: tallyOf(collected.findings),
    findings: sortFindings(collected.findings).map(findingJson),
  };
}

/** The committed baseline the tables compare against: a plain one being read, not recorded and not a history. */
export function tableBaseline(request: BaselineRequest | undefined): PerfBaseline | undefined {
  return request === undefined || request.update || isHistoryPath(request.path) ? undefined : readBaseline(request.path);
}
