/**
 * Whether a measured run went through the Angular unit-test builder, and where a Vitest setting can
 * reach it from there.
 *
 * Under `@angular/build:unit-test` Vitest reads only the runner config the target names, the builder
 * itself decides `isolate` and `environment`, and the modules Vitest imports are esbuild bundles.
 * Advice written for a plain `vitest.config.ts` names a file the run never read, a command that
 * cannot run the suite, and modules that do not exist on disk.
 */
import { join, posix } from 'node:path';

import { hasRootConfig, scriptRunsVitest } from './checks/perf-harness';
import { type UnitTestTarget, unitTestTargets } from './checks/unit-test-targets';
import { installedVersionOf, isBelow } from './checks/vitest-5-facts';
import { pathExists } from './fs-scan';
import type { Profile } from './profile';

export interface BuilderRun {
  /** The target the command names, or the workspace's first; `undefined` when no workspace file declares one. */
  readonly target: UnitTestTarget | undefined;
  /** The installed `@angular/build`. */
  readonly version: string | undefined;
  /** The runner config the run reads, repository-relative, or `undefined` when nothing names one. */
  readonly runnerConfig: string | undefined;
  /** From 21 the builder reads a runner config and picks `happy-dom` when it resolves; 20.x does neither. */
  readonly configurable: boolean;
  /** The target sets `isolate: true` itself, which from 22.1 beats any runner config. */
  readonly isolateOption: boolean;
  readonly happyDom: boolean;
}

export interface PerfContext {
  /** Set when the measured run went through the builder. */
  readonly builder?: BuilderRun;
  /** Any unit-test target at all: `npx vitest doctor` cannot rebuild such a workspace's suite. */
  readonly builderWorkspace: boolean;
  /** The installed `@analogjs/vite-plugin-angular`. */
  readonly analog?: string;
}

export const PLAIN_CONTEXT: PerfContext = { builderWorkspace: false };

export const ANALOG_PLUGIN = '@analogjs/vite-plugin-angular';

/** The first `@angular/build` that reads a runner config and picks `happy-dom` on its own. */
const CONFIGURABLE_FROM = [21];

const BASE_CONFIGS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `vitest-base.config.${extension}`);

/** What `ng generate config vitest` writes, and so the name advice suggests for a new runner config. */
export const SUGGESTED_RUNNER_CONFIG = 'vitest-base.config.mts';

