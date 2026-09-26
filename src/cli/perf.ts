/**
 * `perf` — where a suite's time actually goes, and which files to act on.
 *
 * The summary line Vitest prints is one number per phase for the whole run, and it is the only
 * place they surface. Reading it tells you environment setup is 56 % of the CPU time; it does not
 * tell you which of your 1 400 spec files never needed a DOM. Every finding below therefore names
 * files, from the measurement and the repository's own import graph, and states the rule it used —
 * advice a reader cannot check is advice a reader has to trust.
 */
import { relative } from 'node:path';

import { findBarrelImports } from './checks/barrels';
import { findDomFreeSpecs } from './checks/dom-free';
import type { SourceGraph } from './checks/graph';
import { buildGraph } from './checks/graph';
import { flakyFindings, heapFindings } from './checks/perf-flaky';
import { budgetLine, formatHotspots, nothingOverBudgetNote } from './checks/perf-hotspots';
import { writeCodeQuality } from './code-quality';
import { BARE_RUN_DOCS, NOTHING_TO_READ_DOCS } from './docs';
import { toPosix } from './fs-scan';
import type { CliIo } from './main';
import { MONOCHROME, type Painter, outputWidth, painterFor, wrapText } from './paint';
import type { BaselineOptions } from './perf-baseline';
import { DOMINATES, domEngineFindings, isolationFindings, transformFindings, vitestDoctorFindings, workerFindings } from './perf-config';
import type { PerfFile, PerfRun, Phase } from './perf-data';
import { formatMs, formatShare, measuredNothing, phasesOf, shareOf, testsRunOf, totalOf } from './perf-data';
import { formatEvidence } from './perf-evidence';
import type { GateCandidate, GateOptions, GateRow } from './perf-gate';
import { gateCandidates, gateVerdict, isJudged, measuredFiles, medianFileMs, medianTestMs, suspectFiles } from './perf-gate';
import type { LaneSummary } from './perf-lanes';
import { formatLanes, lanesOf, longPoleFindings } from './perf-lanes';
import type { CpuProfile } from './perf-profile';
import { packageOf, summariseProfile } from './perf-profile';
import type { Collected } from './perf-report';
import { baselineCandidates, budgetsOf, perfJson, recordBaseline, tableBaseline } from './perf-report';
import type { PerfMeasured, PerfSource, Remeasure } from './perf-run';
import { formatVerdict, shortName } from './perf-verdict';
import type { Profile } from './profile';
import { type Finding, type Severity, formatFindings, summarize } from './report';
import { perfMarkdown } from './report-markdown';
import { bar, drawTable } from './table';

/** A whole run cheaper than this has nothing in it worth anybody's afternoon. */
const QUIET_MS = 5_000;

/** How many files one finding names before it stops and counts the rest. */
const LIST_LIMIT = 12;

/** Below this, a file's environment time is measurement noise rather than a cost worth moving. */
const FILE_FLOOR_MS = 1;

export { declaresNoIsolation } from './perf-config';

