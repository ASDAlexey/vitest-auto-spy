import { describe, expect, it } from 'vitest';

import { isOwnedPatch, markOwnedPatch } from './owned-patch';

describe('markOwnedPatch', () => {
  it('marks a function, and only a function', () => {
    const wrapper = (): void => undefined;

    expect(isOwnedPatch(wrapper)).toBe(false);

    markOwnedPatch(wrapper);

    expect(isOwnedPatch(wrapper)).toBe(true);
  });

  it('answers false for everything that is not a marked function', () => {
    expect(isOwnedPatch(undefined)).toBe(false);
    expect(isOwnedPatch(null)).toBe(false);
    expect(isOwnedPatch('setTimeout')).toBe(false);
    expect(isOwnedPatch(42)).toBe(false);
    expect(isOwnedPatch(() => undefined)).toBe(false);
    expect(isOwnedPatch({})).toBe(false);
  });
});
