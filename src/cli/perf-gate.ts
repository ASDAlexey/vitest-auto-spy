/**
 * The gate: the only part of `perf` allowed to fail a pipeline, and the rules it is allowed to do
 * it over.
 *
 * Everything else this command prints is advice — a phase share, a file that could run without a
 * DOM — and advice must never redden somebody's merge request. A gate has the opposite obligation:
 * it fails the build, so every finding in it has to be something the author of the diff did and can
 * undo. Three decisions come out of that, and they are the whole design.
 *
 * **It judges test bodies, not the machine.** Of the six phases, `environment`, `prepare`, `setup`
 * and `transform` are the harness: they scale with the number of files and the CPU, and no spec
 * author can make one of them smaller by writing better code. `import` is nearly as bad, and worse
 * to attribute — under a shared worker the first file to reach a module pays for all of them, so
 * the bill lands on whichever file the scheduler happened to start. `tests` is the one phase that
 * is somebody's code: a real timer nobody advanced, an unmocked request, a fixture rebuilt per
 * case. So `tests` is what the budgets are over.
 *
 * **A budget is relative first and absolute second.** A file is slow when it is both over an
 * absolute floor and far over the median of the run it is in. The median moves with the machine —
 * a loaded CI runner raises every file — so the ratio survives a change of hardware in a way a
 * millisecond count does not, and the floor stops a fast suite from reporting its own fastest
 * outlier as a defect.
 *
 * **Nothing fails on one measurement.** A candidate is re-measured on its own before it is allowed
 * to fail anything, and a file that is not slow when it has the machine to itself is reported as
 * not reproduced rather than as a finding. That is the difference between "your test is slow" and
 * "your test was unlucky about which four other files shared its worker", and a gate that cannot
 * tell them apart gets switched off within a week.
 */
import { relative } from 'node:path';

import { toPosix } from './fs-scan';
import type { PerfFile, PerfRun } from './perf-data';
import { CASE_FLOOR_MS, formatMs, medianOf } from './perf-data';
import type { Finding } from './report';

/** The gate's own section, on the page that documents the command rather than the library. */
export const GATE_DOCS = 'https://asdalexey.github.io/vitest-auto-spy/utilities/cli#the-gate';

export interface GateOptions {
  /** A single test body over this, confirmed, fails the run. */
  readonly maxTestMs: number;
  /** A file whose bodies add up to more than this, and more than `factor` × the median, fails it. */
  readonly maxFileMs: number;
  /** How many times the run's median file a file has to be before its absolute budget applies. */
  readonly factor: number;
  /** `--max-wall-ms`: an explicit whole-run budget. Off unless asked for — it is machine-dependent. */
  readonly maxWallMs: number | undefined;
  /** Repository-relative paths the gate may judge. Empty means every measured file. */
  readonly only: readonly string[];
}

export const GATE_DEFAULTS: GateOptions = {
  maxTestMs: 1_000,
  maxFileMs: 5_000,
  factor: 10,
  maxWallMs: undefined,
  only: [],
};

export type GateCheck = 'perf-gate-regression' | 'perf-gate-slow-file' | 'perf-gate-slow-test' | 'perf-gate-wall';

interface CandidateBase {
  readonly ms: number;
  readonly budget: number;
  /** How the budget was arrived at, in words, so the number in the message can be checked. */
  readonly budgetNote: string;
}

/** One test body over budget. It is the only candidate that carries a name, and it always has one. */
export interface TestCandidate extends CandidateBase {
  readonly check: 'perf-gate-slow-test';
  /** Repository-relative path. */
  readonly file: string;
  /** The test's full name, as Vitest reported it. */
  readonly name: string;
}

/** The bodies of one file, added up. */
export interface FileTotalCandidate extends CandidateBase {
  readonly check: 'perf-gate-slow-file';
  readonly file: string;
}

/**
 * A file that grew against a committed baseline, rather than one that is expensive today.
 *
 * It arrives already converted into milliseconds: the baseline records a ratio to the median file of
 * its run, and `budget` is what that ratio is worth in **this** run — which is what lets the same
 * confirmation pass judge it, and what keeps the number on the screen checkable against a clock
 * instead of being a ratio the reader has no way to verify.
 */
