/**
 * The one place the CLI decides color, and the width arithmetic that has to see through it.
 *
 * Pinned: the three ways a terminal says no, an explicit choice beating the environment, and padding
 * that counts what the terminal shows rather than the escape sequences around it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ESC,
  FALLBACK_WIDTH,
  MONOCHROME,
  TERMINAL,
  colorWanted,
  outputWidth,
  padEnd,
  padStart,
  painterFor,
  stripColor,
  wrapText,
} from './paint';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('colorWanted', () => {
  it('says yes on a terminal and no for NO_COLOR, FORCE_COLOR=0 and TERM=dumb', () => {
    expect(colorWanted({}, true)).toBe(true);
    expect(colorWanted({ NO_COLOR: '' }, true)).toBe(false);
    expect(colorWanted({ FORCE_COLOR: '0' }, true)).toBe(false);
    expect(colorWanted({ TERM: 'dumb' }, true)).toBe(false);
  });

  it('says no to a pipe or a file unless FORCE_COLOR asks, so a harness repainting the lines never nests escapes', () => {
    expect(colorWanted({}, false)).toBe(false);
    expect(colorWanted({ FORCE_COLOR: '1', TERM: 'xterm' }, false)).toBe(true);
    expect(colorWanted({ FORCE_COLOR: '1', NO_COLOR: '1' }, false)).toBe(false);
    expect(colorWanted({})).toBe(process.stdout.isTTY === true);
  });
});

describe('painterFor', () => {
  it('takes an explicit choice over the environment, and follows the environment otherwise', () => {
    vi.stubEnv('NO_COLOR', '1');

    expect(painterFor(true)).toBe(TERMINAL);
    expect(painterFor(undefined)).toBe(MONOCHROME);

    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', '1');
    vi.stubEnv('TERM', 'xterm');

    expect(painterFor(undefined)).toBe(TERMINAL);
    expect(painterFor(false)).toBe(MONOCHROME);
  });
});

describe('the painters', () => {
  it('wraps each color in its escape sequence and a reset, and leaves text alone in monochrome', () => {
    expect(TERMINAL.red('x')).toBe(`${ESC}[31mx${ESC}[0m`);
    expect(TERMINAL.yellow('x')).toBe(`${ESC}[33mx${ESC}[0m`);
    expect(TERMINAL.cyan('x')).toBe(`${ESC}[36mx${ESC}[0m`);
    expect(TERMINAL.bold('x')).toBe(`${ESC}[1mx${ESC}[0m`);
    expect(TERMINAL.dim('x')).toBe(`${ESC}[2mx${ESC}[0m`);
    expect([MONOCHROME.red('x'), MONOCHROME.yellow('x'), MONOCHROME.cyan('x'), MONOCHROME.bold('x'), MONOCHROME.dim('x')]).toEqual([
      'x',
      'x',
      'x',
      'x',
      'x',
    ]);
  });
});

describe('width', () => {
  it('strips every escape sequence, and pads by what is left', () => {
    const colored = TERMINAL.red(TERMINAL.bold('ab'));

    expect(stripColor(colored)).toBe('ab');
    expect(stripColor(padEnd(colored, 5))).toBe('ab   ');
    expect(stripColor(padStart(colored, 5))).toBe('   ab');
  });

  it('never pads a value already wider than the column', () => {
    expect(padEnd('abcdef', 3)).toBe('abcdef');
    expect(padStart('abcdef', 3)).toBe('abcdef');
  });
});

describe('outputWidth', () => {
  it('takes the terminal, then COLUMNS, then an 80-column log, and keeps prose between 40 and 120', () => {
    const tty = (columns: number): { isTTY: boolean; columns: number } => ({ isTTY: true, columns });

    expect(outputWidth({ COLUMNS: '90' }, tty(100))).toBe(100);
    expect(outputWidth({ COLUMNS: '90' }, { columns: 100 })).toBe(90);
    expect(outputWidth({ COLUMNS: 'wide' }, {})).toBe(FALLBACK_WIDTH);
    expect(outputWidth({}, tty(0))).toBe(FALLBACK_WIDTH);
    expect(outputWidth({}, tty(20))).toBe(40);
    expect(outputWidth({}, tty(300))).toBe(120);
    expect(outputWidth()).toBeGreaterThanOrEqual(40);
  });
});

describe('wrapText', () => {
  it('wraps on spaces under a hanging indent, and gives a word wider than the line a line of its own, whole', () => {
    expect(wrapText('aaa bbb ccc', 9, '  ', '- ')).toEqual(['- aaa bbb', '  ccc']);
    expect(wrapText(`see ${'u'.repeat(20)} now`, 10, '')).toEqual(['see', 'u'.repeat(20), 'now']);
    expect(wrapText('', 10, '  ')).toEqual(['  ']);
  });

  it('keeps the lines a text already has, and counts what the terminal shows', () => {
    expect(wrapText('one\ntwo', 40, '  ', '> ')).toEqual(['> one', '  two']);
    expect(wrapText(`${TERMINAL.red('ab')} cd`, 5, '')).toEqual([TERMINAL.red('ab') + ' cd']);
  });
});
