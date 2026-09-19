import { describe, expect, it } from 'vitest';

import { MONOCHROME, TERMINAL, stripColor } from './paint';
import { bar, drawTable } from './table';

describe('drawTable', () => {
  it('right-aligns numbers, pads a text column in the middle, and leaves the last one whole', () => {
    expect(
      drawTable(
        [
          { head: 'name', cells: ['a', 'bbb'], left: true },
          { head: 'ms', cells: ['5', '1200'] },
          { head: 'file', cells: ['x.spec.ts', 'a/very/long/path.spec.ts'], left: true },
        ],
        MONOCHROME,
      ),
    ).toEqual(['  name    ms  file', '  a        5  x.spec.ts', '  bbb   1200  a/very/long/path.spec.ts']);
  });

  it('dims the header, paints a cell after padding it, and drops the trailing blank of an empty heading', () => {
    const lines = drawTable(
      [
        { head: 'ms', cells: ['5'], paint: (cell, row) => `${TERMINAL.red(cell)}${String(row)}` },
        { head: '', cells: ['█'], left: true },
      ],
      TERMINAL,
    );

    expect(lines[0]).toBe(`  ${TERMINAL.dim('ms')}`);
    expect(lines[1]).toBe(`  ${TERMINAL.red(' 5')}0  █`);
    expect(stripColor(lines[1] ?? '')).toBe('   50  █');
  });

  it('draws nothing for no columns', () => {
    expect(drawTable([], MONOCHROME)).toEqual([]);
  });
});

describe('bar', () => {
  it('fills whole cells and ends in an eighth, clamped to the width', () => {
    expect(bar(0, 10)).toBe('');
    expect(bar(0.5, 10)).toBe('█████');
    expect(bar(0.0625, 10)).toBe('▋');
    expect(bar(2, 4)).toBe('████');
    expect(bar(-1, 4)).toBe('');
  });
});
