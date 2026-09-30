/**
 * The argument grammar, pinned. It is 40 lines of hand-written parsing precisely so the package
 * keeps its zero-dependency posture, which only holds if the 40 lines are exercised.
 */
import { describe, expect, it } from 'vitest';

import { flagEnabled, flagList, flagNumber, flagValue, parseArgs } from './args';

describe('parseArgs', () => {
  it('takes the first bare token as the command and the rest as positionals', () => {
    const args = parseArgs(['doctor', 'src', 'lib']);

    expect(args.command).toBe('doctor');
    expect(args.positionals).toEqual(['src', 'lib']);
  });

  it('reads a value flag in both spellings', () => {
    expect(flagValue(parseArgs(['init', '--cwd', '/tmp/x']), 'cwd')).toBe('/tmp/x');
    expect(flagValue(parseArgs(['init', '--cwd=/tmp/y']), 'cwd')).toBe('/tmp/y');
    expect(flagValue(parseArgs(['codemod', '--from', 'jasmine']), 'from')).toBe('jasmine');
  });

  it('adds up a repeated list flag and keeps the last value of any other', () => {
    const args = parseArgs(['doctor', '--ignore', 'a', '--ignore=b,c', '--cwd', '/x', '--cwd', '/y']);

    expect(flagList(args, 'ignore')).toEqual(['a', 'b', 'c']);
    expect(flagValue(args, 'cwd')).toBe('/y');
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

describe('the pass-through after --', () => {
  it('keeps every token after the first bare -- as typed, flags included', () => {
    const args = parseArgs(['ng-test', '--shard', '1/2', '--', '--include', 'src/app', '--', '--coverage']);

    expect(flagValue(args, 'shard')).toBe('1/2');
    expect(args.passthrough).toEqual(['--include', 'src/app', '--', '--coverage']);
    expect(args.flags).not.toHaveProperty('include');
    expect(parseArgs(['doctor']).passthrough).toEqual([]);
  });

  it('reads --changed with or without a ref', () => {
    expect(parseArgs(['ng-test', '--changed']).flags['changed']).toBe(true);
    expect(parseArgs(['ng-test', '--changed', '--', '--coverage']).flags['changed']).toBe(true);
    expect(flagValue(parseArgs(['ng-test', '--changed', 'origin/main']), 'changed')).toBe('origin/main');
  });
});

describe('flagNumber', () => {
  it('reads a budget, and refuses anything that is not one', () => {
    expect(flagNumber(parseArgs(['perf', '--max-test-ms', '1500']), 'max-test-ms')).toBe(1_500);
    expect(flagNumber(parseArgs(['perf', '--max-test-ms=0']), 'max-test-ms')).toBe(0);
    expect(flagNumber(parseArgs(['perf']), 'max-test-ms')).toBeUndefined();
    expect(flagNumber(parseArgs(['perf', '--max-test-ms=  ']), 'max-test-ms')).toBeUndefined();
    expect(flagNumber(parseArgs(['perf', '--max-test-ms=soon']), 'max-test-ms')).toBeUndefined();
    expect(flagNumber(parseArgs(['perf', '--max-test-ms=-5']), 'max-test-ms')).toBeUndefined();
    expect(flagNumber(parseArgs(['perf', '--max-test-ms=1e999']), 'max-test-ms')).toBeUndefined();
  });
});

describe('flagList', () => {
  it('splits on commas, trims, and drops the gaps a trailing comma leaves', () => {
    expect(flagList(parseArgs(['perf', '--gate-only', 'libs/a, libs/b,']), 'gate-only')).toEqual(['libs/a', 'libs/b']);
    expect(flagList(parseArgs(['perf']), 'gate-only')).toEqual([]);
  });
});
