/**
 * The advice `perf` reads from the runner configs: the DOM engine, the worker count, isolation and
 * the module cache. A report that carries Vitest's resolved config is read from that instead of
 * from the config text; an older one falls back to reading the configs.
 */
import { availableParallelism } from 'node:os';

import type { SourceGraph } from './checks/graph';
import { isolationFromAngularBuilder } from './checks/runner-isolation';
import type { PerfFile, PerfRun, Phase } from './perf-data';
import { formatMs, formatShare, shareOf } from './perf-data';
import type { Profile } from './profile';
import type { Finding } from './report';

/** The share at which a phase is worth naming files over. Below it the advice would be noise. */
export const DOMINATES = 0.3;

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
/**
 * A property, the shorthand for a value computed above it, or the `const` behind that shorthand —
 * a config that sizes its pool from the cgroup rather than from a literal is the one that thought
 * about this hardest, and it was the one being told it had not declared a cap.
 */
const WORKER_CAP = /\bmaxWorkers\s*[,:=}]|\bmaxWorkers\s*$/m;
const MODULE_CACHE = /\bfsModuleCache\s*:\s*true/;

/** The pools `isolate` changes anything in: the `vm` pools give every file a fresh context either way. */
const ISOLATING_POOLS: ReadonlySet<string> = new Set(['forks', 'threads']);

/** The findings `npx vitest doctor` can A/B on this machine: pool, isolation, DOM engine, module cache, workers. */
const CONFIRMABLE: ReadonlySet<string> = new Set(['perf-environment-engine', 'perf-isolation', 'perf-transform', 'perf-workers']);

/**
 * Summed phase time above which the worker count is a decision rather than a detail.
 *
 * Below it the machine runs the whole suite in a few seconds on any setting, and a note about peak
 * memory is noise. Above it the suite is the kind that shares a runner with other jobs.
 */
const LARGE_RUN_MS = 60_000;

/**
 * Comment lines are dropped first: this repository's own config explains `isolate: false` in a
 * comment three lines above `isolate: true`, and a prose mention is not a setting.
 */
function configCode(graph: SourceGraph): [string, string][] {
  const configs: [string, string][] = [];

  for (const [file, text] of graph.texts) {
    if (!CONFIG_FILE.test(file)) {
      continue;
    }

    configs.push([
      file,
      text
        .split('\n')
        .filter((line) => !/^\s*(?:\/[*/]|\*)/.test(line))
        .join('\n'),
    ]);
  }

  return configs;
}

/** The first runner config that declares `setting`, ignoring the comments that discuss it. */
function configDeclaring(graph: SourceGraph, setting: RegExp): string | undefined {
  return configCode(graph).find(([, code]) => setting.test(code))?.[0];
}

/** Whether any runner config declares `setting`. */
function configDeclares(graph: SourceGraph, setting: RegExp): boolean {
  return configDeclaring(graph, setting) !== undefined;
}

/** Nesting first, then a plain `vitest.config.*` over a named variant such as `vitest.bench.config.*`. */
function configRank(file: string): number {
  return file.split('/').length * 2 + (/(?:^|\/)vite(?:st)?\.config\./.test(file) ? 0 : 1);
}

/** The runner config a new setting belongs in, named for the reader. */
function configName(graph: SourceGraph): string {
  const [first] = configCode(graph)
    .map(([file]) => file)
    .sort((a, b) => configRank(a) - configRank(b) || a.localeCompare(b));

  return first ?? 'your Vitest config';
}

export function declaresNoIsolation(graph: SourceGraph): boolean {
  return configDeclares(graph, NO_ISOLATION);
}

/** The major version of the Vitest that ran the suite, or `undefined` when the report does not say. */
export function vitestMajor(run: PerfRun): number | undefined {
  const major = /^(\d+)\./.exec(run.vitest ?? '')?.[1];

  return major === undefined ? undefined : Number(major);
}

/**
 * How many workers the run could have at once: the resolved `maxWorkers`, or on Vitest 5, which
 * leaves it out unless configured, the highest lane a file ran on.
 */
