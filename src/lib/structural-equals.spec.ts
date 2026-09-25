/**
 * The comparison behind every `calledWith` config a string key cannot stand for: a matcher at any
 * depth, and a function, whose name is not its identity.
 */
import { describe, expect, it } from 'vitest';

import { serializeValue } from './serialize-args';
import {
  ASYMMETRIC_MATCHER_BRAND,
  describeWithMatchers,
  isAsymmetricMatcher,
  matchesStructurally,
  needsStructuralMatch,
  sameExpectation,
} from './structural-equals';

/** A matcher the runner did not build: no brand, and a verdict no comparison can read. */
function handRolled(accept: (value: unknown) => boolean): { asymmetricMatch(value: unknown): boolean } {
  return { asymmetricMatch: accept };
}

describe('isAsymmetricMatcher', () => {
  it('recognises anything that answers asymmetricMatch, and nothing else', () => {
    expect(isAsymmetricMatcher(expect.any(Number))).toBe(true);
    expect(isAsymmetricMatcher(handRolled(() => true))).toBe(true);
    expect(isAsymmetricMatcher({ asymmetricMatch: 'not a function' })).toBe(false);
    expect(isAsymmetricMatcher({})).toBe(false);
    expect(isAsymmetricMatcher(null)).toBe(false);
    expect(isAsymmetricMatcher(1)).toBe(false);
  });

  it('reads the brand the runner stamps on its own matchers', () => {
    expect(Reflect.get(expect.any(Number), '$$typeof')).toBe(ASYMMETRIC_MATCHER_BRAND);
  });
});

describe('needsStructuralMatch', () => {
  it('is true for a matcher or a function, wherever it sits', () => {
    expect(needsStructuralMatch(expect.any(Number))).toBe(true);
    expect(needsStructuralMatch(() => 1)).toBe(true);
    expect(needsStructuralMatch({ id: expect.any(Number) })).toBe(true);
    expect(needsStructuralMatch([{ deep: [expect.anything()] }])).toBe(true);
    expect(needsStructuralMatch(new Map([['handler', () => 1]]))).toBe(true);
    expect(needsStructuralMatch(new Map([[() => 1, 'handler']]))).toBe(true);
    expect(needsStructuralMatch(new Set([expect.any(String)]))).toBe(true);
  });

  it('is false for data a string key can stand for', () => {
    expect(needsStructuralMatch(1)).toBe(false);
    expect(needsStructuralMatch(null)).toBe(false);
    expect(needsStructuralMatch(undefined)).toBe(false);
    expect(needsStructuralMatch({ id: 1, nested: { at: new Date(0) } })).toBe(false);
    expect(needsStructuralMatch([1, 'a'])).toBe(false);
    expect(needsStructuralMatch(new Set([1, 2]))).toBe(false);
  });

  it('answers on a cyclic value instead of recursing forever', () => {
    const cyclic: Record<string, unknown> = { id: 1 };
    cyclic['self'] = cyclic;

    expect(needsStructuralMatch(cyclic)).toBe(false);

    cyclic['handler'] = (): number => 1;

    expect(needsStructuralMatch(cyclic)).toBe(true);
  });
});

