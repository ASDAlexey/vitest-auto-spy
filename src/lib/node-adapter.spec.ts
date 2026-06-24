/**
 * The `node:test` adapter against the real `node:test` module (available under
 * the Node-based Vitest runner). Verifies the call-shape and reset translation
 * its `{ arguments }`-per-call format requires.
 */
import { describe, expect, it } from 'vitest';

import { nodeMockAdapter } from './node-adapter';

describe('nodeMockAdapter', () => {
  it('createMockFn wraps an implementation', () => {
    const inc = nodeMockAdapter.createMockFn((value: number) => value + 1);

    expect(inc(1)).toBe(2);
  });

  it('createMockFn defaults to a no-op when no implementation is given', () => {
    const noop = nodeMockAdapter.createMockFn();

    expect(noop()).toBeUndefined();
  });

  it('getCalls flattens the node:test { arguments } call shape', () => {
    const fn = nodeMockAdapter.createMockFn();

    fn(1, 'a');
    fn(2);

    expect(nodeMockAdapter.getCalls(fn)).toEqual([[1, 'a'], [2]]);
  });

  it('reset clears the recorded calls', () => {
    const fn = nodeMockAdapter.createMockFn();
    fn('x');

    nodeMockAdapter.reset(fn);

    expect(nodeMockAdapter.getCalls(fn)).toEqual([]);
  });

  it('spyOnGetter / spyOnSetter record accessor access', () => {
    let backing = 5;
    const target: Record<string, unknown> = {};
    Object.defineProperty(target, 'value', {
      get: (): number => backing,
      set: (next: number): void => {
        backing = next;
      },
      configurable: true,
    });

    const getter = nodeMockAdapter.spyOnGetter(target, 'value');
    const setter = nodeMockAdapter.spyOnSetter(target, 'value');

    void target['value'];
    target['value'] = 9;

    expect(nodeMockAdapter.getCalls(getter)).toEqual([[]]);
    expect(nodeMockAdapter.getCalls(setter)).toEqual([[9]]);
  });
});
