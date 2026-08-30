/**
 * The lexer under the codemod, and the edit list on top of it.
 *
 * Every transform matches against the mask rather than the source, so the cases that matter here
 * are the ones where a naive find-and-replace would have edited prose: `jest.fn()` inside a
 * comment, inside a string, inside a regular expression. The bracket matcher gets its own cases for
 * the arrow, which is the character sequence that makes a type-argument list look closed when it is
 * not.
 */
import { describe, expect, it } from 'vitest';

import { EMPTY_OUTPUT, applyEdits, mergeOutputs, note } from './edits';
import { buildMask, lineOf, maskCode, maskComments, matchBracket, splitTopLevel, trimmed } from './mask';

describe('maskCode', () => {
  it('blanks the contents of comments, strings and regular expressions, keeping the length', () => {
    const source = ['// jest.fn()', "const a = 'jest.spyOn';", '/* jest.mock */', 'const r = /jest\\.fn/;'].join('\n');
    const masked = maskCode(source);

    expect(masked.length).toBe(source.length);
    expect(masked).not.toContain('jest.');
    expect(masked.split('\n')).toHaveLength(4);
  });

  it('keeps the quotes, so an import specifier is still findable', () => {
    expect(maskCode("import x from 'pkg';")).toBe("import x from '   ';");
  });

  it('leaves a division alone and masks a regular expression', () => {
    expect(maskCode('const a = (b) / c / d;')).toBe('const a = (b) / c / d;');
    expect(maskCode('if (/a/.test(x)) {}')).toBe('if (   .test(x)) {}');
    expect(maskCode('/a/.test(x)')).toBe('   .test(x)');
  });

  it('masks a template literal for the transforms and shows it to the residue check', () => {
    expect(maskCode('const a = `jest.fn()`;')).toBe('const a = `         `;');
    expect(maskComments('const a = `jest.fn()`;')).toBe('const a = `jest.fn()`;');
    expect(maskComments("import x from 'jest-auto-spies'; // 'y'")).toBe("import x from 'jest-auto-spies';       ");
    expect(maskComments("const a = 'jest.spyOn';")).toBe("const a = '          ';");
    expect(buildMask('const a = /x/; // c', { view: 'residue' })).toBe('const a =    ;     ');
  });

  it('does not let an apostrophe in a comment swallow the file', () => {
    const source = "// don't\nconst a = 1;";

    expect(maskCode(source)).toBe('        \nconst a = 1;');
  });
});

describe('matchBracket', () => {
  it('answers undefined for a character that is not a bracket', () => {
    expect(matchBracket('abc', 0)).toBeUndefined();
  });

  it('answers undefined when the source is unbalanced', () => {
    expect(matchBracket('f(a, b', 1)).toBeUndefined();
  });

  it('does not read the arrow of a function type as a closing angle bracket', () => {
    const type = 'Mock<() => void, []>';

    expect(matchBracket(type, 4)).toBe(type.length);
  });

  it('counts nested brackets', () => {
    const type = '<Record<string, number>, [a: string]>';

    expect(matchBracket(type, 0)).toBe(type.length);
  });
});

describe('splitTopLevel', () => {
  it('splits on the commas that are not nested', () => {
    const text = 'A, Record<string, number>, [b, c]';
    const parts = splitTopLevel(text, 0, text.length).map(([start, end]) => text.slice(start, end).trim());

    expect(parts).toEqual(['A', 'Record<string, number>', '[b, c]']);
  });

  it('answers an empty list for an empty argument list', () => {
    expect(splitTopLevel('<>', 1, 1)).toEqual([]);
    expect(splitTopLevel('<  >', 1, 3)).toEqual([]);
  });

  it('keeps an empty trailing part when there was a comma', () => {
    expect(splitTopLevel('A,', 0, 2)).toHaveLength(2);
  });

  it('does not split inside an arrow type', () => {
    const text = '(a: string) => void, []';

    expect(splitTopLevel(text, 0, text.length)).toHaveLength(2);
  });
});

describe('trimmed and lineOf', () => {
  it('drops the whitespace at both ends', () => {
    expect(trimmed('  ab  ', [0, 6])).toEqual([2, 4]);
    expect(trimmed('    ', [0, 4])).toEqual([4, 4]);
  });

  it('counts lines from one', () => {
    expect(lineOf('a\nb\nc', 0)).toBe(1);
    expect(lineOf('a\nb\nc', 4)).toBe(3);
  });
});

describe('applyEdits', () => {
  it('applies back to front so the indices stay valid', () => {
    const source = 'aaa bbb ccc';
    const result = applyEdits(source, [
      { start: 0, end: 3, text: 'x' },
      { start: 8, end: 11, text: 'z' },
    ]);

    expect(result).toBe('x bbb z');
  });

  it('drops an edit that overlaps one already applied, and an inverted one', () => {
    const source = '0123456789';

    const edits = [
      { start: 2, end: 8, text: 'X' },
      { start: 5, end: 9, text: 'Y' },
      { start: 4, end: 1, text: 'Z' },
    ];

    // Back to front, so the edit nearer the end of the file is the one that survives an overlap.
    expect(applyEdits(source, edits)).toBe('01234Y9');
  });

  it('breaks a tie on the same start by the longer span, so the shorter one is the one dropped', () => {
    const edits = [
      { start: 2, end: 4, text: 'short' },
      { start: 2, end: 6, text: 'long' },
    ];

    expect(applyEdits('0123456789', edits)).toBe('01long6789');
  });
});

describe('mergeOutputs and note', () => {
  it('concatenates every channel', () => {
    const one = { ...EMPTY_OUTPUT, edits: [{ start: 0, end: 1, text: 'a' }] };
    const two = { ...EMPTY_OUTPUT, dropIfUnused: ['Spy'], needs: [{ specifier: 'vitest', name: 'Mock', typeOnly: true }] };
    const merged = mergeOutputs([one, two]);

    expect(merged.edits).toHaveLength(1);
    expect(merged.needs).toHaveLength(1);
    expect(merged.dropIfUnused).toEqual(['Spy']);
    expect(merged.notes).toEqual([]);
  });

  it('addresses a note as path:line, which an editor turns into a jump', () => {
    const finding = note({ check: 'c', severity: 'warning', file: 'a.spec.ts', line: 12, message: 'm', fix: 'f' });

    expect(finding.file).toBe('a.spec.ts:12');
  });
});
