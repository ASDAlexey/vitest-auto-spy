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
 *    for `vitest.config.*` / `vite.config.*` and read as **text** — a `clearMocks: true` and its two
 *    siblings, nothing evaluated, no module loaded. A lint run must not execute a project's config
 *    to decide what to report, and the three values this needs are written as literals in every
 *    config that sets them.
 *
 * With neither, the answer is `undefined` and the rule reports nothing. That is the whole reason
 * this file exists rather than a default of "assume Vitest's defaults": Vitest's own default for
 * `clearMocks` has moved between major versions, and a rule that deletes lines on an assumption
 * about a file it never found would be wrong in the one direction that costs a suite its isolation.
 *
 * **What the search misses**, said out loud because the workspace this was measured on is the case:
 * a runner config at a path nothing standard names — one a builder picks, such as the
 * `runnerConfig` of `@angular/build:unit-test` — is not found. `configFile` points at it, so the
 * flags are read from the file that sets them rather than copied into the lint config and kept in
 * step by hand. The search is a convenience for the ordinary layout, not a promise.
 *
 * The result is cached per directory for the length of the lint run, because a suite asks the same
 * question once per spec file and the answer is one directory walk shared by all of them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { type RuleContext } from './rule-types';

/** The three runner options that reset mocks between tests. */
export interface RunnerResets {
  clearMocks: boolean;
  mockReset: boolean;
  restoreMocks: boolean;
}

/** The config file names a runner is configured in, in the order a directory is searched. */
const CONFIG_NAMES = ['vitest.config', 'vite.config'].flatMap((base) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${base}.${extension}`),
);

/** One walk's answer per directory: the flags, or `null` for "searched, found nothing". */
const cache = new Map<string, RunnerResets | null>();

/** The three flags as a config's text sets them; anything but a literal `true` reads as off. */
function flagsIn(text: string): RunnerResets {
  return {
    clearMocks: /\bclearMocks\s*:\s*true\b/.test(text),
    mockReset: /\bmockReset\s*:\s*true\b/.test(text),
    restoreMocks: /\brestoreMocks\s*:\s*true\b/.test(text),
  };
}

/** The first runner config in one directory, read. */
function configIn(directory: string): RunnerResets | null {
  const name = CONFIG_NAMES.find((candidate) => existsSync(join(directory, candidate)));

  return name === undefined ? null : flagsIn(readFileSync(join(directory, name), 'utf8'));
}

/** The nearest runner config at or above `directory`, cached for every directory the walk passed. */
function search(directory: string): RunnerResets | null {
  const walked: string[] = [];
  let found: RunnerResets | null = null;

  for (let current = directory; ; current = dirname(current)) {
    const cached = cache.get(current);

    if (cached !== undefined) {
      found = cached;
      break;
    }

    walked.push(current);
    found = configIn(current);

    if (found !== null || dirname(current) === current) {
      break;
    }
  }

  walked.forEach((entry) => cache.set(entry, found));

  return found;
}

/** The rule's options: the three flags, and the runner config to read them from. */
interface ResetOptions extends Partial<RunnerResets> {
  configFile?: string;
}

function isResetOptions(value: unknown): value is ResetOptions {
  return typeof value === 'object' && value !== null;
}

/** The runner config `configFile` names, read; loud when it is not there. */
function namedConfig(context: RuleContext, configFile: string): RunnerResets {
  const path = resolve(context.cwd, configFile);

  if (!existsSync(path)) {
    throw new Error(
      `[vitest-auto-spy] no-redundant-mock-reset: the configFile option names ${path}, which does not exist. ` +
        'Point it at the runner config that sets clearMocks / restoreMocks / mockReset, relative to the directory ESLint runs in.',
    );
  }

  return flagsIn(readFileSync(path, 'utf8'));
}

/** What the runner resets between tests, or `undefined` when nothing said. */
export function runnerResets(context: RuleContext): RunnerResets | undefined {
  const [options] = context.options;

  if (!isResetOptions(options)) {
    return search(dirname(context.filename)) ?? undefined;
  }

  const base =
    options.configFile === undefined
      ? { clearMocks: false, mockReset: false, restoreMocks: false }
      : namedConfig(context, options.configFile);

  return {
    clearMocks: options.clearMocks ?? base.clearMocks,
    mockReset: options.mockReset ?? base.mockReset,
    restoreMocks: options.restoreMocks ?? base.restoreMocks,
  };
}
