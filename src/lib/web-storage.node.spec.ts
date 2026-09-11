// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { restoreMockedProps } from './prop-mock';
import { restoreWebStorage, stubWebStorage } from './web-storage';

/**
 * The DOM-less half, in its own file because it needs a runtime where `document` is *undeclared*
 * rather than undefined — `setupAutoSpy()` calls the repair unconditionally, and a project whose
 * node specs share that setup file is where a missing `typeof` guard would surface.
 */
describe('restoreWebStorage in a node environment', () => {
  it('installs nothing where the runtime is supposed to have no storage', () => {
    expect(restoreWebStorage()).toEqual([]);
    expect(Reflect.get(globalThis, 'localStorage')).toBeUndefined();
  });
});

describe('stubWebStorage in a node environment', () => {
  it('installs the storage the spec asked for, and takes it away again', () => {
    const local = stubWebStorage('localStorage', { items: { token: 'abc' } });

    expect(Reflect.get(globalThis, 'localStorage')).toBe(local.storage);

    restoreMockedProps();

    expect(Reflect.get(globalThis, 'localStorage')).toBeUndefined();
  });
});