function workerCount(run: PerfRun): number | undefined {
  const lanes = run.files.flatMap((file) => (file.lane === undefined ? [] : [file.lane]));

  return run.config?.maxWorkers ?? (lanes.length === 0 ? undefined : Math.max(...lanes));
}

/** Vitest 5 records which options the user set; advice never second-guesses one of those. */
function provided(run: PerfRun, option: string): boolean {
  return run.config?.provided?.includes(option) === true;
}

/**
 * `happy-dom` builds the same DOM for less, for the files that genuinely need one.
 *
 * The other half of the environment advice: `perf-environment` moves the specs that need no DOM out
 * of one entirely, and this one is for everything left behind. Only offered to a configuration that
 * names `jsdom` and does not already mention `happy-dom` anywhere — a suite that has made this
 * choice does not need to be asked again.
 */
/** The config that runs the suite on `jsdom`: the resolved one when the report has it, the config text otherwise. */
function jsdomConfig(graph: SourceGraph, run: PerfRun): string | undefined {
  const environment = run.config?.environment;

  if (environment === undefined) {
    return configDeclaring(graph, JSDOM);
  }

  return environment === 'jsdom' ? (configDeclaring(graph, JSDOM) ?? configName(graph)) : undefined;
}

export function domEngineFindings(phases: readonly Phase[], graph: SourceGraph, run: PerfRun): Finding[] {
  const config = jsdomConfig(graph, run);

  if (shareOf(phases, 'environment') < DOMINATES || config === undefined || configDeclares(graph, HAPPY_DOM)) {
    return [];
  }

  return [
    {
      check: 'perf-environment-engine',
      severity: 'info',
      message: `${config} sets \`environment: 'jsdom'\`, and building the DOM is ${formatShare(shareOf(phases, 'environment'))} of the measured CPU time. Every spec that needs a DOM keeps paying that, whatever moves to \`node\`.`,
      fix: `Try \`environment: 'happy-dom'\` in ${config}, one project at a time with the suite green after each: it builds the DOM for less, and implements less of the platform.`,
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
export function workerFindings(total: number, graph: SourceGraph, run: PerfRun, cores: number = availableParallelism()): Finding[] {
  const cap = Math.max(1, Math.floor(cores / 2));
  const resolved = workerCount(run);

  if (total < LARGE_RUN_MS || configDeclares(graph, WORKER_CAP) || (resolved !== undefined && resolved <= cap)) {
    return [];
  }

  const started =
    resolved === undefined
      ? `one worker per core — ${cores} on this machine`
      : `up to ${resolved} workers on this machine's ${cores} cores`;

  return [
    {
      check: 'perf-workers',
      severity: 'info',
      message: `No \`maxWorkers\` is declared, so Vitest starts ${started}, each a whole runtime with its own memory.`,
      fix: `If the run shares this machine, set \`maxWorkers: ${cap}\` in ${configName(graph)} and compare the wall clock before and after.`,
    },
  ];
}

/**
 * Whether the run has already settled isolation. The resolved config is the answer when the report
 * carries it: a `vm` pool, `isolate: false`, or an `isolate` the user set on purpose.
 */
function isolationSettled(graph: SourceGraph, profile: Profile, run: PerfRun): boolean {
  const config = run.config;

  if (config?.isolate !== undefined) {
    return !config.isolate || provided(run, 'isolate') || (config.pool !== undefined && !ISOLATING_POOLS.has(config.pool));
  }

  /**
   * A builder can have made this decision where no config can show it. `@angular/build:unit-test`
   * passes `isolate: false` to Vitest unless its target or the runner config it names asks for isolation.
   */
  return declaresNoIsolation(graph) || isolationFromAngularBuilder(profile)?.isolated === false;
}

/**
 * The start-up isolation pays, and what reusing workers would save — the estimate Vitest 5's own
 * isolate hint makes: startup spread over the lanes, less the one start-up per lane that stays.
 */
function startupCost(run: PerfRun, cores: number): string {
  const startup = run.startup;

  if (startup === undefined || startup.workers === 0) {
    return '';
  }

  const lanes = Math.max(1, Math.min(run.files.length, workerCount(run) ?? cores - 1));
  const spawned = ` ${startup.workers} workers were spawned, ${formatMs(startup.ms)} of start-up summed over them (spawn, bundle and environment).`;

  if (startup.workers <= lanes) {
    return spawned;
  }

  const saving = startup.ms / lanes - startup.ms / startup.workers;

  return `${spawned} Reusing one worker per lane saves at least ~${formatMs(saving)} of wall clock, by the estimate Vitest 5's own isolate hint makes: that start-up spread over ${lanes} lanes, less the one start-up per lane that stays.`;
}

export function isolationFindings(
  phases: readonly Phase[],
  graph: SourceGraph,
  profile: Profile,
  run: PerfRun,
  cores: number = availableParallelism(),
): Finding[] {
  const overhead = shareOf(phases, 'environment') + shareOf(phases, 'setup') + shareOf(phases, 'prepare');

  if (overhead < DOMINATES || isolationSettled(graph, profile, run)) {
    return [];
  }

  return [
    {
      check: 'perf-isolation',
      severity: 'info',
      message: `Per-file environment, setup and prepare together are ${formatShare(overhead)} of the measured CPU time. \`test.isolate: false\` pays those once per worker instead of once per file.${startupCost(run, cores)}`,
      fix: `Try \`isolate: false\` in ${configName(graph)} and keep it only if peak memory stays acceptable: without isolation, every double a file creates lives until its worker ends.`,
    },
  ];
}

/**
 * Transform wait, which Vitest 5 measures per file. Nothing keeps a transform between two runs
 * unless `fsModuleCache` is on, so every run pays the whole graph again.
 */
export function transformFindings(phases: readonly Phase[], graph: SourceGraph, run: PerfRun): Finding[] {
  const waiting = run.files.filter((file): file is PerfFile & { fetch: number } => file.fetch !== undefined);
  const cached = run.config?.fsModuleCache ?? configDeclares(graph, MODULE_CACHE);

  /** Only when every file carries it is `transform` the per-file wait rather than the whole-run number. */
  if (
    waiting.length === 0 ||
    waiting.length < run.files.length ||
    shareOf(phases, 'transform') < DOMINATES ||
    cached ||
    provided(run, 'fsModuleCache')
  ) {
    return [];
  }

  const wait = waiting.reduce((total, file) => total + file.fetch, 0);
  const legacy = (vitestMajor(run) ?? 5) < 5;
  const option = legacy ? '`experimental.fsModuleCache: true`' : '`fsModuleCache: true`';
  const directory = legacy ? 'node_modules/.experimental-vitest-cache' : 'node_modules/.vitest-cache';

  return [
    {
      check: 'perf-transform',
      severity: 'info',
      message: `Waiting for modules to be transformed is ${formatShare(shareOf(phases, 'transform'))} of the measured CPU time — ${formatMs(wait)} over ${waiting.length} files — and every run pays it again, because nothing keeps a transform between runs.`,
      fix: `Set ${option} in ${configName(graph)}: the next run reads the transformed modules from ${directory} instead, which puts up to ${formatMs(wait)} of that wait at stake. On CI it only helps when ${directory} is kept between pipelines, in the job's cache.`,
    },
  ];
}

/**
 * On Vitest 5 the switches above can be measured rather than trusted: `vitest doctor` re-runs the
 * suite once per candidate. One line, only when a finding it could confirm fired.
 */
export function vitestDoctorFindings(run: PerfRun, findings: readonly Finding[]): Finding[] {
  if ((vitestMajor(run) ?? 0) < 5 || !findings.some((finding) => CONFIRMABLE.has(finding.check))) {
    return [];
  }

  return [
    {
      check: 'perf-vitest-doctor',
      severity: 'info',
      message: `This run was measured on Vitest ${String(run.vitest)}, which ships an A/B runner of its own: \`npx vitest doctor\` re-runs the suite once per pool, isolation, DOM-engine and module-cache candidate and recommends only a switch it measured faster on this machine. It is Vitest's command, not this package's \`doctor\`.`,
      fix: 'Run `npx vitest doctor` before keeping any pool, `isolate`, `environment`, `fsModuleCache` or `maxWorkers` change suggested above.',
    },
  ];
}
