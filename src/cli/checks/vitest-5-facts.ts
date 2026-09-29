/**
 * What the Vitest 5 checks read off a repository: installed versions, the keys its runner configs
 * set, the flags its scripts pass and the CI configs beside them.
 *
 * Lexical like every other reader here. A config key is known by the chain of object keys around
 * it, so `experimental: { fsModuleCache: true }` reads as `experimental.fsModuleCache` and a
 * `projects: [{ test: { … } }]` entry as `test.…`; comments and string contents never count.
 */
import { dirname, join, resolve } from 'node:path';

import { compareVersions, parseVersion } from '../../lib/angular-build-notice';
import { parseJsonc, pathExists, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { SourceGraph } from './graph';
import { isInsideLiteral, literalSpans } from './literals';

/** Node's own lookup: the nearest `node_modules` up the tree, so a workspace package sees the hoisted install. */
export function installedVersionOf(cwd: string, packageName: string): string | undefined {
  const text = upTree(cwd, (directory) => readTextFile(join(directory, 'node_modules', packageName, 'package.json')));
  const manifest = text === undefined ? undefined : parseJsonc(text);
  const version = isRecord(manifest) ? manifest['version'] : undefined;

  return typeof version === 'string' ? version : undefined;
}

function upTree<T>(cwd: string, read: (directory: string) => T | undefined): T | undefined {
  for (let directory = resolve(cwd); ; directory = dirname(directory)) {
    const found = read(directory);

    if (found !== undefined || dirname(directory) === directory) {
      return found;
    }
  }
}

function declares(manifest: unknown, packageName: string): boolean {
  return (
    isRecord(manifest) &&
    ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some((field) => {
      const block = manifest[field];

      return isRecord(block) && block[packageName] !== undefined;
    })
  );
}

/** A workspace package whose runner is declared once, in the workspace root's manifest, declares it too. */
export function declaredUpTree(profile: Profile, packageName: string): boolean {
  return (
    profile.dependencies[packageName] !== undefined ||
    upTree(profile.cwd, (directory) => {
      const manifest = parseJsonc(readTextFile(join(directory, 'package.json')) ?? '');

      return declares(manifest, packageName) ? true : isWorkspaceRoot(directory, manifest) ? false : undefined;
    }) === true
  );
}

/** Where the walk stops: a manifest above the repository's own root speaks for somebody else's project. */
function isWorkspaceRoot(directory: string, manifest: unknown): boolean {
  return (
    (isRecord(manifest) && manifest['workspaces'] !== undefined) ||
    ['.git', 'pnpm-workspace.yaml'].some((marker) => pathExists(join(directory, marker)))
  );
}

/** `false` for a version that cannot be read: an unknown version holds nothing back. */
export function isBelow(raw: string | undefined, floor: readonly number[]): boolean {
  const version = parseVersion(raw ?? '');

  return version !== undefined && compareVersions(version, floor) < 0;
}

export function vitestMajor(cwd: string): number | undefined {
  return parseVersion(installedVersionOf(cwd, 'vitest') ?? '')?.[0];
}

/** The installed major, for a repository that declares Vitest itself rather than getting it transitively. */
export function declaredVitestMajor(profile: Profile): number | undefined {
  return declaredUpTree(profile, 'vitest') ? vitestMajor(profile.cwd) : undefined;
}

export interface ConfigKey {
  readonly file: string;
  /** Dotted chain of enclosing object keys, e.g. `test.experimental.fsModuleCache`. */
  readonly path: string;
  /** The rest of the line after the colon, trimmed. */
  readonly value: string;
}

const RUNNER_CONFIG = /(?:^|\/)vite(?:st)?[\w.-]*\.config\.[cm]?[jt]s$/;
const KEY_OR_BRACE = /([$A-Z_a-z][\w$]*)\s*:(?!:)|[{}]/g;

export function isRunnerConfig(file: string): boolean {
  return RUNNER_CONFIG.test(file);
}

export function configKeys(file: string, text: string): ConfigKey[] {
  const spans = literalSpans(text);
  const stack: (string | undefined)[] = [];
  const found: ConfigKey[] = [];
  let pending: { key: string; end: number } | undefined;

  for (const match of text.matchAll(KEY_OR_BRACE)) {
    if (isInsideLiteral(spans, match.index)) {
      continue;
    }

    const [token, key] = match;

    if (key === undefined) {
      const opensValue = token === '{' && pending !== undefined && text.slice(pending.end, match.index).trim() === '';

      if (token === '{') {
        stack.push(opensValue ? pending?.key : undefined);
      } else {
        stack.pop();
      }

      pending = undefined;

      continue;
    }

    const end = match.index + token.length;
    const lineEnd = text.indexOf('\n', end);

    pending = { key, end };
    found.push({
      file,
      path: [...stack.filter((name) => name !== undefined), key].join('.'),
      value: text.slice(end, lineEnd === -1 ? text.length : lineEnd).trim(),
    });
  }

  return found;
}

/** The texts of the files a predicate picks by name, so the rest are never read. */
export function textsOf(graph: SourceGraph, picks: (file: string) => boolean): TextFile[] {
  return [...graph.texts.keys()].filter(picks).flatMap((file) => {
    const text = graph.texts.get(file);

    return text === undefined ? [] : [{ file, text }];
  });
}

export function runnerConfigKeys(graph: SourceGraph): ConfigKey[] {
  return textsOf(graph, isRunnerConfig).flatMap(({ file, text }) => configKeys(file, text));
}

/** The key is `name` itself or ends in `.name`, wherever the config nests it. */
export function isKey(entry: ConfigKey, name: string): boolean {
  return entry.path === name || entry.path.endsWith(`.${name}`);
}

export function isTrue(entry: ConfigKey): boolean {
  return /^true\b/.test(entry.value);
}

export function stringValue(entry: ConfigKey): string | undefined {
  return /^(["'`])([^"'`]+)\1/.exec(entry.value)?.[2];
}

/** The scripts that run Vitest themselves, by name. */
export function vitestScripts(profile: Profile): [string, string][] {
  return Object.entries(profile.scripts).filter(([, script]) => /\bvitest\b/.test(script));
}

export function passesFlag(script: string, flag: string): boolean {
  return new RegExp(`(?:^|\\s)--${flag.replace('.', '\\.')}(?:[\\s=]|$)(?!=?false\\b)`).test(script);
}

const CI_FILE = /^(?:\.github\/workflows\/[^/]+|\.gitlab-ci|\.gitlab\/.+|\.circleci\/config|azure-pipelines|bitbucket-pipelines)\.ya?ml$/;

export interface TextFile {
  readonly file: string;
  readonly text: string;
}

export function ciConfigs(profile: Profile): TextFile[] {
  return profile.files
    .filter((file) => CI_FILE.test(file))
    .flatMap((file) => {
      const text = readTextFile(join(profile.cwd, file));

      return text === undefined ? [] : [{ file, text }];
    });
}