export interface RegressionCandidate extends CandidateBase {
  readonly check: 'perf-gate-regression';
  readonly file: string;
  /** How many times its recorded share of the run the file now takes. */
  readonly grewBy: number;
}

/** A finding about one spec file, which is the only kind a confirmation pass can re-measure. */
export type FileCandidate = FileTotalCandidate | RegressionCandidate | TestCandidate;

/** A finding about the whole run. It names no file, so there is nothing narrower to re-run. */
export interface WallCandidate extends CandidateBase {
  readonly check: 'perf-gate-wall';
}

export type GateCandidate = FileCandidate | WallCandidate;

/**
 * The path this file has inside the repository, or `undefined` when it is not in one.
 *
 * The second attempt is the one that matters. A report is routinely written somewhere else than it
 * is read: CI clones into `/builds/<group>/<project>` and a laptop into `~/projects/<project>`, so
 * every absolute path in a report handed over by `--json` escapes the working directory and would
 * be dropped — leaving an empty map, no candidates, and a gate that prints an all-clear it did not
 * earn. `PerfRun.root` is recorded for exactly this, so the file is re-based onto the working
 * directory instead of thrown away.
 */
function repositoryPath(file: string, root: string, cwd: string): string | undefined {
  const here = toPosix(relative(cwd, file));

  if (here !== '' && !here.startsWith('..')) {
    return here;
  }

  const there = root === '' ? '' : toPosix(relative(root, file));

  return there !== '' && !there.startsWith('..') ? there : undefined;
}

/** Measured files keyed by repository-relative path; anything outside the repository is dropped. */
export function measuredFiles(run: PerfRun, cwd: string): Map<string, PerfFile> {
  const found = new Map<string, PerfFile>();

  for (const file of run.files) {
    const path = repositoryPath(file.file, run.root, cwd);

    if (path !== undefined) {
      found.set(path, file);
    }
  }

  return found;
}

/** `--gate-only`: a path is judged when it is one of the entries, or lives under one. */
export function isJudged(path: string, only: readonly string[]): boolean {
  if (only.length === 0) {
    return true;
  }

  return only.some((entry) => {
    const prefix = toPosix(entry).replace(/\/+$/, '');

    return path === prefix || path.startsWith(`${prefix}/`);
  });
}

/** The median of the files that ran something. A file that ran nothing is not evidence of speed. */
export function medianFileMs(files: Iterable<PerfFile>): number {
  const ran = [...files].filter((file) => file.testCount > 0 || file.tests > 0);

  return medianOf(ran.map((file) => file.tests));
}

function slowTests(path: string, file: PerfFile, options: GateOptions): TestCandidate[] {
  return file.cases
    .filter((entry) => entry.ms >= options.maxTestMs)
    .map((entry) => ({
      check: 'perf-gate-slow-test' as const,
      file: path,
      name: entry.name,
      ms: entry.ms,
      budget: options.maxTestMs,
      budgetNote: `--max-test-ms ${Math.round(options.maxTestMs)}`,
    }));
}

function slowFile(path: string, file: PerfFile, budget: number, options: GateOptions): FileTotalCandidate[] {
  if (file.tests < budget) {
    return [];
  }

  return [
    {
      check: 'perf-gate-slow-file',
      file: path,
      ms: file.tests,
      budget,
      budgetNote: `the larger of --max-file-ms ${Math.round(options.maxFileMs)} and ${options.factor}× the median file of this run`,
    },
  ];
}

/**
 * Everything the run says is over budget, before any of it has been confirmed.
 *
 * A file that has a slow test in it produces no file finding: the two would name the same seconds
 * twice, and the test is the more actionable half.
 */
