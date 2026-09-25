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

  it('renders RegExp by its source and flags (no `{}` collision)', () => {
    expect(serializeValue(/ab+/giu)).toBe('/ab+/giu');
    // A regular expression has no own enumerable entries; without its own branch every one of them
    // keys as `{}` and `calledWith(/a/)` answers a call made with `/b/`.
    expect(serializeValue(/a/)).not.toBe(serializeValue(/b/));
  });

  it('renders a URL by its href (no `URL{}` collision)', () => {
    expect(serializeValue(new URL('https://a.test/x?q=1'))).toBe("new URL('https://a.test/x?q=1')");
    // A URL keeps its state in internal slots, so the class-name fallback rendered every one as
    // `URL{}` and `calledWith(new URL(a))` answered a call made with `new URL(b)`.
    expect(serializeValue(new URL('https://a.test/x'))).not.toBe(serializeValue(new URL('https://b.test/y')));
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

  it('reuses a rendering that emitted a back-edge, and stays deterministic for the structure', () => {
    // `first` and `second` reference each other, so whichever is reached first renders the other
    // with `[Circular]`. That rendering is reused on the second path rather than recomputed: it is
    // the walk order — fixed by sorted keys — that decides the text, so a second graph of the same
    // shape produces the same key, which is the only property matching needs.
    const build = (): Record<string, unknown> => {
      const first: Record<string, unknown> = {};
      const second: Record<string, unknown> = { first };
      first['second'] = second;

      return { a: first, b: second };
    };

    expect(serializeValue(build())).toBe('{a:{second:{first:[Circular]}},b:{first:[Circular]}}');
    expect(serializeValue(build())).toBe(serializeValue(build()));
  });

  it('stays linear on a graph whose every node points back at the root', () => {
    // The shape every Angular double carries — a component that reaches its injector, a node that
    // reaches its root. Leaving back-edge subtrees out of the cache made this 2^depth again: 276 ms
    // at depth 18, against 1.9 ms for the same graph without the back-edges.
    const root: Record<string, unknown> = { id: 'root' };
    let current = root;

    for (let index = 0; index < 18; index += 1) {
      const next: Record<string, unknown> = { id: index, root };

      current['left'] = { next };
      current['right'] = { next };
      current = next;
    }

    const startedAt = Date.now();
    serializeValue(root);

    expect(Date.now() - startedAt).toBeLessThan(50);
  });

  it('renders an Error by name and message, own fields included', () => {
    // `name` and `message` are not enumerable, so every error used to render as `{}` and
    // `calledWith(new Error('a'))` answered a call made with `new Error('b')`.
    expect(serializeValue(new Error('boom'))).toBe("new Error('boom')");
    expect(serializeValue(new TypeError('boom'))).not.toBe(serializeValue(new Error('boom')));
    expect(serializeValue(new Error('a'))).not.toBe(serializeValue(new Error('b')));

    const withStatus = Object.assign(new Error('failed'), { status: 500 });

    expect(serializeValue(withStatus)).toBe("new Error('failed'){status:500}");
  });

  it('quotes an object key that could otherwise forge another object', () => {
    expect(serializeValue({ 'a:1,b': 2 })).not.toBe(serializeValue({ a: 1, b: 2 }));
    expect(serializeValue({ 'needs-quotes': 1 })).toBe("{'needs-quotes':1}");
  });

  it('renders symbol-keyed entries rather than dropping them', () => {
    const key = Symbol('flag');

    expect(serializeValue({ [key]: 1 })).toBe('{Symbol(flag):1}');
    expect(serializeValue({ [key]: 1 })).not.toBe(serializeValue({ [key]: 2 }));
    // A non-enumerable own property is not part of the value a literal describes.
    const hidden = {};
    Object.defineProperty(hidden, Symbol('hidden'), { value: 1, enumerable: false });

    expect(serializeValue(hidden)).toBe('{}');
  });

  it('sorts symbol-keyed entries too, so insertion order does not make two keys', () => {
    const first = Symbol('a');
    const second = Symbol('b');

    expect(serializeValue({ [second]: 2, [first]: 1 })).toBe('{Symbol(a):1,Symbol(b):2}');
    expect(serializeValue({ [first]: 1, [second]: 2 })).toBe(serializeValue({ [second]: 2, [first]: 1 }));
  });

  it('keys a Map and a Set by content rather than by insertion order', () => {
    expect(serializeValue(new Set([2, 1]))).toBe(serializeValue(new Set([1, 2])));
    expect(
      serializeValue(
        new Map([
          ['b', 2],
          ['a', 1],
        ]),
      ),
    ).toBe(
      serializeValue(
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      ),
    );
    expect(serializeValue(new Set([1]))).not.toBe(serializeValue(new Set([2])));
  });

  it('names the class of an instance that has nothing enumerable to show', () => {
    class Empty {
      get value(): number {
        return 1;
      }
    }

    expect(serializeValue(new Empty())).toBe('Empty{}');
    expect(serializeValue(new Empty())).not.toBe(serializeValue({}));
    expect(serializeValue(Object.create(null))).toBe('{}');
    expect(serializeValue(Object.create(Object.create(null)))).toBe('Object{}');
  });

  it('stops expanding a key past the budget, keeping the shape that tells two apart', () => {
    const wide = (fill: string): Record<string, unknown> =>
      Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`f${index}`, { value: fill.repeat(20), index }]));
    const shared = { deep: wide('a') };
    const huge = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`n${index}`, shared]));

    const rendered = serializeValue(huge);

    expect(rendered).toContain('…');
    expect(rendered.length).toBeLessThan(200_000);
    // Two arguments of that size are still told apart by the shape the summary keeps.
    expect(serializeValue([huge])).not.toBe(serializeValue([Object.assign({ extra: 1 }, huge)]));
  });

  it('summarises an array past the budget by its length', () => {
    const wide = Array.from({ length: 600 }, (_, index) => ({ value: 'a'.repeat(100), index }));
    const rendered = serializeValue(Array.from({ length: 40 }, () => wide));

    expect(rendered).toContain('[…600]');
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
