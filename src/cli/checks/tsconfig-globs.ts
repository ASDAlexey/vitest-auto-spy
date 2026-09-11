/**
 * A `tsconfig` `include` pattern that matches no file.
 *
 * Found by a person opening a spec and seeing `Cannot find name 'vi'` while `tsc --noEmit`
 * reported zero errors: a migration codemod editing `include` had eaten `/**` + `/*`, turning
 * `src/**` + `/*.spec.ts` into `src*.spec.ts` — a syntactically valid glob that matches nothing.
 * Nothing consumes the result, so the suite stays green and only an editor ever notices.
 *
 * "Matches nothing" covers two situations, and only one of them hides anything. The codemod's glob
 * missed spec files that were there; a freshly generated library's `src/**` + `/*.spec.ts` misses
 * nothing, because no spec has been written yet — the first one will match. So the error is kept for
 * a pattern whose intended files exist in the config's own tree, and the empty case is an `info`: a
 * scaffold that reports a defect teaches the reader to ignore the check, and to silence it by
 * deleting a tsconfig the first spec will need.
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

/**
 * The file-name ending a pattern is written for: the part of its last segment after the final
 * wildcard. `src/**` + `/*.spec.ts` gives `.spec.ts`, and so does the codemod's `src*.spec.ts`.
 * `undefined` when the last segment has no wildcard — it names one file, and a named file that does
 * not exist is reported whatever else the tree holds.
 */
export function literalTail(pattern: string): string | undefined {
  const last = pattern.slice(pattern.lastIndexOf('/') + 1);
  const wildcard = Math.max(last.lastIndexOf('*'), last.lastIndexOf('?'));

  if (wildcard === -1) {
    return undefined;
  }

  const tail = last.slice(wildcard + 1);

  return tail === '' ? undefined : tail;
}

/**
 * Whether the tree the config governs holds a file the pattern was evidently meant for. The config's
 * directory rather than the pattern's own prefix, because a prefix is exactly what a broken glob gets
 * wrong: `lib/**` + `/*.spec.ts` over specs that live in `src/` has an empty prefix and a full tree.
 */
function hasIntendedFiles(configPath: string, tail: string, files: readonly string[]): boolean {
  const directory = posix.dirname(configPath);
  const prefix = directory === '.' ? '' : `${directory}/`;

  return files.some((file) => file.startsWith(prefix) && file.endsWith(tail));
}

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

/** What one `include` entry that matches nothing amounts to — or nothing, when it matches or is exempt. */
function checkInclude(configPath: string, entry: string, files: readonly string[]): Finding | undefined {
  if (entry.includes('${') || entry.startsWith('/')) {
    return undefined;
  }

  const resolved = resolveFromConfig(configPath, entry);

  if (isExemptPattern(resolved) || matchesAnyFile(resolved, files)) {
    return undefined;
  }

  const tail = literalTail(resolved);

  if (tail !== undefined && !hasIntendedFiles(configPath, tail, files)) {
    return {
      check: 'tsconfig-glob-matches-nothing',
      severity: 'info',
      file: configPath,
      message: `The "include" pattern ${JSON.stringify(entry)} matches no file, and there is no "*${tail}" beside this config for it to miss.`,
      fix: 'Nothing is unchecked today: the entry starts matching when the first such file is written. Delete it only if none ever will be.',
    };
  }

  return {
    check: 'tsconfig-glob-matches-nothing',
    severity: 'error',
    file: configPath,
    message: `The "include" pattern ${JSON.stringify(entry)} matches no file.`,
    fix: 'A pattern that matches nothing type-checks nothing, and `tsc --noEmit` still reports zero errors. Fix the glob or delete the entry.',
  };
}

function checkOne(cwd: string, configPath: string, files: readonly string[]): Finding[] {
  const text = readTextFile(join(cwd, configPath));
  const parsed = text === undefined ? undefined : parseJsonc(text);

  if (!isRecord(parsed)) {
    return [];
  }

  const findings = stringList(parsed['include']).flatMap((entry) => checkInclude(configPath, entry, files) ?? []);

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
