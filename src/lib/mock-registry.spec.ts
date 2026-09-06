/**
 * A successful capture is staged here rather than taken from the runner in use. Vitest 4 held every
 * mock in one `Set` and `clearAllMocks()` walked it with `Set.prototype.forEach` — the seam
 * `captureMockRegistry` reads. Vitest 5 walks a weak-ref registry with `for…of`, so there is nothing
 * for the patch to see, and a stand-in runner is the only way to drive the success path on both.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SWEEP_SENTINEL } from './constants';
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

/** A Vitest-4-shaped runner standing in for the installed one, and the way back off it. */
interface StagedRunner {
  readonly registry: Set<unknown>;
  readonly restore: () => void;
}

let staged: StagedRunner | undefined;

/**
 * Route every `vi.fn()` into one `Set` and make `vi.clearAllMocks()` walk it with
 * `Set.prototype.forEach` — a Vitest 4 runner as far as the capture can tell.
 */
function stageVitest4Registry(): Set<unknown> {
  const registry = new Set<unknown>();
  const realFn = vi.fn;
  const realClearAllMocks = vi.clearAllMocks;

  Reflect.set(vi, 'fn', (implementation: (...args: never[]) => unknown) => {
    const mock = realFn(implementation);

    registry.add(mock);

    return mock;
  });

  Reflect.set(vi, 'clearAllMocks', () => {
    registry.forEach((mock) => {
      // A second `forEach` on the way out, the way a real `mockClear` reaches into the mock's own
      // state: only the first set the patch is called on is the registry.
      new Set([mock]).forEach(() => undefined);
    });

    return vi;
  });

  staged = {
    registry,
    restore: () => {
      Reflect.set(vi, 'fn', realFn);
      Reflect.set(vi, 'clearAllMocks', realClearAllMocks);
    },
  };

  return registry;
}

/** Take the stand-in runner back off and forget the capture it drove. */
function unstage(): void {
  staged?.restore();
  staged = undefined;
  resetMockRegistryTracking();
}

describe('captureMockRegistry', () => {
  afterEach(unstage);

  it('finds the set the runner clears, and the probe leaves no trace in it', () => {
    const registry = stageVitest4Registry();
    const captured = captureMockRegistry();

    expect(captured).toBe(registry);
    expect(captured?.size).toBe(0);

    const mock = vi.fn();

    expect(captured?.has(mock)).toBe(true);
  });

  it('captures once per worker and hands the same set back', () => {
    stageVitest4Registry();

    expect(captureMockRegistry()).toBe(captureMockRegistry());
  });

  it('yields no capture from a runner whose clear does not iterate with Set.prototype.forEach', () => {
    const clearAllMocks = vi.spyOn(vi, 'clearAllMocks').mockImplementation(() => {
      // Vitest 5 clears with a `for…of` walk over its own registry, which never reaches
      // `Set.prototype.forEach` — the one seam the capture reads.
      for (const entry of new Set([vi.fn()])) {
        expect(entry).toBeTypeOf('function');
      }

      return vi;
    });

    expect(captureMockRegistry()).toBeUndefined();

    clearAllMocks.mockRestore();
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

  it('reports a size on the installed runner exactly when it captured something', () => {
    expect(getMockRegistrySize()).toBe(captureMockRegistry()?.size);
  });
});

describe('pruneMockRegistry', () => {
  afterEach(unstage);

  it('is a no-op without a capture', () => {
    expect(pruneMockRegistry()).toBe(0);
  });

  it('drops a mock the file created and keeps one marked long-lived', () => {
    stageVitest4Registry();

    const registry = captureMockRegistry();
    const shared = keepMockRegistered(vi.fn());
    const local = vi.fn();

    expect(pruneMockRegistry()).toBeGreaterThan(0);

    expect(registry?.has(shared)).toBe(true);
    expect(registry?.has(local)).toBe(false);
  });

  it('drops an entry that cannot be marked at all', () => {
    stageVitest4Registry();

    const registry = captureMockRegistry();

    registry?.add('not a mock');
    keepRegisteredMocks();

    expect(pruneMockRegistry()).toBe(1);
    expect(registry?.has('not a mock')).toBe(false);
  });

  it('finds nothing left to do on a second call', () => {
    stageVitest4Registry();
    captureMockRegistry();
    vi.fn();
    pruneMockRegistry();

    expect(pruneMockRegistry()).toBe(0);
  });
});

describe('keepMockRegistered', () => {
  afterEach(unstage);

  it('hands the mock back so it can wrap a declaration', () => {
    const mock = vi.fn();

    expect(keepMockRegistered(mock)).toBe(mock);
  });

  it('ignores a value no WeakSet can hold', () => {
    expect(keepMockRegistered('nothing to mark')).toBe('nothing to mark');
    expect(keepMockRegistered(null)).toBeNull();
  });

  it('marks a mock that is an object rather than a function', () => {
    stageVitest4Registry();

    const registry = captureMockRegistry();
    // A proxy-based double is an object; nothing about the mark assumes a callable.
    const proxied = {};

    registry?.add(proxied);
    keepMockRegistered(proxied);
    pruneMockRegistry();

    expect(registry?.has(proxied)).toBe(true);
  });

  it('never drops the sweep sentinel, whoever created it and whenever', () => {
    stageVitest4Registry();

    const registry = captureMockRegistry();
    // The mark, not the identity: the adapter's sentinel may come from a second copy of that module
    // under `isolate: false`, and pruning it would turn `vi.clearAllMocks()` into a silent no-op for
    // every spy this library built.
    const sentinel = Object.defineProperty(vi.fn(), SWEEP_SENTINEL, { value: true, configurable: true });

    registry?.add(sentinel);
    pruneMockRegistry();

    expect(registry?.has(sentinel)).toBe(true);
  });
});

describe('restoreLongLivedImplementations', () => {
  afterEach(unstage);

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
  afterEach(unstage);

  it('is a no-op without a capture', () => {
    expect(() => keepRegisteredMocks()).not.toThrow();
    expect(pruneMockRegistry()).toBe(0);
  });

  it('marks everything the file inherited, so a prune leaves it alone', () => {
    stageVitest4Registry();

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
    stageVitest4Registry();
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

// The stand-in the tracked block installed outlives that block's own `afterAll` prune, so it comes
// off at the end of the file instead.
afterAll(unstage);
