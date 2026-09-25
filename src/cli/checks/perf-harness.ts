/**
 * Whether a bare `vitest run` in this repository would measure this repository's suite.
 *
 * It very often would not, and the failure is silent in the worst way. A workspace whose suite is
 * built by something else — the Angular `@angular/build:unit-test` builder, an Nx target that runs
 * a config per project, a script that generates one — has no Vitest configuration at its root, so
 * `vitest run` there takes the defaults: no `globals`, no path aliases, and an `include` that
 * sweeps up every `*.spec.*` in the tree, build output included. Every file then fails to collect,
 * on `describe is not defined` or `Cannot find package '@app/thing'`, and the phase table that
 * comes out is real time spent on nothing: transform and environment for 1 800 files, zero test
 * bodies. Measured on one such workspace: 1 830 files, 29 s of wall clock, 0 ms of tests.
 *
 * So this refuses before spending the half-minute, and says which of the two entry points to use.
 * The check is deliberately narrow — a repository that has a root config, or whose `test` script
 * runs Vitest itself, is left alone, because for those the bare run **is** the suite.
 */
import { join } from 'node:path';

import { BARE_RUN_DOCS } from '../docs';
import { pathExists } from '../fs-scan';
import { PERF_REPORTER_ENV } from '../perf-data';
import type { Profile } from '../profile';
import { type UnitTestTarget, unitTestTargets } from './unit-test-targets';

/** Config files `vitest run` reads from the directory it is started in. */
const ROOT_CONFIGS: readonly string[] = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.cts',
  'vitest.config.js',
  'vitest.config.mjs',
  'vitest.config.cjs',
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.cts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
  'vitest.workspace.ts',
  'vitest.workspace.js',
  'vitest.workspace.json',
];

/**
 * `vitest` as the command of the `test` script rather than a word inside it. `npm test` being
 * `node tools/bench/run.mjs` is the case this exists to catch, and that script may well end up
 * running Vitest — through a builder, with a configuration this command cannot see.
 */
const RUNS_VITEST = /(?:^|&&|\|\||;|\s)(?:(?:npx|pnpm|yarn|bunx)\s+(?:--no\s+|-y\s+|dlx\s+)?)?vitest(?:\s|$)/;

export function hasRootConfig(cwd: string): boolean {
  return ROOT_CONFIGS.some((candidate) => pathExists(join(cwd, candidate)));
}

export function scriptRunsVitest(script: string | undefined): boolean {
  return script !== undefined && RUNS_VITEST.test(script);
}

/**
 * The Angular unit-test builder reads no Vitest config unless its target names one, but it takes
 * `--reporters` and `--include` on the command line, so the reporter attaches with no file edited.
 */
function builderRecipe(target: UnitTestTarget): string[] {
  const cli = target.builder.startsWith('@nx/') ? 'nx' : 'ng';

  return [
    `\`${target.project}:${target.name}\` in ${target.file} runs through \`${target.builder}\`, which takes the perf reporter as an option. Measure it with:`,
    `  npx vitest-auto-spy perf --command 'npx ${cli} run ${target.project}:${target.name} --reporters=default --reporters="$${PERF_REPORTER_ENV}" {paths:--include=}'`,
  ];
}

function configRecipe(script: string | undefined): string[] {
  return [
    'Attach the perf reporter where the Vitest config of your suite declares `reporters`:',
    `  const perf = process.env['${PERF_REPORTER_ENV}'];`,
    "  reporters: perf === undefined ? ['default'] : ['default', perf],",
    script === undefined ? 'Then measure the command that runs your suite:' : 'Then measure the command that runs it:',
    `  npx vitest-auto-spy perf --command '${script === undefined ? '<command that runs your suite>' : 'npm test'}'`,
  ];
}

/**
 * The refusal, or `undefined` when a bare run is fair. Prose rather than a `Finding`: it is
 * returned before anything ran, and it replaces the report instead of appearing inside one.
 */
export function bareRunWouldMeasureSomethingElse(profile: Profile): string | undefined {
  if (hasRootConfig(profile.cwd) || scriptRunsVitest(profile.scripts['test'])) {
    return undefined;
  }

  const script = profile.scripts['test'];
  const seen = script === undefined ? 'there is no `test` script' : `\`npm test\` is \`${script}\``;
  const [target] = unitTestTargets(profile);

  return [
    `A bare \`vitest run\` would not measure this repository's suite: there is no vitest.config or vite.config at the root, and ${seen}. Without a config every file fails to collect, so the timings would measure nothing.`,
    ...(target === undefined ? configRecipe(script) : builderRecipe(target)),
    `Docs: ${BARE_RUN_DOCS}`,
  ].join('\n');
}
