/**
 * Each matcher here exists because a jasmine suite nests it inside another expectation, so every
 * case is asserted both ways — as `jasmine.name()` inside `toEqual` / `toHaveBeenCalledWith`, which
 * is the form that has no Vitest alternative, and as the registered `expect(value).jasmineName()`,
 * which is where the failure messages come out.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { jasmine, resetTimeoutIntervalWarning } from './jasmine-global';
import { registerJasmineMatchers, resetJasmineMatchers } from './jasmine-matchers';

describe('jasmine matchers', () => {
  beforeAll(() => {
    registerJasmineMatchers();
  });

  afterAll(() => {
    // The latch is process-wide, and the shared-env run puts every file in one worker.
    resetJasmineMatchers();
    resetTimeoutIntervalWarning();
  });

  describe('truthy / falsy', () => {
    it('separates loosely-true from loosely-false values', () => {
      expect(1).jasmineTruthy();
      expect('a').jasmineTruthy();
      expect(0).jasmineFalsy();
      expect('').jasmineFalsy();
      expect(null).jasmineFalsy();

      expect({ id: 7, name: '' }).toEqual({ id: jasmine.truthy(), name: jasmine.falsy() });
    });
  });

  describe('empty / notEmpty', () => {
    it('recognises every container jasmine calls empty', () => {
      expect('').jasmineEmpty();
      expect([]).jasmineEmpty();
      expect({}).jasmineEmpty();
      expect(new Map()).jasmineEmpty();
      expect(new Set()).jasmineEmpty();

      expect('a').jasmineNotEmpty();
      expect([1]).jasmineNotEmpty();
      expect({ a: 1 }).jasmineNotEmpty();
      expect(new Map([['k', 1]])).jasmineNotEmpty();
      expect(new Set([1])).jasmineNotEmpty();
    });

    it('treats a value that has no notion of emptiness as non-empty', () => {
      expect(7).jasmineNotEmpty();
      expect(null).jasmineNotEmpty();
      expect(undefined).jasmineNotEmpty();
    });

    it('reads as an asymmetric matcher inside another expectation', () => {
      expect({ tags: [], name: 'a' }).toEqual({ tags: jasmine.empty(), name: jasmine.notEmpty() });
    });
  });

  describe('is', () => {
    it('compares by reference where every other matcher deep-compares', () => {
      const shared = { id: 1 };

      expect(shared).jasmineIs(shared);
      expect({ id: 1 }).not.jasmineIs(shared);
      expect({ held: shared }).toEqual({ held: jasmine.is(shared) });
    });
  });

  describe('mapContaining / setContaining', () => {
    it('matches a subset of entries and members, by equality not reference', () => {
      const map = new Map<string, unknown>([
        ['a', { id: 1 }],
        ['b', 2],
      ]);

      expect(map).jasmineMapContaining(new Map([['a', { id: 1 }]]));
      expect(map).not.jasmineMapContaining(new Map([['a', { id: 2 }]]));
      expect(map).not.jasmineMapContaining(new Map([['missing', 1]]));

      const set = new Set<unknown>([{ id: 1 }, 2]);

      expect(set).jasmineSetContaining(new Set([{ id: 1 }]));
      expect(set).not.jasmineSetContaining(new Set([{ id: 3 }]));
    });

    it('rejects a value that is not a Map or a Set at all', () => {
      expect({ a: 1 }).not.jasmineMapContaining(new Map([['a', 1]]));
      expect([1]).not.jasmineSetContaining(new Set([1]));
    });

    it('reads as an asymmetric matcher inside another expectation', () => {
      expect({ index: new Map([['a', 1]]), seen: new Set([1]) }).toEqual({
        index: jasmine.mapContaining(new Map([['a', 1]])),
        seen: jasmine.setContaining(new Set([1])),
      });
    });
  });

  describe('arrayWithExactContents', () => {
    it('ignores order but not multiplicity', () => {
      expect(['a', 'b']).jasmineArrayWithExactContents(['b', 'a']);
      expect([{ id: 1 }, { id: 2 }]).jasmineArrayWithExactContents([{ id: 2 }, { id: 1 }]);

      expect(['a', 'b']).not.jasmineArrayWithExactContents(['a']);
      expect(['a', 'a']).not.jasmineArrayWithExactContents(['a', 'b']);
      expect('ab').not.jasmineArrayWithExactContents(['a', 'b']);
    });

    it('reads as an asymmetric matcher inside another expectation', () => {
      expect({ tags: ['b', 'a'] }).toEqual({ tags: jasmine.arrayWithExactContents(['a', 'b']) });
    });
  });

  describe('failure messages', () => {
    it('names what was wanted, in both directions', () => {
      expect(() => expect(0).jasmineTruthy()).toThrow('to be truthy');
      expect(() => expect(1).not.jasmineTruthy()).toThrow('not to be truthy');
      expect(() => expect(1).jasmineFalsy()).toThrow('to be falsy');
      expect(() => expect([1]).jasmineEmpty()).toThrow('to be empty');
      expect(() => expect([]).jasmineNotEmpty()).toThrow('to be non-empty');
      expect(() => expect({}).jasmineIs({})).toThrow('to be the same reference as');
      expect(() => expect(new Map()).jasmineMapContaining(new Map([['a', 1]]))).toThrow('to be a Map containing');
      expect(() => expect(new Set()).jasmineSetContaining(new Set([1]))).toThrow('to be a Set containing');
      expect(() => expect([]).jasmineArrayWithExactContents(['a'])).toThrow('to hold exactly the members of');
    });

    it('negates cleanly too, for the matchers that take an argument', () => {
      const shared = { id: 1 };
      const map = new Map([['a', 1]]);
      const set = new Set([1]);

      expect(() => expect(shared).not.jasmineIs(shared)).toThrow('not to be the same reference as');
      expect(() => expect(map).not.jasmineMapContaining(new Map([['a', 1]]))).toThrow('not to be a Map containing');
      expect(() => expect(set).not.jasmineSetContaining(new Set([1]))).toThrow('not to be a Set containing');
      expect(() => expect(['a']).not.jasmineArrayWithExactContents(['a'])).toThrow('not to hold exactly the members of');
    });
  });

  describe('registration', () => {
    it('is idempotent, so the lazy path through the namespace costs nothing after the first call', () => {
      const extend = vi.spyOn(expect, 'extend');

      registerJasmineMatchers();
      jasmine.truthy();

      expect(extend).not.toHaveBeenCalled();
      extend.mockRestore();
    });
  });
});
