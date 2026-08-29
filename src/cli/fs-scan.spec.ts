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

  it('counts a symlink as neither a file nor a directory', () => {
    const root = createTempRepo({ 'src/a.ts': '' });

    linkInRepo(root, 'link.ts', 'src/a.ts');

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
