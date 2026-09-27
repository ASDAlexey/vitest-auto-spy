/**
 * What the runner is configured to reset between tests — the one fact `no-redundant-mock-reset`
 * cannot read off the file it is linting.
 *
 * Two sources, in this order.
 *
 * 1. **The rule's own options**, `{ clearMocks, restoreMocks, mockReset }`. Given at all, they are
 *    the answer: a project that writes them has said what its runner does, and going to the disk
 *    behind that would let a stray `vite.config.ts` overrule it. `{ configFile }` names the runner
 *    config instead — absolute, or relative to ESLint's working directory — and it is read the same
 *    way as a config the search finds; a flag given beside it wins over the file. A `configFile`
 *    that does not exist is a configuration error and says so, rather than a rule that goes quiet.
 * 2. **The runner config beside the file**, found by walking up from the linted file's directory
 *    for `vitest.config.*` / `vite.config.*` / `vitest-base.config.*` (the name `runnerConfig: true` of
 *    `@angular/build:unit-test` resolves) and read as **text** — a `clearMocks: true` and its two
 *    siblings, nothing evaluated, no module loaded. A lint run must not execute a project's config
 *    to decide what to report, and the three values this needs are written as literals in every
 *    config that sets them.
 *
 * With neither, the answer is `undefined` and the rule reports nothing. That is the whole reason
 * this file exists rather than a default of "assume Vitest's defaults": a rule that deletes lines on
 * an assumption about a file it never found would be wrong in the one direction that costs a suite
 * its isolation.
 *
 * **A config file that leaves `clearMocks` out gets Vitest's default for it**, and that default moved:
 * off up to Vitest 4, on from Vitest 5. The installed major is read from the nearest
 * `node_modules/vitest/package.json` above the linted file, cached the same way; not found, or older
 * than 5, it stays off. A `clearMocks` the config names at all — `false`, an expression — is not the
 * default and reads as off. The rule's own flags are not defaulted: what they leave out is off.
 *
 * **A config is not the only runner.** Where a `@angular/build:unit-test` / `@nx/angular:unit-test`
 * target serves the file (`builder-targets.ts`), the flags a config gives — searched or `configFile` —
 * count only as far as each builder run applies them too: one without `runnerConfig` reads no config
 * and runs on Vitest's defaults, so a `restoreMocks: true` it never sees does not make a reset dead.
 * The rule's own flags are not narrowed: written by hand, they are the project's word for every run.
 * `configFlags` is the one that is: the flags a factory-built `configFile` sets beyond its text, read
 * as if written there, so they reach exactly the runs that load that file.
 *
 * **What the search misses**, said out loud because the workspace this was measured on is the case:
 * a runner config at a path nothing standard names — a `runnerConfig` string of
 * `@angular/build:unit-test` pointing elsewhere — is not found. `configFile` points at it, so the
 * flags are read from the file that sets them rather than copied into the lint config and kept in
 * step by hand. The search is a convenience for the ordinary layout, not a promise.
 *
 * The result is cached per directory for the length of the lint run, because a suite asks the same
 * question once per spec file and the answer is one directory walk shared by all of them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { builderConfigs } from './builder-targets';
import { type RuleContext } from './rule-types';

/** The three runner options that reset mocks between tests. */
export interface RunnerResets {
  clearMocks: boolean;
  mockReset: boolean;
  restoreMocks: boolean;
  /** `clearMocks` is on only because the config left it to Vitest 5's default. */
  clearByDefault: boolean;
}

/** A config's reading before the installed Vitest settles what an unnamed `clearMocks` means. */
interface ConfigFlags extends Omit<RunnerResets, 'clearByDefault' | 'clearMocks'> {
  clearMocks: boolean | undefined;
}

/** A run that reads no config file: every flag at Vitest's default. */
const NO_CONFIG: ConfigFlags = { clearMocks: undefined, mockReset: false, restoreMocks: false };

