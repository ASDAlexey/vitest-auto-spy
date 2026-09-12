/**
 * `perf` — where a suite's time actually goes, and which files to act on.
 *
 * The summary line Vitest prints is one number per phase for the whole run, and it is the only
 * place they surface. Reading it tells you environment setup is 56 % of the CPU time; it does not
 * tell you which of your 1 400 spec files never needed a DOM. Every finding below therefore names
 * files, from the measurement and the repository's own import graph, and states the rule it used —
 * advice a reader cannot check is advice a reader has to trust.
 */
import { findBarrelImports } from './checks/barrels';
import { DOM_FREE_RULE, findDomFreeSpecs } from './checks/dom-free';
import type { SourceGraph } from './checks/graph';
import { buildGraph } from './checks/graph';
import { formatHotspots } from './checks/perf-hotspots';
import { isolationFromAngularBuilder } from './checks/runner-isolation';
import type { CliIo } from './main';
import type { BaselineOptions } from './perf-baseline';
import { baselineDrift, baselineRegressions, buildBaseline, readBaseline, writeBaseline } from './perf-baseline';
import type { PerfFile, PerfRun, Phase } from './perf-data';
import { PERF_DOCS, formatMs, formatShare, measuredNothing, phasesOf, shareOf, testsRunOf, totalOf } from './perf-data';
import type { GateCandidate, GateOptions } from './perf-gate';
import { gateCandidates, gateVerdict, isJudged, measuredFiles, medianFileMs, suspectFiles } from './perf-gate';
import type { PerfSource, Remeasure } from './perf-run';
import type { Profile } from './profile';
import type { Finding } from './report';
import { formatFindings, summarize } from './report';

/** The share at which a phase is worth naming files over. Below it the advice would be noise. */
const DOMINATES = 0.3;

/** A whole run cheaper than this has nothing in it worth anybody's afternoon. */
const QUIET_MS = 5_000;

/** How many files one finding names before it stops and counts the rest. */
const LIST_LIMIT = 12;

/** Below this, a file's environment time is measurement noise rather than a cost worth moving. */
const FILE_FLOOR_MS = 1;

const DOCS_ISOLATE = `${PERF_DOCS}#memory-under-isolate-false`;
const DOCS_SLOW = `${PERF_DOCS}#what-actually-makes-a-suite-slow`;

/**
 * Every runner config in the repository, not only `vitest.config.ts` at the root.
 *
 * A workspace that runs its suite through a builder keeps the Vitest settings in a file of its own
 * — `tools/unit-test-bench/vitest-runner.config.ts` in the one this was widened for — and with the
 * narrow pattern the settings checks could not see it. The cost of missing it is not a missing
 * finding but a **wrong** one: telling a suite that already caps `maxWorkers` to go and cap it.
 */
