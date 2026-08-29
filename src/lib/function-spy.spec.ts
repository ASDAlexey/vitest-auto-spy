/**
 * The spy factory hands its dispatch to the adapter *before* the pieces the dispatch needs exist —
 * the `settledResults` recorder can only be installed once the host mock is there, and the host
 * mock is built from the dispatch. Nothing in the three shipped adapters calls the implementation
 * that early, so the ordering is invisible until one does; this spec is the adapter that does.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createFunctionSpy } from './function-spy';
import { type MockAdapter, type MockFn, registerMockAdapter } from './mock-adapter';
import type { Func } from './types';
import { vitestMockAdapter } from './vitest-adapter';

/** An adapter that warms the implementation while the mock is being created. */
const warmingAdapter: MockAdapter = {
  ...vitestMockAdapter,
  createMockFn(implementation?: Func, name?: string): MockFn {
    const mock = vitestMockAdapter.createMockFn(implementation, name);

    implementation?.();

    return mock;
  },
};

afterEach(() => {
  registerMockAdapter(vitestMockAdapter);
});

describe('createFunctionSpy', () => {
  it('survives an adapter that calls the implementation while the mock is still being created', () => {
    registerMockAdapter(warmingAdapter);

    const load = createFunctionSpy<() => string>('load');

    load.calledWith().mockReturnValue('configured');

    expect(load()).toBe('configured');
  });
});
