/**
 * The guard inside `useVitestAdapter()`.
 *
 * The registry is process-wide, and under `isolate: false` every spec file shares it, so this file
 * cannot assume it knows what is registered — nor may it leave a stand-in behind for whatever runs
 * next. Each test empties the registry itself and restores whatever was there before.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type MockAdapter, getMockAdapter, hasMockAdapter, registerMockAdapter, resetMockAdapter } from './mock-adapter';
import { useVitestAdapter } from './use-vitest-adapter';
import { vitestMockAdapter } from './vitest-adapter';

const standIn: MockAdapter = {
  createMockFn: () => () => undefined,
  spyOnGetter: () => () => undefined,
  spyOnSetter: () => () => undefined,
  getCalls: () => [],
  reset: () => undefined,
  clear: () => undefined,
  restoreImplementation: () => undefined,
};

describe('useVitestAdapter', () => {
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

  it('installs the default Vitest adapter when the registry is empty', () => {
    useVitestAdapter();

    expect(hasMockAdapter()).toBe(true);
    expect(getMockAdapter()).toBe(vitestMockAdapter);
  });

  it('keeps the adapter a runtime entry installed first', () => {
    registerMockAdapter(standIn);
    useVitestAdapter();

    expect(getMockAdapter()).toBe(standIn);
  });
});