const CONFIG_FILE = /(?:^|\/)vite(?:st)?[\w.-]*\.config\.[cm]?[jt]s$/;
const NO_ISOLATION = /\bisolate\s*:\s*false/;
const JSDOM = /\benvironment\s*:\s*["'`]jsdom["'`]/;
const HAPPY_DOM = /happy-dom/;
const WORKER_CAP = /\bmaxWorkers\s*:/;

/**
 * Summed phase time above which the worker count is a decision rather than a detail.
 *
 * Below it the machine runs the whole suite in a few seconds on any setting, and a note about peak
 * memory is noise. Above it the suite is the kind that shares a runner with other jobs.
 */
const LARGE_RUN_MS = 60_000;

/** Per-worker resident memory, measured on this package's own Angular suite — see the perf docs. */
const WORKER_RSS_MB = 155;

export interface PerfAnalysis {
  readonly phases: readonly Phase[];
  /** Summed phase time. Larger than the wall clock, because the phases are spread over workers. */
  readonly total: number;
  readonly fileCount: number;
  readonly findings: readonly Finding[];
}

interface EnvironmentCandidate {
  readonly spec: string;
  readonly ms: number;
}

interface BarrelCandidate {
  readonly spec: string;
  readonly barrel: string;
  readonly reach: number;
}

function remainder(total: number): string {
  return total > LIST_LIMIT ? ` The ${total - LIST_LIMIT} not listed below are in the same set.` : '';
}

function nodeCandidates(specs: readonly string[], measured: ReadonlyMap<string, PerfFile>): EnvironmentCandidate[] {
  return specs
    .map((spec) => ({ spec, ms: measured.get(spec)?.environment ?? 0 }))
    .filter((entry) => entry.ms > FILE_FLOOR_MS)
    .sort((a, b) => b.ms - a.ms || a.spec.localeCompare(b.spec));
}

function environmentFindings(
  phases: readonly Phase[],
  profile: Profile,
  graph: SourceGraph,
  measured: ReadonlyMap<string, PerfFile>,
): Finding[] {
  if (shareOf(phases, 'environment') < DOMINATES) {
    return [];
  }

  const domFree = findDomFreeSpecs(profile, graph);
  const undecided = domFree.undecided;
  const ranked = nodeCandidates(domFree.specs, measured);
  const movable = ranked.reduce((sum, entry) => sum + entry.ms, 0);
  const summary =
    ranked.length === 0
      ? `No spec file could be proved DOM-free, so this names none; ${undecided} were left undecided.`
      : `${ranked.length} spec files reach no DOM and spent ${formatMs(movable)} of it.${remainder(ranked.length)} ${undecided} more were left undecided.`;

  return [
    {
      check: 'perf-environment',
      severity: 'info',
      message: `Environment setup is ${formatShare(shareOf(phases, 'environment'))} of the measured CPU time, against ${formatShare(shareOf(phases, 'tests'))} in the test bodies. ${summary}`,
      fix: `Move what does not need a DOM to the \`node\` environment. Rule used — ${DOM_FREE_RULE}. Background: ${DOCS_SLOW}`,
    },
    ...ranked.slice(0, LIST_LIMIT).map((entry): Finding => ({
      check: 'perf-environment-node-candidate',
      severity: 'info',
      file: entry.spec,
      message: `Mentions no DOM name and imports no package off the DOM-free list; ${formatMs(entry.ms)} of this run went on building an environment for it.`,
      fix: 'Put `// @vitest-environment node` in a docblock at the top of the file, or group these specs into a project whose `environment` is `node`.',
    })),
  ];
}

/** The widest barrel each spec imports; a spec importing three of them has one problem, not three. */
function barrelCandidates(graph: SourceGraph): BarrelCandidate[] {
  const widest = new Map<string, BarrelCandidate>();

  for (const use of findBarrelImports(graph)) {
    if (!widest.has(use.spec)) {
      widest.set(use.spec, use);
    }
  }

  return [...widest.values()].sort((a, b) => b.reach - a.reach || a.spec.localeCompare(b.spec));
}

function importFindings(phases: readonly Phase[], graph: SourceGraph): Finding[] {
  if (shareOf(phases, 'import') < DOMINATES) {
    return [];
  }

  const ranked = barrelCandidates(graph);

  if (ranked.length === 0) {
    return [];
  }

  return [
    {
      check: 'perf-import',
      severity: 'info',
      message: `Importing modules is ${formatShare(shareOf(phases, 'import'))} of the measured CPU time, and ${ranked.length} spec files reach their subject through a barrel.${remainder(ranked.length)}`,
      fix: `A barrel re-exports a whole directory, so a spec importing one loads all of it to use one export. Import the module itself. Background: ${DOCS_SLOW}`,
    },
    ...ranked.slice(0, LIST_LIMIT).map((entry): Finding => ({
      check: 'perf-import-barrel',
      severity: 'info',
      file: entry.spec,
      message: `Imports the barrel ${entry.barrel}, which pulls ${entry.reach} repository modules into this spec's graph.`,
      fix: 'Import the module directly instead of through the barrel.',
    })),
  ];
}

/**
 * Comment lines are dropped first: this repository's own config explains `isolate: false` in a
 * comment three lines above `isolate: true`, and a prose mention is not a setting.
 */
function configCode(graph: SourceGraph): string[] {
  const configs: string[] = [];

  for (const [file, text] of graph.texts) {
    if (!CONFIG_FILE.test(file)) {
      continue;
    }

    configs.push(
      text
        .split('\n')
        .filter((line) => !/^\s*(?:\/[*/]|\*)/.test(line))
        .join('\n'),
    );
  }

  return configs;
}

/** Whether any runner config declares `setting`, ignoring the comments that discuss it. */
function configDeclares(graph: SourceGraph, setting: RegExp): boolean {
  return configCode(graph).some((code) => setting.test(code));
}

export function declaresNoIsolation(graph: SourceGraph): boolean {
  return configDeclares(graph, NO_ISOLATION);
}

/**
 * `happy-dom` builds the same DOM for less, for the files that genuinely need one.
 *
 * The other half of the environment advice: `perf-environment` moves the specs that need no DOM out
 * of one entirely, and this one is for everything left behind. Only offered to a configuration that
 * names `jsdom` and does not already mention `happy-dom` anywhere — a suite that has made this
 * choice does not need to be asked again.
 */
function domEngineFindings(phases: readonly Phase[], graph: SourceGraph): Finding[] {
  if (shareOf(phases, 'environment') < DOMINATES || !configDeclares(graph, JSDOM) || configDeclares(graph, HAPPY_DOM)) {
    return [];
  }

  return [
    {
      check: 'perf-environment-engine',
      severity: 'info',
      message: `The DOM here is \`jsdom\`, and building it is ${formatShare(shareOf(phases, 'environment'))} of the measured CPU time. Every spec that genuinely needs a DOM keeps paying that, whatever moves to \`node\`.`,
      fix: `Try \`happy-dom\`: measured on this package's own Angular suite, same 117 files and same assertions, 26.5 s of user CPU against 23.2 s — 12 % less. On a spec that builds a DOM and does nothing else the gap is far wider (253 ms against 119 ms per file), so how much of it you get back depends on how much of your file is the environment. It implements less of the platform, so it is a swap to make one project at a time with the suite green after each. Background: ${DOCS_SLOW}`,
    },
  ];
}

/**
 * The worker count, which is a memory setting first and a speed setting second.
 *
 * Vitest defaults to one worker per core, and each one is a whole runtime: measured on this
 * package's own Angular suite, resident memory came to 1.42 GB plus ~155 MB per worker. Capping the
 * count is the one lever that changes peak memory without changing a line of the suite, and the
 * wall-clock it costs is small — which is exactly the trade nobody is told about, because the
 * default never announces itself.
 */
function workerFindings(total: number, graph: SourceGraph): Finding[] {
  if (total < LARGE_RUN_MS || configDeclares(graph, WORKER_CAP)) {
    return [];
  }

  return [
    {
      check: 'perf-workers',
      severity: 'info',
      message: `No \`maxWorkers\` is declared, so Vitest takes one worker per core. On this package's own Angular suite that came to 1.42 GB of resident memory plus ~${WORKER_RSS_MB} MB per worker — on a 16-core machine, ~1.9 GB of it is the eight workers past a cap of four.`,
      fix: 'Set `maxWorkers: 4` if the run has to share a machine. Measured on a field deployment of this package: 13.50 s against 13.13 s at the eight-worker optimum — 2.8 % of wall clock, for 3.7 GB of resident memory instead of 5.8 GB. Take your own reading before fixing the number: the best count is a property of the machine, not of the suite.',
    },
  ];
}

function isolationFindings(phases: readonly Phase[], graph: SourceGraph, cwd: string): Finding[] {
  const overhead = shareOf(phases, 'environment') + shareOf(phases, 'setup') + shareOf(phases, 'prepare');
  /**
   * A builder can have made this decision where no config can show it. `@angular/build:unit-test`
   * passes `isolate: false` to Vitest and overrides whatever a runner config said, so a workspace
   * on it has already taken the trade — and being told to take a decision you made is the one thing
   * a findings tool must never spend a reader's attention on.
   */
  const builder = isolationFromAngularBuilder(cwd);

  if (overhead < DOMINATES || declaresNoIsolation(graph) || builder?.isolated === false) {
    return [];
  }

  return [
    {
      check: 'perf-isolation',
      severity: 'info',
      message: `Per-file environment, setup and prepare together are ${formatShare(overhead)} of the measured CPU time. Those three are what \`test.isolate: false\` pays once per worker instead of once per file.`,
      fix: `It is a trade, not a win — without isolation every double a file created stays alive for the whole worker, so peak memory grows with the suite. This package's own measurements of that are at ${DOCS_ISOLATE}; take yours before switching.`,
    },
  ];
}

export function analysePerf(run: PerfRun, profile: Profile): PerfAnalysis {
  const phases = phasesOf(run);
  const total = totalOf(phases);
  const base = { phases, total, fileCount: run.files.length };

  if (total < QUIET_MS) {
    return { ...base, findings: [] };
  }

  const graph = buildGraph(profile);
  const measured = measuredFiles(run, profile.cwd);

  return {
    ...base,
    findings: [
      ...environmentFindings(phases, profile, graph, measured),
      ...domEngineFindings(phases, graph),
      ...importFindings(phases, graph),
      ...isolationFindings(phases, graph, profile.cwd),
      ...workerFindings(total, graph),
    ],
  };
}

/**
 * What a run with no findings is told. Two lines, because the two silences are different: a suite
 * that is cheap has nothing to move, and a suite that is expensive but evenly spread has nothing
 * this command can name a file for.
 */
export function nothingToDo(analysis: PerfAnalysis): string {
  return analysis.total < QUIET_MS
    ? `Nothing here is worth your time — the whole run costs ${formatMs(analysis.total)} of CPU time.`
    : `No phase is over ${formatShare(DOMINATES)} of the total and no rule found a file to name. Nothing here is worth your time.`;
}

/** The phase table, largest share first — the answer to "where did the time go". */
export function formatPhases(phases: readonly Phase[]): string {
  const header = `  ${'phase'.padEnd(14)}${'time'.padStart(10)}${'share'.padStart(9)}`;
  const rows = phases.map((phase) => `  ${phase.name.padEnd(14)}${formatMs(phase.ms).padStart(10)}${formatShare(phase.share).padStart(9)}`);

  return [header, ...rows].join('\n');
}

function reportFindings(analysis: PerfAnalysis, io: CliIo): void {
  if (analysis.findings.length === 0) {
    io.out(`\n${nothingToDo(analysis)}`);

    return;
  }

  io.out(`\n${formatFindings(analysis.findings)}`);
  io.out(`\n${summarize(analysis.findings)}`);
}

/** A slow suite is not a broken one, so this is the only code that means "your suite is over budget". */
export const PERF_GATE_FAILED = 1;

/** There was nothing to judge: no report, or a run in which no test body executed. */
export const PERF_NO_MEASUREMENT = 2;

export interface GateRequest {
  readonly options: GateOptions;
  /** How the suspects are re-measured, or `undefined` when this source cannot be re-run. */
  readonly remeasure: Remeasure | undefined;
  /** `--no-confirm`: one reading may fail the run, because the caller said so. */
  readonly trustSingle: boolean;
}

export interface BaselineRequest {
  readonly path: string;
  /** `--update-baseline`: record this run instead of judging it against the last one. */
  readonly update: boolean;
  readonly options: BaselineOptions;
}

export interface PerfOptions {
  readonly gate?: GateRequest;
  readonly baseline?: BaselineRequest;
  /** How many rows the hotspot tables print. `0` turns them off. */
  readonly top?: number;
}

/**
 * What a run that collected files and executed nothing is told.
 *
 * This is the report the command used to print as though it were a measurement — 1 830 files, 29 s
 * of wall clock, 55 s of CPU — while every one of those files had failed to collect. Those are real
 * seconds, and they are the seconds of a failure, so the phase table is not printed at all.
 */
function describeEmptyRun(run: PerfRun): string {
  return [
    `Nothing was measured: ${run.files.length} test ${run.files.length === 1 ? 'file was' : 'files were'} collected and ${testsRunOf(run)} test bodies ran.`,
    'Time spent collecting files that never ran a test is not a measurement of a suite, so the phase table is not printed.',
    'Look at the run itself: every file failing on the same error — "describe is not defined", "Cannot find package" — means the runner was configured by something other than the configuration this command reached. Measure that command with --command, or hand over its report with --json.',
    `Docs: ${PERF_DOCS}`,
  ].join('\n');
}

/**
 * What a report measured in another checkout is told.
 *
 * A report is routinely written somewhere else than it is read, and `measuredFiles` re-bases it on
 * `PerfRun.root` for exactly that. When even that does not land inside the working directory, the
 * two roots are printed: every rule here works on repository-relative paths, so the alternative is
 * an empty file set, no candidates, and a gate that prints an all-clear it never earned.
 */
function describeForeignRoot(run: PerfRun, cwd: string): string {
  return [
    `None of the ${run.files.length} measured files is inside ${cwd}.`,
    run.root === '' ? 'The report records no root of its own to re-base them from.' : `The report was written under ${run.root}.`,
    'Run this from the directory the suite was measured in, or pass --cwd, so the paths in the report can be resolved against it.',
    `Docs: ${PERF_DOCS}`,
  ].join('\n');
}

/**
 * The second measurement, or `undefined` and a line saying why there is none.
 *
 * The set it came back with is checked against the set it was asked for, and that check is the
 * difference between a confirmation and a coincidence: a harness that ignores the paths it is
 * handed — an `ng test` wrapper with its own `--include`, an Nx target — re-runs the **whole suite**
 * and returns the same contended number, which the gate would then print as "re-measured on its
 * own". It is not, and a gate that says so once is a gate nobody believes again.
 */
function confirmRun(gate: GateRequest, suspects: readonly string[], cwd: string, io: CliIo): PerfRun | undefined {
  if (gate.remeasure === undefined || suspects.length === 0) {
    return undefined;
  }

  io.out(`\nperf gate: re-measuring ${suspects.length} ${suspects.length === 1 ? 'file' : 'files'} on their own before failing anything.`);

  const second = gate.remeasure(suspects);

  if (!second.ok) {
    io.err(`\nwarning  The confirmation pass could not run, so nothing below is confirmed.\n${second.error}`);

    return undefined;
  }

  if (second.runFailed || measuredNothing(second.run)) {
    io.err('\nwarning  The confirmation pass did not pass, or ran no test, so nothing below is confirmed.');

    return undefined;
  }

  const measured = [...measuredFiles(second.run, cwd).keys()];
  const asked = new Set(suspects);
  const extra = measured.filter((path) => !asked.has(path));

  if (extra.length > 0) {
    io.err(
      `\nwarning  The confirmation pass measured ${measured.length} files when it was asked for ${suspects.length} — the command ignored the paths it was given, so this was the same crowded run again and confirms nothing. Put {paths} (or {paths:<prefix>}) where the command takes its file filter.`,
    );

    return undefined;
  }

  return second.run;
}

/** The `--gate-only` entries that matched no measured file. A list that matches nothing judges nothing. */
function unmatchedScope(run: PerfRun, cwd: string, only: readonly string[]): string[] {
  const paths = [...measuredFiles(run, cwd).keys()];

  return only.filter((entry) => !paths.some((path) => isJudged(path, [entry])));
}

function runGate(run: PerfRun, cwd: string, io: CliIo, gate: GateRequest, extra: readonly GateCandidate[]): number {
  const unmatched = unmatchedScope(run, cwd, gate.options.only);

  if (unmatched.length > 0) {
    io.err(
      `\n--gate-only named ${unmatched.length === gate.options.only.length ? 'nothing this run measured' : 'paths this run did not measure'}: ${unmatched.join(', ')}. A scope that matches nothing judges nothing, and a gate that judges nothing must not report an all-clear.`,
    );

    return PERF_NO_MEASUREMENT;
  }

  const candidates = [...gateCandidates(run, cwd, gate.options), ...extra];

  if (candidates.length === 0) {
    io.out(
      `\nperf gate: nothing over budget — no test body over ${formatMs(gate.options.maxTestMs)}, no file over ${formatMs(gate.options.maxFileMs)}.`,
    );

    return 0;
  }

  const verdict = gateVerdict(candidates, confirmRun(gate, suspectFiles(candidates), cwd, io), cwd, gate.trustSingle);

  io.out(`\n${formatFindings(verdict.findings)}`);
  io.out(`\n${summarize(verdict.findings)}`);

  return verdict.failed ? PERF_GATE_FAILED : 0;
}

/**
 * The baseline half: record this run, or turn what grew since the last recording into candidates the
 * gate judges like any other.
 *
 * A regression arrives as milliseconds rather than as the ratio it was detected by, because the
 * confirmation pass measures a clock and a reader checks one. `wasRatio × factor × this run's median
 * file` is what the recorded share is worth here, and a file over that is a file that grew.
 */
function baselineCandidates(run: PerfRun, cwd: string, request: BaselineRequest, io: CliIo): GateCandidate[] {
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

function recordBaseline(run: PerfRun, cwd: string, path: string, io: CliIo): void {
  const baseline = buildBaseline(run, cwd);

  writeBaseline(path, baseline);
  io.out(
    `\nperf baseline: recorded ${Object.keys(baseline.files).length} files at a median of ${formatMs(baseline.median)} into ${path}. Commit it — it is only worth what the next reader can diff.`,
  );
}

/**
 * The whole command below the argument parsing.
 *
 * Without `--gate` it still always exits 0 on a report it could read: a slow suite is not a broken
 * one, and the advisory findings must never redden a pipeline. The two non-zero codes are the gate
 * failing (1) and there being nothing to judge (2).
 */
export function renderPerf(source: PerfSource, profile: Profile, io: CliIo, options: PerfOptions = {}): number {
  const gate = options.gate;

  if (!source.ok) {
    io.err(source.error);

    return PERF_NO_MEASUREMENT;
  }

  if (measuredNothing(source.run)) {
    io.err(describeEmptyRun(source.run));

    return PERF_NO_MEASUREMENT;
  }

  if (measuredFiles(source.run, profile.cwd).size === 0) {
    io.err(describeForeignRoot(source.run, profile.cwd));

    return PERF_NO_MEASUREMENT;
  }

  if (source.runFailed) {
    io.err('warning  The suite did not pass. The timings below are still what the run measured.\n');
  }

  const analysis = analysePerf(source.run, profile);

  io.out(`vitest-auto-spy perf — ${profile.cwd}`);
  io.out(
    `${analysis.fileCount} test files, ${formatMs(source.run.wall)} wall clock, ${formatMs(analysis.total)} of CPU time summed over the workers\n`,
  );

  if (source.note !== undefined) {
    io.out(`${source.note}\n`);
  }

  io.out(formatPhases(analysis.phases));

  const hotspots = formatHotspots(source.run, profile.cwd, options.top === undefined ? {} : { limit: options.top });

  if (hotspots !== '') {
    io.out(`\n${hotspots}`);
  }

  reportFindings(analysis, io);

  if (options.baseline?.update === true) {
    recordBaseline(source.run, profile.cwd, options.baseline.path, io);

    return 0;
  }

  const regressions = options.baseline === undefined ? [] : baselineCandidates(source.run, profile.cwd, options.baseline, io);

  if (gate === undefined) {
    if (regressions.length > 0) {
      io.out(`\n${formatFindings(gateVerdict(regressions, undefined, profile.cwd, false).findings)}`);
    }

    return 0;
  }

  if (source.runFailed) {
    io.err(
      '\nThe gate does not judge a run that did not pass: a failed test is measured until its timeout, and 30 s of timeout looks exactly like 30 s of slow code. Fix the suite, then gate it.',
    );

    return PERF_NO_MEASUREMENT;
  }

  return runGate(source.run, profile.cwd, io, gate, regressions);
}
