/**
 * The advice `perf` reads from the runner configs: the DOM engine, the worker count, isolation and
 * the module cache. A report that carries Vitest's resolved config is read from that instead of
 * from the config text; an older one falls back to reading the configs.
 */
import { availableParallelism } from 'node:os';

import type { SourceGraph } from './checks/graph';
import { isolationFromAngularBuilder } from './checks/runner-isolation';
import type { BuilderRun, PerfContext } from './perf-builder';
import { ANALOG_PLUGIN, PLAIN_CONTEXT, builderCommand, runnerConfigHome, targetLabel, unavailableUnder } from './perf-builder';
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
function configName(graph: SourceGraph, context: PerfContext): string {
  if (context.builder !== undefined) {
    return runnerConfigHome(context.builder);
  }

  const [first] = configCode(graph)
    .map(([file]) => file)
    .sort((a, b) => configRank(a) - configRank(b) || a.localeCompare(b));

  return first ?? 'your Vitest config';
}

/** The fix that sets `setting` in the config the run reads, or why the builder leaves it nowhere to go. */
function fixIn(graph: SourceGraph, context: PerfContext, setting: string, fix: (config: string) => string): string {
  const builder = context.builder;

  return builder === undefined || builder.configurable ? fix(configName(graph, context)) : unavailableUnder(builder, setting);
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

/** What `@angular/build:unit-test` passes to Vitest itself, so Vitest 5 lists it as provided either way. */
const BUILDER_PROVIDED: ReadonlySet<string> = new Set(['environment', 'isolate']);

/** Vitest 5 records which options the user set; advice never second-guesses one of those. */
function provided(run: PerfRun, option: string, context: PerfContext): boolean {
  return run.config?.provided?.includes(option) === true && !(context.builder !== undefined && BUILDER_PROVIDED.has(option));
}

/** The config that runs the suite on `jsdom`: the resolved one when the report has it, the config text otherwise. */
function jsdomConfig(graph: SourceGraph, run: PerfRun): string | undefined {
  const environment = run.config?.environment;

  if (environment === undefined) {
    return configDeclaring(graph, JSDOM);
  }

  return environment === 'jsdom' ? (configDeclaring(graph, JSDOM) ?? configName(graph, PLAIN_CONTEXT)) : undefined;
}

function engineSwap(phases: readonly Phase[], config: string): Finding {
  return {
    check: 'perf-environment-engine',
    severity: 'info',
    message: `${config} sets \`environment: 'jsdom'\`, and building the DOM is ${formatShare(shareOf(phases, 'environment'))} of the measured CPU time. Every spec that needs a DOM keeps paying that, whatever moves to \`node\`.`,
    fix: `Try \`environment: 'happy-dom'\` in ${config}, one project at a time with the suite green after each: it builds the DOM for less, and implements less of the platform.`,
  };
}

/**
 * From 21 `@angular/build:unit-test` runs the suite on `happy-dom` whenever the package resolves and
 * the runner config names no environment, so there the switch is an install rather than a config line.
 */
function builderEngineFindings(phases: readonly Phase[], graph: SourceGraph, run: PerfRun, builder: BuilderRun): Finding[] {
  const config = builder.runnerConfig;

  if (config !== undefined && JSDOM.test(graph.texts.get(config) ?? '')) {
    return [engineSwap(phases, config)];
  }

  if (!builder.configurable || builder.happyDom || (run.config?.environment ?? 'jsdom') !== 'jsdom') {
    return [];
  }

  return [
    {
      check: 'perf-environment-engine',
      severity: 'info',
      message: `@angular/build runs this suite on \`jsdom\` because \`happy-dom\` is not installed, and building the DOM is ${formatShare(shareOf(phases, 'environment'))} of the measured CPU time. Every spec that needs a DOM keeps paying that, whatever moves to \`node\`.`,
      fix: 'Try `npm i -D happy-dom`: the builder picks it over `jsdom` by itself, with no config line. Keep it only if the suite stays green: it builds the DOM for less, and implements less of the platform.',
    },
  ];
}

/**
 * `happy-dom` builds the same DOM for less, for the files that genuinely need one.
 *
 * The other half of the environment advice: `perf-environment` moves the specs that need no DOM out
 * of one entirely, and this one is for everything left behind. Only offered to a configuration that
 * names `jsdom` and does not already mention `happy-dom` anywhere — a suite that has made this
 * choice does not need to be asked again.
 */
export function domEngineFindings(
  phases: readonly Phase[],
  graph: SourceGraph,
  run: PerfRun,
  context: PerfContext = PLAIN_CONTEXT,
): Finding[] {
  if (shareOf(phases, 'environment') < DOMINATES || configDeclares(graph, HAPPY_DOM)) {
    return [];
  }

  if (context.builder !== undefined) {
    return builderEngineFindings(phases, graph, run, context.builder);
  }

  const config = jsdomConfig(graph, run);

  return config === undefined ? [] : [engineSwap(phases, config)];
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
export function workerFindings(
  total: number,
  graph: SourceGraph,
  run: PerfRun,
  cores: number = availableParallelism(),
  context: PerfContext = PLAIN_CONTEXT,
): Finding[] {
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
      fix: fixIn(
        graph,
        context,
        '`maxWorkers`',
        (config) => `If the run shares this machine, set \`maxWorkers: ${cap}\` in ${config} and compare the wall clock before and after.`,
      ),
    },
  ];
}