describe('matchesStructurally', () => {
  it('applies a matcher wherever it sits in the config value', () => {
    expect(matchesStructurally(expect.any(Number), 1)).toBe(true);
    expect(matchesStructurally({ id: expect.any(Number) }, { id: 1 })).toBe(true);
    expect(matchesStructurally({ id: expect.any(Number) }, { id: 'x' })).toBe(false);
    expect(matchesStructurally([expect.any(String)], ['a'])).toBe(true);
    expect(matchesStructurally({ nested: { ids: [expect.any(Number)] } }, { nested: { ids: [7] } })).toBe(true);
  });

  it('compares functions by identity, not by name', () => {
    const handler = function shared(): string {
      return 'a';
    };
    const other = function shared(): string {
      return 'b';
    };

    expect(matchesStructurally(handler, handler)).toBe(true);
    expect(matchesStructurally(handler, other)).toBe(false);
    expect(matchesStructurally({ on: handler }, { on: other })).toBe(false);
    expect(matchesStructurally({ on: handler }, { on: handler })).toBe(true);
  });

  it('holds NaN equal to itself and keeps -0 apart from 0', () => {
    expect(matchesStructurally({ n: Number.NaN }, { n: Number.NaN })).toBe(true);
    expect(matchesStructurally({ n: -0 }, { n: 0 })).toBe(false);
  });

  it('refuses a primitive against an object, either way round', () => {
    expect(matchesStructurally({ id: 1 }, 'not an object')).toBe(false);
    expect(matchesStructurally({ id: 1 }, null)).toBe(false);
    expect(matchesStructurally({ id: undefined }, { id: 1 })).toBe(false);
  });

  it('compares a Date, a RegExp and an Error by what they are', () => {
    expect(matchesStructurally({ at: new Date(1) }, { at: new Date(1) })).toBe(true);
    expect(matchesStructurally({ at: new Date(1) }, { at: new Date(2) })).toBe(false);
    expect(matchesStructurally({ at: new Date(1) }, { at: { getTime: () => 1 } })).toBe(false);
    expect(matchesStructurally({ re: /a/g }, { re: /a/g })).toBe(true);
    expect(matchesStructurally({ re: /a/g }, { re: /a/i })).toBe(false);
    expect(matchesStructurally({ re: /a/ }, { re: 'a' })).toBe(false);
    expect(matchesStructurally({ error: new Error('a') }, { error: new Error('a') })).toBe(true);
    expect(matchesStructurally({ error: new Error('a') }, { error: new Error('b') })).toBe(false);
    expect(matchesStructurally({ error: new Error('a') }, { error: new TypeError('a') })).toBe(false);
    expect(matchesStructurally({ error: new Error('a') }, { error: { message: 'a' } })).toBe(false);
    expect(matchesStructurally({ error: Object.assign(new Error('a'), { status: 1 }) }, { error: new Error('a') })).toBe(false);
  });

  it('compares a URL by its href, as the runner’s own equals does', () => {
    expect(matchesStructurally({ url: new URL('https://a.test/x') }, { url: new URL('https://a.test/x') })).toBe(true);
    expect(matchesStructurally({ url: new URL('https://a.test/x') }, { url: new URL('https://b.test/y') })).toBe(false);
    expect(matchesStructurally({ url: new URL('https://a.test/x') }, { url: 'https://a.test/x' })).toBe(false);
    expect(matchesStructurally({ url: new URL('https://a.test/x') }, { url: {} })).toBe(false);
  });

  it('compares a Map and a Set by content, in any order', () => {
    const config = new Map<string, unknown>([
      ['a', 1],
      ['b', expect.any(Number)],
    ]);

    expect(
      matchesStructurally(
        { map: config },
        {
          map: new Map<string, unknown>([
            ['b', 2],
            ['a', 1],
          ]),
        },
      ),
    ).toBe(true);
    expect(matchesStructurally({ map: config }, { map: new Map([['a', 1]]) })).toBe(false);
    expect(matchesStructurally({ map: config }, { map: { a: 1, b: 2 } })).toBe(false);
    expect(matchesStructurally({ set: new Set([expect.any(Number), 'a']) }, { set: new Set(['a', 3]) })).toBe(true);
    expect(matchesStructurally({ set: new Set([1]) }, { set: new Set([2]) })).toBe(false);
    expect(matchesStructurally({ set: new Set([1]) }, { set: [1] })).toBe(false);
    // One expected item claims one actual item: two matchers cannot both take the same element.
    expect(matchesStructurally({ set: new Set([expect.any(Number), expect.any(Number)]) }, { set: new Set([1]) })).toBe(false);
  });

  it('compares arrays by length and position', () => {
    expect(matchesStructurally({ ids: [1, 2] }, { ids: [1, 2] })).toBe(true);
    expect(matchesStructurally({ ids: [1, 2] }, { ids: [2, 1] })).toBe(false);
    expect(matchesStructurally({ ids: [1] }, { ids: [1, 2] })).toBe(false);
    expect(matchesStructurally({ ids: [1] }, { ids: { 0: 1 } })).toBe(false);
  });

  it('compares objects by their own enumerable entries, symbols included', () => {
    const key = Symbol('flag');

    expect(matchesStructurally({ [key]: expect.any(Number) }, { [key]: 1 })).toBe(true);
    expect(matchesStructurally({ [key]: 1 }, { [key]: 2 })).toBe(false);
    expect(matchesStructurally({ id: expect.anything(), extra: 1 }, { id: 1 })).toBe(false);
    expect(matchesStructurally({ id: expect.anything() }, { other: 1 })).toBe(false);
  });

  it('ignores the prototype, as the runner’s own equals does', () => {
    class Payload {
      readonly id = 1;
      handler = (): string => 'x';
    }

    const instance = new Payload();

    expect(matchesStructurally({ body: instance }, { body: { id: 1, handler: instance.handler } })).toBe(true);
  });

  it('answers on a pair of cyclic values instead of recursing forever', () => {
    const config: Record<string, unknown> = { id: expect.any(Number) };
    config['self'] = config;

    const actual: Record<string, unknown> = { id: 1 };
    actual['self'] = actual;

    expect(matchesStructurally(config, actual)).toBe(true);
    expect(matchesStructurally(config, { id: 1, self: { id: 2 } })).toBe(false);
  });
});