export interface PerfAnalysis {
  readonly phases: readonly Phase[];
  /** Summed phase time. Larger than the wall clock, because the phases are spread over workers. */
  readonly total: number;
  readonly fileCount: number;
  readonly findings: readonly Finding[];
  /** Vitest 5+: how the run used its worker lanes, when the report places files on them. */
  readonly lanes?: LaneSummary;
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

/**
 * What moving these specs to `node` would actually free. An environment belongs to a worker, not to
 * a file, so it is only saved when **every** file that worker ran is DOM-free; a single DOM-using
 * file left behind rebuilds it and the move buys nothing. Files of one worker carry the identical
 * `environment` value, and on Vitest 5 the same lane too, which splits two workers that collide.
 * Vitest 5.0's `workerId` cannot group them: measured, it is new for every file, even on a reused worker.
 */
function movableEnvironment(measured: ReadonlyMap<string, PerfFile>, domFree: ReadonlySet<string>): number {
  const workers = new Map<string, { ms: number; files: number; free: number }>();

  for (const [spec, file] of measured) {
    const key = `${String(file.lane)}:${file.environment}`;
    const worker = workers.get(key) ?? { ms: file.environment, files: 0, free: 0 };

    workers.set(key, { ms: worker.ms, files: worker.files + 1, free: worker.free + (domFree.has(spec) ? 1 : 0) });
  }

  return [...workers.values()].reduce((total, worker) => (worker.files === worker.free ? total + worker.ms : total), 0);
}

function environmentFix(movable: number, setupFiles: readonly string[]): string {
  if (movable > 0) {
    return 'Move the files listed below to the `node` environment.';
  }

  return setupFiles.length === 0
    ? 'Nothing can move until a spec is proved DOM-free; the docs say what the rule reads.'
    : `Nothing can move while every spec loads ${setupFiles.map((file) => `\`${file.replace(/^\.\//, '')}\``).join(', ')}: a setup file that mentions a DOM name keeps every spec on the DOM. Move the DOM part of it into a setup file only the DOM specs load.`;
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
  const movable = movableEnvironment(measured, new Set(domFree.specs));
  const saving =
    movable === 0
      ? 'none of them shares a worker only with other DOM-free files, so moving them alone frees no environment'
      : `moving them frees ${formatMs(movable)}`;
  const summary =
    ranked.length === 0
      ? `No spec file could be proved DOM-free, so this names none; ${undecided} were left undecided.`
      : `${ranked.length} spec files reach no DOM, and ${saving}.${remainder(ranked.length)} ${undecided} more were left undecided.`;

  return [
    {
      check: 'perf-environment',
      severity: 'info',
      message: `Environment setup is ${formatShare(shareOf(phases, 'environment'))} of the measured CPU time, against ${formatShare(shareOf(phases, 'tests'))} in the test bodies. ${summary}`,
      fix: environmentFix(ranked.length, profile.setupFiles),
    },
    ...ranked.slice(0, LIST_LIMIT).map((entry): Finding => ({
      check: 'perf-environment-node-candidate',
      severity: 'info',
      file: entry.spec,
      message: `Mentions no DOM name and imports no package off the DOM-free list; the worker that ran it spent ${formatMs(entry.ms)} building the environment it shares with the rest of that worker's files.`,
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

/** Vitest 5 splits the transform wait out of `import`, which then is evaluation alone. */
function importPhase(run: PerfRun): string {
  return run.files.length > 0 && run.files.every((file) => file.fetch !== undefined)
    ? 'Evaluating imported modules — the wait for their transforms is counted under `transform` —'
    : 'Importing modules';
}

