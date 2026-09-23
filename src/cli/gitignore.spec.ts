import { describe, expect, it } from 'vitest';

import type { IgnoreRule } from './gitignore';
import { excludesFileSetting, isIgnoredBy, parseGitignore } from './gitignore';

function ignores(text: string, path: string): boolean {
  const rules: readonly IgnoreRule[] = parseGitignore(text) ?? [];

  return isIgnoredBy([{ base: '', rules }], path);
}

describe('parseGitignore', () => {
  it('skips blank lines and comments, and trims trailing whitespace', () => {
    expect(parseGitignore('\n# comment\n  \ntmp/  \r\n')?.map((rule) => rule.negated)).toEqual([false]);
  });

  it('drops a positive pattern it cannot read, which only means scanning more', () => {
    expect(parseGitignore('a\\ b/\n[unclosed/\n[[:alpha:]]/\n[z-a]/\n/\nkept/')).toHaveLength(1);
  });

  it('gives up on the whole file when a negation cannot be read', () => {
    expect(parseGitignore('build-*/\n!build-\\#1/')).toBeUndefined();
  });
});

describe('isIgnoredBy', () => {
  it('matches a slash-free pattern at any depth and an anchored one only from the root', () => {
    expect(ignores('generated/', 'src/app/generated')).toBe(true);
    expect(ignores('/generated/', 'src/generated')).toBe(false);
    expect(ignores('/generated/', 'generated')).toBe(true);
    expect(ignores('src/generated', 'src/generated')).toBe(true);
    expect(ignores('src/generated', 'libs/src/generated')).toBe(false);
  });

  it('keeps a star and a question mark inside one segment', () => {
    expect(ignores('tmp-*', 'tmp-run')).toBe(true);
    expect(ignores('a/*/c', 'a/b/c')).toBe(true);
    expect(ignores('a/*/c', 'a/b/x/c')).toBe(false);
    expect(ignores('run?', 'run1')).toBe(true);
    expect(ignores('run?', 'run12')).toBe(false);
    expect(ignores('v1.0', 'v1x0')).toBe(false);
  });

  it('reads a double star as any number of directories', () => {
    expect(ignores('**/cache', 'a/b/cache')).toBe(true);
    expect(ignores('**/cache', 'cache')).toBe(true);
    expect(ignores('a/**/c', 'a/c')).toBe(true);
    expect(ignores('a/**/c', 'a/x/y/c')).toBe(true);
    expect(ignores('a/**', 'a/b')).toBe(true);
    expect(ignores('a/**', 'a')).toBe(false);
  });

  it('reads a bracket class, negated or not', () => {
    expect(ignores('out[12]', 'out1')).toBe(true);
    expect(ignores('out[12]', 'out3')).toBe(false);
    expect(ignores('out[!12]', 'out3')).toBe(true);
    expect(ignores('out[^12]', 'out1')).toBe(false);
    expect(ignores('x[]]', 'x]')).toBe(true);
    expect(ignores('x[!]]', 'x]')).toBe(false);
  });

  it('lets the last matching rule win, so a negation re-includes a directory', () => {
    expect(ignores('*\n!*/', 'src')).toBe(false);
    expect(ignores('/packages/*\n!/packages/core/', 'packages/core')).toBe(false);
    expect(ignores('/packages/*\n!/packages/core/', 'packages/cli')).toBe(true);
    expect(ignores('!keep/\nkeep/', 'keep')).toBe(true);
  });
});

describe('isIgnoredBy across files', () => {
  const source = (base: string, text: string): { base: string; rules: IgnoreRule[] } => ({ base, rules: parseGitignore(text) ?? [] });

  it('reads a nested file relative to its own directory and only below it', () => {
    const sources = [source('', ''), source('libs/app', '/generated/\ncache')];

    expect(isIgnoredBy(sources, 'libs/app/generated')).toBe(true);
    expect(isIgnoredBy(sources, 'libs/app/src/generated')).toBe(false);
    expect(isIgnoredBy(sources, 'libs/app/src/cache')).toBe(true);
    expect(isIgnoredBy(sources, 'generated')).toBe(false);
    expect(isIgnoredBy(sources, 'libs/application/generated')).toBe(false);
  });

  it('lets a deeper file override a shallower one, and any file override info/exclude', () => {
    const sources = [source('', 'scratch/'), source('', 'generated/'), source('libs/app', '!generated/\n!scratch/')];

    expect(isIgnoredBy(sources, 'libs/app/generated')).toBe(false);
    expect(isIgnoredBy(sources, 'libs/app/scratch')).toBe(false);
    expect(isIgnoredBy(sources, 'libs/web/generated')).toBe(true);
    expect(isIgnoredBy(sources, 'scratch')).toBe(true);
  });
});

describe('excludesFileSetting', () => {
  it('takes the last core.excludesFile, whatever the key case, quoted or with a trailing comment', () => {
    const config = [
      '[user]',
      '  excludesFile = /not/core',
      '[core]',
      '  autocrlf = input',
      '  excludesFile = ~/.gitignore_global ; comment',
      '[Core]',
      '\texcludesfile = "/path with \\"quote\\"/ignore"',
    ].join('\n');

    expect(excludesFileSetting(config)).toBe('/path with "quote"/ignore');
    expect(excludesFileSetting('[core]\n  excludesFile = ~/.gitignore_global # comment')).toBe('~/.gitignore_global');
    expect(excludesFileSetting('[user]\n  name = x')).toBeUndefined();
    expect(excludesFileSetting('excludesFile = /before/any/section')).toBeUndefined();
  });
});