const BUILDER_CLI = /(?:^|&&|\|\||;|\s)(?:(?:npx|pnpm|yarn|bunx)\s+(?:exec\s+)?)?(?:ng|nx)\s/;
const SCRIPT_CALL = /^\s*(?:npm|pnpm|yarn)\s+(?:run(?:-script)?\s+)?([\w.:-]+)/;
const RUNNER_CONFIG_FLAG = /--runner-?[Cc]onfig(?:=|\s+)["']?([^\s"']+)/;
const RUN_TARGET = /\b(?:ng|nx)\s+run\s+([^\s:]+):([^\s:]+)/;
const SHORT_TARGET = /\b(?:ng|nx)\s+([\w-]+)\s+([^\s-]\S*)/;

/** The command line, and the script body it calls when it is `npm test` or `npm run <script>`. */
function linesOf(command: string | undefined, scripts: Readonly<Record<string, string>>): string[] {
  const line = command ?? (scripts['test'] === undefined ? undefined : 'npm test');

  if (line === undefined) {
    return [];
  }

  const script = SCRIPT_CALL.exec(line)?.[1];
  const body = script === undefined ? undefined : scripts[script];

  return body === undefined ? [line] : [line, body];
}

function runsBuilder(lines: readonly string[], profile: Profile, targets: readonly UnitTestTarget[]): boolean {
  if (lines.some((line) => BUILDER_CLI.test(line))) {
    return true;
  }

  return !lines.some((line) => scriptRunsVitest(line)) && targets.length > 0 && !hasRootConfig(profile.cwd);
}

function targetOf(lines: readonly string[], targets: readonly UnitTestTarget[]): UnitTestTarget | undefined {
  for (const line of lines) {
    const run = RUN_TARGET.exec(line);
    const short = run === null ? SHORT_TARGET.exec(line) : null;
    const [project, name] = run === null ? [short?.[2], short?.[1]] : [run[1], run[2]];
    const found =
      targets.find((target) => target.project === project && target.name === name) ?? targets.find((target) => target.project === project);

    if (found !== undefined) {
      return found;
    }
  }

  return targets[0];
}

function namedRunnerConfig(profile: Profile, target: UnitTestTarget | undefined): string | undefined {
  const value = target?.optionBlocks
    .map((block) => block['runnerConfig'])
    .filter((entry): entry is string | true => entry === true || (typeof entry === 'string' && entry !== ''))
    .at(-1);

  if (target === undefined || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value.replace(/^\.\//, '');
  }

  const found = [...new Set([target.root, ''])]
    .flatMap((dir) => BASE_CONFIGS.map((name) => posix.join(dir, name)))
    .find((file) => pathExists(join(profile.cwd, file)));

  return found ?? posix.join(target.root, SUGGESTED_RUNNER_CONFIG);
}

/**
 * What `perf` knows about the run beyond its report. `command` is `--command`; without one the run is
 * judged by what `npm test` runs, the same way the bare run decides whether it would measure the suite.
 */
export function perfContext(profile: Profile, command: string | undefined): PerfContext {
  const targets = unitTestTargets(profile);
  const lines = linesOf(command, profile.scripts);
  const analog = installedVersionOf(profile.cwd, ANALOG_PLUGIN);
  const base = {
    builderWorkspace: targets.length > 0 || lines.some((line) => BUILDER_CLI.test(line)),
    ...(analog === undefined ? {} : { analog }),
  };

  if (!runsBuilder(lines, profile, targets)) {
    return base;
  }

  const target = targetOf(lines, targets);
  const version = installedVersionOf(profile.cwd, '@angular/build');
  const runnerConfig = lines
    .map((line) => RUNNER_CONFIG_FLAG.exec(line)?.[1])
    .find((file) => file !== undefined)
    ?.replace(/^\.\//, '');

  return {
    ...base,
    builder: {
      target,
      version,
      runnerConfig: runnerConfig ?? namedRunnerConfig(profile, target),
      configurable: !isBelow(version, CONFIGURABLE_FROM),
      isolateOption: target?.optionBlocks.some((block) => block['isolate'] === true) === true,
      happyDom: profile.dependencies['happy-dom'] !== undefined || installedVersionOf(profile.cwd, 'happy-dom') !== undefined,
    },
  };
}

/** `app:test`, or a description when no workspace file declares the target. */
export function targetLabel(builder: BuilderRun): string {
  return builder.target === undefined ? 'the unit-test target' : `\`${builder.target.project}:${builder.target.name}\``;
}

/** The command that runs the target, for a recipe. */
export function builderCommand(builder: BuilderRun): string {
  const target = builder.target;

  if (target === undefined) {
    return 'npx ng test';
  }

  return `npx ${target.builder.startsWith('@nx/') ? 'nx' : 'ng'} run ${target.project}:${target.name}`;
}

/**
 * Where a new Vitest setting goes under the builder, for "set X in …": the runner config the run
 * reads, or one the target has to be pointed at first.
 */
export function runnerConfigHome(builder: BuilderRun): string {
  if (builder.runnerConfig !== undefined) {
    return builder.runnerConfig;
  }

  const where = builder.target === undefined ? '' : ` in ${builder.target.file}`;

  return `a runner config — ${targetLabel(builder)} names none, so add \`"runnerConfig": "${SUGGESTED_RUNNER_CONFIG}"\` to its options${where} first —`;
}

/** Why a setting cannot reach Vitest through a builder that reads no runner config. */
export function unavailableUnder(builder: BuilderRun, setting: string): string {
  return `${setting} cannot reach Vitest through @angular/build ${String(builder.version)}: it reads no runner config before 21. Upgrade to 21 or later to make this change.`;
}

const TEST_EXTENSION = /\.(?:spec|test)\.[^./]+$/;
const BUNDLE = /^(spec|chunk)-(.+)\.[cm]?js$/;

/**
 * A slow import under the builder, named for a reader, or `undefined` to leave it out. The builder
 * names a spec's bundle `spec-<path>.js`, its path with `/` as `-` and no test extension; a
 * `chunk-*.js` is shared code no source file answers to. Neither exists on disk.
 */
export function builderImport(module: string, spec: string, named: string): string | undefined {
  const match = module.includes('/node_modules/') ? null : BUNDLE.exec(posix.basename(module));

  if (match === null) {
    return named;
  }

  const dashed = spec.replace(TEST_EXTENSION, '').replaceAll('/', '-');
  const name = String(match[2]);

  return match[1] === 'spec' && (dashed === name || dashed.endsWith(`-${name}`)) ? `${spec}, bundled with its imports` : undefined;
}
