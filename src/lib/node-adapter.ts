/**
 * The `node:test` {@link MockAdapter}, built as a factory.
 *
 * `node:test` is a Node built-in that Vitest cannot bundle into its own test
 * environment, so — like the Bun adapter — this module never imports it. The
 * `vitest-auto-spy/node` entry supplies the real `node:test` `mock` primitive via
 * {@link createNodeMockAdapter}, which also keeps the factory unit-testable with a
 * stub off Node's test runner.
 *
 * `node:test` records each call as a `{ arguments, result, … }` object (not a
 * bare argument array) and resets via `mock.resetCalls()`, so `getCalls` /
 * `reset` adapt that shape. Accessor spies reuse the shared redefine helper.
 */
import type { MockAdapter, MockFn } from './mock-adapter';
import { createRedefineMockAdapter } from './redefine-accessor-spy';
import type { Func } from './types';

/** A `node:test` mock function — the surface this adapter relies on. */
export interface NodeMock {
  (...args: unknown[]): unknown;
  mock: { calls: { arguments: unknown[] }[]; resetCalls(): void };
}

/** The slice of `node:test` the Node entry injects (the module's `mock` object). */
export interface NodeTestApi {
  fn(implementation?: Func): NodeMock;
}

/** View a runtime-agnostic {@link MockFn} as the concrete `node:test` mock it actually is here. */
function asNodeMock(mockFn: MockFn): NodeMock {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- every `MockFn` this adapter hands out is a `node:test` `mock.fn()`; reading its `{ arguments }`-shaped calls / resetting narrows the bare callable back to the concrete mock.
  return mockFn as any;
}

/**
 * `node:test`'s `mock.fn()` has no `mockName`, so spies were nameless in its
 * diagnostics while Vitest/Bun showed names. Attach the name as `displayName`
 * (the convention inspectors read) for cross-runner parity. Non-enumerable so it
 * never leaks into `Object.keys`/serialization.
 */
function nameNodeMock(mockFn: MockFn, name?: string): MockFn {
  if (name !== undefined) {
    Object.defineProperty(mockFn, 'displayName', { value: name, configurable: true });
  }

  return mockFn;
}

/** Build a `node:test` {@link MockAdapter} from the runtime's `mock` primitive. */
export function createNodeMockAdapter(nodeTest: NodeTestApi): MockAdapter {
  return createRedefineMockAdapter({
    createMockFn: (implementation?: Func, name?: string): MockFn =>
      nameNodeMock(nodeTest.fn(implementation ?? ((): void => undefined)), name),
    getCalls: (mockFn: MockFn): readonly unknown[][] => asNodeMock(mockFn).mock.calls.map((call) => call.arguments),
    reset: (mockFn: MockFn): void => asNodeMock(mockFn).mock.resetCalls(),
    // `node:test` mocks reset call history via `resetCalls()`; there is no
    // separate implementation to preserve, so clear maps to the same primitive.
    clear: (mockFn: MockFn): void => asNodeMock(mockFn).mock.resetCalls(),
  });
}
