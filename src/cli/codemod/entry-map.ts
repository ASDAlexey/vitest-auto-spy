/**
 * Which entry point each exported name lives behind — read off the installed package, never typed
 * out by hand.
 *
 * The one thing a migration codemod must not get wrong is the entry it moves a name to. A table
 * written into this file is a table that is right for the version it was written against and wrong
 * for the one the consumer installed: an entry added in a later minor is a name this codemod would
 * leave at the root, and an entry that moved is a rewrite that no longer resolves. So the table is
 * derived, at run time, from the `exports` map of the `vitest-auto-spy` the consumer actually has,
 * and from the export statements of the files that map points at. A lookup against the installed
 * version's own export map has no false positives, because it is not a guess about the API — it
 * *is* the API.
 *
 * When no copy of the package can be found, the table is `undefined` and the transforms that need
 * it decline to run and say so. A wrong entry that still compiles is exactly the failure this whole
 * command exists to avoid, so guessing is not on the menu.
 */
import { dirname, join } from 'node:path';

import { parseJsonc, pathExists, readTextFile, toPosix } from '../fs-scan';
import { isRecord } from '../profile';
import type { FileHint } from './entry-hint';
import { NO_HINT } from './entry-hint';
import { maskCode } from './mask';

const PACKAGE_NAME = 'vitest-auto-spy';

/** How deep a `node_modules` lookup walks out of `cwd`, for a workspace whose deps are hoisted. */
const LOOKUP_DEPTH = 6;

/** How far `export * from` is followed. The barrels here are two deep; eight is slack, not policy. */
const REEXPORT_DEPTH = 8;

export interface EntryMap {
  /** Exported name → every specifier that exports it, e.g. `provideAutoSpy` → `vitest-auto-spy/angular`. */
  readonly byName: ReadonlyMap<string, readonly string[]>;
  /** Where the table came from, printed by `--list` so the reader can audit it. */
  readonly source: string;
}

/** The installed package, from the consumer's `node_modules` outwards. */
export function findPackageRoot(cwd: string, fallback: string | undefined): string | undefined {
  let current = cwd;

  for (let depth = 0; depth < LOOKUP_DEPTH; depth += 1) {
    const candidate = join(current, 'node_modules', PACKAGE_NAME);

    if (pathExists(join(candidate, 'package.json'))) {
      return candidate;
    }

    const parent = dirname(current);

    if (parent === current) {
      break;
    }

    current = parent;
  }

  return fallback;
}

/**
 * The file behind one `exports` value. `types` first — a declaration file names the type-only
 * exports a runtime bundle cannot — then the runtime conditions.
 */
