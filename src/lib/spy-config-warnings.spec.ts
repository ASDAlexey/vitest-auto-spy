import { describe, expect, it } from 'vitest';

import { closestName, ownerOf } from './spy-config-warnings';

describe('closestName', () => {
  it('finds the method a typo most likely meant, whatever the case', () => {
    expect(closestName('lod', ['save', 'load', 'reload'])).toBe('load');
    expect(closestName('LOAD', ['load'])).toBe('load');
  });

  it('suggests nothing when no candidate is close, and skips symbol keys', () => {
    expect(closestName('checkout', ['load', Symbol('checkout')])).toBeUndefined();
  });
});

describe('ownerOf', () => {
  it('reads the class out of a factory label', () => {
    expect(ownerOf('createSpyFromClass(CartService)')).toBe('CartService');
  });
});
