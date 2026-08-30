/**
 * The `vi.defineHelper` probe.
 *
 * Two things are worth proving and one is not testable here. The wrap must be transparent — same
 * arguments, same return value, same throw — and the probe must answer correctly for every runtime
 * the package ships to: Vitest 4.1, where a definer is found, and Bun / `node:test` / an older
 * Vitest, where none is and the helper has to come back untouched. What no spec can assert is the
 * point of the exercise: which line the *runner* attributes a failure to. That is observable only
 * by running a failing test and reading the reporter.
 *
 * The probe takes its host as an argument precisely so these tests can exist: Vitest installs
 * `__vitest_index__` non-configurably, so it cannot be swapped on the real `globalThis`.
 */
import { describe, expect, it } from 'vitest';

import { applyHelperDefiner, defineHelper, findHelperDefiner } from './define-helper';
import type { Func } from './types';

describe('findHelperDefiner', () => {
  it('finds the definer Vitest installs on the real global', () => {
    expect(findHelperDefiner(globalThis)).toBeTypeOf('function');
  });

  it.each([
    ['nothing on the host at all', {}],
    ['an index that is not an object', { __vitest_index__: 'not-an-index' }],
    ['an index that is null', { __vitest_index__: null }],
    ['an index whose vi is missing', { __vitest_index__: {} }],
    ['a vi that is not an object', { __vitest_index__: { vi: 'nope' } }],
    ['a vi without defineHelper (Vitest below 4.1)', { __vitest_index__: { vi: {} } }],
    ['a defineHelper that is not callable', { __vitest_index__: { vi: { defineHelper: 'nope' } } }],
  ])('answers undefined for a runtime offering %s', (_case, host) => {
    expect(findHelperDefiner(host)).toBeUndefined();
  });
});

describe('applyHelperDefiner', () => {
  it('routes the helper through the definer when there is one', () => {
    // Hand-written rather than a `vi.fn()`: the definer's contract is generic identity
    // (`<F>(fn: F) => F`), which a `Mock` cannot express — it fixes the type parameters.
    const seen: unknown[] = [];
    const define = <F extends Func>(fn: F): F => {
      seen.push(fn);

      return fn;
    };
    const original = (value: number): number => value * 2;

    expect(applyHelperDefiner(define, original)).toBe(original);
    expect(seen).toEqual([original]);
  });

  it('hands the helper back untouched off Vitest, adding no wrapper frame of its own', () => {
    const original = (value: number): number => value * 2;

    expect(applyHelperDefiner(undefined, original)).toBe(original);
  });
});

describe('defineHelper', () => {
  it('is transparent to arguments, return value and throwing', () => {
    const helper = defineHelper((a: number, b: string): string => {
      if (a < 0) {
        throw new Error(`negative ${b}`);
      }

      return `${a}${b}`;
    });

    expect(helper(1, 'a')).toBe('1a');
    expect(() => helper(-1, 'a')).toThrow('negative a');
  });
});
