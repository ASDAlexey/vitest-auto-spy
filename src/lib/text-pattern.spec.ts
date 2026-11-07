import { describe, expect, it } from 'vitest';

import { includesAnyPattern, searchesPattern } from './text-pattern';

describe('searchesPattern', () => {
  it('answers the same on every call for a global or sticky RegExp', () => {
    const global = /data-/g;
    const sticky = /data-/y;

    expect([searchesPattern(global, 'data-x'), searchesPattern(global, 'data-x')]).toEqual([true, true]);
    expect([searchesPattern(sticky, 'data-x'), searchesPattern(sticky, 'data-x')]).toEqual([true, true]);
  });
});

describe('includesAnyPattern', () => {
  it('takes a string as a substring and a RegExp as a search', () => {
    expect(includesAnyPattern('some-sdk/poll.js', ['sdk/poll'])).toBe(true);
    expect(includesAnyPattern('some-sdk/poll.js', [/poll\.js$/g])).toBe(true);
    expect(includesAnyPattern('some-sdk/poll.js', ['other', /other/])).toBe(false);
  });
});