/** The config file names a runner is configured in, in the order a directory is searched. */
const CONFIG_NAMES = ['vitest.config', 'vite.config', 'vitest-base.config'].flatMap((base) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${base}.${extension}`),
);

/** One walk's answer per directory: the config's flags, or `null` for "searched, found nothing". */
const configCache = new Map<string, ConfigFlags | null>();

/** The installed Vitest's major per directory, or `null` for "searched, found nothing". */
const versionCache = new Map<string, number | null>();

/** The three flags as a config's text sets them; anything but a literal `true` reads as off, and an unnamed `clearMocks` as unknown. */
function flagsIn(text: string): ConfigFlags {
  return {
    clearMocks: /\bclearMocks\b/.test(text) ? /\bclearMocks\s*:\s*true\b/.test(text) : undefined,
    mockReset: /\bmockReset\s*:\s*true\b/.test(text),
    restoreMocks: /\brestoreMocks\s*:\s*true\b/.test(text),
  };
}

/** The first runner config in one directory, read. */
function configIn(directory: string): ConfigFlags | null {
  const name = CONFIG_NAMES.find((candidate) => existsSync(join(directory, candidate)));

  return name === undefined ? null : flagsIn(readFileSync(join(directory, name), 'utf8'));
}

/** The major of the Vitest installed in one directory's `node_modules`. */
function vitestIn(directory: string): number | null {
  const path = join(directory, 'node_modules', 'vitest', 'package.json');

  if (!existsSync(path)) {
    return null;
  }

  const major = /"version"\s*:\s*"(\d+)\./.exec(readFileSync(path, 'utf8'))?.[1];

  return major === undefined ? null : Number(major);
}

/** The nearest answer `probe` gives at or above `directory`, cached for every directory the walk passed. */
function nearest<T>(directory: string, cache: Map<string, T | null>, probe: (directory: string) => T | null): T | null {
  const walked: string[] = [];
  let found: T | null = null;

  for (let current = directory; ; current = dirname(current)) {
    const cached = cache.get(current);

    if (cached !== undefined) {
      found = cached;
      break;
    }

    walked.push(current);
    found = probe(current);

    if (found !== null || dirname(current) === current) {
      break;
    }
  }

  walked.forEach((entry) => cache.set(entry, found));

  return found;
}

/** A config's flags, with an unnamed `clearMocks` given the default of the Vitest installed beside the file. */
function settled(context: RuleContext, flags: ConfigFlags): RunnerResets {
  if (flags.clearMocks !== undefined) {
    return { ...flags, clearMocks: flags.clearMocks, clearByDefault: false };
  }

  const clearByDefault = (nearest(dirname(context.filename), versionCache, vitestIn) ?? 0) >= 5;

  return { ...flags, clearMocks: clearByDefault, clearByDefault };
}

/** What only both runs do: a reset is dead only where every runner serving the file performs it. */
function meet(left: RunnerResets, right: RunnerResets): RunnerResets {
  const clearMocks = left.clearMocks && right.clearMocks;

  return {
    clearMocks,
    mockReset: left.mockReset && right.mockReset,
    restoreMocks: left.restoreMocks && right.restoreMocks,
    clearByDefault: clearMocks && left.clearByDefault && right.clearByDefault,
  };
}

/** A named config's path and its reading, which a builder run loading that same file shares. */
interface NamedConfig {
  path: string;
  flags: ConfigFlags;
}

/** A config's flags narrowed to what every unit-test builder target serving the file also resets. */
function underBuilders(context: RuleContext, found: RunnerResets, named?: NamedConfig): RunnerResets {
  const read = (config: string | undefined): ConfigFlags => {
    if (config === undefined || !existsSync(config)) {
      return NO_CONFIG;
    }

    return config === named?.path ? named.flags : flagsIn(readFileSync(config, 'utf8'));
  };

  return builderConfigs(context.filename).reduce((flags, config) => meet(flags, settled(context, read(config))), found);
}

type ResetFlags = Partial<Pick<RunnerResets, 'clearMocks' | 'mockReset' | 'restoreMocks'>>;

/** The rule's options: the three flags, the runner config to read them from, and what that config sets beyond its text. */
interface ResetOptions extends ResetFlags {
  configFile?: string;
  configFlags?: ResetFlags;
}

function isResetOptions(value: unknown): value is ResetOptions {
  return typeof value === 'object' && value !== null;
}

/** The runner config `configFile` names, read with `configFlags` over its text; loud when it is not there. */
function namedConfig(context: RuleContext, configFile: string, extra: ResetFlags = {}): NamedConfig {
  const path = resolve(context.cwd, configFile);

  if (!existsSync(path)) {
    throw new Error(
      `[vitest-auto-spy] no-redundant-mock-reset: the configFile option names ${path}, which does not exist. ` +
        'Point it at the runner config that sets clearMocks / restoreMocks / mockReset, relative to the directory ESLint runs in.',
    );
  }

  const text = flagsIn(readFileSync(path, 'utf8'));

  return {
    path,
    flags: {
      clearMocks: extra.clearMocks ?? text.clearMocks,
      mockReset: extra.mockReset ?? text.mockReset,
      restoreMocks: extra.restoreMocks ?? text.restoreMocks,
    },
  };
}

/** The flags `configFile` gives every run that loads it, narrowed by the builder runs that do not. */
function fromConfigFile(context: RuleContext, configFile: string, extra: ResetFlags | undefined): RunnerResets {
  const named = namedConfig(context, configFile, extra);

  return underBuilders(context, settled(context, named.flags), named);
}

/** What the runner resets between tests, or `undefined` when nothing said. */
export function runnerResets(context: RuleContext): RunnerResets | undefined {
  const [options] = context.options;

  if (!isResetOptions(options)) {
    const found = nearest(dirname(context.filename), configCache, configIn);

    return found === null ? undefined : underBuilders(context, settled(context, found));
  }

  const base =
    options.configFile === undefined
      ? { clearMocks: false, mockReset: false, restoreMocks: false, clearByDefault: false }
      : fromConfigFile(context, options.configFile, options.configFlags);

  return {
    clearMocks: options.clearMocks ?? base.clearMocks,
    mockReset: options.mockReset ?? base.mockReset,
    restoreMocks: options.restoreMocks ?? base.restoreMocks,
    clearByDefault: options.clearMocks === undefined && base.clearByDefault,
  };
}
