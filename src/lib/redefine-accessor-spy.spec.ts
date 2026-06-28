/**
 * The shared accessor-redefine helper used by the Bun and `node:test` adapters
 * (neither has a native accessor spy). Tested directly with a tiny call-recording
 * mock factory so every branch — existing accessors vs. a fresh property, get vs.
 * set — is covered independently of any runtime.
 */
import { describe, expect, it } from 'vitest';

import type { MockFn } from './mock-adapter';
import { spyOnAccessorByRedefine } from './redefine-accessor-spy';
import type { Func } from './types';

/** Minimal mock: records calls and forwards to the wrapped implementation. */
function makeMockFactory(): { create: (impl?: Func) => MockFn; callsOf: (mock: MockFn) => unknown[][] } {
  const callLog = new WeakMap<MockFn, unknown[][]>();
  const create = (impl?: Func): MockFn => {
    const calls: unknown[][] = [];
    const mock: MockFn = (...args: unknown[]): unknown => {
      calls.push(args);

      return impl?.(...args);
    };
    callLog.set(mock, calls);

    return mock;
  };

  return { create, callsOf: (mock: MockFn): unknown[][] => callLog.get(mock) ?? [] };
}

function defineEmptyAccessors(target: Record<string, unknown>, property: string): void {
  Object.defineProperty(target, property, {
    get: (): undefined => undefined,
    set: (_value: unknown): void => undefined,
    configurable: true,
    enumerable: true,
  });
}

describe('spyOnAccessorByRedefine', () => {
  it('wraps the getter while preserving the existing setter', () => {
    const { create, callsOf } = makeMockFactory();
    const target: Record<string, unknown> = {};
    defineEmptyAccessors(target, 'value');

    const getter = spyOnAccessorByRedefine(create, target, 'value', 'get');

    void target['value'];

    expect(callsOf(getter)).toEqual([[]]);
    // The untouched setter still works (no throw).
    expect(() => (target['value'] = 1)).not.toThrow();
  });

  it('wraps the setter while preserving the existing getter', () => {
    const { create, callsOf } = makeMockFactory();
    const target: Record<string, unknown> = {};
    defineEmptyAccessors(target, 'value');

    const setter = spyOnAccessorByRedefine(create, target, 'value', 'set');

    target['value'] = 42;

    expect(callsOf(setter)).toEqual([[42]]);
    expect(() => void target['value']).not.toThrow();
  });

  it('defines a fresh accessor when the property has no descriptor yet', () => {
    const { create, callsOf } = makeMockFactory();
    const target: Record<string, unknown> = {};

    const getter = spyOnAccessorByRedefine(create, target, 'fresh', 'get');

    void target['fresh'];

    expect(callsOf(getter)).toEqual([[]]);
    expect(Object.getOwnPropertyDescriptor(target, 'fresh')?.enumerable).toBe(true);
  });
});
