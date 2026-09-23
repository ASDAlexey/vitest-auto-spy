/**
 * The only place in this package that touches `node:fs`.
 *
 * Keeping it in one module is what makes the invariant checkable: the library itself never reads
 * the disk, so `node:fs` must appear in the CLI bundle and nowhere else. Everything above this
 * module works on plain strings and can therefore be tested without a temporary directory.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

import type { IgnoreRule, IgnoreSource } from './gitignore';
import { excludesFileSetting, isIgnoredBy, parseGitignore } from './gitignore';

/**
 * Directories a repository-wide scan must never descend into. The package-manager stores are here
 * because CI points them inside the checkout (`.bun/install/cache`, `npm ci --cache .npm`).
 */
const SKIPPED_DIRECTORIES = new Set([
  '.angular',
  '.bun',
  '.cache',
  '.git',
  '.next',
  '.npm',
  '.nuxt',
  '.nx',
  '.output',
  '.pnpm-store',
  '.svelte-kit',
  '.turbo',
  '.yarn',
  'bower_components',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'out-tsc',
  'tmp',
  'vendor',
]);

export function isSkippedDirectory(name: string): boolean {
  return SKIPPED_DIRECTORIES.has(name);
}

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
  return scan(root, limit, () => false).files;
}

export interface RepositoryScan {
  readonly files: string[];
  /** Directories git's exclude rules pruned, root-relative — a check must not expect files there. */
  readonly ignored: string[];
  readonly truncated: boolean;
}

/** Whether a directory, root-relative and POSIX, is one the scan leaves out. */
export type DirectoryFilter = (directory: string) => boolean;

/**
 * The scan plus whether it stopped at {@link SCAN_CAP} — a caller that reports a *clean* result off
 * a truncated list would be lying about the part of the tree it never saw. Unlike
 * {@link listRepositoryFiles}, it also honours git's exclude rules for directories.
 */
export function scanRepository(root: string, limit: number = scanCap(), filter: DirectoryFilter = gitignoreFilter(root)): RepositoryScan {
  return scan(root, limit, filter);
}

function scan(root: string, limit: number, filter: DirectoryFilter): RepositoryScan {
  const walker: Walker = { root, filter, found: [], ignored: [], limit };
  const truncated = walk(walker, root);

  return { files: walker.found.sort(), ignored: walker.ignored.sort(), truncated };
}

/**
 * Git's exclude rules below `root`, read from the files rather than asked of `git`: the per-user
 * `core.excludesFile`, the root's own `info/exclude` and every `.gitignore` from the root down. It
 * answers for a directory that does not exist too, which is what a `tsconfig` pattern into
 * not-yet-generated output needs. A `.gitignore` above the root is not read: a home directory kept
 * in git with `*` in it would empty the scan.
 */
export function gitignoreFilter(root: string): DirectoryFilter {
  const gitDirectory = commonGitDirectory(root);
  const excludes: IgnoreSource[] = [
    { base: '', rules: rulesOf(readTextFile(resolve(root, globalExcludesFile(gitDirectory)))) },
    { base: '', rules: rulesOf(gitDirectory === undefined ? undefined : readTextFile(join(gitDirectory, 'info', 'exclude'))) },
  ];
  const files = new Map<string, IgnoreSource>();
  const verdicts = new Map<string, boolean>();

  const sourceIn = (directory: string): IgnoreSource => {
    const cached = files.get(directory) ?? { base: directory, rules: rulesOf(readTextFile(join(root, directory, '.gitignore'))) };

    files.set(directory, cached);

    return cached;
  };

  const isIgnored = (path: string): boolean => {
    if (path === '' || path === '..' || path.startsWith('../')) {
      return false;
    }

    const cached = verdicts.get(path);

    if (cached !== undefined) {
      return cached;
    }

    const segments = path.split('/');
    const parents = segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
    const verdict = isIgnored(parents.at(-1) ?? '') || isIgnoredBy([...excludes, sourceIn(''), ...parents.map(sourceIn)], path);

    verdicts.set(path, verdict);

    return verdict;
  };

  return isIgnored;
}

function rulesOf(text: string | undefined): IgnoreRule[] {
  return (text === undefined ? undefined : parseGitignore(text)) ?? [];
}

/**
 * The git directory that holds `info/exclude` and `config` for the root: `.git` itself, or the
 * common directory a worktree's `.git` file leads to.
 */
function commonGitDirectory(root: string): string | undefined {
  const dotGit = join(root, '.git');
  const gitDirectory = isDirectory(dotGit) ? dotGit : linkedGitDirectory(root, dotGit);

  if (gitDirectory === undefined) {
    return undefined;
  }

  const common = readTextFile(join(gitDirectory, 'commondir'))?.trim();

  return common ? resolve(gitDirectory, common) : gitDirectory;
}

function linkedGitDirectory(root: string, dotGit: string): string | undefined {
  const [target] = captures(readTextFile(dotGit) ?? '', /^gitdir:\s*(.+?)\s*$/m);

  return target === undefined ? undefined : resolve(root, target);
}

/** An environment variable git reads, where set to the empty string counts as unset. */
function setting(name: string): string | undefined {
  const value = process.env[name];

  return value === '' ? undefined : value;
}

/**
 * Where git reads the per-user excludes from: the last `core.excludesFile` among the global and the
 * repository config, else `$XDG_CONFIG_HOME/git/ignore`. `GIT_CONFIG_GLOBAL` replaces the global
 * files, as in git; `[include]` is not followed.
 */
function globalExcludesFile(gitDirectory: string | undefined): string {
  const home = setting('HOME') ?? homedir();
  const xdg = setting('XDG_CONFIG_HOME') ?? join(home, '.config');
  const override = process.env['GIT_CONFIG_GLOBAL'];
  const configs = [
    ...(override === undefined ? [join(xdg, 'git', 'config'), join(home, '.gitconfig')] : [override]),
    ...(gitDirectory === undefined ? [] : [join(gitDirectory, 'config')]),
  ];
  const configured = configs.flatMap((config) => excludesFileSetting(readTextFile(config) ?? '') ?? []).at(-1);

  return configured === undefined ? join(xdg, 'git', 'ignore') : configured.replace(/^~(?=\/|$)/, home);
}

interface Walker {
  readonly root: string;
  readonly filter: DirectoryFilter;
  readonly found: string[];
  readonly ignored: string[];
  readonly limit: number;
}

/**
 * A repository of its own, below the one being scanned: a git worktree (whose `.git` is a *file*)
 * or a nested clone.
 *
 * Its files are not this repository's files. A tree carrying agent worktrees under
 * `.claude/worktrees/` listed them twice over — `doctor` saw every import graph in duplicate, and
 * `codemod --write` would have rewritten specs sitting on somebody else's branch.
 */
function isRepositoryRoot(directory: string): boolean {
  return existsSync(join(directory, '.git'));
}

function walk(walker: Walker, directory: string): boolean {
  if (walker.found.length >= walker.limit) {
    return true;
  }

  let entries;

  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (walker.found.length >= walker.limit) {
      return true;
    }

    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!isSkippedDirectory(entry.name) && !isRepositoryRoot(full) && !isGitignored(walker, full) && walk(walker, full)) {
        return true;
      }

      continue;
    }

    if (entry.isFile()) {
      walker.found.push(toPosix(relative(walker.root, full)));
    }
  }

  return false;
}

function isGitignored(walker: Walker, directory: string): boolean {
  const path = toPosix(relative(walker.root, directory));

  if (!walker.filter(path)) {
    return false;
  }

  walker.ignored.push(path);

  return true;
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
