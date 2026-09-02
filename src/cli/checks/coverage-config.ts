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
import { join } from 'node:path';

import { captures, parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { Finding } from '../report';

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

const WORKSPACE_FILE = /(^|\/)(?:angular|workspace|project)\.json$/;
const UNIT_TEST_BUILDER = '@angular/build:unit-test';

/** Vitest 4 is where `coverage.all` stopped existing. */
const ALL_REMOVED_IN = 4;

/**
 * Patterns above which `isIncluded` stops being free.
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

/** Pattern counts from an `@angular/build:unit-test` target's own coverage options. */
function collectTargetScope(value: unknown, into: { patterns: number }): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTargetScope(item, into);
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const options = value['options'];

  if ((value['builder'] === UNIT_TEST_BUILDER || value['executor'] === UNIT_TEST_BUILDER) && isRecord(options)) {
    for (const key of ['coverageInclude', 'coverageExclude']) {
      const list = options[key];

      if (Array.isArray(list)) {
        into.patterns += list.length;
      }
    }
  }

  for (const nested of Object.values(value)) {
    collectTargetScope(nested, into);
  }
}

/** How many coverage globs the workspace's unit-test targets declare between them. */
export function targetScopeSize(profile: Profile): number {
  const total = { patterns: 0 };

  for (const file of profile.files.filter((candidate) => WORKSPACE_FILE.test(candidate))) {
    collectTargetScope(parseJsonc(readTextFile(join(profile.cwd, file)) ?? ''), total);
  }

  return total.patterns;
}

function collectRunnerConfigs(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRunnerConfigs(item, into);
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const options = value['options'];

  if ((value['builder'] === UNIT_TEST_BUILDER || value['executor'] === UNIT_TEST_BUILDER) && isRecord(options)) {
    const runnerConfig = options['runnerConfig'];

    if (typeof runnerConfig === 'string') {
      into.add(runnerConfig.replace(/^\.\//, ''));
    }
  }

  for (const nested of Object.values(value)) {
    collectRunnerConfigs(nested, into);
  }
}

/** Runner config files named by an `@angular/build:unit-test` target of this workspace. */
export function unitTestRunnerConfigs(profile: Profile): string[] {
  const found = new Set<string>();

  for (const file of profile.files.filter((candidate) => WORKSPACE_FILE.test(candidate))) {
    collectRunnerConfigs(parseJsonc(readTextFile(join(profile.cwd, file)) ?? ''), found);
  }

  return [...found];
}

/** The installed major version of a package, read from its own manifest. */
function installedMajor(cwd: string, packageName: string): number | undefined {
  const text = readTextFile(join(cwd, 'node_modules', packageName, 'package.json'));
  const parsed = text === undefined ? undefined : parseJsonc(text);
  const version = isRecord(parsed) ? parsed['version'] : undefined;
  const major = typeof version === 'string' ? /^(\d+)\./.exec(version) : null;

  return major === null || major === undefined ? undefined : Number(major[1]);
}

export function checkCoverageConfig(profile: Profile): Finding[] {
  const runnerConfigs = unitTestRunnerConfigs(profile);
  const targetScope = targetScopeSize(profile);
  const major = installedMajor(profile.cwd, 'vitest');
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

    if (scopeSize >= RECOMPILE_THRESHOLD) {
      findings.push({
        check: 'coverage-include-recompiles-globs',
        severity: 'info',
        file,
        message: `The coverage scope here is ${scopeSize} globs, and \`@vitest/coverage-v8\` recompiles all of them for every filename: its \`globCache\` memoises the verdict, keyed by the file, and never the matcher. Nothing fails — the report is correct, it is just paid for once per file per pattern.`,
        fix: 'Swap the provider for a wrapper that compiles the list once: `coverage.provider: "custom"` plus a `customProviderModule` that re-exports `@vitest/coverage-v8` and overwrites `isIncluded` in `getProvider()`. Measured on one 1 725-file suite: 229.59 s → 22.88 s on a shard, with a byte-identical report. The recipe is in the docs — Adapters → Angular, "Coverage matching costs more than coverage".',
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
