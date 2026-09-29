/**
 * `useRunnerAdapter()` — the registration the runner-agnostic entries make instead of importing
 * `vitest`. The registry is worker-wide, so every test empties it and restores what was there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type MockAdapter, getMockAdapter, hasMockAdapter, registerMockAdapter, resetMockAdapter } from './mock-adapter';
import { setSpyEngine } from './spy-engine';
import { vitestMockAdapter } from './vitest-adapter';
import { type VitestFnHost, createVitestMockAdapter, useRunnerAdapter } from './vitest-runner-adapter';

describe('useRunnerAdapter', () => {
  let installed: MockAdapter | undefined;

  beforeEach(() => {
    installed = hasMockAdapter() ? getMockAdapter() : undefined;
    resetMockAdapter();
  });

  afterEach(() => {
    resetMockAdapter();

    if (installed) {
      registerMockAdapter(installed);
    }
  });

  it("builds the Vitest adapter from the runner's own vi", () => {
    useRunnerAdapter();

    const adapter = getMockAdapter();

    expect(adapter).not.toBe(vitestMockAdapter);

    const spy = adapter.createMockFn((value: number) => value * 2, 'double');

    expect(spy(2)).toBe(4);
    expect(adapter.getCalls(spy)).toEqual([[2]]);
    expect(vi.isMockFunction(spy)).toBe(true);
  });

  it('keeps an adapter a runtime entry registered first', () => {
    registerMockAdapter(vitestMockAdapter);
    useRunnerAdapter();

    expect(getMockAdapter()).toBe(vitestMockAdapter);
  });

  it('registers nothing off Vitest, leaving the named error to the first spy', () => {
    useRunnerAdapter({});

    expect(hasMockAdapter()).toBe(false);
  });
});

describe('createVitestMockAdapter', () => {
  it("hands vi.fn the implementation under the runner's engine, and none for a bare mock or the sweep sentinel", () => {
    const restoreEngine = setSpyEngine('runner');
    const host: VitestFnHost = { fn: vi.fn };
    const fn = vi.spyOn(host, 'fn');
    const adapter = createVitestMockAdapter(host);

    try {
      const double = (value: number): number => value * 2;
      const spy = adapter.createMockFn(double);
      const bare = adapter.createMockFn();

      expect(spy(2)).toBe(4);
      expect(bare()).toBeUndefined();
      expect(fn.mock.calls).toEqual([[], [double], []]);
    } finally {
      restoreEngine();
    }
  });
});
