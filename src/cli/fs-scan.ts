/**
 * The only place in this package that touches `node:fs`.
 *
 * Keeping it in one module is what makes the invariant checkable: the library itself never reads
 * the disk, so `node:fs` must appear in the CLI bundle and nowhere else. Everything above this
 * module works on plain strings and can therefore be tested without a temporary directory.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/** Directories a repository-wide scan must never descend into. */
const SKIPPED_DIRECTORIES = new Set([
  '.angular',
  '.cache',
  '.git',
  '.next',
  '.nuxt',
  '.nx',
  '.output',
  '.svelte-kit',
  '.turbo',
  '.yarn',
  'bower_components',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'tmp',
  'vendor',
]);

/** A guard against a pathological tree: a doctor run must stay a few seconds, not a few minutes. */
export const SCAN_CAP = 50_000;

/** Raises {@link SCAN_CAP} for a repository that really is bigger — the codemod's warning says so. */
export const SCAN_CAP_ENV = 'VITEST_AUTO_SPY_SCAN_CAP';

/** The cap in force for this process. Anything but a positive integer is ignored, not reported. */
export function scanCap(): number {
  const raw = Number(process.env[SCAN_CAP_ENV]);

  return Number.isInteger(raw) && raw > 0 ? raw : SCAN_CAP;
}

/**
 * Every first capture group of a global pattern. Written with `replace` rather than `matchAll`
 * because the replacer's group parameter is a `string` — with `matchAll` it is `string | undefined`
 * under `noUncheckedIndexedAccess`, and a guard for a group that cannot be absent is a branch no
 * input can ever take.
 */
export function captures(source: string, pattern: RegExp): string[] {
  const found: string[] = [];

  source.replace(pattern, (whole: string, group: string): string => {
    found.push(group);

    return whole;
  });

  return found;
}

export function toPosix(path: string): string {
  return path.split(sep).join('/');
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A path that is a symlink. `CLAUDE.md -> AGENTS.md` is a documented way to keep one instruction
 * file, and writing through it would put the managed block into AGENTS.md twice.
 */
export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Reads a file, returning `undefined` rather than throwing when it is missing or unreadable. */
export function readTextFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** Writes a file, creating the parent directories. Returns the content actually written. */
export function writeTextFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

export function removeFile(path: string): void {
  rmSync(path, { force: true });
}

/**
 * Every file under `root`, as repository-relative POSIX paths, with build output and dependency
 * directories skipped. Sorted, so a report is stable across platforms.
 */
export function listRepositoryFiles(root: string, limit: number = scanCap()): string[] {
  return scanRepository(root, limit).files;
}

/**
 * The scan plus whether it stopped at {@link SCAN_CAP} — a caller that reports a *clean* result off
 * a truncated list would be lying about the part of the tree it never saw.
 */
export function scanRepository(root: string, limit: number = scanCap()): { files: string[]; truncated: boolean } {
  const found: string[] = [];
  const truncated = walk(root, root, found, limit);

  return { files: found.sort(), truncated };
}

function walk(root: string, directory: string, found: string[], limit: number): boolean {
  if (found.length >= limit) {
    return true;
  }

  let entries;

  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (found.length >= limit) {
      return true;
    }

    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name) && walk(root, full, found, limit)) {
        return true;
      }

      continue;
    }

    if (entry.isFile()) {
      found.push(toPosix(relative(root, full)));
    }
  }

  return false;
}

/**
 * `JSON.parse` over a file that may legitimately contain comments and trailing commas — every
 * `tsconfig.json` does. Returns `undefined` when the text is not recoverable rather than throwing:
 * a doctor that dies on one malformed file reports nothing about the other 151.
 */
export function parseJsonc(text: string): unknown {
  try {
    return JSON.parse(stripJsonComments(text));
  } catch {
    return undefined;
  }
}

function stripJsonComments(text: string): string {
  let result = '';
  let index = 0;

  while (index < text.length) {
    const rest = text.slice(index);

    if (text[index] === '"') {
      const end = findStringEnd(text, index);

      result += text.slice(index, end);
      index = end;

      continue;
    }

    if (rest.startsWith('//')) {
      index = advancePast(text, index, '\n');

      continue;
    }

    if (rest.startsWith('/*')) {
      index = advancePast(text, index + 2, '*/');

      continue;
    }

    result += text[index];
    index += 1;
  }

  return result.replace(/,(\s*[\]}])/g, '$1');
}

/**
 * The index just past the string literal opening at `start`, whose quote character is whatever sits
 * there — `"` in JSON, any of the three in TypeScript. `text.length` when it is never closed.
 */
export function findStringEnd(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;

  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;

      continue;
    }

    if (text[index] === quote) {
      return index + 1;
    }

    index += 1;
  }

  return text.length;
}

function advancePast(text: string, start: number, terminator: string): number {
  const found = text.indexOf(terminator, start);

  return found === -1 ? text.length : found + terminator.length;
}
