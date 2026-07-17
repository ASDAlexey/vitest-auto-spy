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
