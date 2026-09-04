/**
 * Name resolution against this package's own export map.
 *
 * Both checks built on this module answer a question about a name — "which entry exports it", "is
 * the thing this file called one of ours" — and both claim zero false positives. That claim rests
 * on the table being generated (`scripts/generate-export-map.mjs`) rather than written down, and on
 * `tableApplies`: a table describes one major version, and the consumer may have another installed.
 */
import { dirname, join } from 'node:path';

import { captures, parseJsonc, readTextFile } from '../fs-scan';
import { isRecord } from '../profile';
import { AWAITABLE_HELPERS, ENTRY_SPECIFIERS, EXPORTED_BY, EXPORT_MAP_VERSION } from './export-map.generated';
import { isInsideLiteral, literalSpans } from './literals';

const ENTRIES = ENTRY_SPECIFIERS.split(' ');
const AWAITABLE = new Set(AWAITABLE_HELPERS.split(' '));
const NO_OWNERS: readonly string[] = [];

/** Export name → every entry specifier that exports it, in `exports` order. */
const OWNERS = new Map<string, readonly string[]>(
  Object.entries(EXPORTED_BY).map(([name, indices]) => {
    const owned = new Set(indices.split(' ').map(Number));

    return [name, ENTRIES.filter((_entry, index) => owned.has(index))];
  }),
);

/** The same table read the other way round, so an entry can be asked what it exports. */
const NAMES_BY_ENTRY = new Map<string, ReadonlySet<string>>(
  ENTRIES.map((entry) => [entry, new Set([...OWNERS].filter(([, owners]) => owners.includes(entry)).map(([name]) => name))]),
);

export interface EntryImport {
  /** The specifier the file imported from, e.g. `vitest-auto-spy/angular`. */
  readonly entry: string;
  /** The exported name, before any `as` rename. */
  readonly name: string;
  /** The identifier the name is bound to in this file. */
  readonly local: string;
}

const IMPORT = /\bimport\s+(?:type\s+)?([\s\w$*,{}]*?)\s*from\s*["'](vitest-auto-spy(?:\/[\w-]+)?)["']/g;
const BRACED = /{([^}]*)}/g;
const RENAME = ' as ';

function parseClause(clause: string, entry: string): EntryImport[] {
  const found: EntryImport[] = [];

  for (const inner of captures(clause, BRACED)) {
    for (const raw of inner.split(',')) {
      const token = raw
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^type /, '');
      const rename = token.indexOf(RENAME);

      if (token !== '') {
        found.push({
          entry,
          name: rename === -1 ? token : token.slice(0, rename),
          local: rename === -1 ? token : token.slice(rename + RENAME.length),
        });
      }
    }
  }

  return found;
}

/**
 * Every named import a file takes from one of this package's entry points.
 *
 * Lexical, like the rest of the CLI, and deliberately narrow: a namespace import binds no name to a
 * single export, so it is skipped rather than guessed at, and an import statement inside a string
 * or a comment is text about code rather than code.
 */
export function findEntryImports(source: string): EntryImport[] {
  const spans = literalSpans(source);
  const found: EntryImport[] = [];

  source.replace(IMPORT, (whole: string, clause: string, entry: string, offset: number): string => {
    if (!isInsideLiteral(spans, offset)) {
      found.push(...parseClause(clause, entry));
    }

    return whole;
  });

  return found;
}

/** The names an entry exports, or `undefined` when the specifier is not one this version publishes. */
export function entryExports(entry: string): ReadonlySet<string> | undefined {
  return NAMES_BY_ENTRY.get(entry);
}

/** Every entry exporting a name, in `exports` order. Empty when no entry of this version does. */
export function ownersOf(name: string): readonly string[] {
  return OWNERS.get(name) ?? NO_OWNERS;
}

/** An export whose every call signature returns a promise, so calling it and dropping it is a bug. */
export function isAwaitableHelper(name: string): boolean {
  return AWAITABLE.has(name);
}

function majorOf(version: string): string | undefined {
  return captures(version, /^(\d+)\./g)[0];
}

/** The version of this package the consuming repository actually has installed, if it can be read. */
export function installedVersion(cwd: string): string | undefined {
  let directory = cwd;

  for (;;) {
    const text = readTextFile(join(directory, 'node_modules/vitest-auto-spy/package.json'));
    const parsed = text === undefined ? undefined : parseJsonc(text);
    const version = isRecord(parsed) ? parsed['version'] : undefined;

    if (typeof version === 'string') {
      return version;
    }

    const parent = dirname(directory);

    if (parent === directory) {
      return undefined;
    }

    directory = parent;
  }
}

/**
 * Whether the generated table describes the version the repository resolves.
 *
 * A helper moves between entries only in a major, so matching majors is the whole condition. An
 * unreadable or unparsable version falls back to reporting: the CLI is normally run from the
 * installed package, and staying silent because one lockfile is unusual is the worse mistake.
 */
export function tableApplies(cwd: string): boolean {
  const installed = installedVersion(cwd);
  const theirs = installed === undefined ? undefined : majorOf(installed);

  return theirs === undefined || theirs === majorOf(EXPORT_MAP_VERSION);
}