export function gateCandidates(run: PerfRun, cwd: string, options: GateOptions): GateCandidate[] {
  const measured = measuredFiles(run, cwd);
  const fileBudget = Math.max(options.maxFileMs, medianFileMs(measured.values()) * options.factor);
  const candidates: GateCandidate[] = [];

  for (const [path, file] of [...measured].sort(([a], [b]) => a.localeCompare(b))) {
    if (!isJudged(path, options.only)) {
      continue;
    }

    /**
     * Both, and the file finding is dropped later — only if a body finding **survived confirmation**.
     * Suppressing here instead was wrong in a way that took a measured example to see: a file at 60 s
     * whose slowest body sat one millisecond over the body budget produced only that body's
     * candidate, the body did not reproduce, and the 60-second file nobody had judged passed the
     * gate.
     */
    candidates.push(...slowTests(path, file, options), ...slowFile(path, file, fileBudget, options));
  }

  if (options.maxWallMs !== undefined && run.wall > options.maxWallMs) {
    candidates.push({
      check: 'perf-gate-wall',
      ms: run.wall,
      budget: options.maxWallMs,
      budgetNote: `--max-wall-ms ${Math.round(options.maxWallMs)}`,
    });
  }

  return candidates;
}

/** The files a confirmation pass has to re-measure, in the order they were found. */
export function suspectFiles(candidates: readonly GateCandidate[]): string[] {
  return [
    ...new Set(candidates.filter((candidate): candidate is FileCandidate => candidate.check !== 'perf-gate-wall').map((c) => c.file)),
  ];
}

/** What the second measurement said about a candidate, or `undefined` when it did not measure it. */
function secondReading(candidate: FileCandidate, confirm: ReadonlyMap<string, PerfFile>): number | undefined {
  const file = confirm.get(candidate.file);

  if (file === undefined) {
    return undefined;
  }

  if (candidate.check !== 'perf-gate-slow-test') {
    return file.tests;
  }

  /** A body the second run does not list is under the report's floor, which is well under any budget. */
  return file.cases.find((entry) => entry.name === candidate.name)?.ms ?? 0;
}

const SLOW_TEST_FIX = [
  'A test body over a second is usually waiting rather than working: a timer nobody advanced (`vi.useFakeTimers()` and `vi.advanceTimersByTime`),',
  'a real request or a real animation frame, an `await` on something that settles on a schedule, or a fixture rebuilt from scratch in every case.',
  `Raise --max-test-ms only when the body genuinely has that much work to do. Background: ${GATE_DOCS}`,
].join(' ');

const SLOW_FILE_FIX = [
  'Look at what every test in the file pays before it asserts anything: a `beforeEach` that builds the whole module graph, a real clock, a fixture',
  'the file could build once. Splitting the file changes nothing — the same seconds move to two files.',
  `Background: ${GATE_DOCS}`,
].join(' ');

const REGRESSION_FIX = [
  'This file was not always this expensive. Read the diff of the file and of what it imports since the baseline was recorded: a `beforeEach`',
  'that grew a dependency, a fixture that got bigger, a double replaced by the real collaborator. If the cost is deliberate, re-record the',
  `baseline with --update-baseline in the same commit, so the next reader sees a decision rather than a drift. Background: ${GATE_DOCS}`,
].join(' ');

const WALL_FIX = `The whole run is over the budget this pipeline set for it. Raise --max-wall-ms, or take the phase table above apart — it says which phase grew. Background: ${GATE_DOCS}`;

function describe(candidate: GateCandidate): string {
  if (candidate.check === 'perf-gate-wall') {
    return `The run took ${formatMs(candidate.ms)} of wall clock, over the ${formatMs(candidate.budget)} budget (${candidate.budgetNote}).`;
  }

  if (candidate.check === 'perf-gate-slow-test') {
    return `\`${candidate.name}\` spent ${formatMs(candidate.ms)} in its body, over the ${formatMs(candidate.budget)} budget (${candidate.budgetNote}).`;
  }

  if (candidate.check === 'perf-gate-regression') {
    return `The test bodies in this file take ${candidate.grewBy.toFixed(1)}× the share of the run they took when the baseline was recorded — ${formatMs(candidate.ms)} against the ${formatMs(candidate.budget)} that share is worth here (${candidate.budgetNote}).`;
  }

  return `The test bodies in this file add up to ${formatMs(candidate.ms)}, over the ${formatMs(candidate.budget)} budget (${candidate.budgetNote}).`;
}

const FIXES: Record<GateCheck, string> = {
  'perf-gate-regression': REGRESSION_FIX,
  'perf-gate-slow-file': SLOW_FILE_FIX,
  'perf-gate-slow-test': SLOW_TEST_FIX,
  'perf-gate-wall': WALL_FIX,
};

function fixFor(candidate: GateCandidate): string {
  return FIXES[candidate.check];
}

