/**
 * The mock-adapter registry.
 *
 * The registry is process-wide, and under `isolate: false` every spec file shares it, so this file
 * cannot assume it is the first to touch it — nor may it leave a fake adapter behind for whatever
 * runs next. Each test empties the registry itself and restores whatever was there before, which is
 * what makes the "no adapter registered" path testable regardless of file order or isolation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type MockAdapter, getMockAdapter, hasMockAdapter, registerMockAdapter, resetMockAdapter } from './mock-adapter';

const fakeAdapter: MockAdapter = {
  createMockFn: () => () => undefined,
  spyOnGetter: () => () => undefined,
  spyOnSetter: () => () => undefined,
  getCalls: () => [],
  reset: () => undefined,
  clear: () => undefined,
  restoreImplementation: () => undefined,
};

describe('mock adapter registry', () => {
  let installedAdapter: MockAdapter | undefined;

  beforeEach(() => {
    installedAdapter = hasMockAdapter() ? getMockAdapter() : undefined;
    resetMockAdapter();
  });

  afterEach(() => {
    resetMockAdapter();

    if (installedAdapter) {
      registerMockAdapter(installedAdapter);
    }
  });

  it('reports an empty registry before any entry has registered an adapter', () => {
    expect(hasMockAdapter()).toBe(false);
  });

  it('throws an actionable hint when no entry has registered an adapter', () => {
    expect(() => getMockAdapter()).toThrow(/no mock adapter registered/i);
  });

  it('returns the adapter installed by a runtime entry', () => {
    registerMockAdapter(fakeAdapter);

    expect(hasMockAdapter()).toBe(true);
    expect(getMockAdapter()).toBe(fakeAdapter);
  });
});
