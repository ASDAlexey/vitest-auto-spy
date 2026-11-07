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
 *    config that sets them. Comments and strings are cut first, and a config the text cannot settle —
 *    `projects` / `workspace` giving some tests settings of their own, a flag written twice — reads as
 *    every flag off, so the rule stays silent rather than delete a reset one project still needs.
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
 * Which file a directory resolves to is cached per directory, because a suite asks the same question
 * once per spec file; what the file says is cached by its mtime, so an editor's ESLint server sees an edit.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { findStringEnd } from '../jsonc';
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

/** One walk's answer per directory: the config's path, or `null` for "searched, found nothing". */
const configCache = new Map<string, string | null>();

/** Each config's reading, kept while its mtime holds, so an editor's long-lived ESLint sees an edit. */
const flagsCache = new Map<string, { mtimeMs: number; flags: ConfigFlags }>();

/** The installed Vitest's major per directory, or `null` for "searched, found nothing". */
const versionCache = new Map<string, number | null>();

/** Every flag off and `clearMocks` named: what a config this reading cannot settle counts as. */
const UNREADABLE: ConfigFlags = { clearMocks: false, mockReset: false, restoreMocks: false };

/** A key that gives some tests a config of their own, which a text reading cannot tell apart from the root's. */
const PER_PROJECT = /\b(?:projects|workspace)\b/;

/** The config's code with comments cut and every string emptied, so neither can spell a flag. */
function codeOf(text: string): string {
  const parts: string[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);

    if (text.startsWith('//', index) || text.startsWith('/*', index)) {
      const terminator = text.startsWith('//', index) ? '\n' : '*/';
      const end = text.indexOf(terminator, index + 2);

      index = end === -1 ? text.length : end + terminator.length;
      parts.push(' ');
    } else if (char === '"' || char === "'" || char === '`') {
      index = findStringEnd(text, index);
      parts.push(`${char}${char}`);
    } else {
      parts.push(char);
      index += 1;
    }
  }

  return parts.join('');
}

/**
 * The three flags as a config's code sets them; anything but a literal `true` reads as off, and an unnamed `clearMocks`
 * as unknown. A config with per-project settings, or a flag written twice, is unreadable: every flag off.
 */
function flagsIn(text: string): ConfigFlags {
  const code = codeOf(text);
  const mentions = (flag: string): number => code.match(new RegExp(`\\b${flag}\\b`, 'g'))?.length ?? 0;

  if (PER_PROJECT.test(code) || Object.keys(UNREADABLE).some((flag) => mentions(flag) > 1)) {
    return UNREADABLE;
  }

  return {
    clearMocks: mentions('clearMocks') === 0 ? undefined : /\bclearMocks\s*:\s*true\b/.test(code),
    mockReset: /\bmockReset\s*:\s*true\b/.test(code),
    restoreMocks: /\brestoreMocks\s*:\s*true\b/.test(code),
  };
}

/** A config file's flags, read again whenever its mtime moves; `null` once it is gone. */
function flagsAt(path: string): ConfigFlags | null {
  let mtimeMs: number;

  try {
    ({ mtimeMs } = statSync(path));
  } catch {
    return null;
  }

  const cached = flagsCache.get(path);

  if (cached?.mtimeMs === mtimeMs) {
    return cached.flags;
  }

  const flags = flagsIn(readFileSync(path, 'utf8'));

  flagsCache.set(path, { mtimeMs, flags });

  return flags;
}

/** The first runner config in one directory. */
function configIn(directory: string): string | null {
  return CONFIG_NAMES.map((candidate) => join(directory, candidate)).find((path) => existsSync(path)) ?? null;
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
    if (config === undefined) {
      return NO_CONFIG;
    }

    return config === named?.path ? named.flags : (flagsAt(config) ?? NO_CONFIG);
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
  const text = flagsAt(path);

  if (text === null) {
    throw new Error(
      `[vitest-auto-spy] no-redundant-mock-reset: the configFile option names ${path}, which does not exist. ` +
        'Point it at the runner config that sets clearMocks / restoreMocks / mockReset, relative to the directory ESLint runs in.',
    );
  }

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
    const path = nearest(dirname(context.filename), configCache, configIn);
    const found = path === null ? null : flagsAt(path);

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
