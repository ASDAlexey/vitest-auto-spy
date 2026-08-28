import { describe, expect, it } from 'vitest';

import { diffByField } from './record-diff';

describe('diffByField', () => {
  it('says nothing when the arrays match', () => {
    expect(diffByField([{ id: 1 }], [{ id: 1 }])).toBeUndefined();
  });

  it('ignores key order, as the argument matcher does', () => {
    expect(diffByField([{ id: 1, name: 'a' }], [{ name: 'a', id: 1 }])).toBeUndefined();
  });

  it('reports a length mismatch on its own, before comparing anything', () => {
    expect(diffByField([{ id: 1 }], [])).toBe('lengths differ: 1 actual, 0 expected.');
  });

  it('names the one field that moved in every element, and that it is constant', () => {
    const actual = [1, 2, 3].map((id) => ({ id, at: 1 }));
    const expected = [1, 2, 3].map((id) => ({ id, at: id + 1 }));

    expect(diffByField(actual, expected)).toBe('3 of 3 elements differ.\n  `at` differs in all 3: actual 1 everywhere, expected 2, 3, 4');
  });

  it('locates a difference that affects only some elements', () => {
    const report = diffByField([{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 9 }]);

    expect(report).toBe('1 of 2 elements differ.\n  `id` differs in 1/2 (index 1): actual 2, expected 9');
  });

  it('reports a field one side does not have at all', () => {
    expect(diffByField([{ id: 1 }], [{ id: 1, at: 5 }])).toContain('`at` differs in all 1: actual undefined, expected 5');
  });

  it('stops listing example values once there are too many', () => {
    const actual = Array.from({ length: 8 }, (_, index) => ({ at: index }));
    const expected = Array.from({ length: 8 }, (_, index) => ({ at: index + 100 }));

    expect(diffByField(actual, expected)).toContain('actual 0, 1, 2, 3, 4, 5, …, expected 100, 101, 102, 103, 104, 105, …');
  });

  it('compares non-record elements whole', () => {
    expect(diffByField(['a', 'b'], ['a', 'c'])).toContain('`the element` differs in 1/2 (index 1)');
  });

  it('compares whole when only one side is a record', () => {
    expect(diffByField([{ id: 1 }], ['a'])).toContain('`the element` differs');
  });

  it('reports every field that moved, not only the first', () => {
    const report = diffByField([{ id: 1, at: 1 }], [{ id: 2, at: 2 }]);

    expect(report).toContain('`id` differs');
    expect(report).toContain('`at` differs');
  });
});
