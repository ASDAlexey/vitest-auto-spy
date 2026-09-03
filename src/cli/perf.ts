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
import { DOM_FREE_RULE, findDomFreeSpecs } from './checks/dom-free';
import type { SourceGraph } from './checks/graph';
import { buildGraph } from './checks/graph';
import { toPosix } from './fs-scan';
import type { CliIo } from './main';
import type { PerfFile, PerfRun, Phase } from './perf-data';
import { PERF_DOCS, formatMs, formatShare, phasesOf, shareOf, totalOf } from './perf-data';
import type { PerfSource } from './perf-run';
import type { Profile } from './profile';
import { readProfile } from './profile';
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

const CONFIG_FILE = /(?:^|\/)vite(?:st)?\.config\.[cm]?[jt]s$/;
const NO_ISOLATION = /\bisolate\s*:\s*false/;

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

/** Measured files keyed by repository-relative path; anything outside the repository is dropped. */
export function measuredFiles(run: PerfRun, cwd: string): Map<string, PerfFile> {
  const found = new Map<string, PerfFile>();

  for (const file of run.files) {
    const path = toPosix(relative(cwd, file.file));

    if (path !== '' && !path.startsWith('..')) {
      found.set(path, file);
    }
  }

  return found;
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
export function declaresNoIsolation(graph: SourceGraph): boolean {
  for (const [file, text] of graph.texts) {
    if (!CONFIG_FILE.test(file)) {
      continue;
    }

    const code = text
      .split('\n')
      .filter((line) => !/^\s*(?:\/[*/]|\*)/.test(line))
      .join('\n');

    if (NO_ISOLATION.test(code)) {
      return true;
    }
  }

  return false;
}

function isolationFindings(phases: readonly Phase[], graph: SourceGraph): Finding[] {
  const overhead = shareOf(phases, 'environment') + shareOf(phases, 'setup') + shareOf(phases, 'prepare');

  if (overhead < DOMINATES || declaresNoIsolation(graph)) {
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
      ...importFindings(phases, graph),
      ...isolationFindings(phases, graph),
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

/** The whole command below the argument parsing. Always exits 0: a slow suite is not a broken one. */
export function renderPerf(source: PerfSource, cwd: string, io: CliIo): number {
  if (!source.ok) {
    io.err(source.error);

    return 1;
  }

  if (source.runFailed) {
    io.err('warning  The suite did not pass. The timings below are still what the run measured.\n');
  }

  const analysis = analysePerf(source.run, readProfile(cwd));

  io.out(`vitest-auto-spy perf — ${cwd}`);
  io.out(
    `${analysis.fileCount} test files, ${formatMs(source.run.wall)} wall clock, ${formatMs(analysis.total)} of CPU time summed over the workers\n`,
  );
  io.out(formatPhases(analysis.phases));
  reportFindings(analysis, io);

  return 0;
}
