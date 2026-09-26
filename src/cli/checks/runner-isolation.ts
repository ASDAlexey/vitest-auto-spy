/**
 * Whether this workspace already runs its files in one shared environment, when nothing in a Vitest
 * config says so.
 *
 * `perf-isolation` offers `test.isolate: false` to a suite whose per-file environment, setup and
 * prepare dominate. Under `@angular/build:unit-test` that offer is wrong and cannot be seen to be
 * wrong from the runner config alone: from 21.0 the builder passes `isolate: false` to Vitest itself
 * ("Defaults to false to align with the Karma/Jasmine experience", its own schema). A runner config
 * the target names can still turn isolation back on — the builder merges its `test` block over that
 * default — and from 22.1 the builder option `isolate` beats both, either way. 20.x reads no runner
 * config at all and leaves Vitest's own per-file isolation on. So a workspace that has already taken
 * the trade would get told to take it, which is the one thing a findings tool must never do: spend a
 * reader's attention on a decision they made.
 *
 * This reads the builder target rather than guessing from the dependency list, because the
 * dependency is present in every Angular workspace while the runner is not. The Nx executor
 * delegates to the same builder and inherits the same default.
 */
import { join, posix } from 'node:path';

import { readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { type UnitTestTarget, unitTestTargets } from './unit-test-targets';
import { configKeys, installedVersionOf, isBelow, isKey, isTrue } from './vitest-5-facts';

export interface IsolationVerdict {
  /** `true` when the workspace asked for per-file isolation, `false` when it takes the builder default. */
  readonly isolated: boolean;
  /** What decided it, for the message that suppresses the finding. */
  readonly why: string;
}

/** The names `runnerConfig: true` looks for, in this order, in the project root and then the workspace root. */
const BASE_CONFIGS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `vitest-base.config.${extension}`);

/** The first `@angular/build` whose default is `isolate: false` and that reads a runner config. */
const SHARED_BY_DEFAULT_FROM = [21];

/** Before 22.1 the builder option only ever forced isolation on; `isolate: false` left the runner config in charge. */
const OPTION_WINS_FROM = [22, 1];

function baseConfig(profile: Profile, root: string): string | undefined {
  return [...new Set([root, ''])]
    .flatMap((dir) => BASE_CONFIGS.map((name) => posix.join(dir, name)))
    .find((file) => readTextFile(join(profile.cwd, file)) !== undefined);
}

/** Every runner config the target can name, across its option blocks. */
function runnerConfigsOf(profile: Profile, target: UnitTestTarget): string[] {
  return target.optionBlocks.flatMap((block) => {
    const value = block['runnerConfig'];

    if (typeof value === 'string' && value !== '') {
      return [value.replace(/^\.\//, '')];
    }

    const found = value === true ? baseConfig(profile, target.root) : undefined;

    return found === undefined ? [] : [found];
  });
}

function asksForIsolation(profile: Profile, file: string): boolean {
  return configKeys(file, readTextFile(join(profile.cwd, file)) ?? '').some((entry) => isKey(entry, 'isolate') && isTrue(entry));
}

function targetVerdict(profile: Profile, target: UnitTestTarget, optionWins: boolean): IsolationVerdict | undefined {
  if (target.optionBlocks.some((block) => block['isolate'] === true)) {
    return { isolated: true, why: `${target.builder} runs with \`isolate: true\`, declared on its target` };
  }

  if (optionWins && target.optionBlocks.some((block) => block['isolate'] === false)) {
    return undefined;
  }

  const config = runnerConfigsOf(profile, target).find((file) => asksForIsolation(profile, file));

  return config === undefined ? undefined : { isolated: true, why: `${config} sets \`isolate: true\`, which ${target.builder} keeps` };
}

/**
 * The verdict, or `undefined` when this workspace does not run its suite through that builder and
 * the question is therefore none of this check's business.
 *
 * A workspace with several such targets answers `isolated: true` if **any** of them asked for
 * isolation: the finding is a suggestion to a reader, and a reader who has written the key once has
 * had the thought.
 */
export function isolationFromAngularBuilder(profile: Profile): IsolationVerdict | undefined {
  const targets = unitTestTargets(profile);
  const [first] = targets;

  if (first === undefined) {
    return undefined;
  }

  const version = installedVersionOf(profile.cwd, '@angular/build');

  if (isBelow(version, SHARED_BY_DEFAULT_FROM)) {
    return { isolated: true, why: `@angular/build ${String(version)} reads no runner config and keeps Vitest's per-file isolation` };
  }

  const optionWins = !isBelow(version, OPTION_WINS_FROM);
  const asked = targets.map((target) => targetVerdict(profile, target, optionWins)).find((verdict) => verdict !== undefined);

  return asked ?? { isolated: false, why: `${first.builder} already runs without per-file isolation — that is its default` };
}
