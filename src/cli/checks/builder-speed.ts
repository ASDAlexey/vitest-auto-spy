/**
 * Two speed-ups `@angular/build:unit-test` leaves on the table by default: the module cache for a
 * run the builder instruments with istanbul, and happy-dom, which the builder picks once it resolves.
 *
 * Both go through the runner config the target names, which the builder reads from 21.0 on; 20.x
 * reads none and always runs jsdom, so there neither advice has anything to act on.
 */
import { join, posix } from 'node:path';

import { readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { namedTargets } from './angular-build';
import { type UnitTestTarget, unitTestTargets } from './unit-test-targets';
import {
  type ConfigKey,
  ciConfigs,
  configKeys,
  installedVersionOf,
  isBelow,
  isKey,
  isTrue,
  stringValue,
  vitestMajor,
} from './vitest-5-facts';
import { CACHE_PATH, persistFix, persistedInCi } from './vitest-5-upgrade';

/** The first `@angular/build` that reads a runner config and picks happy-dom by itself. */
const RUNNER_CONFIG_FROM = [21];

/** The only major the istanbul numbers were measured on. */
const MODULE_CACHE_VITEST_FROM = 5;

const BASE_CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

interface TargetConfig {
  readonly target: UnitTestTarget;
  /** The runner config the target names, repository-relative, when one exists. */
  readonly config: string | undefined;
  readonly keys: readonly ConfigKey[];
  readonly browsers: readonly string[];
}

function namedConfig(profile: Profile, target: UnitTestTarget, value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') {
    return value.replace(/^\.\//, '');
  }

  if (value !== true) {
    return undefined;
  }

  const candidates = [...new Set([target.root, ''])].flatMap((dir) =>
    BASE_CONFIG_EXTENSIONS.map((extension) => posix.join(dir, `vitest-base.config.${extension}`)),
  );

  return candidates.find((file) => readTextFile(join(profile.cwd, file)) !== undefined);
}

function keysOf(profile: Profile, config: string | undefined): ConfigKey[] {
  return config === undefined ? [] : configKeys(config, readTextFile(join(profile.cwd, config)) ?? '');
}

function targetConfig(profile: Profile, target: UnitTestTarget): TargetConfig {
  const config = target.optionBlocks.map((block) => namedConfig(profile, target, block['runnerConfig'])).find(Boolean);
  const browsers = target.optionBlocks.flatMap((block) =>
    Array.isArray(block['browsers']) ? block['browsers'].filter((name): name is string => typeof name === 'string') : [],
  );

  return { target, config, keys: keysOf(profile, config), browsers };
}

function builderTargets(profile: Profile): TargetConfig[] {
  if (!isRunnerConfigRead(profile)) {
    return [];
  }

  return unitTestTargets(profile).map((target) => targetConfig(profile, target));
}

function isRunnerConfigRead(profile: Profile): boolean {
  const version = installedVersionOf(profile.cwd, '@angular/build');

  return version !== undefined && !isBelow(version, RUNNER_CONFIG_FROM);
}

/** Why the builder resolves the coverage provider to istanbul for this target, or `undefined` when it does not. */
function istanbulBecause(profile: Profile, { config, keys, browsers }: TargetConfig): string | undefined {
  // The −46 % was measured on jsdom in Node only; browser mode stays unadvised until measured.
  if (browsers.length > 0) {
    return undefined;
  }

  const provider = keys.filter((key) => isKey(key, 'coverage.provider')).map(stringValue)[0];

  if (provider !== undefined) {
    return provider === 'istanbul' ? `${String(config)} sets \`coverage.provider: 'istanbul'\`` : undefined;
  }

  const istanbul = installedVersionOf(profile.cwd, '@vitest/coverage-istanbul') !== undefined;
  const v8 = installedVersionOf(profile.cwd, '@vitest/coverage-v8') !== undefined;

  return istanbul && !v8 ? 'only `@vitest/coverage-istanbul` is installed, so the builder picks istanbul' : undefined;
}

const hasModuleCache = ({ keys }: TargetConfig): boolean => keys.some((key) => isKey(key, 'fsModuleCache') && isTrue(key));

const ISTANBUL_MEASURED =
  'On an Angular 22.2 suite of 700 spec files on Vitest 5, the module cache took an istanbul coverage run under the builder from 24.55 s to 13.20 s (−46 %), and from 27.01 s to 15.85 s (−41 %) with the builder cache off, as it is on CI; with v8 it gained nothing, since the builder has already bundled the code.';

interface Group {
  readonly first: TargetConfig;
  readonly why: string;
  readonly targets: TargetConfig[];
}

function moduleCacheFinding(profile: Profile, { first, why, targets: group }: Group): Finding {
  const where = namedTargets(group.map(({ target }) => target));
  const ci = ciConfigs(profile);
  const persist = ci.length > 0 && !persistedInCi(ci, CACHE_PATH) ? ` ${persistFix(CACHE_PATH)}` : '';
  const turnOn =
    first.config === undefined
      ? `Add \`"runnerConfig": "vitest-base.config.mts"\` to the options of ${where}, and export \`defineConfig({ test: { fsModuleCache: true } })\` from that file.`
      : `Add \`fsModuleCache: true\` to the \`test\` block of ${first.config}.`;

  return {
    check: 'angular-build-istanbul-module-cache',
    severity: 'info',
    file: first.config ?? first.target.file,
    message: `${where} collects coverage with istanbul through \`${first.target.builder}\` (${why}), and no runner config of it turns on \`fsModuleCache\`: every run instruments every file again. ${ISTANBUL_MEASURED}`,
    fix: `${turnOn}${persist}`,
  };
}

function checkIstanbulModuleCache(profile: Profile, targets: readonly TargetConfig[]): Finding[] {
  const major = vitestMajor(profile.cwd);

  if (major === undefined || major < MODULE_CACHE_VITEST_FROM) {
    return [];
  }

  const groups = new Map<string, Group>();

  for (const entry of targets) {
    const why = hasModuleCache(entry) ? undefined : istanbulBecause(profile, entry);

    if (why !== undefined) {
      const key = entry.config ?? '';
      const group = groups.get(key) ?? { first: entry, why, targets: [] };

      group.targets.push(entry);
      groups.set(key, group);
    }
  }

  return [...groups.values()].map((group) => moduleCacheFinding(profile, group));
}

function checkHappyDom(profile: Profile, targets: readonly TargetConfig[]): Finding[] {
  const jsdom = installedVersionOf(profile.cwd, 'jsdom');

  if (jsdom === undefined || installedVersionOf(profile.cwd, 'happy-dom') !== undefined) {
    return [];
  }

  const onJsdom = targets.filter(({ keys, browsers }) => browsers.length === 0 && !keys.some((key) => isKey(key, 'environment')));

  if (onJsdom.length === 0) {
    return [];
  }

  const where = namedTargets(onJsdom.map(({ target }) => target));

  return [
    {
      check: 'angular-build-happy-dom',
      severity: 'info',
      file: 'package.json',
      message: `${where} runs on jsdom ${jsdom} only because \`happy-dom\` is not installed: from @angular/build 21 the builder picks happy-dom by itself whenever it resolves, unless the runner config sets \`environment\`. On an Angular 22.2 suite of 700 spec files happy-dom took 4.6 % off the wall time and 6 % off the resident memory of the run.`,
      fix: '`npm i -D happy-dom`; no config line is needed. happy-dom implements less of the platform than jsdom, so run the suite once and keep jsdom (uninstall happy-dom) if a spec depends on what it lacks.',
    },
  ];
}

export function checkBuilderSpeed(profile: Profile): Finding[] {
  const targets = builderTargets(profile);

  return [...checkIstanbulModuleCache(profile, targets), ...checkHappyDom(profile, targets)];
}
