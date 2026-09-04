/**
 * The `node:test` adapter factory, exercised with a stub that mirrors
 * `node:test`'s `mock.fn()` (per-call `{ arguments }` shape, `resetCalls`).
 * `node:test` itself is a Node built-in Vitest cannot bundle, so the factory
 * shape is what we can verify here — the real module is wired in `src/node.ts`.
 */
import { describe, expect, it } from 'vitest';

import { type NodeMock, type NodeTestApi, createNodeMockAdapter } from './node-adapter';
import type { Func } from './types';

/**
 * Build a `node:test`-like `mock` whose `fn()` records `{ arguments }`-shaped calls.
 *
 * The mock inherits the *implementation's* `name`, which is what real `node:test` does and what the
 * adapter relies on instead of redefining `name` on the mock — see `nameImplementation`.
 */
function makeNodeTestApi(): NodeTestApi {
  return {
    fn: (implementation?: Func): NodeMock => {
      const calls: { arguments: unknown[] }[] = [];
      let currentImplementation = implementation;
      // A `function`, not an arrow: real `node:test` hands back something constructable that
      // forwards `this`, and both are contracts the adapter's named wrapper has to preserve.
      const fn = function (this: unknown, ...args: unknown[]): unknown {
        calls.push({ arguments: args });

        return currentImplementation?.apply(this, args);
      } as NodeMock;

      Object.defineProperty(fn, 'name', { value: implementation?.name ?? '', configurable: true });

      fn.mock = {
        calls,
        resetCalls: (): void => {
          calls.length = 0;
        },
        mockImplementation: (next: Func): void => {
          currentImplementation = next;
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

  it('restoreImplementation re-installs the given implementation', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());
    const fn = adapter.createMockFn(() => 'original');

    expect(fn()).toBe('original');

    adapter.restoreImplementation(fn, () => 'restored');
    expect(fn()).toBe('restored');
  });

  it('names the mock after the method, not after the library dispatch it wraps', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());

    const named = adapter.createMockFn(function dispatch(): void {}, 'fetchUser');
    const anonymous = adapter.createMockFn();

    expect(named.name).toBe('fetchUser');
    expect(Object.getOwnPropertyDescriptor(named, 'displayName')?.value).toBe('fetchUser');
    expect(anonymous.name).toBe('');
    expect(Object.getOwnPropertyDescriptor(anonymous, 'displayName')).toBeUndefined();
  });

  it('names the implementation rather than redefining name on the mock', () => {
    // Redefining `name` on the mock drops it out of V8's fast map — +206 B per mock against +65 B
    // for naming at creation, which is why the wrapper exists at all.
    const adapter = createNodeMockAdapter(makeNodeTestApi());

    const named = adapter.createMockFn(function dispatch(): void {}, 'fetchUser');

    expect(Object.getOwnPropertyDescriptor(named, 'name')?.value).toBe('fetchUser');
  });

  it('keeps the named wrapper constructable, which mockConstructor needs', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());
    const built = { built: true };

    const Ctor = adapter.createMockFn(function (): object {
      return built;
    }, 'PaymentsClient');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the adapter hands back a bare callable; `mockConstructor` narrows it to a constructor the same way.
    expect(new (Ctor as any)()).toBe(built);
    expect(Ctor.name).toBe('PaymentsClient');
  });

  it('keeps the name through reset, clear and restoreImplementation', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());
    const named = adapter.createMockFn(undefined, 'fetchUser');

    named();
    adapter.reset(named);
    adapter.clear(named);
    adapter.restoreImplementation(named, (): void => undefined);

    expect(named.name).toBe('fetchUser');
  });

  it('forwards this and every argument through the named wrapper', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi());
    const host = { tag: 'host' };

    const spy = adapter.createMockFn(function (this: typeof host, ...args: unknown[]): unknown {
      return [this.tag, ...args];
    }, 'describeCall');

    expect(spy.call(host, 1, 2)).toEqual(['host', 1, 2]);
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
