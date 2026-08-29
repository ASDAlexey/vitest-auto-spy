/**
 * The repository's own import graph, built once and shared by every check that needs one.
 *
 * Lexical and deliberately generous: it matches `from '…'`, a side-effect `import '…'`, a dynamic
 * `import('…')` and `require('…')`, then resolves only the **relative** specifiers — a bare one
 * resolves into `node_modules`, which no repository-level check here has any interest in.
 */
import { join, posix } from 'node:path';

import { captures, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const SPEC_FILE = /\.(?:spec|test)\.[cm]?[jt]sx?$/;

const SPECIFIER_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s+["']([^"']+)["']/g,
];

const RESOLUTION_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js'];

export interface SourceGraph {
  /** Every non-declaration source file in the repository, POSIX-relative. */
  readonly sources: readonly string[];
  /** Importer → the repository files it imports. */
  readonly imports: ReadonlyMap<string, readonly string[]>;
  /** Imported file → the repository files importing it. */
  readonly importedBy: ReadonlyMap<string, readonly string[]>;
  /** Raw text of every source file, so a check never reads the disk twice. */
  readonly texts: ReadonlyMap<string, string>;
}

export function isSpecFile(file: string): boolean {
  return SPEC_FILE.test(file);
}

export function isSourceFile(file: string): boolean {
  return SOURCE_FILE.test(file) && !DECLARATION_FILE.test(file);
}

/** Every module specifier a file mentions. */
export function extractSpecifiers(source: string): string[] {
  const found = new Set<string>();

  for (const pattern of SPECIFIER_PATTERNS) {
    for (const specifier of captures(source, pattern)) {
      found.add(specifier);
    }
  }

  return [...found];
}

/** Resolves a relative specifier against the repository's own file list. */
export function resolveRelative(importer: string, specifier: string, files: ReadonlySet<string>): string | undefined {
  if (!specifier.startsWith('.')) {
    return undefined;
  }

  const base = posix.normalize(posix.join(posix.dirname(importer), specifier)).replace(/^\.\//, '');
  const withoutJs = base.replace(/\.[cm]?js$/, '');
  const stems = base === withoutJs ? [base] : [base, withoutJs];

  for (const stem of stems) {
    for (const suffix of RESOLUTION_SUFFIXES) {
      if (files.has(`${stem}${suffix}`)) {
        return `${stem}${suffix}`;
      }
    }
  }

  return undefined;
}

function record(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);

  if (existing === undefined) {
    map.set(key, [value]);

    return;
  }

  if (!existing.includes(value)) {
    existing.push(value);
  }
}

export function buildGraph(profile: Profile): SourceGraph {
  const sources = profile.files.filter(isSourceFile);
  const known = new Set(profile.files);
  const imports = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>();
  const texts = new Map<string, string>();

  for (const importer of sources) {
    const text = readTextFile(join(profile.cwd, importer));

    if (text === undefined) {
      continue;
    }

    texts.set(importer, text);

    for (const specifier of extractSpecifiers(text)) {
      const resolved = resolveRelative(importer, specifier, known);

      if (resolved !== undefined && resolved !== importer) {
        record(imports, importer, resolved);
        record(importedBy, resolved, importer);
      }
    }
  }

  return { sources, imports, importedBy, texts };
}