export function pickTarget(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const condition of ['types', 'import', 'default', 'require']) {
    const found = pickTarget(value[condition]);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

/**
 * The file an `exports` target names, with one fallback: a checkout that has not been built has no
 * `dist`, and the sources next to it say the same thing. That keeps the table available when the
 * package is linked from source, which is how a monorepo consumes it before the first release.
 */
export function resolveTarget(root: string, target: string): string | undefined {
  const direct = join(root, target);

  if (pathExists(direct)) {
    return direct;
  }

  const source = join(root, target.replace(/^\.\/dist\//, './src/').replace(/\.d\.[cm]?ts$|\.[cm]?js$/, '.ts'));

  return pathExists(source) ? source : undefined;
}

const NAMED_EXPORT = /export\s+(?:type\s+)?{([^}]*)}/g;
const DECLARED_EXPORT =
  /export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|const|enum|function|interface|let|type|var)\s+([$A-Z_a-z][\w$]*)/g;
/**
 * The quote is captured so the specifier's length is known: in the mask its text is blank.
 *
 * `export type *` matters as much as `export *` here, and missing it is not a cosmetic gap: the root
 * entry re-exports the whole public type surface with exactly that form, so without the optional
 * `type` this walker loses `Spy<T>` and every type beside it. The table then looks complete, the
 * import transform decides it cannot place the name, and the file is left on `jest-auto-spies` with
 * a residue error — a failure that only appears where `dist` is absent and the sources are read.
 */
const STAR_EXPORT = /export\s+(?:type\s+)?\*\s+from\s*(["'])([^"']+)\1/g;

/** `a, b as c, type D, type E as F` → the names the importer writes. */
export function namesFromClause(clause: string): string[] {
  return clause
    .split(',')
    .map((part) => part.trim().replace(/^type\s+/, ''))
    .map((part) => (part.includes(' as ') ? part.slice(part.lastIndexOf(' as ') + 4) : part))
    .map((part) => part.trim())
    .filter((part) => /^[$A-Z_a-z][\w$]*$/.test(part) && part !== 'default');
}

const RELATIVE_SUFFIXES = ['', '.ts', '.d.ts', '.js', '/index.ts', '/index.d.ts', '/index.js'];

function resolveRelative(fromFile: string, specifier: string): string | undefined {
  const base = join(dirname(fromFile), specifier.replace(/\.[cm]?js$/, ''));

  for (const suffix of RELATIVE_SUFFIXES) {
    if (pathExists(`${base}${suffix}`)) {
      return `${base}${suffix}`;
    }
  }

  return undefined;
}

/** Every name a module exports, following `export * from` through the barrels. */
export function exportedNames(file: string, seen: Set<string> = new Set(), depth: number = REEXPORT_DEPTH): string[] {
  const text = readTextFile(file);

  if (text === undefined || seen.has(file) || depth === 0) {
    return [];
  }

  seen.add(file);

  const masked = maskCode(text);
  const names: string[] = [];

  masked.replace(NAMED_EXPORT, (whole: string, clause: string): string => {
    names.push(...namesFromClause(clause));

    return whole;
  });

  masked.replace(DECLARED_EXPORT, (whole: string, name: string): string => {
    names.push(name);

    return whole;
  });

  // The specifier is read from the source rather than from the capture group: the mask blanks a
  // string's contents, so the group holds the right number of spaces and nothing else. Its length
  // is what locates it, since the closing quote is the last character of the match.
  masked.replace(STAR_EXPORT, (whole: string, _quote: string, blanked: string, offset: number): string => {
    const end = offset + whole.length - 1;
    const specifier = text.slice(end - blanked.length, end);
    const target = specifier.startsWith('.') ? resolveRelative(file, specifier) : undefined;

    names.push(...(target === undefined ? [] : exportedNames(target, seen, depth - 1)));

    return whole;
  });

  return names;
}

function subpathSpecifier(name: string, key: string): string | undefined {
  if (key === '.') {
    return name;
  }

  return key.startsWith('./') && !key.includes('*') ? `${name}/${key.slice(2)}` : undefined;
}

/** The export map of the installed package, turned into a name → specifiers lookup. */
export function buildEntryMap(root: string | undefined): EntryMap | undefined {
  const manifest = root === undefined ? undefined : readTextFile(join(root, 'package.json'));
  const parsed = manifest === undefined ? undefined : parseJsonc(manifest);

  if (root === undefined || !isRecord(parsed) || !isRecord(parsed['exports']) || typeof parsed['name'] !== 'string') {
    return undefined;
  }

  const packageName = parsed['name'];
  const byName = new Map<string, string[]>();

  for (const [key, value] of Object.entries(parsed['exports'])) {
    const specifier = subpathSpecifier(packageName, key);
    const target = pickTarget(value);
    const file = specifier === undefined || target === undefined ? undefined : resolveTarget(root, target);

    if (specifier === undefined || file === undefined) {
      continue;
    }

    for (const name of exportedNames(file)) {
      record(byName, name, specifier);
    }
  }

  return byName.size === 0 ? undefined : { byName, source: toPosix(root) };
}

function record(byName: Map<string, string[]>, name: string, specifier: string): void {
  const existing = byName.get(name);

  if (existing === undefined) {
    byName.set(name, [specifier]);

    return;
  }

  if (!existing.includes(specifier)) {
    existing.push(specifier);
  }
}

/** What the resolver decided, and how sure it is — the three cases have three different reports. */
export type EntryChoice =
  /** No entry of the installed package exports the name at all. */
  | { readonly kind: 'absent' }
  /** Decided by evidence: the root, the repository's entry, the only exporter, or the file itself. */
  | { readonly kind: 'chosen'; readonly entry: string }
  /** Several entries export it and nothing decided which; `entry` is the fallback, reported. */
  | { readonly kind: 'guessed'; readonly entry: string; readonly candidates: readonly string[] };

const BUN_PREFIX = `${PACKAGE_NAME}/bun`;

/**
 * The order the fallback walks when neither the repository nor the file says anything.
 *
 * Angular first, and not as a coin toss: `jest-auto-spies` and `jasmine-auto-spies` are Angular
 * testing libraries, and `provideAutoSpy` — the second-most-imported name in either — is exported
 * by five entries here. Declining to place it left every migrated file still importing the legacy
 * package, which is a worse answer than a named default with a warning beside it.
 */
const FALLBACK_ORDER = ['angular', 'bun-angular', 'nestjs', 'vue', 'react', 'svelte', 'jasmine'].map((name) => `${PACKAGE_NAME}/${name}`);

function rank(specifier: string): number {
  const index = FALLBACK_ORDER.indexOf(specifier);

  return index === -1 ? FALLBACK_ORDER.length : index;
}

/** The best of a non-empty pool. `slice().join('')` for the reason `group()` gives: no empty branch. */
function best(pool: readonly string[]): string {
  return [...pool]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, 1)
    .join('');
}

/** `vitest-auto-spy/bun-angular` → `['bun', 'angular']`, which is how a framework token is matched. */
function partsOf(specifier: string): string[] {
  return specifier.slice(specifier.indexOf('/') + 1).split('-');
}

/** The candidates written for one framework — `/angular` and `/bun-angular` both are Angular's. */
function narrow(candidates: readonly string[], framework: string | undefined): readonly string[] {
  return framework === undefined ? [] : candidates.filter((candidate) => partsOf(candidate).includes(framework));
}

/**
 * The candidates built for the runtime the repository runs. A Bun repository handed `/angular`
 * registers the Vitest adapter and every spy fails at run time, so the runtime outranks the
 * fallback order — `/bun-angular` is the same helper for the runner this repository actually has.
 */
function sameRuntime(pool: readonly string[], preferred: string): readonly string[] {
  const wanted = pool.filter((candidate) => candidate.startsWith(BUN_PREFIX) === preferred.startsWith(BUN_PREFIX));

  return wanted.length === 0 ? pool : wanted;
}

/**
 * The entry an import of `name` should name, and how the answer was reached.
 *
 * The root wins when it exports the name, because the root is the entry that registers the mock
 * adapter and the one every runner has. Then the entry that matches the repository — the Angular
 * helpers go to `/angular` in an Angular repository — then a name only one entry exports.
 *
 * Past that the name is exported by several non-root entries, and this used to answer `undefined`,
 * which the caller reported as "no entry point exports it". That was false for 23 names, including
 * `provideAutoSpy`, and it left the file on the legacy import with a residue error on top. So the
 * file is asked instead: an entry it already imports from, or the framework its own text names. A
 * decision made that way is `chosen`; only a genuine coin toss is `guessed`, and that one is
 * reported with the alternatives spelled out.
 */
export function chooseEntry(map: EntryMap, name: string, preferred: string, hint: FileHint): EntryChoice {
  const specifiers = map.byName.get(name);

  if (specifiers === undefined) {
    return { kind: 'absent' };
  }

  if (specifiers.includes(PACKAGE_NAME)) {
    return { kind: 'chosen', entry: PACKAGE_NAME };
  }

  if (specifiers.includes(preferred)) {
    return { kind: 'chosen', entry: preferred };
  }

  return specifiers.length === 1 ? { kind: 'chosen', entry: best(specifiers) } : decide(specifiers, preferred, hint);
}

function decide(candidates: readonly string[], preferred: string, hint: FileHint): EntryChoice {
  const known = candidates.find((candidate) => hint.imported.includes(candidate));

  if (known !== undefined) {
    return { kind: 'chosen', entry: known };
  }

  const scoped = narrow(candidates, hint.framework);

  if (scoped.length > 0) {
    return { kind: 'chosen', entry: best(sameRuntime(scoped, preferred)) };
  }

  return { kind: 'guessed', entry: best(sameRuntime(candidates, preferred)), candidates };
}

/**
 * The decided entry, or `undefined` when the table genuinely does not have the name.
 *
 * For callers that place one known helper — `asSpy`, `Spy`, `createSpyObj` — where there is no file
 * evidence to weigh and, as it happens, nothing to weigh it against: each of those is exported by
 * the root or by exactly one entry.
 */
export function entryFor(map: EntryMap, name: string, preferred: string): string | undefined {
  const choice = chooseEntry(map, name, preferred, NO_HINT);

  return choice.kind === 'absent' ? undefined : choice.entry;
}
