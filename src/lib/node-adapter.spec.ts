/**
 * The `node:test` adapter factory, exercised with a stub that mirrors
 * `node:test`'s `mock.fn()` (per-call `{ arguments }` shape, `resetCalls`).
 * `node:test` itself is a Node built-in Vitest cannot bundle, so the factory
 * shape is what we can verify here — the real module is wired in `src/node.ts`.
 */
import { describe, expect, it } from 'vitest';

import { describeMockAdapterContract } from './mock-adapter-contract';
import { type NodeMock, type NodeTestApi, createNodeMockAdapter } from './node-adapter';
import type { Func } from './types';

/**
 * Build a `node:test`-like `mock` whose `fn()` records `{ arguments }`-shaped calls.
 *
 * The mock inherits the *implementation's* `name`, which is what real `node:test` does and what the
 * adapter relies on instead of redefining `name` on the mock — see `nameImplementation`.
 */
function makeNodeTestApi({ restore = true }: { restore?: boolean } = {}): NodeTestApi {
  return {
    fn: (implementation?: Func): NodeMock => {
      const calls: { arguments: unknown[] }[] = [];
      let currentImplementation = implementation;
      // A `function`, not an arrow: real `node:test` hands back something constructable that
      // forwards `this`, and both are contracts the adapter's named wrapper has to preserve.
      const name = implementation?.name ?? '';
      const fn = {
        // eslint-disable-next-line object-shorthand -- a concise method is not constructable, and real `node:test` mocks are.
        [name]: function (this: unknown, ...args: unknown[]): unknown {
          calls.push({ arguments: args });

          return currentImplementation?.apply(this, args);
        },
      }[name] as NodeMock;

      fn.mock = {
        calls,
        resetCalls: (): void => {
          calls.length = 0;
        },
        mockImplementation: (next: Func): void => {
          currentImplementation = next;
        },
      };

      if (restore) {
        fn.mock.restore = (): void => {
          currentImplementation = implementation;
        };
      }

      return fn;
    },
  };
}

describeMockAdapterContract({ describe, it }, { name: 'node:test (stub)', adapter: () => createNodeMockAdapter(makeNodeTestApi()) });

describe('createNodeMockAdapter', () => {
  it('reset still clears the calls on a node:test without mock.restore()', () => {
    const adapter = createNodeMockAdapter(makeNodeTestApi({ restore: false }));
    const fn = adapter.createMockFn();

    fn('x');
    adapter.reset(fn);

    expect(adapter.getCalls(fn)).toEqual([]);
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
});
