import { describe, expect, it } from 'vitest';

import { reportRelativePath } from './report-relative-path';

describe('reportRelativePath', () => {
  it.each([
    ['/ci/repo/src/a.ts', '/ci/repo'],
    ['C:\\ci\\repo\\src\\a.ts', 'c:\\ci\\repo'],
    ['//server/share/repo/src/a.ts', '\\\\server\\share\\repo'],
  ])('relocates %s into the checkout', (file, root) => {
    expect(reportRelativePath(file, root, '/local')).toBe('src/a.ts');
  });

  it.each([
    ['/ci/repo2/a.ts', '/ci/repo'],
    ['/ci', '/ci/repo'],
    ['/ci/repo', '/ci/repo'],
    ['D:\\a.ts', 'C:\\repo'],
    ['src/a.ts', '/ci/repo'],
    ['/ci/repo/a.ts', 'repo'],
    ['/ci/repo/a.ts', ''],
  ])('rejects %s outside its recorded root', (file, root) => {
    expect(reportRelativePath(file, root, '/local')).toBeUndefined();
  });

  it('keeps local files whose directory starts with two dots', () => {
    expect(reportRelativePath('/local/..archive/a.ts', '', '/local')).toBe('..archive/a.ts');
  });
});
