/**
 * `ArgsMap` keys argument lists for `calledWith` matching. These specs cover the
 * two strategies directly: exact string keys (fast primitive path + deep
 * circular-safe path) and asymmetric-matcher predicates, plus the precedence and
 * guard branches.
 */
import { describe, expect, it } from 'vitest';

import { ArgsMap } from './args-map';

describe('ArgsMap', () => {
  it('stores and retrieves by exact primitive args (fast path)', () => {
    const map = new ArgsMap();
    map.set([1, 'a'], 'v');

    expect(map.get([1, 'a'])).toBe('v');
    expect(map.get([1, 'b'])).toBeUndefined();
  });

  it('matches deep object args via the circular-safe path', () => {
    const map = new ArgsMap();
    map.set([{ id: 1 }], 'obj');

    expect(map.get([{ id: 1 }])).toBe('obj');
    expect(map.get([{ id: 2 }])).toBeUndefined();
  });

  it('keys prototype-sensitive string args as plain entries', () => {
    const map = new ArgsMap();
    map.set(['__proto__'], 'a');
    map.set(['constructor'], 'b');

    expect(map.get(['__proto__'])).toBe('a');
    expect(map.get(['constructor'])).toBe('b');
    expect(map.get(['toString'])).toBeUndefined();
  });

  it('matches an asymmetric matcher arg against concrete values', () => {
    const map = new ArgsMap();
    map.set([expect.any(Number)], 'num');

    expect(map.get([7])).toBe('num');
    expect(map.get(['x'])).toBeUndefined();
  });

  it('supports objectContaining and mixed matcher/literal args', () => {
    const map = new ArgsMap();
    map.set([expect.objectContaining({ id: 1 }), 'go'], 'hit');

    expect(map.get([{ id: 1, extra: true }, 'go'])).toBe('hit');
    // literal element differs
    expect(map.get([{ id: 1, extra: true }, 'stop'])).toBeUndefined();
    // matcher element differs
    expect(map.get([{ id: 2 }, 'go'])).toBeUndefined();
  });

  it('rejects a matcher config when the arity differs', () => {
    const map = new ArgsMap();
    map.set([expect.any(Number)], 'num');

    expect(map.get([1, 2])).toBeUndefined();
  });

  it('returns undefined for a non-array lookup', () => {
    const map = new ArgsMap();
    map.set([expect.any(Number)], 'num');

    expect(map.get('not-an-array')).toBeUndefined();
  });

  it('prefers an exact match over an asymmetric one', () => {
    const map = new ArgsMap();
    map.set([expect.any(Number)], 'any');
    map.set([5], 'exact');

    expect(map.get([5])).toBe('exact');
    expect(map.get([6])).toBe('any');
  });
});
