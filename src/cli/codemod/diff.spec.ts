/**
 * The diff, which in a dry run is the entire product.
 *
 * Two properties are worth pinning: the hunk header has to count the lines it actually printed —
 * a wrong `@@` is what makes a diff impossible to apply by hand — and two changes far apart have to
 * come out as two hunks rather than one block that swallows the file between them.
 */
import { describe, expect, it } from 'vitest';

import { unifiedDiff } from './diff';

function numbered(count: number, from: number = 1): string {
  return Array.from({ length: count }, (_unused, index) => `line ${index + from}`).join('\n');
}

describe('unifiedDiff', () => {
  it('is empty when nothing changed', () => {
    expect(unifiedDiff('a.ts', 'same', 'same')).toBe('');
  });

  it('names the file and counts the lines of the hunk', () => {
    const before = ['a', 'b', 'c'].join('\n');
    const after = ['a', 'B', 'c'].join('\n');

    expect(unifiedDiff('a.spec.ts', before, after)).toBe(
      ['--- a/a.spec.ts', '+++ b/a.spec.ts', '@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c'].join('\n'),
    );
  });

  it('reports an insertion and a deletion with the right line counts', () => {
    expect(unifiedDiff('a.ts', 'a\nc', 'a\nb\nc')).toContain('@@ -1,2 +1,3 @@');
    expect(unifiedDiff('a.ts', 'a\nb\nc', 'a\nc')).toContain('@@ -1,3 +1,2 @@');
  });

  it('emits two hunks when the changes are far apart', () => {
    const before = numbered(40);
    const after = before.replace('line 2\n', 'LINE 2\n').replace('line 38\n', 'LINE 38\n');
    const headers = unifiedDiff('a.ts', before, after)
      .split('\n')
      .filter((line) => line.startsWith('@@'));

    expect(headers).toHaveLength(2);
  });

  it('prints one replaced block rather than aligning a middle nobody would read', () => {
    const before = numbered(600);
    const after = numbered(600, 1000);
    const body = unifiedDiff('a.ts', before, after).split('\n');

    expect(body.filter((line) => line.startsWith('-'))).toHaveLength(601);
    expect(body.filter((line) => line.startsWith('+'))).toHaveLength(601);
  });
});
