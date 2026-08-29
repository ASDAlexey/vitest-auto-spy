import { describe, expect, it } from 'vitest';

import { isDeepValue, serializePrimitive, serializeValue } from './serialize-args';

describe('serializeValue', () => {
  it('renders primitives the way arg-matching keys expect', () => {
    expect(serializeValue('hi')).toBe("'hi'");
    expect(serializeValue(1)).toBe('1');
    expect(serializeValue(true)).toBe('true');
    expect(serializeValue(undefined)).toBe('undefined');
    expect(serializeValue(null)).toBe('null');
    expect(serializeValue(10n)).toBe('10n');
    expect(serializeValue(Symbol('s'))).toBe('Symbol(s)');
  });

  it('escapes single quotes and backslashes inside strings', () => {
    expect(serializeValue("it's")).toContain("\\'");
    expect(serializeValue('back\\slash')).toContain('\\\\');
  });

  it('renders a named function distinctly', () => {
    function namedFn(): void {
      /* noop */
    }

    expect(serializeValue(namedFn)).toBe('[Function: namedFn]');
  });

  it('renders Date by its timestamp', () => {
    expect(serializeValue(new Date(0))).toBe('new Date(0)');
  });

  it('renders arrays and objects without spaces (matching the error message format)', () => {
    expect(serializeValue([1, 'a'])).toBe("[1,'a']");
    expect(serializeValue({ a: 1, b: 'x' })).toBe("{a:1,b:'x'}");
    expect(serializeValue([{ a: [1] }])).toBe('[{a:[1]}]');
  });

  it('keys an object by its content, not by the order the literal was written in', () => {
    expect(serializeValue({ id: 1, name: 'a' })).toBe(serializeValue({ name: 'a', id: 1 }));
  });

  it('sorts keys at every depth', () => {
    expect(serializeValue({ b: { d: 1, c: 2 }, a: 3 })).toBe('{a:3,b:{c:2,d:1}}');
  });

  it('leaves array order alone — there the order is the value', () => {
    expect(serializeValue([1, 2])).not.toBe(serializeValue([2, 1]));
  });

  it('renders Map and Set distinctly (no `{}` collision)', () => {
    expect(serializeValue(new Map([['k', 'v']]))).toBe("new Map([['k','v']])");
    expect(serializeValue(new Set([1, 2]))).toBe('new Set([1,2])');
    // A Map and a Set must not collapse to the same key.
    expect(serializeValue(new Map())).not.toBe(serializeValue(new Set()));
  });

  it('produces distinct keys for values JSON.stringify would collapse', () => {
    expect(serializeValue([undefined])).not.toBe(serializeValue([null]));
    expect(serializeValue([1])).not.toBe(serializeValue(['1']));
    // `-0` and `0` are distinct match keys.
    expect(serializeValue(-0)).toBe('-0');
    expect(serializeValue(0)).toBe('0');
  });

  it('stays stack-safe on circular references', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    expect(serializeValue(circular)).toBe('{self:[Circular]}');
  });

  it('renders a node reachable by two paths in full, both times', () => {
    const shared = { id: 1 };

    expect(serializeValue({ left: shared, right: shared })).toBe('{left:{id:1},right:{id:1}}');
  });

  it('walks a shared node once however many paths reach it', () => {
    // The guard against the exponential blow-up on a DAG. A getter counts how often the node is
    // actually walked; the rendering still appears on every path it is reachable from, because that
    // is what the key has to say, but it is computed once.
    let reads = 0;
    const shared = {
      get id(): number {
        reads += 1;

        return 1;
      },
    };

    expect(serializeValue({ a: { x: shared }, b: { y: shared } })).toBe('{a:{x:{id:1}},b:{y:{id:1}}}');
    expect(reads).toBe(1);
  });

  it('stays linear in distinct nodes on a deep diamond', () => {
    // 17 distinct objects reachable by 65 536 paths. Before identity memoisation this walk was
    // 2^depth serialisations — 37 ms here, and 1.1 s two levels deeper.
    let level: object = { leaf: true };

    for (let index = 0; index < 16; index += 1) {
      level = { left: level, right: level };
    }

    const startedAt = Date.now();
    serializeValue(level);

    expect(Date.now() - startedAt).toBeLessThan(20);
  });

  it('does not reuse a rendering that depended on the path that produced it', () => {
    // `first` and `second` reference each other, so whichever is reached first renders the other
    // with `[Circular]` — a rendering that is correct only for that path. Reached from `second`,
    // `first` must render in full again rather than come back from the cache.
    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = { first };
    first['second'] = second;

    expect(serializeValue({ a: first, b: second })).toBe('{a:{second:{first:[Circular]}},b:{first:{second:[Circular]}}}');
  });
});

describe('serializePrimitive', () => {
  it('renders a non-object value identically to serializeValue', () => {
    expect(serializePrimitive('hi')).toBe(serializeValue('hi'));
    expect(serializePrimitive(-0)).toBe('-0');
    expect(serializePrimitive(undefined)).toBe('undefined');
  });
});

describe('isDeepValue', () => {
  it('is true for non-null objects and false for primitives/null', () => {
    expect(isDeepValue({})).toBe(true);
    expect(isDeepValue([1])).toBe(true);
    expect(isDeepValue(null)).toBe(false);
    expect(isDeepValue('x')).toBe(false);
    expect(isDeepValue(1)).toBe(false);
  });
});
