/**
 * The one module that touches `node:fs`, so the one module whose specs need real inodes.
 */
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  isDirectory,
  isSymlink,
  listRepositoryFiles,
  parseJsonc,
  pathExists,
  readTextFile,
  removeFile,
  scanRepository,
  toPosix,
  writeTextFile,
} from './fs-scan';
import { createTempRepo, linkInRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

describe('listRepositoryFiles', () => {
  it('returns sorted POSIX paths and never descends into build output or dependencies', () => {
    const root = createTempRepo({
      'src/b.ts': '',
      'src/a.ts': '',
      'node_modules/pkg/index.js': '',
      'dist/bundle.js': '',
      'coverage/lcov.info': '',
    });

    expect(listRepositoryFiles(root)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('skips a package-manager store that CI keeps inside the checkout', () => {
    const root = createTempRepo({
      'src/a.ts': '',
      '.bun/install/cache/pkg@1.0.0/tsconfig.json': '{}',
      '.npm/_cacache/index-v5/00/entry': '',
      '.pnpm-store/v3/files/00/pkg.json': '',
      'out-tsc/src/a.js': '',
    });

    expect(listRepositoryFiles(root)).toEqual(['src/a.ts']);
  });

  it('does not honour .gitignore, so a report directory is listed whatever the base ignores', () => {
    const root = createTempRepo({ '.gitignore': 'shard-*/\n', 'shard-1/perf.json': '' });

    expect(listRepositoryFiles(root)).toEqual(['.gitignore', 'shard-1/perf.json']);
  });

  it('counts a symlink as neither a file nor a directory', () => {
    const root = createTempRepo({ 'src/a.ts': '' });

    linkInRepo(root, 'link.ts', 'src/a.ts');

    expect(listRepositoryFiles(root)).toEqual(['src/a.ts']);
  });

  it('does not descend into a nested repository or a worktree, whose files belong to another branch', () => {
    const root = createTempRepo({
      'src/a.ts': '',
      '.claude/worktrees/one/.git': 'gitdir: /elsewhere/.git/worktrees/one',
      '.claude/worktrees/one/src/copy.spec.ts': '',
      'packages/nested/.git/HEAD': 'ref: refs/heads/main',
      'packages/nested/src/b.ts': '',
    });

    expect(listRepositoryFiles(root)).toEqual(['src/a.ts']);
  });

  it('stops at the limit rather than walking a pathological tree', () => {
    const root = createTempRepo({ 'src/a.ts': '', 'src/b.ts': '', 'other/c.ts': '' });

    expect(listRepositoryFiles(root, 1).length).toBeLessThan(3);
  });

  it('returns nothing for a directory it cannot read', () => {
    expect(listRepositoryFiles(join('/', 'no-such-root-1a2b3c'))).toEqual([]);
  });
});

describe('scanRepository', () => {
  it('says the list is complete when the whole tree fits', () => {
    const root = createTempRepo({ 'src/a.ts': '', 'src/b.ts': '' });

    expect(scanRepository(root)).toEqual({ files: ['src/a.ts', 'src/b.ts'], ignored: [], truncated: false });
  });

  it('prunes the directories the root .gitignore excludes and names them', () => {
    const root = createTempRepo({
      '.gitignore': ['# local output', '/reports/', 'generated', 'tmp-*/', 'keep/*', '!keep/src/', ''].join('\n'),
      'src/a.ts': '',
      'src/generated/b.ts': '',
      'reports/r.json': '',
      'libs/reports/c.ts': '',
      'tmp-run/x.ts': '',
      'keep/drop/y.ts': '',
      'keep/src/z.ts': '',
      'keep/top.ts': '',
    });

    expect(scanRepository(root)).toEqual({
      files: ['.gitignore', 'keep/src/z.ts', 'keep/top.ts', 'libs/reports/c.ts', 'src/a.ts'],
      ignored: ['keep/drop', 'reports', 'src/generated', 'tmp-run'],
      truncated: false,
    });
  });

  it('scans as before when there is no .gitignore or it cannot be honoured', () => {
    expect(scanRepository(createTempRepo({ 'gen/a.ts': '' })).files).toEqual(['gen/a.ts']);

    const root = createTempRepo({ '.gitignore': 'gen/\n!gen\\ keep/\n', 'gen/a.ts': '' });

    expect(scanRepository(root)).toEqual({ files: ['.gitignore', 'gen/a.ts'], ignored: [], truncated: false });
  });

  it('reports truncation when the cap is reached inside a subdirectory', () => {
    const root = createTempRepo({ 'src/a.ts': '', 'src/b.ts': '' });
    const scan = scanRepository(root, 1);

    // Whichever of the two the platform's `readdir` hands back first: the point is that the cap was
    // hit *inside* `src/`, which is the return path the sibling-level check above never reaches.
    expect(scan.files).toHaveLength(1);
    expect(scan.truncated).toBe(true);
  });

  it('scans nothing and says so for a cap of zero', () => {
    const root = createTempRepo({ 'src/a.ts': '' });

    expect(scanRepository(root, 0)).toEqual({ files: [], ignored: [], truncated: true });
  });
});

describe('single-path helpers', () => {
  it('reports what exists, what is a directory and what is a link', () => {
    const root = createTempRepo({ 'src/a.ts': 'x', 'dir/': '' });

    linkInRepo(root, 'link.ts', 'src/a.ts');

    expect(pathExists(join(root, 'src/a.ts'))).toBe(true);
    expect(pathExists(join(root, 'nope.ts'))).toBe(false);
    expect(isDirectory(join(root, 'dir'))).toBe(true);
    expect(isDirectory(join(root, 'src/a.ts'))).toBe(false);
    expect(isDirectory(join(root, 'nope'))).toBe(false);
    expect(isSymlink(join(root, 'link.ts'))).toBe(true);
    expect(isSymlink(join(root, 'src/a.ts'))).toBe(false);
  });

  it('reads, writes and removes', () => {
    const root = createTempRepo({});
    const target = join(root, 'nested/deep/file.md');

    expect(readTextFile(target)).toBeUndefined();

    writeTextFile(target, 'body');

    expect(readTextFile(target)).toBe('body');

    removeFile(target);

    expect(pathExists(target)).toBe(false);
  });

  it('normalises a native path to POSIX', () => {
    expect(toPosix(join('a', 'b', 'c.ts'))).toBe('a/b/c.ts');
  });
});

describe('parseJsonc', () => {
  it('accepts the comments and trailing commas every tsconfig has', () => {
    const parsed = parseJsonc(`{
      // a line comment with a "quote" and a } brace
      /* a block comment */
      "include": ["src/**/*.ts",],
      "note": "a // slash and a /* start inside a string",
      "escaped": "a \\" quote",
    }`);

    expect(parsed).toEqual({
      include: ['src/**/*.ts'],
      note: 'a // slash and a /* start inside a string',
      escaped: 'a " quote',
    });
  });

  it('survives an unterminated string or block comment', () => {
    expect(parseJsonc('{ "a": "unterminated')).toBeUndefined();
    expect(parseJsonc('{ "a": 1 } /* unterminated')).toEqual({ a: 1 });
  });

  it('returns undefined rather than throwing on malformed text', () => {
    expect(parseJsonc('{ not json')).toBeUndefined();
  });
});