describe('sameExpectation', () => {
  it('holds two matchers of one class and one state to be the same config', () => {
    expect(sameExpectation(expect.anything(), expect.anything())).toBe(true);
    expect(sameExpectation(expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 1 }))).toBe(true);
    expect(sameExpectation(expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 }))).toBe(false);
  });

  it('keeps matcher classes apart even when their state is alike', () => {
    expect(sameExpectation(expect.stringContaining('a'), expect.stringMatching('a'))).toBe(false);
    expect(sameExpectation(expect.objectContaining({ id: 1 }), expect.not.objectContaining({ id: 1 }))).toBe(false);
  });

  it('keeps expect.any of two one-named classes apart', () => {
    const First = (() => class Model {})();
    const Second = (() => class Model {})();

    expect(sameExpectation(expect.any(First), expect.any(Second))).toBe(false);
    expect(sameExpectation(expect.any(First), expect.any(First))).toBe(true);
  });

  it('compares a hand-rolled matcher by reference only', () => {
    const accept = (value: unknown): boolean => value === 1;
    const matcher = handRolled(accept);

    expect(sameExpectation(matcher, matcher)).toBe(true);
    expect(sameExpectation(matcher, handRolled(accept))).toBe(false);
    expect(sameExpectation(matcher, 1)).toBe(false);
    expect(sameExpectation(expect.anything(), matcher)).toBe(false);
  });

  it('compares a nested matcher as configuration rather than applying it', () => {
    expect(sameExpectation({ id: expect.any(Number) }, { id: expect.any(Number) })).toBe(true);
    expect(sameExpectation({ id: expect.any(Number) }, { id: expect.any(String) })).toBe(false);
    // Applied, this would have matched; compared, a matcher is not the value it accepts.
    expect(sameExpectation({ id: expect.any(Number) }, { id: 1 })).toBe(false);
  });
});

describe('describeWithMatchers', () => {
  it('renders a matcher the way the runner prints it', () => {
    expect(describeWithMatchers(expect.any(Number), serializeValue)).toBe('Any<Number>');
    expect(
      describeWithMatchers(
        handRolled(() => true),
        serializeValue,
      ),
    ).toBe('[object Object]');
  });

  it('falls back to the serializer for anything holding no matcher', () => {
    expect(describeWithMatchers({ id: 1 }, serializeValue)).toBe('{id:1}');
    expect(describeWithMatchers('a', serializeValue)).toBe("'a'");
    expect(describeWithMatchers(null, serializeValue)).toBe('null');
  });

  it('renders the container around a matcher, keys sorted', () => {
    expect(describeWithMatchers({ name: 'a', id: expect.any(Number) }, serializeValue)).toBe("{id:Any<Number>,name:'a'}");
    expect(describeWithMatchers([expect.any(String), 1], serializeValue)).toBe('[Any<String>,1]');
    expect(describeWithMatchers(new Set([expect.anything()]), serializeValue)).toBe('new Set([Anything])');
    expect(describeWithMatchers(new Map([['id', expect.any(Number)]]), serializeValue)).toBe("new Map([['id',Any<Number>]])");
    const key = Symbol('flag');

    expect(describeWithMatchers({ [key]: expect.anything() }, serializeValue)).toBe('{Symbol(flag):Anything}');
  });

  it('names an instance holding no matcher instead of walking what it reaches', () => {
    class ElementRef {
      readonly focus = (): void => undefined;

      constructor(readonly nativeElement: object) {}
    }

    const node = document.createElement('div');

    document.body.append(node);

    try {
      expect(describeWithMatchers(new ElementRef(node), serializeValue)).toBe('<ElementRef>');
      expect(describeWithMatchers([new ElementRef(node), expect.any(Number)], serializeValue)).toBe('[<ElementRef>,Any<Number>]');
      expect(describeWithMatchers(Object.assign(Object.create({ shared: true }) as object, { run: () => 1 }), serializeValue)).toBe(
        '<Object>',
      );
      expect(
        describeWithMatchers(
          [
            new (class {
              readonly run = (): number => 1;
            })(),
          ],
          serializeValue,
        ),
      ).toBe('[<object>]');
      expect(describeWithMatchers(new ElementRef({ id: expect.any(Number) }), serializeValue)).toContain('nativeElement:{id:Any<Number>}');
    } finally {
      node.remove();
    }
  });

  it('stops at a cycle and lets the serializer render the repeat', () => {
    const cyclic: Record<string, unknown> = { id: expect.any(Number) };
    cyclic['self'] = cyclic;

    expect(describeWithMatchers(cyclic, serializeValue)).toContain('self:');
  });
});