function importFindings(phases: readonly Phase[], graph: SourceGraph, run: PerfRun): Finding[] {
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
      message: `${importPhase(run)} is ${formatShare(shareOf(phases, 'import'))} of the measured CPU time, and ${ranked.length} spec files reach their subject through a barrel.${remainder(ranked.length)}`,
      fix: 'Import the module itself in the files listed below: a barrel loads its whole directory to hand over one export.',
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

export function analysePerf(run: PerfRun, profile: Profile, failOnFlaky = false): PerfAnalysis {
  const phases = phasesOf(run);
  const total = totalOf(phases);
  const measured = measuredFiles(run, profile.cwd);
  const lanes = lanesOf(measured);
  const base = { phases, total, fileCount: run.files.length, ...(lanes === undefined ? {} : { lanes }) };
  const always = [...flakyFindings(measured, failOnFlaky), ...heapFindings(measured, run.config?.isolate === false)];

  if (total < QUIET_MS) {
    return { ...base, findings: always };
  }

  const graph = buildGraph(profile);
  const advice = [
    ...environmentFindings(phases, profile, graph, measured),
    ...domEngineFindings(phases, graph, run),
    ...transformFindings(phases, graph, run),
    ...importFindings(phases, graph, run),
    ...isolationFindings(phases, graph, profile, run),
    ...workerFindings(total, graph, run),
  ];

  return {
    ...base,
    findings: [...always, ...advice, ...longPoleFindings(lanes), ...vitestDoctorFindings(run, advice)],
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
    : `No phase this command has advice for — environment, import, or the three isolation pays per file — is over ${formatShare(DOMINATES)} of the total, and no rule found a file to name. Nothing here is worth your time.`;
}

const PHASE_BAR_CELLS = 20;

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

/** The phase table, largest share first — the answer to "where did the time go". */
export function formatPhases(phases: readonly Phase[], paint: Painter = MONOCHROME): string {
  return drawTable(
    [
      { head: 'phase', cells: phases.map((phase) => phase.name), left: true },
      { head: 'time', cells: phases.map((phase) => formatMs(phase.ms)) },
      { head: 'share', cells: phases.map((phase) => formatShare(phase.share)) },
      { head: '', cells: phases.map((phase) => bar(phase.share, PHASE_BAR_CELLS)), left: true, paint: (cell) => paint.cyan(cell) },
    ],
    paint,
  ).join('\n');
}

function reportFindings(analysis: PerfAnalysis, io: CliIo, minSeverity?: Severity): void {
  if (analysis.findings.length === 0) {
    io.out(`\n${nothingToDo(analysis)}`);

    return;
  }

  reportOnly(analysis.findings, io, minSeverity);
}

/** The findings the threshold lets through, or nothing; the one tally for the whole run comes last. */
function reportOnly(findings: readonly Finding[], io: CliIo, minSeverity?: Severity): void {
  const report = formatFindings(findings, minSeverity);

  if (report !== '') {
    io.out(`\n${report}`);
  }
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
  /** The budgets the tables are drawn against when there is no gate — the same flags, so the report and a later `--gate` agree. */
  readonly budgets?: GateOptions;
  readonly baseline?: BaselineRequest;
  /** How many rows the hotspot tables print. `0` turns them off. */
  readonly top?: number;
  /** Findings quieter than this are left out of the report; the tally still counts them. */
  readonly minSeverity?: Severity;
  /** `--code-quality`: also write every finding of this run as a GitLab Code Quality report here. */
  readonly codeQuality?: string;
  /** `--fail-on-flaky`: a test that passed only on a retry fails the run like a gate finding. */
  readonly failOnFlaky?: boolean;
  /** `--fail-on-red`: a run whose suite failed exits 1, so `perf --command` can stand in for the test step. */
  readonly failOnRed?: boolean;
  /** `--format json` or `markdown`: one document on stdout instead of the text report. */
  readonly format?: OutputFormat;
}

export type OutputFormat = 'json' | 'markdown' | 'text';

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
    'When every file fails on the same error, such as "describe is not defined", the suite is configured somewhere this run did not reach. Measure the command that runs it with --command.',
    `Docs: ${BARE_RUN_DOCS}`,
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
    'Pass --cwd the directory the suite was measured in.',
    `Docs: ${NOTHING_TO_READ_DOCS}`,
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
function confirmRun(gate: GateRequest, suspects: readonly string[], cwd: string, io: CliIo): PerfMeasured | undefined {
  if (gate.remeasure === undefined || suspects.length === 0) {
    return undefined;
  }

  io.out(
    `\nperf gate: re-measuring ${suspects.length === 1 ? '1 file on its own' : `${suspects.length} files on their own`} before failing anything.`,
  );

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

  return second;
}

/**
 * A confirmed finding, with the card of what the confirmation pass saw inside the file: the two
 * readings against the budget, its slowest bodies, and where the profile says the time went. A
 * finding that was not confirmed carries nothing — the second reading did not agree with it, so its
 * profile explains a file that was not slow.
 */
function withEvidence(
  finding: Finding,
  row: GateRow,
  first: PerfRun,
  second: PerfMeasured | undefined,
  cwd: string,
  options: GateOptions,
): Finding {
  const firstFiles = measuredFiles(first, cwd);
  const before = finding.file === undefined ? undefined : firstFiles.get(finding.file);
  const after = finding.file === undefined || second === undefined ? undefined : measuredFiles(second.run, cwd).get(finding.file);

  if (finding.severity !== 'error' || before === undefined || after === undefined || row.again === undefined) {
    return finding;
  }

  const medianTest = medianTestMs(firstFiles.values());
  const slowest = [...after.cases]
    .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((entry) => ({ name: shortName(entry.name), ms: entry.ms }));
  const profile = [...(second?.profiles ?? new Map<string, CpuProfile>())].find(([path]) => toPosix(relative(cwd, path)) === finding.file);
  const imports = (after.slowImports ?? []).map((entry) => ({
    name: packageOf(entry.module) ?? toPosix(relative(cwd, entry.module)),
    ms: entry.ms,
  }));
  const details = formatEvidence(
    {
      ms: row.ms,
      budget: row.budget,
      again: row.again,
      testCount: before.testCount,
      medianTest,
      slowest,
      maxTestMs: options.maxTestMs,
      summary: profile === undefined ? undefined : summariseProfile(profile[1], profile[0], cwd),
      imports,
    },
    painterFor(undefined),
  );

  return { ...finding, details };
}

/** The `--gate-only` entries that matched no measured file. A list that matches nothing judges nothing. */
function unmatchedScope(run: PerfRun, cwd: string, only: readonly string[]): string[] {
  const paths = [...measuredFiles(run, cwd).keys()];

  return only.filter((entry) => !paths.some((path) => isJudged(path, [entry])));
}

function runGate(
  run: PerfRun,
  cwd: string,
  io: CliIo,
  gate: GateRequest,
  extra: readonly GateCandidate[],
  collected: Collected,
  minSeverity?: Severity,
): number {
  const unmatched = unmatchedScope(run, cwd, gate.options.only);

  if (unmatched.length > 0) {
    io.err(
      `\n--gate-only named ${unmatched.length === gate.options.only.length ? 'nothing this run measured' : 'paths this run did not measure'}: ${unmatched.join(', ')}. A scope that matches nothing judges nothing, and a gate that judges nothing must not report an all-clear.`,
    );
    collected.gate = 'refused';

    return PERF_NO_MEASUREMENT;
  }

  const candidates = [...gateCandidates(run, cwd, gate.options), ...extra];

  collected.gate = 'judged';

  if (candidates.length === 0) {
    io.out(`\nperf gate: nothing over budget — no test body over ${formatMs(gate.options.maxTestMs)}, no file over its budget.`);

    return 0;
  }

  const second = confirmRun(gate, suspectFiles(candidates), cwd, io);
  const verdict = gateVerdict(candidates, second?.run, cwd, gate.trustSingle);
  const findings = verdict.entries.map(({ finding, row }) => withEvidence(finding, row, run, second, cwd, gate.options));

  collected.findings.push(...findings);
  collected.rows.push(...verdict.rows);
  io.out(`\n${formatVerdict(verdict.rows, painterFor(undefined)).join('\n')}`);
  reportOnly(findings, io, minSeverity);

  return verdict.failed ? PERF_GATE_FAILED : 0;
}

/**
 * The budgets, then the files and bodies over them, or one line saying there are none. Under
 * `--gate` that line is left to the gate, which prints its own all-clear a few lines further down.
 */
function reportHotspots(source: PerfMeasured, cwd: string, options: PerfOptions, io: CliIo): void {
  if (options.top === 0) {
    return;
  }

  const gate = budgetsOf(options);
  const baseline = tableBaseline(options.baseline);
  const hotspots = formatHotspots(source.run, cwd, {
    gate,
    ...(options.top === undefined ? {} : { limit: options.top }),
    ...(baseline === undefined ? {} : { baseline }),
  });

  io.out(`\n${budgetLine(gate, medianTestMs(measuredFiles(source.run, cwd).values()), outputWidth()).join('\n')}`);

  if (hotspots !== '') {
    io.out(`\n${hotspots}`);
  } else if (options.gate === undefined) {
    io.out(`\n${wrapText(nothingOverBudgetNote(gate, source.runFailed), outputWidth(), '  ', '').join('\n')}`);
  }
}

/**
 * The whole command below the argument parsing.
 *
 * Without `--gate` it still always exits 0 on a report it could read: a slow suite is not a broken
 * one, and the advisory findings must never redden a pipeline. `--fail-on-red` opts into exit 1 for
 * a suite that failed, for a job whose only test step is `perf --command`. The two non-zero codes are the gate
 * failing (1) and there being nothing to judge (2).
 */
export function renderPerf(source: PerfSource, profile: Profile, io: CliIo, options: PerfOptions = {}): number {
  const document = options.format === 'json' || options.format === 'markdown';
  const text: CliIo = document ? { out: () => undefined, err: io.err } : io;
  const collected: Collected = { findings: [], rows: [] };
  const rendered = renderInto(source, profile, text, options, collected);
  const code = rendered === 0 && options.failOnRed === true && source.ok && source.runFailed ? PERF_GATE_FAILED : rendered;

  if (document) {
    const report = perfJson(source, profile, options, collected, code);

    io.out(options.format === 'markdown' ? perfMarkdown(report) : JSON.stringify(report, undefined, 2));
  }

  return code;
}

function renderInto(source: PerfSource, profile: Profile, io: CliIo, options: PerfOptions, collected: Collected): number {
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

  if (source.run.partial === true) {
    io.err(
      `warning  The run did not finish: this report was written before its end and holds the ${count(source.run.files.length, 'file')} that completed. The timings below are what those files measured.\n`,
    );
  } else if (source.runFailed) {
    io.err('warning  The suite did not pass. The timings below are still what the run measured.\n');
  }

  const code = reportMeasured(source, profile, io, options, collected);

  io.out(`\n${summarize(collected.findings, options.minSeverity)}`);

  if (options.codeQuality !== undefined) {
    writeCodeQuality(options.codeQuality, collected.findings, options.minSeverity);
  }

  return code;
}

function reportMeasured(source: PerfMeasured, profile: Profile, io: CliIo, options: PerfOptions, collected: Collected): number {
  const analysis = analysePerf(source.run, profile, options.failOnFlaky === true);
  const measured = [...measuredFiles(source.run, profile.cwd).values()];

  collected.analysis = analysis;
  collected.run = source.run;
  collected.findings.push(...analysis.findings);
  io.out(`vitest-auto-spy perf — ${profile.cwd}`);
  io.out(
    `${count(analysis.fileCount, 'test file')}, ${count(testsRunOf(source.run), 'test')}, ${formatMs(source.run.wall)} wall clock, ${formatMs(analysis.total)} of CPU time summed over the workers`,
  );
  const lanes = analysis.lanes === undefined ? '' : `\n${formatLanes(analysis.lanes)}`;

  io.out(`median test ${formatMs(medianTestMs(measured))}, median file ${formatMs(medianFileMs(measured))}${lanes}\n`);

  if (source.note !== undefined) {
    io.out(`${source.note}\n`);
  }

  io.out(formatPhases(analysis.phases, painterFor(undefined)));

  reportFindings(analysis, io, options.minSeverity);
  reportHotspots(source, profile.cwd, options, io);

  const code = judgeMeasured(source, profile, io, options, collected);

  return code === 0 && analysis.findings.some((finding) => finding.check === 'perf-flaky' && finding.severity === 'error')
    ? PERF_GATE_FAILED
    : code;
}

function judgeMeasured(source: PerfMeasured, profile: Profile, io: CliIo, options: PerfOptions, collected: Collected): number {
  const gate = options.gate;

  if (options.baseline?.update === true) {
    recordBaseline(source.run, profile.cwd, options.baseline.path, io);

    return 0;
  }

  const regressions = options.baseline === undefined ? [] : baselineCandidates(source.run, profile.cwd, options.baseline, io);

  if (gate === undefined) {
    const findings = gateVerdict(regressions, undefined, profile.cwd, false).findings;

    collected.findings.push(...findings);
    reportOnly(findings, io, options.minSeverity);

    return 0;
  }

  if (source.run.partial === true) {
    io.err(
      '\nThe gate does not judge a run that did not finish: the files it never reached are not in the report, and a verdict over part of a suite is an all-clear it did not earn. Let the run finish, then gate it.',
    );
    collected.gate = 'refused';

    return PERF_NO_MEASUREMENT;
  }

  if (source.runFailed) {
    io.err(
      '\nThe gate does not judge a run that did not pass: a failed test is measured until its timeout, and 30 s of timeout looks exactly like 30 s of slow code. Fix the suite, then gate it.',
    );
    collected.gate = 'refused';

    return PERF_NO_MEASUREMENT;
  }

  return runGate(source.run, profile.cwd, io, gate, regressions, collected, options.minSeverity);
}
