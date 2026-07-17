/**
 * The `node:test` adapter factory, exercised with a stub that mirrors
 * `node:test`'s `mock.fn()` (per-call `{ arguments }` shape, `resetCalls`).
 * `node:test` itself is a Node built-in Vitest cannot bundle, so the factory
 * shape is what we can verify here — the real module is wired in `src/node.ts`.
 */
import { describe, expect, it } from 'vitest';

import { type NodeMock, type NodeTestApi, createNodeMockAdapter } from './node-adapter';
import type { Func } from './types';

/** Build a `node:test`-like `mock` whose `fn()` records `{ arguments }`-shaped calls. */
function makeNodeTestApi(): NodeTestApi {
  return {
    fn: (implementation?: Func): NodeMock => {
      const calls: { arguments: unknown[] }[] = [];
      const fn = ((...args: unknown[]): unknown => {
        calls.push({ arguments: args });

        return implementation?.(...args);
      }) as NodeMock;
      fn.mock = {
        calls,
        resetCalls: (): void => {
          calls.length = 0;
        },
      };

      return fn;
    },
  };
}

describe('createNodeMockAdapter', () => {
  it('createMockFn wraps an implementation', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());

    const inc = adapter.createMockFn((value: number) => value + 1);

    expect(inc(1)).toBe(2);
  });

  it('createMockFn defaults to a no-op when no implementation is given', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());

    expect(adapter.createMockFn()()).toBeUndefined();
  });

  it('getCalls flattens the node:test { arguments } call shape and reset clears them', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());
    const fn = adapter.createMockFn();

    fn(1, 'a');
    fn(2);
    expect(adapter.getCalls(fn)).toEqual([[1, 'a'], [2]]);

    adapter.reset(fn);
    expect(adapter.getCalls(fn)).toEqual([]);
  });

  it('clear drops the recorded calls (node:test has no separate implementation reset)', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());
    const fn = adapter.createMockFn();

    fn('x');
    adapter.clear(fn);

    expect(adapter.getCalls(fn)).toEqual([]);
  });

  it('names the mock via displayName for cross-runner diagnostics (and skips it when unnamed)', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());

    const named = adapter.createMockFn(undefined, 'fetchUser');
    const anonymous = adapter.createMockFn();

    expect(Object.getOwnPropertyDescriptor(named, 'displayName')?.value).toBe('fetchUser');
    expect(Object.getOwnPropertyDescriptor(anonymous, 'displayName')).toBeUndefined();
  });

  it('spyOnGetter / spyOnSetter record accessor access', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());
    let backing = 5;
    const target: Record<string, unknown> = {};
    Object.defineProperty(target, 'value', {
      get: (): number => backing,
      set: (next: number): void => {
        backing = next;
      },
      configurable: true,
    });

    const getter = adapter.spyOnGetter(target, 'value');
    const setter = adapter.spyOnSetter(target, 'value');

    void target['value'];
    target['value'] = 9;

    expect(adapter.getCalls(getter)).toEqual([[]]);
    expect(adapter.getCalls(setter)).toEqual([[9]]);
  });
});
