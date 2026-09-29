/**
 * `trackMockRegistry()` captures when it is called, so both runners are set up while the file is
 * collected: the installed Vitest 5 first, which has nothing to capture, then a Vitest-4-shaped
 * stand-in whose `clearAllMocks()` walks one `Set` with `Set.prototype.forEach`.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  captureMockRegistry,
  getMockRegistrySize,
  keepMockRegistered,
  resetMockRegistryTracking,
  restoreLongLivedImplementations,
  trackMockRegistry,
} from './mock-registry';

let lostItsImplementation: (() => unknown) | undefined;

describe('trackMockRegistry on a runner with no registry to capture', () => {
  trackMockRegistry();
  resetMockRegistryTracking();

  it('leaves a shared mock without the implementation a reset took', () => {
    const shared = keepMockRegistered(vi.fn().mockImplementation(() => 'shared'));

    shared.mockReset();
    lostItsImplementation = shared;

    expect(shared()).toBeUndefined();
  });

  it('registered no hook that would have put it back', () => {
    expect(lostItsImplementation?.()).toBeUndefined();
    expect(restoreLongLivedImplementations()).toBe(1);
  });
});

const staged = new Set<unknown>();
const realFn = vi.fn;
const realClearAllMocks = vi.clearAllMocks;

let trackedInsideTheBlock: unknown;
let markedBeforeTheBlock: unknown;

describe('trackMockRegistry on a runner whose registry it captures', () => {
  Reflect.set(vi, 'fn', (implementation?: (...args: never[]) => unknown) => {
    const mock = realFn(implementation);

    staged.add(mock);

    return mock;
  });
  Reflect.set(vi, 'clearAllMocks', () => {
    staged.forEach(() => undefined);

    return vi;
  });

  // Created before the tracking starts, which is what a `vi.fn()` from the module graph looks like.
  markedBeforeTheBlock = vi.fn();
  trackMockRegistry();

  it('works on the captured registry, and the file inherits what was created before it', () => {
    trackedInsideTheBlock = vi.fn();

    expect(captureMockRegistry()).toBe(staged);
    expect(staged.has(trackedInsideTheBlock)).toBe(true);
  });
});

describe('after a tracked block', () => {
  it('pruned what the block created and kept what preceded it', () => {
    expect(staged.has(trackedInsideTheBlock)).toBe(false);
    expect(staged.has(markedBeforeTheBlock)).toBe(true);
    expect(getMockRegistrySize()).toBe(staged.size);
  });
});

afterAll(() => {
  Reflect.set(vi, 'fn', realFn);
  Reflect.set(vi, 'clearAllMocks', realClearAllMocks);
  resetMockRegistryTracking();
});
