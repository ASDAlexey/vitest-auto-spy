/**
 * The one place the CLI decides color, and the width arithmetic that has to see through it.
 *
 * Pinned: the three ways a terminal says no, an explicit choice beating the environment, and padding
 * that counts what the terminal shows rather than the escape sequences around it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ESC, MONOCHROME, TERMINAL, colorWanted, padEnd, padStart, painterFor, stripColor } from './paint';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('colorWanted', () => {
  it('says yes by default and no for NO_COLOR, FORCE_COLOR=0 and TERM=dumb', () => {
    expect(colorWanted({})).toBe(true);
    expect(colorWanted({ NO_COLOR: '' })).toBe(false);
    expect(colorWanted({ FORCE_COLOR: '0' })).toBe(false);
    expect(colorWanted({ FORCE_COLOR: '1', TERM: 'xterm' })).toBe(true);
    expect(colorWanted({ TERM: 'dumb' })).toBe(false);
  });
});

describe('painterFor', () => {
  it('takes an explicit choice over the environment, and follows the environment otherwise', () => {
    vi.stubEnv('NO_COLOR', '1');

    expect(painterFor(true)).toBe(TERMINAL);
    expect(painterFor(undefined)).toBe(MONOCHROME);

    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', undefined);
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
