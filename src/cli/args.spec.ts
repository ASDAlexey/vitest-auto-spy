/**
 * The argument grammar, pinned. It is 40 lines of hand-written parsing precisely so the package
 * keeps its zero-dependency posture, which only holds if the 40 lines are exercised.
 */
import { describe, expect, it } from 'vitest';

import { flagEnabled, flagValue, parseArgs } from './args';

describe('parseArgs', () => {
  it('takes the first bare token as the command and the rest as positionals', () => {
    const args = parseArgs(['doctor', 'src', 'lib']);

    expect(args.command).toBe('doctor');
    expect(args.positionals).toEqual(['src', 'lib']);
  });

  it('reads a value flag in both spellings', () => {
    expect(flagValue(parseArgs(['init', '--cwd', '/tmp/x']), 'cwd')).toBe('/tmp/x');
    expect(flagValue(parseArgs(['init', '--cwd=/tmp/y']), 'cwd')).toBe('/tmp/y');
  });

  it('does not swallow the next flag as a value', () => {
    const args = parseArgs(['init', '--cwd', '--check']);

    expect(flagValue(args, 'cwd')).toBeUndefined();
    expect(flagEnabled(args, 'check')).toBe(true);
  });

  it('treats an unknown flag as boolean and resolves the short aliases', () => {
    const args = parseArgs(['-h', '-v', '--dry-run']);

    expect(flagEnabled(args, 'help')).toBe(true);
    expect(flagEnabled(args, 'version')).toBe(true);
    expect(flagEnabled(args, 'dry-run')).toBe(true);
  });

  it('honours an explicit false so a script can pass a computed value', () => {
    expect(flagEnabled(parseArgs(['init', '--check=false']), 'check')).toBe(false);
    expect(flagEnabled(parseArgs(['init']), 'check')).toBe(false);
    expect(flagValue(parseArgs(['init', '--check']), 'check')).toBeUndefined();
  });
});
