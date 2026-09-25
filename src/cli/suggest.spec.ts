import { describe, expect, it } from 'vitest';

import { nearest } from './suggest';

describe('nearest', () => {
  const commands = ['doctor', 'perf', 'init', 'codemod'];

  it('finds the candidate a typo most likely meant', () => {
    expect(nearest('dcotor', commands)).toBe('doctor');
    expect(nearest('Perf', commands)).toBe('perf');
    expect(nearest('dryrun', ['check', 'dry-run', 'only'])).toBe('dry-run');
  });

  it('takes an unambiguous prefix of three letters or more', () => {
    expect(nearest('code', commands)).toBe('codemod');
    expect(nearest('co', ['codemod', 'cwd'])).toBe('cwd');
  });

  it('guesses nothing when no candidate is close', () => {
    expect(nearest('deploy', commands)).toBeUndefined();
    expect(nearest('x', [])).toBeUndefined();
  });
});
