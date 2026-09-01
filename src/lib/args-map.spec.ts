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

  it('keeps a non-array key out of the arity index', () => {
    const map = new ArgsMap();
    map.set('bare', 'value');

    expect(map.get('bare')).toBe('value');
    expect(map.get([1])).toBeUndefined();
  });

  it('does not serialize a call whose arity nobody configured', () => {
    const map = new ArgsMap();
    map.set([1], 'one');

    // Reading this property throws, so the assertion is that it is never read: a two-argument call
    // cannot match a one-argument config, and the key is therefore never built.
    const unserializable = {
      get boom(): never {
        throw new Error('serialized an argument list that cannot match');
      },
    };

    expect(map.get([unserializable, 'second'])).toBeUndefined();
    expect(map.get([1])).toBe('one');
  });

  it('prefers an exact match over an asymmetric one', () => {
    const map = new ArgsMap();
    map.set([expect.any(Number)], 'any');
    map.set([5], 'exact');

    expect(map.get([5])).toBe('exact');
    expect(map.get([6])).toBe('any');
  });

  it('overrides an asymmetric config registered with an equivalent matcher', () => {
    // `expect.anything()` is a fresh instance per call, so a re-registration used to be appended
    // behind the config it was meant to replace and never reached. See issue #6.
    const map = new ArgsMap();
    map.set([12, expect.anything()], 'first');
    map.set([12, expect.anything()], 'second');

    expect(map.get([12, { y: 3 }])).toBe('second');
    expect(map.configured()).toEqual(['[12,Anything]']);
  });

  it('overrides a matcher config whose sample matches, and keeps one whose sample differs', () => {
    const map = new ArgsMap();
    map.set([expect.objectContaining({ id: 1 })], 'one');
    map.set([expect.objectContaining({ id: 2 })], 'two');
    map.set([expect.objectContaining({ id: 1 })], 'one again');

    expect(map.get([{ id: 1 }])).toBe('one again');
    expect(map.get([{ id: 2 }])).toBe('two');
  });

  it('keeps matchers of different classes apart even when their state is alike', () => {
    // Both hold the sample `'a'` and neither is inverted: only the class tells them apart.
    const map = new ArgsMap();
    map.set([expect.stringContaining('a')], 'containing');
    map.set([expect.stringMatching('a')], 'matching');

    expect(map.configured()).toHaveLength(2);
    expect(map.get(['a'])).toBe('containing');
  });

  it('keeps a matcher and its inverse apart', () => {
    const map = new ArgsMap();
    map.set([expect.objectContaining({ id: 1 })], 'containing');
    map.set([expect.not.objectContaining({ id: 1 })], 'not containing');

    expect(map.get([{ id: 1 }])).toBe('containing');
    expect(map.get([{ id: 2 }])).toBe('not containing');
  });

  it('overrides only when the literal args around the matcher match too', () => {
    const map = new ArgsMap();
    map.set([1, expect.any(Number)], 'one');
    map.set([2, expect.any(Number)], 'two');
    map.set([1, expect.any(Number)], 'one again');
    map.set([1, expect.any(String)], 'one string');

    expect(map.get([1, 5])).toBe('one again');
    expect(map.get([2, 5])).toBe('two');
    expect(map.get([1, 'x'])).toBe('one string');
  });

  it('does not treat a matcher position and a literal position as the same config', () => {
    const map = new ArgsMap();
    map.set([expect.any(Number), 'go'], 'matcher first');
    map.set(['go', expect.any(Number)], 'literal first');

    expect(map.get([5, 'go'])).toBe('matcher first');
    expect(map.get(['go', 5])).toBe('literal first');
  });

  it('does not override across a differing arity', () => {
    const map = new ArgsMap();
    map.set([expect.any(Number)], 'one arg');
    map.set([expect.any(Number), 'extra'], 'two args');

    expect(map.get([5])).toBe('one arg');
    expect(map.get([5, 'extra'])).toBe('two args');
  });

  it('compares a hand-rolled matcher by reference only', () => {
    // A duck-typed matcher carries no runner brand: its verdict lives in a closure that no
    // serialization can see, so two of them are never assumed to be the same expectation.
    const positive = { asymmetricMatch: (value: unknown): boolean => typeof value === 'number' && value > 0 };
    const negative = { asymmetricMatch: (value: unknown): boolean => typeof value === 'number' && value < 0 };

    const map = new ArgsMap();
    map.set([positive], 'positive');
    map.set([negative], 'negative');

    expect(map.get([1])).toBe('positive');
    expect(map.get([-1])).toBe('negative');

    // The same instance re-registered is the same config, and does override.
    map.set([positive], 'positive again');

    expect(map.get([1])).toBe('positive again');
    expect(map.configured()).toHaveLength(2);
  });

  it('describes a hand-rolled matcher by its class when it cannot describe itself', () => {
    const map = new ArgsMap();
    map.set([{ asymmetricMatch: (): boolean => true }], 'any');

    expect(map.configured()).toEqual(['[[object Object]]']);
  });

  it('keeps the registration order that decides between overlapping configs', () => {
    const map = new ArgsMap();
    map.set([expect.any(Number)], 'number');
    map.set([expect.anything()], 'anything');
    // Replacing in place, rather than appending, leaves the narrower config in front.
    map.set([expect.any(Number)], 'number again');

    expect(map.get([5])).toBe('number again');
    expect(map.get(['x'])).toBe('anything');
  });

  it('serializes a config arg once at set() time, not on every lookup', () => {
    // The config arg never changes after it is registered, so re-rendering it per call was pure
    // waste — an asymmetric config whose other arg is a large object paid two deep walks per
    // invocation where one is enough. A getter counts the walks the config side actually costs.
    let configReads = 0;
    const configArg = {
      get id(): number {
        configReads += 1;

        return 1;
      },
    };

    const map = new ArgsMap();
    map.set([expect.any(Number), configArg], 'hit');

    expect(configReads).toBe(1);

    expect(map.get([5, { id: 1 }])).toBe('hit');
    expect(map.get([6, { id: 1 }])).toBe('hit');
    expect(map.get([7, { id: 2 }])).toBeUndefined();

    // Still 1: three lookups, and the config side was never walked again.
    expect(configReads).toBe(1);
  });
});
