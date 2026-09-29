/**
 * Which spec files one `ng test` run gets. The unit-test builder hands Vitest a config object of its
 * own, so `--shard` and `--changed` never reach it; an `--include` list is the one lever it takes.
 */
import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import { buildGraph, isSourceFile, isSpecFile } from './checks/graph';
import type { Profile } from './profile';

export interface Shard {
  readonly index: number;
  readonly count: number;
}

export function parseShard(value: string): Shard | undefined {
  const match = /^(\d+)\/(\d+)$/.exec(value.trim());
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);

  return match !== null && count >= 1 && index >= 1 && index <= count ? { index, count } : undefined;
}

/** Vitest's own split: files ordered by a hash of their path, then cut into near-equal ranges. */
export function shardFiles(files: readonly string[], shard: Shard): string[] {
  const ordered = files
    .map((file) => ({ file, hash: createHash('sha1').update(file).digest('hex') }))
    .sort((a, b) => (a.hash < b.hash ? -1 : 1))
    .map(({ file }) => file);
  const base = Math.floor(ordered.length / shard.count);
  const remainder = ordered.length % shard.count;
  const start = shard.index <= remainder ? (base + 1) * (shard.index - 1) : remainder * (base + 1) + (shard.index - remainder - 1) * base;
  const size = shard.index <= remainder ? base + 1 : base;

  return ordered.slice(start, start + size);
}

const LIST_HEADER = 'Discovered test files:';

/** The files `ng test --list-tests` printed, or `undefined` when the output has no list at all. */
export function discoveredFiles(output: string): string[] | undefined {
  const lines = output.split(/\r?\n/);
  const header = lines.findIndex((line) => line.trim() === LIST_HEADER);

  if (header === -1) {
    return undefined;
  }

  return lines
    .slice(header + 1)
    .map((line) => line.trim())
    .filter(isSpecFile);
}

const SPEC_SUFFIX = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const GLOB_CHARACTER = /[!()*+?@[\]{}]/;

function ancestors(file: string): string[] {
  const found: string[] = [];

  for (let directory = posix.dirname(file); directory !== '.' && directory !== '/'; directory = posix.dirname(directory)) {
    found.unshift(directory);
  }

  return found;
}

/**
 * The same selection in fewer `--include` entries: a directory whose every spec of one suffix is
 * selected becomes one `dir/**\/*<suffix>` glob. `universe` is every spec the builder or the disk knows.
 */
export function compressIncludes(selected: readonly string[], universe: readonly string[]): string[] {
  const chosen = new Set(selected);
  const partial = new Set<string>();

  for (const file of universe.filter((entry) => !chosen.has(entry))) {
    const suffix = SPEC_SUFFIX.exec(file)?.[0];

    for (const directory of suffix === undefined ? [] : ancestors(file)) {
      partial.add(`${directory}|${suffix}`);
    }
  }

  const includes = new Set<string>();

  for (const file of selected) {
    const suffix = String(SPEC_SUFFIX.exec(file)?.[0]);
    const whole = ancestors(file).find((directory) => !GLOB_CHARACTER.test(directory) && !partial.has(`${directory}|${suffix}`));

    includes.add(whole === undefined ? file : `${whole}/**/*${suffix}`);
  }

  return [...includes];
}

/** The pass-through arguments minus any `--include`: the computed list replaces it. */
export function withoutInclude(args: readonly string[]): string[] {
  const kept: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const token = String(args[index]);

    if (token === '--include') {
      index++;
    } else if (!token.startsWith('--include=')) {
      kept.push(token);
    }
  }

  return kept;
}

/** A change to one of these can move every spec, and the import graph does not see why. */
const RUN_EVERYTHING =
  /^(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|angular\.json|tsconfig(?:\.[\w-]+)?\.json|vite(?:st)?(?:[.-][\w-]+)?\.config\.[cm]?[jt]s)$/;

export type Affected = { readonly all: false; readonly specs: ReadonlySet<string> } | { readonly all: true; readonly reason: string };

/** Imported file → importers; the graph already follows `compilerOptions.paths` aliases, `extends` included. */
function importers(profile: Profile): { readonly by: Map<string, string[]>; readonly texts: ReadonlyMap<string, string> } {
  const graph = buildGraph(profile);
  const by = new Map<string, string[]>();

  for (const [file, list] of graph.importedBy) {
    by.set(file, [...list]);
  }

  return { by, texts: graph.texts };
}

function closure(seeds: Iterable<string>, next: (file: string) => readonly string[]): Set<string> {
  const seen = new Set(seeds);

  for (const file of seen) {
    for (const neighbour of next(file)) {
      seen.add(neighbour);
    }
  }

  return seen;
}

/**
 * The specs a set of changed files can reach. A template or a stylesheet is not imported, so it
 * seeds every source that names it; a change a setup file can reach, or a config, runs everything.
 */
export function affectedSpecs(profile: Profile, changed: readonly string[], setupFiles: readonly string[]): Affected {
  const trigger = changed.find((file) => RUN_EVERYTHING.test(posix.basename(file)));

  if (trigger !== undefined) {
    return { all: true, reason: `${trigger} changed` };
  }

  const { by, texts } = importers(profile);
  const imports = new Map<string, string[]>();

  for (const [target, list] of by) {
    for (const importer of list) {
      imports.set(importer, [...(imports.get(importer) ?? []), target]);
    }
  }

  const global = closure(setupFiles, (file) => imports.get(file) ?? []);
  const setupHit = changed.find((file) => global.has(file));

  if (setupHit !== undefined) {
    return { all: true, reason: `${setupHit} changed, and every spec loads it through the setup files` };
  }

  const seeds = changed.flatMap((file) => {
    if (isSourceFile(file)) {
      return [file];
    }

    const name = posix.basename(file);
    const naming: string[] = [];

    for (const [source, text] of texts) {
      if (text.includes(name)) {
        naming.push(source);
      }
    }

    return [file, ...naming];
  });
  const reached = closure(seeds, (file) => by.get(file) ?? []);

  return { all: false, specs: new Set([...reached].filter(isSpecFile)) };
}
