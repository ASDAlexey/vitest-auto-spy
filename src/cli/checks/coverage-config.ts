/**
 * Coverage settings that cost something and announce nothing.
 *
 * The first two findings are the same defect in two shapes: a coverage setting written where the
 * party that assembles the coverage options never looks at it, or written in a form the first of the
 * two matching passes throws away. Nothing fails either way — the run is green and a report is
 * produced; it is simply not the report the setting describes, and no warning says so.
 *
 * The third is the same silence about time rather than about content: a scope large enough that
 * matching it costs more than collecting the coverage does. That one is `info`, because the report
 * it produces is correct.
 */
import { join, posix } from 'node:path';

import { COVERAGE_MATCHING_DOCS } from '../docs';
import { captures, parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { Finding } from '../report';
import { UNIT_TEST_BUILDERS, unitTestTargets } from './unit-test-targets';
import { vitestMajor } from './vitest-5-facts';

/** Where a Vitest config lives when no builder target names one explicitly. */
const CONFIG_CANDIDATES = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.cts',
  'vitest.config.js',
  'vitest.config.mjs',
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.cts',
  'vite.config.js',
  'vite.config.mjs',
];

/** The names `runnerConfig: true` looks for, in this order, in the project root and then the workspace root. */
const BASE_CONFIGS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `vitest-base.config.${extension}`);

const WORKSPACE_FILE = /(^|\/)(?:angular|workspace|project)\.json$/;
const UNIT_TEST_BUILDER = '@angular/build:unit-test';

const runsUnitTestBuilder = (target: Record<string, unknown>): boolean =>
  [target['builder'], target['executor']].some((name) => typeof name === 'string' && UNIT_TEST_BUILDERS.has(name));

/** Vitest 4 is where `coverage.all` stopped existing. */
const ALL_REMOVED_IN = 4;

/**
 * Vitest 5 is where the coverage provider started compiling `coverage.include`/`exclude` once.
 *
 * `BaseCoverageProvider.getGlobMatchers()` builds the two `picomatch` matchers on first use and
 * keeps them; before it, `isIncluded()` went through `picomatch.isMatch(file, patterns, options)`,
 * which compiles the list again on every call.
 */
const GLOBS_COMPILED_ONCE_IN = 5;

/**
 * Patterns above which `isIncluded` stops being free on the versions that recompile them.
 *
 * The provider memoises the *verdict*, keyed by filename, and never the compiled matcher, so
 * `picomatch` recompiles the whole list once per file. The number is a floor, not a cliff: on a real
 * shard the surcharge was linear in the list, and 50 is simply where a hand-written scope ends and a
 * generated one begins. A list this long is also evidence the workspace is large enough for the
 * per-file cost to be multiplied by thousands.
 */
const RECOMPILE_THRESHOLD = 50;

/**
 * The first `coverage: { … }` object literal of a config, brace-balanced from its opening brace.
 *
 * Lexical, like every other reader in this CLI: the config is a TypeScript module that may compute
 * its own value, and evaluating a consumer's config to learn which keys it sets is far more than
 * this is worth. A brace inside a string literal inside the coverage block would end the slice
 * early — the cost of that is a missed finding, never a wrong one, because both callers only ask
 * whether a key is present.
 */
export function coverageBlock(text: string): string | undefined {
  const opening = /coverage\s*:\s*{/.exec(text);

  if (opening === null) {
    return undefined;
  }

  let depth = 0;

  for (let index = opening.index + opening[0].length - 1; index < text.length; index += 1) {
    if (text[index] === '{') {
      depth += 1;
    } else if (text[index] === '}') {
      depth -= 1;

      if (depth === 0) {
        return text.slice(opening.index, index + 1);
      }
    }
  }

  return undefined;
}

/** The block with everything nested inside a deeper object literal removed. */
function ownKeysText(block: string): string {
  let depth = 0;
  let kept = '';

  for (const character of block) {
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
    } else if (depth === 1) {
      kept += character;
    }
  }

  return kept;
}

/** Whether the coverage block sets `key` itself, rather than inside a nested literal. */
export function declaresKey(block: string, key: string): boolean {
  return new RegExp(`(?:^|[\\s,])${key}\\s*:`).test(ownKeysText(block));
}

