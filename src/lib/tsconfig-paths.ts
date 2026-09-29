/**
 * `compilerOptions.paths` and `baseUrl` as TypeScript applies them: read from the root configs,
 * through their `extends` chains, with each option resolved against the config that declared it.
 * The caller reads the files, so the doctor and the lint plugin share this without sharing a scanner.
 */
import { posix } from 'node:path';

import { isPlainRecord as isRecord } from './plain-record';

/** A config's parsed contents by root-relative path, `undefined` when it is missing or unreadable. */
export type ReadConfigFile = (path: string) => unknown;

export interface PathAlias {
  readonly pattern: string;
  /** The pattern up to its `*`, or all of it when it has none. */
  readonly prefix: string;
  readonly suffix: string;
  readonly wildcard: boolean;
  /** Repository-relative targets; a `*` in them takes the text the pattern's `*` matched. */
  readonly targets: readonly string[];
}

export interface CompilerPaths {
  /** Repository-relative; bare specifiers resolve under it before `node_modules`. */
  readonly baseUrl?: string | undefined;
  readonly aliases: readonly PathAlias[];
}

interface Declared {
  readonly baseUrl?: string | undefined;
  readonly paths?: { readonly from: string; readonly map: Readonly<Record<string, unknown>> } | undefined;
}

const ROOT_CONFIGS = ['tsconfig.json', 'tsconfig.base.json'];

/** A cycle or a runaway chain stops here rather than hanging the run. */
const MAX_EXTENDS = 16;

function tidy(path: string): string {
  const normalized = posix.normalize(path).replace(/\/$/, '');

  return normalized === '.' ? '' : normalized.replace(/^\.\//, '');
}

function readConfig(read: ReadConfigFile, path: string): Record<string, unknown> | undefined {
  const parsed = read(path);

  return isRecord(parsed) ? parsed : undefined;
}

/** Where an `extends` entry points: a relative file, with or without `.json`, or a package's config. */
function extendedPath(read: ReadConfigFile, from: string, entry: string): string | undefined {
  const base = entry.startsWith('.') ? tidy(posix.join(posix.dirname(from), entry)) : `node_modules/${entry}`;
  const candidates = [base, `${base}.json`, `${base}/tsconfig.json`];

  return candidates.find((candidate) => readConfig(read, candidate) !== undefined);
}

function extendsOf(config: Record<string, unknown>): string[] {
  const entries: unknown[] = Array.isArray(config['extends']) ? config['extends'] : [config['extends']];

  return entries.filter((entry): entry is string => typeof entry === 'string');
}

function declared(read: ReadConfigFile, path: string, depth: number): Declared {
  const config = depth > MAX_EXTENDS ? undefined : readConfig(read, path);

  if (config === undefined) {
    return {};
  }

  const inherited = extendsOf(config)
    .flatMap((entry) => extendedPath(read, path, entry) ?? [])
    .reduce<Declared>((merged, base) => ({ ...merged, ...definedOnly(declared(read, base, depth + 1)) }), {});
  const options = isRecord(config['compilerOptions']) ? config['compilerOptions'] : {};
  const directory = posix.dirname(path);
  const own: Declared = {
    baseUrl: typeof options['baseUrl'] === 'string' ? tidy(posix.join(directory, options['baseUrl'])) : undefined,
    paths: isRecord(options['paths']) ? { from: directory, map: options['paths'] } : undefined,
  };

  return { ...inherited, ...definedOnly(own) };
}

function definedOnly(value: Declared): Declared {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function aliasesOf(value: Declared): PathAlias[] {
  if (value.paths === undefined) {
    return [];
  }

  const root = value.baseUrl ?? value.paths.from;

  return Object.entries(value.paths.map).flatMap(([pattern, targets]) => {
    const star = pattern.indexOf('*');
    const list = Array.isArray(targets) ? targets.filter((target): target is string => typeof target === 'string') : [];

    return list.length === 0
      ? []
      : [
          {
            pattern,
            prefix: star === -1 ? pattern : pattern.slice(0, star),
            suffix: star === -1 ? '' : pattern.slice(star + 1),
            wildcard: star !== -1,
            targets: list.map((target) => tidy(posix.join(root, target))),
          },
        ];
  });
}

/** The root configs' paths, `tsconfig.json` first; a pattern it declares hides the same one in the base. */
export function readCompilerPaths(read: ReadConfigFile): CompilerPaths {
  const configs = ROOT_CONFIGS.map((name) => declared(read, name, 0));
  const seen = new Set<string>();
  const aliases = configs.flatMap(aliasesOf).filter((alias) => !seen.has(alias.pattern) && seen.add(alias.pattern));

  return { baseUrl: configs.find((config) => config.baseUrl !== undefined)?.baseUrl, aliases };
}

/** The alias TypeScript picks: an exact pattern, else the wildcard with the longest prefix. */
export function matchingAlias(specifier: string, aliases: readonly PathAlias[]): { alias: PathAlias; star: string } | undefined {
  const exact = aliases.find((alias) => !alias.wildcard && alias.pattern === specifier);

  if (exact !== undefined) {
    return { alias: exact, star: '' };
  }

  const alias = aliases
    .filter((candidate) => candidate.wildcard && specifier.length >= candidate.prefix.length + candidate.suffix.length)
    .filter((candidate) => specifier.startsWith(candidate.prefix) && specifier.endsWith(candidate.suffix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return alias === undefined ? undefined : { alias, star: specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length) };
}

/** Repository-relative stems a bare specifier may name, in the order TypeScript tries them. */
export function aliasCandidates(specifier: string, paths: CompilerPaths): string[] {
  const match = matchingAlias(specifier, paths.aliases);
  const mapped = match === undefined ? [] : match.alias.targets.map((target) => target.replace('*', match.star));

  return paths.baseUrl === undefined ? mapped : [...mapped, tidy(posix.join(paths.baseUrl, specifier))];
}