/**
 * Whether the run has already settled isolation. The resolved config is the answer when the report
 * carries it: a `vm` pool, `isolate: false`, or an `isolate` the user set on purpose.
 */
function isolationSettled(graph: SourceGraph, profile: Profile, run: PerfRun, context: PerfContext): boolean {
  const config = run.config;

  if (config?.isolate !== undefined) {
    return !config.isolate || provided(run, 'isolate', context) || (config.pool !== undefined && !ISOLATING_POOLS.has(config.pool));
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

const ISOLATION_TRADE =
  'keep it only if peak memory stays acceptable: without isolation, every double a file creates lives until its worker ends.';

function isolationFix(graph: SourceGraph, context: PerfContext): string {
  const builder = context.builder;

  // From 22.1 the target's own option beats the runner config, so that is where the switch is.
  if (builder?.isolateOption === true && builder.target !== undefined) {
    return `Try \`"isolate": false\` on ${targetLabel(builder)} in ${builder.target.file} and ${ISOLATION_TRADE}`;
  }

  return fixIn(graph, context, '`isolate: false`', (config) => `Try \`isolate: false\` in ${config} and ${ISOLATION_TRADE}`);
}

export function isolationFindings(
  phases: readonly Phase[],
  graph: SourceGraph,
  profile: Profile,
  run: PerfRun,
  cores: number = availableParallelism(),
  context: PerfContext = PLAIN_CONTEXT,
): Finding[] {
  const overhead = shareOf(phases, 'environment') + shareOf(phases, 'setup') + shareOf(phases, 'prepare');

  if (overhead < DOMINATES || isolationSettled(graph, profile, run, context)) {
    return [];
  }

  return [
    {
      check: 'perf-isolation',
      severity: 'info',
      message: `Per-file environment, setup and prepare together are ${formatShare(overhead)} of the measured CPU time. \`test.isolate: false\` pays those once per worker instead of once per file.${startupCost(run, cores)}`,
      fix: isolationFix(graph, context),
    },
  ];
}

const ANALOG_CONFIG = /@analogjs\/vite-plugin-angular/;
const INLINE_STYLES = /\bstyles\s*:\s*["'[`]/;

function inlineStyledComponent(graph: SourceGraph): boolean {
  return [...graph.texts.values()].some((text) => text.includes('@Component(') && INLINE_STYLES.test(text));
}

/** Analog compiles inline `styles` in JIT mode into virtual modules a warm module cache cannot find again. */
function analogRisk(graph: SourceGraph, context: PerfContext): boolean {
  return context.builder === undefined && configDeclares(graph, ANALOG_CONFIG) && inlineStyledComponent(graph);
}

function analogWarning(phases: readonly Phase[], context: PerfContext): Finding {
  const plugin = context.analog === undefined ? ANALOG_PLUGIN : `${ANALOG_PLUGIN} ${context.analog}`;

  return {
    check: 'perf-transform',
    severity: 'warning',
    message: `Waiting for modules to be transformed is ${formatShare(shareOf(phases, 'transform'))} of the measured CPU time, but the module cache is not the fix here: under ${plugin} a component with inline \`styles\` breaks the second, warm run with \`Cannot find module '/@id/__x00__virtual:angular:jit:style:inline;<hash>'\` in every spec that renders one.`,
    fix: `Leave \`fsModuleCache\` off while the suite runs through ${plugin}, and measure again after upgrading it.`,
  };
}

/**
 * Transform wait, which Vitest 5 measures per file. Nothing keeps a transform between two runs
 * unless `fsModuleCache` is on, so every run pays the whole graph again.
 */
export function transformFindings(
  phases: readonly Phase[],
  graph: SourceGraph,
  run: PerfRun,
  context: PerfContext = PLAIN_CONTEXT,
): Finding[] {
  const waiting = run.files.filter((file): file is PerfFile & { fetch: number } => file.fetch !== undefined);
  const cached = run.config?.fsModuleCache ?? configDeclares(graph, MODULE_CACHE);

  /** Only when every file carries it is `transform` the per-file wait rather than the whole-run number. */
  if (
    waiting.length === 0 ||
    waiting.length < run.files.length ||
    shareOf(phases, 'transform') < DOMINATES ||
    cached ||
    provided(run, 'fsModuleCache', context)
  ) {
    return [];
  }

  // No Analog release is measured to keep inline styles through a warm cache yet (2.7.5 breaks); same rule as doctor.
  if (analogRisk(graph, context)) {
    return [analogWarning(phases, context)];
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
      fix: fixIn(
        graph,
        context,
        option,
        (config) =>
          `Set ${option} in ${config}: the next run reads the transformed modules from ${directory} instead, which puts up to ${formatMs(wait)} of that wait at stake. On CI it only helps when ${directory} is kept between pipelines, in the job's cache.`,
      ),
    },
  ];
}

/**
 * Under the builder `npx vitest doctor` runs the specs without the bundle, the globals and the
 * TestBed the builder sets up, and its baseline fails on `describe is not defined`.
 */
function builderAbFindings(builder: BuilderRun | undefined): Finding[] {
  if (!builder?.configurable) {
    return [];
  }

  const command = `${builderCommand(builder)} --watch=false`;
  const base = builder.runnerConfig === undefined ? command : `${command} --runner-config=${builder.runnerConfig}`;
  const variant = builder.runnerConfig === undefined ? 'a runner config of its own' : `a copy of ${builder.runnerConfig}`;

  return [
    {
      check: 'perf-vitest-doctor',
      severity: 'info',
      message:
        'This run went through @angular/build, where `npx vitest doctor` cannot measure anything: without the builder the specs are not bundled and get no globals, so its baseline run fails on `describe is not defined`. The builder takes a runner config per run, which is enough for an A/B of your own.',
      fix: `Before keeping a change suggested above, put it in ${variant} and time \`${command} --runner-config=<variant>\` against \`${base}\`, a few rounds each, alternating.`,
    },
  ];
}

/**
 * On Vitest 5 the switches above can be measured rather than trusted: `vitest doctor` re-runs the
 * suite once per candidate. One line, only when a finding it could confirm fired.
 */
export function vitestDoctorFindings(run: PerfRun, findings: readonly Finding[], context: PerfContext = PLAIN_CONTEXT): Finding[] {
  if ((vitestMajor(run) ?? 0) < 5 || !findings.some((finding) => CONFIRMABLE.has(finding.check) && finding.severity === 'info')) {
    return [];
  }

  if (context.builderWorkspace || context.builder !== undefined) {
    return builderAbFindings(context.builder);
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
