/**
 * The mock-adapter registry in isolation. This file deliberately imports ONLY
 * `./mock-adapter` (never a public entry), so per-file isolation (vitest
 * `isolate: true`) keeps the registry empty — exercising the "no adapter
 * registered" path that a real runtime entry is responsible for filling.
 */
import { describe, expect, it } from 'vitest';

import { type MockAdapter, getMockAdapter, registerMockAdapter } from './mock-adapter';

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
  it('throws an actionable hint when no entry has registered an adapter', () => {
    expect(() => getMockAdapter()).toThrow(/no mock adapter registered/i);
  });

  it('returns the adapter installed by a runtime entry', () => {
    registerMockAdapter(fakeAdapter);

    expect(getMockAdapter()).toBe(fakeAdapter);
  });
});