/** The quoted entries of one of the block's own array-valued keys. */
export function arrayPatterns(block: string, key: string): string[] {
  const arrays = captures(ownKeysText(block), new RegExp(`(?:^|[\\s,])${key}\\s*:\\s*\\[([^\\]]*)]`, 'g'));

  return arrays.flatMap((body) => captures(body, /["'`]([^"'`]+)["'`]/g));
}

/** The quoted entries of the block's own `include` array. */
export function includePatterns(block: string): string[] {
  return arrayPatterns(block, 'include');
}

/**
 * Whether a pattern can match an emitted bundle chunk — a `.js` file with a generated name.
 *
 * A pattern whose last segment names no extension can match anything, so it is treated as able to;
 * only a pattern that pins an extension other than `js` is evidence that it cannot.
 */
export function canMatchBundleChunk(pattern: string): boolean {
  const segment = pattern.slice(pattern.lastIndexOf('/') + 1);

  if (!segment.includes('.')) {
    return true;
  }

  const extension = segment.slice(segment.lastIndexOf('.') + 1);

  return extension === '*' || /^[cm]?js$/.test(extension) || /^{[^}]*\b[cm]?js\b[^}]*}$/.test(extension);
}

/**
 * Every `@angular/build:unit-test` target in a workspace document, handed to `onOptions`.
 *
 * The walk is the same for every question asked of a workspace; only what is read off the matched
 * target differs, so the recursion lives here once.
 */
function forEachUnitTestOptions(value: unknown, onOptions: (options: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      forEachUnitTestOptions(item, onOptions);
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const options = value['options'];

  if (runsUnitTestBuilder(value) && isRecord(options)) {
    onOptions(options);
  }

  for (const nested of Object.values(value)) {
    forEachUnitTestOptions(nested, onOptions);
  }
}

/** The same walk over every workspace file this profile carries. */
function forEachWorkspaceUnitTest(profile: Profile, onOptions: (options: Record<string, unknown>) => void): void {
  for (const file of profile.files.filter((candidate) => WORKSPACE_FILE.test(candidate))) {
    forEachUnitTestOptions(parseJsonc(readTextFile(join(profile.cwd, file)) ?? ''), onOptions);
  }
}

/** How many coverage globs the workspace's unit-test targets declare between them. */
export function targetScopeSize(profile: Profile): number {
  let patterns = 0;

  forEachWorkspaceUnitTest(profile, (options) => {
    for (const key of ['coverageInclude', 'coverageExclude']) {
      const list = options[key];

      if (Array.isArray(list)) {
        patterns += list.length;
      }
    }
  });

  return patterns;
}

function baseConfigIn(profile: Profile, roots: readonly string[]): string | undefined {
  for (const root of new Set(roots)) {
    const file = BASE_CONFIGS.map((name) => posix.join(root, name)).find(
      (candidate) => readTextFile(join(profile.cwd, candidate)) !== undefined,
    );

    if (file !== undefined) {
      return file;
    }
  }

  return undefined;
}

/**
 * Runner config files an `@angular/build:unit-test` target of this workspace reads: the one it
 * names, or the `vitest-base.config.*` that `runnerConfig: true` resolves to.
 */
export function unitTestRunnerConfigs(profile: Profile): string[] {
  const found = new Set<string>();

  forEachWorkspaceUnitTest(profile, (options) => {
    const runnerConfig = options['runnerConfig'];

    if (typeof runnerConfig === 'string') {
      found.add(runnerConfig.replace(/^\.\//, ''));
    }
  });

  for (const target of unitTestTargets(profile)) {
    const base = target.optionBlocks.some((block) => block['runnerConfig'] === true) ? baseConfigIn(profile, [target.root, '']) : undefined;

    if (base !== undefined) {
      found.add(base);
    }
  }

  return [...found];
}

export function checkCoverageConfig(profile: Profile): Finding[] {
  const runnerConfigs = unitTestRunnerConfigs(profile);
  const targetScope = targetScopeSize(profile);
  const major = vitestMajor(profile.cwd);
  const builderNote =
    unitTestTargets(profile).length > 0 ? ` Under \`${UNIT_TEST_BUILDER}\`, Vitest 5 needs @angular/build 22.2.0 or newer.` : '';
  const findings: Finding[] = [];

  for (const file of [...new Set([...runnerConfigs, ...CONFIG_CANDIDATES])]) {
    const text = readTextFile(join(profile.cwd, file));
    const block = text === undefined ? undefined : coverageBlock(text);

    if (block === undefined) {
      continue;
    }

    if (major !== undefined && major >= ALL_REMOVED_IN && declaresKey(block, 'all')) {
      findings.push({
        check: 'coverage-all-removed',
        severity: 'warning',
        file,
        message: `\`coverage.all\` no longer exists in Vitest ${major}: the key is absent from \`coverageConfigDefaults\` and nothing reads it. The pass over files no test imported is driven by \`coverage.include\` now.`,
        fix: 'Delete `all` and declare `coverage.include` instead. Without an include the report has been covering only the files the run imported — which is what this config has been silently doing since the upgrade.',
      });
    }

    const scopeSize = arrayPatterns(block, 'include').length + arrayPatterns(block, 'exclude').length + targetScope;

    if (major !== undefined && major < GLOBS_COMPILED_ONCE_IN && scopeSize >= RECOMPILE_THRESHOLD) {
      findings.push({
        check: 'coverage-include-recompiles-globs',
        severity: 'info',
        file,
        message: `The coverage scope here is ${scopeSize} globs, and Vitest ${major} compiles every one of them again for every file it checks, so matching can cost more than the coverage itself.`,
        fix: `Upgrade to Vitest ${GLOBS_COMPILED_ONCE_IN}, which compiles them once.${builderNote} To stay on ${major}, use the custom-provider recipe: ${COVERAGE_MATCHING_DOCS}`,
      });
    }

    const patterns = runnerConfigs.includes(file) ? includePatterns(block) : [];

    if (patterns.length > 0 && !patterns.some(canMatchBundleChunk)) {
      findings.push({
        check: 'coverage-include-misses-bundle',
        severity: 'warning',
        file,
        message: `\`coverage.include\` here names only sources, and \`${UNIT_TEST_BUILDER}\` runs the suite over a bundle: the provider matches the list once against the executed chunks, before any remap, and every counter is dropped there.`,
        fix: 'Move the list to the target’s `coverageInclude` option — the builder prepends `spec-*.js` and `chunk-*.js` to it, which is exactly what the pre-remap pass needs. Keeping it here means an empty report from a run that stays green.',
      });
    }
  }

  return findings;
}
