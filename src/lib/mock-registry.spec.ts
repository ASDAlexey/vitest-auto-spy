/**
 * The registry these specs prune is the real one — there is no second copy of `@vitest/spy` to
 * stage this against. That is safe here because this repo runs with `clearMocks` off: nothing in
 * the suite depends on a mock of an earlier file still being reachable from `vi.clearAllMocks()`.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  captureMockRegistry,
  getMockRegistrySize,
  keepMockRegistered,
  keepRegisteredMocks,
  pruneMockRegistry,
  resetMockRegistryTracking,
  restoreLongLivedImplementations,
  trackMockRegistry,
} from './mock-registry';

describe('captureMockRegistry', () => {
  afterEach(resetMockRegistryTracking);

  it('finds the set @vitest/spy clears, and the probe leaves no trace in it', () => {
    const captured = captureMockRegistry();
    const mock = vi.fn();

    expect(captured).toBeInstanceOf(Set);
    expect(captured?.has(mock)).toBe(true);
  });

  it('captures once per worker and hands the same set back', () => {
    expect(captureMockRegistry()).toBe(captureMockRegistry());
  });

  it('gives up when the set it saw does not hold the probe, and does not retry', () => {
    const clearAllMocks = vi.spyOn(vi, 'clearAllMocks').mockImplementation(() => {
      // A runner whose `clearAllMocks` iterates something else — or nothing the probe is in.
      new Set(['decoy']).forEach(() => {});

      return vi;
    });

    expect(captureMockRegistry()).toBeUndefined();

    clearAllMocks.mockRestore();

    expect(captureMockRegistry()).toBeUndefined();
    expect(getMockRegistrySize()).toBeUndefined();
  });

  it('puts Set.prototype.forEach back even when clearing throws', () => {
    const original = Set.prototype.forEach;
    const clearAllMocks = vi.spyOn(vi, 'clearAllMocks').mockImplementation(() => {
      throw new Error('runner refused');
    });

    expect(() => captureMockRegistry()).toThrow('runner refused');
    expect(Set.prototype.forEach).toBe(original);

    clearAllMocks.mockRestore();
  });
});

describe('pruneMockRegistry', () => {
  afterEach(resetMockRegistryTracking);

  it('is a no-op without a capture', () => {
    expect(pruneMockRegistry()).toBe(0);
  });

  it('drops a mock the file created and keeps one marked long-lived', () => {
    const registry = captureMockRegistry();
    const shared = keepMockRegistered(vi.fn());
    const local = vi.fn();

    expect(pruneMockRegistry()).toBeGreaterThan(0);

    expect(registry?.has(shared)).toBe(true);
    expect(registry?.has(local)).toBe(false);
  });

  it('drops an entry that cannot be marked at all', () => {
    const registry = captureMockRegistry();

    registry?.add('not a mock');
    keepRegisteredMocks();

    expect(pruneMockRegistry()).toBe(1);
    expect(registry?.has('not a mock')).toBe(false);
  });

  it('finds nothing left to do on a second call', () => {
    captureMockRegistry();
    vi.fn();
    pruneMockRegistry();

    expect(pruneMockRegistry()).toBe(0);
  });
});

describe('keepMockRegistered', () => {
  afterEach(resetMockRegistryTracking);

  it('hands the mock back so it can wrap a declaration', () => {
    const mock = vi.fn();

    expect(keepMockRegistered(mock)).toBe(mock);
  });

  it('ignores a value no WeakSet can hold', () => {
    expect(keepMockRegistered('nothing to mark')).toBe('nothing to mark');
    expect(keepMockRegistered(null)).toBeNull();
  });

  it('marks a mock that is an object rather than a function', () => {
    const registry = captureMockRegistry();
    // A proxy-based double is an object; nothing about the mark assumes a callable.
    const proxied = {};

    registry?.add(proxied);
    keepMockRegistered(proxied);
    pruneMockRegistry();

    expect(registry?.has(proxied)).toBe(true);

    // Out again: this is the real registry, and `vi.clearAllMocks()` calls `mockClear` on whatever
    // it finds there.
    registry?.delete(proxied);
  });
});

describe('restoreLongLivedImplementations', () => {
  afterEach(resetMockRegistryTracking);

  it('has nothing to do while no long-lived mock carries an implementation', () => {
    expect(restoreLongLivedImplementations()).toBe(0);
  });

  it('puts back an implementation a reset dropped', () => {
    const shared = keepMockRegistered(vi.fn().mockReturnValue('kept'));

    // What `vi.resetAllMocks()` does to every mock still in the registry, done here to the one mock
    // this test owns: the value came from a chained `mockReturnValue`, so `mockReset` leaves nothing.
    shared.mockReset();

    expect(shared()).toBeUndefined();
    expect(restoreLongLivedImplementations()).toBe(1);
    expect(shared()).toBe('kept');
  });

  it('leaves an implementation a test installed on purpose alone', () => {
    const shared = keepMockRegistered(vi.fn().mockReturnValue('from the module'));

    shared.mockReturnValue('from this test');

    expect(restoreLongLivedImplementations()).toBe(0);
    expect(shared()).toBe('from this test');
  });

  it('ignores a long-lived mock that never carried an implementation', () => {
    const shared = keepMockRegistered(vi.fn());

    shared.mockReset();

    expect(restoreLongLivedImplementations()).toBe(0);
    expect(shared()).toBeUndefined();
  });

  it('ignores a double with no implementation controls to read', () => {
    const proxied = keepMockRegistered({});

    expect(restoreLongLivedImplementations()).toBe(0);
    expect(proxied).toEqual({});
  });

  it('remembers the implementation it saw first, not a later one', () => {
    const shared = keepMockRegistered(vi.fn().mockReturnValue('from the module'));

    shared.mockReturnValue('from a test');
    keepMockRegistered(shared);
    shared.mockReset();

    expect(restoreLongLivedImplementations()).toBe(1);
    expect(shared()).toBe('from the module');
  });

  it('forgets what it remembered when tracking is reset', () => {
    const shared = keepMockRegistered(vi.fn().mockReturnValue('kept'));

    resetMockRegistryTracking();
    shared.mockReset();

    expect(restoreLongLivedImplementations()).toBe(0);
    expect(shared()).toBeUndefined();
  });
});

describe('keepRegisteredMocks', () => {
  afterEach(resetMockRegistryTracking);

  it('is a no-op without a capture', () => {
    expect(() => keepRegisteredMocks()).not.toThrow();
    expect(pruneMockRegistry()).toBe(0);
  });

  it('marks everything the file inherited, so a prune leaves it alone', () => {
    const inherited = vi.fn();
    const registry = captureMockRegistry();

    keepRegisteredMocks();

    const local = vi.fn();

    pruneMockRegistry();

    expect(registry?.has(inherited)).toBe(true);
    expect(registry?.has(local)).toBe(false);
  });
});

/**
 * The hooks, running for real. `trackedInsideTheBlock` is created while the block owns the hooks;
 * the assertion that it was pruned lives in the test after the block, which is the first place the
 * `afterAll` has already run.
 */
let trackedInsideTheBlock: unknown;
let trackedRegistry: Set<unknown> | undefined;
let markedBeforeTheBlock: unknown;

describe('trackMockRegistry', () => {
  // Registered before the tracking hooks, so it runs first: this mock exists when the block starts,
  // which is what a `vi.fn()` created while the module graph was being evaluated looks like.
  beforeAll(() => {
    markedBeforeTheBlock = vi.fn();
  });

  trackMockRegistry();

  it('has a registry to work with, and the file inherits what was created before it', () => {
    trackedRegistry = captureMockRegistry();
    trackedInsideTheBlock = vi.fn();

    expect(getMockRegistrySize()).toBeGreaterThan(0);
    expect(trackedRegistry?.has(trackedInsideTheBlock)).toBe(true);
  });
});

describe('after a tracked block', () => {
  it('pruned what the block created and kept what preceded it', () => {
    expect(trackedRegistry?.has(trackedInsideTheBlock)).toBe(false);
    expect(trackedRegistry?.has(markedBeforeTheBlock)).toBe(true);
  });

  it('reports the size of the registry it kept', () => {
    expect(getMockRegistrySize()).toBeGreaterThan(0);
  });
});
