/**
 * A `tsconfig` `include` pattern that matches no file.
 *
 * Found by a person opening a spec and seeing `Cannot find name 'vi'` while `tsc --noEmit`
 * reported zero errors: a migration codemod editing `include` had eaten `/**` + `/*`, turning
 * `src/**` + `/*.spec.ts` into `src*.spec.ts` — a syntactically valid glob that matches nothing.
 * Nothing consumes the result, so the suite stays green and only an editor ever notices.
 */
import { join, posix } from 'node:path';

import { parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { Finding } from '../report';

/** The extensions TypeScript adds to an `include` entry that does not name one itself. */
const IMPLIED_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

const TSCONFIG_NAME = /(^|\/)tsconfig[^/]*\.json$/;

function escapeLiteral(segment: string): string {
  return segment.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');
}

/**
 * Translates a TypeScript `include` glob into an anchored regular expression. The tokeniser runs
 * as one alternation, longest construct first, so `**` is never read as two `*`.
 */
export function globToRegExp(pattern: string): RegExp {
  const source = pattern.replace(/\*\*\/|\*\*|[*?]|[^*?]+/g, (token: string): string => {
    if (token === '**/') {
      return '(?:[^/]+/)*';
    }

    if (token === '**') {
      return '.*';
    }

    if (token === '*') {
      return '[^/]*';
    }

    if (token === '?') {
      return '[^/]';
    }

    return escapeLiteral(token);
  });

  return new RegExp(`^${source}$`);
}

/**
 * The concrete patterns one `include` entry stands for. An entry that names no extension is a
 * directory pattern, and TypeScript expands it over the extensions it recognises.
 */
export function expandInclude(pattern: string): string[] {
  const trimmed = pattern.replace(/\/+$/, '');
  const last = trimmed.slice(trimmed.lastIndexOf('/') + 1);

  if (last.includes('.')) {
    return [trimmed];
  }

  const base = last === '*' ? trimmed : `${trimmed}${last === '**' ? '/*' : '/**/*'}`;

  return IMPLIED_EXTENSIONS.map((extension) => `${base}${extension}`);
}

/**
 * Two shapes of pattern are exempt, because for them "matches nothing" is not evidence of
 * anything. A declaration-only glob (`src/**` + `/*.d.ts`) is routinely a placeholder for ambient
 * types a repository has not written yet, and a pattern rooted in a directory this scan never
 * descends into (`dist`, `out-tsc`, `coverage`) cannot match by construction.
 */
export function isExemptPattern(pattern: string): boolean {
  const slash = pattern.indexOf('/');
  const root = slash === -1 ? pattern : pattern.slice(0, slash);

  return /\.d\.[cm]?ts$/.test(pattern) || UNSCANNED_ROOTS.has(root);
}

const UNSCANNED_ROOTS = new Set([
  '.angular',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'out-tsc',
  'tmp',
]);

function matchesAnyFile(pattern: string, files: readonly string[]): boolean {
  const expressions = expandInclude(pattern).map(globToRegExp);

  return files.some((file) => expressions.some((expression) => expression.test(file)));
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function resolveFromConfig(configPath: string, entry: string): string {
  return posix.normalize(posix.join(posix.dirname(configPath), entry)).replace(/^\.\//, '');
}

function checkOne(cwd: string, configPath: string, files: readonly string[]): Finding[] {
  const text = readTextFile(join(cwd, configPath));
  const parsed = text === undefined ? undefined : parseJsonc(text);

  if (!isRecord(parsed)) {
    return [];
  }

  const findings: Finding[] = [];

  for (const entry of stringList(parsed['include'])) {
    if (entry.includes('${') || entry.startsWith('/')) {
      continue;
    }

    const resolved = resolveFromConfig(configPath, entry);

    if (isExemptPattern(resolved)) {
      continue;
    }

    if (!matchesAnyFile(resolved, files)) {
      findings.push({
        check: 'tsconfig-glob-matches-nothing',
        severity: 'error',
        file: configPath,
        message: `The "include" pattern ${JSON.stringify(entry)} matches no file.`,
        fix: 'A pattern that matches nothing type-checks nothing, and `tsc --noEmit` still reports zero errors. Fix the glob or delete the entry.',
      });
    }
  }

  for (const entry of stringList(parsed['files'])) {
    const resolved = resolveFromConfig(configPath, entry);

    if (!files.includes(resolved)) {
      findings.push({
        check: 'tsconfig-file-missing',
        severity: 'error',
        file: configPath,
        message: `The "files" entry ${JSON.stringify(entry)} does not exist.`,
        fix: 'Remove the entry, or restore the file it used to name.',
      });
    }
  }

  return findings;
}

export function checkTsconfigGlobs(profile: Profile): Finding[] {
  const configs = profile.files.filter((file) => TSCONFIG_NAME.test(file));

  return configs.flatMap((config) => checkOne(profile.cwd, config, profile.files));
}
