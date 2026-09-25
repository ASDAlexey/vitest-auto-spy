/**
 * The advice `perf` reads from the runner configs: the DOM engine, the worker count and isolation.
 */
import { availableParallelism } from 'node:os';

import type { SourceGraph } from './checks/graph';
import { isolationFromAngularBuilder } from './checks/runner-isolation';
import type { Phase } from './perf-data';
import { formatShare, shareOf } from './perf-data';
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

/**
 * `happy-dom` builds the same DOM for less, for the files that genuinely need one.
 *
 * The other half of the environment advice: `perf-environment` moves the specs that need no DOM out
 * of one entirely, and this one is for everything left behind. Only offered to a configuration that
 * names `jsdom` and does not already mention `happy-dom` anywhere — a suite that has made this
 * choice does not need to be asked again.
 */
export function domEngineFindings(phases: readonly Phase[], graph: SourceGraph): Finding[] {
  const config = configDeclaring(graph, JSDOM);

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
export function workerFindings(total: number, graph: SourceGraph, cores: number = availableParallelism()): Finding[] {
  if (total < LARGE_RUN_MS || configDeclares(graph, WORKER_CAP)) {
    return [];
  }

  const cap = Math.max(1, Math.floor(cores / 2));

  return [
    {
      check: 'perf-workers',
      severity: 'info',
      message: `No \`maxWorkers\` is declared, so Vitest starts one worker per core — ${cores} on this machine, each a whole runtime with its own memory.`,
      fix: `If the run shares this machine, set \`maxWorkers: ${cap}\` in ${configName(graph)} and compare the wall clock before and after.`,
    },
  ];
}

export function isolationFindings(phases: readonly Phase[], graph: SourceGraph, profile: Profile): Finding[] {
  const overhead = shareOf(phases, 'environment') + shareOf(phases, 'setup') + shareOf(phases, 'prepare');
  /**
   * A builder can have made this decision where no config can show it. `@angular/build:unit-test`
   * passes `isolate: false` to Vitest and overrides whatever a runner config said, so a workspace
   * on it has already taken the trade — and being told to take a decision you made is the one thing
   * a findings tool must never spend a reader's attention on.
   */
  const builder = isolationFromAngularBuilder(profile);

  if (overhead < DOMINATES || declaresNoIsolation(graph) || builder?.isolated === false) {
    return [];
  }

  return [
    {
      check: 'perf-isolation',
      severity: 'info',
      message: `Per-file environment, setup and prepare together are ${formatShare(overhead)} of the measured CPU time. \`test.isolate: false\` pays those once per worker instead of once per file.`,
      fix: `Try \`isolate: false\` in ${configName(graph)} and keep it only if peak memory stays acceptable: without isolation, every double a file creates lives until its worker ends.`,
    },
  ];
}
