/**
 * Which keys of a deep node belong to the spy and which materialise a child is decided per read,
 * and this file is the reason it cannot be decided once per worker: `/rxjs` and `/jasmine` add their
 * helpers to a spy when they are imported, which is routinely *after* the first deep mock of the
 * worker has been read.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { registerMockAdapter } from './mock-adapter';
import { mockDeep } from './mock-deep';
import {
  addObservableHelpersToCalledWithObject,
  addObservableHelpersToFunctionSpy,
  createFunctionSpyStream,
  createObservablePropSpy,
} from './observable-spy';
import { registerObservableSupport } from './observable-support';
import { vitestMockAdapter } from './vitest-adapter';

interface Feed {
  items(): unknown;
}

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

describe('mockDeep — a helper registered after the first read', () => {
  it('answers with the helper rather than with a child node', () => {
    const early = mockDeep<{ feed: Feed }>();

    // The read that used to freeze the surface for the rest of the worker.
    expect(vi.isMockFunction(early.feed.items)).toBe(true);

    registerObservableSupport({
      addToFunctionSpy: addObservableHelpersToFunctionSpy,
      streamForFunctionSpy: createFunctionSpyStream,
      addToCalledWithObject: addObservableHelpersToCalledWithObject,
      createPropSpy: createObservablePropSpy,
    });

    const later = mockDeep<{ feed: Feed }>();
    const nextWith = (later.feed.items as unknown as Record<string, unknown>)['nextWith'];

    expect(typeof nextWith).toBe('function');
    expect(vi.isMockFunction(nextWith)).toBe(false);
  });
});