function finding(candidate: GateCandidate, severity: Finding['severity'], tail: string): Finding {
  return {
    check: candidate.check,
    severity,
    ...(candidate.check === 'perf-gate-wall' ? {} : { file: candidate.file }),
    message: `${describe(candidate)} ${tail}`,
    fix: fixFor(candidate),
  };
}

export interface GateVerdict {
  readonly findings: readonly Finding[];
  /** Whether the run should exit non-zero: a confirmed finding, or one the caller chose to trust. */
  readonly failed: boolean;
}

const UNCONFIRMED = [
  'Measured once and never confirmed, so it fails nothing. Run the gate where the files can be re-measured,',
  'or pass --no-confirm to gate on a single reading.',
].join(' ');

/**
 * The verdict. `confirm` is the second measurement of the suspect files; `undefined` means there
 * was none, and then `trustSingle` decides whether one reading may fail a pipeline.
 */
interface Judged {
  readonly finding: Finding;
  /** Whether this one fails the run. */
  readonly failed: boolean;
  /** Whether it survived a second measurement — the only thing that may suppress a file total. */
  readonly confirmed: boolean;
}

/** One candidate against its second reading, or against the absence of one. */
function judge(candidate: GateCandidate, second: ReadonlyMap<string, PerfFile> | undefined, trustSingle: boolean): Judged {
  if (candidate.check === 'perf-gate-wall') {
    return {
      finding: finding(candidate, 'error', 'A whole-run budget is not re-measured: the second run would be the same suite again.'),
      failed: true,
      confirmed: false,
    };
  }

  const again = second === undefined ? undefined : secondReading(candidate, second);

  if (again === undefined) {
    const tail = trustSingle ? 'Measured once, and --no-confirm said that is enough.' : UNCONFIRMED;

    return { finding: finding(candidate, trustSingle ? 'error' : 'warning', tail), failed: trustSingle, confirmed: false };
  }

  if (again >= candidate.budget) {
    return {
      finding: finding(candidate, 'error', `Re-measured on its own: ${formatMs(again)}, still over budget.`),
      failed: true,
      confirmed: true,
    };
  }

  const under = `Re-measured on its own: ${formatMs(again)}${again < CASE_FLOOR_MS ? ' or less' : ''}, under budget`;

  return {
    finding: finding(candidate, 'info', `${under} — not reported as a defect. It was sharing a worker, not running slowly.`),
    failed: false,
    confirmed: false,
  };
}

/** The two kinds judged first: a body, and the whole run. Everything else is a file total. */
function isBodyOrWall(candidate: GateCandidate): candidate is TestCandidate | WallCandidate {
  return candidate.check === 'perf-gate-slow-test' || candidate.check === 'perf-gate-wall';
}

/**
 * The verdict. `confirm` is the second measurement of the suspect files; `undefined` means there
 * was none, and then `trustSingle` decides whether one reading may fail a pipeline.
 *
 * Bodies are judged first and the file totals of the files they confirmed are then not reported at
 * all: one problem, one finding. The order is the whole point — a file finding may only be dropped
 * for a body finding that survived its second measurement, never for one that merely looked bad
 * once. Suppressing at collection time instead let a 60-second file through because its slowest
 * body sat one millisecond over the body budget and then failed to reproduce.
 */
export function gateVerdict(
  candidates: readonly GateCandidate[],
  confirm: PerfRun | undefined,
  cwd: string,
  trustSingle: boolean,
): GateVerdict {
  const second = confirm === undefined ? undefined : measuredFiles(confirm, cwd);
  const findings: Finding[] = [];
  const confirmedBodies = new Set<string>();
  let failed = false;

  const take = (candidate: GateCandidate): void => {
    const judged = judge(candidate, second, trustSingle);

    findings.push(judged.finding);
    failed = failed || judged.failed;

    if (judged.confirmed && candidate.check === 'perf-gate-slow-test') {
      confirmedBodies.add(candidate.file);
    }
  };

  for (const candidate of candidates.filter(isBodyOrWall)) {
    take(candidate);
  }

  for (const candidate of candidates) {
    if (!isBodyOrWall(candidate) && !confirmedBodies.has(candidate.file)) {
      take(candidate);
    }
  }

  return { findings, failed };
}
