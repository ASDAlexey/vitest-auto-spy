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
import { type MockAdapter, type MockFn, guardAccessorSpies } from './mock-adapter';
import { createRedefineMockAdapter } from './redefine-accessor-spy';
import type { Func } from './types';

/** A `node:test` mock function — the surface this adapter relies on. */
export interface NodeMock {
  (...args: unknown[]): unknown;
  mock: { calls: { arguments: unknown[] }[]; resetCalls(): void; mockImplementation(implementation: Func): void };
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
 * `node:test`'s `mock.fn()` has no `mockName`, and the proxy it hands back keeps the
 * *implementation's* own `name` — so every spy read back as `[Function: dispatch]` (the library's
 * internal dispatch) where Vitest and Bun show the method. `name` is the property both Node's own
 * inspector and this library's argument serializer read, so that is the one that has to carry it.
 *
 * The name is given to the implementation **at creation**, never redefined afterwards, and that is
 * the whole design. `Object.defineProperty(fn, 'name', …)` works, but it drops the function out of
 * V8's fast map: measured on 200 000 mocks, redefining `name` costs **+206 B each** where naming at
 * creation costs **+65 B** (Node 24.19.0, `--expose-gc`). An anonymous function *expression* under
 * a computed key is named by the language itself, and unlike a concise method it stays
 * constructable — which `mockConstructor` needs, since the code under test calls `new` on it.
 *
 * `displayName` is still set on the proxy for inspectors that prefer that convention; it predates
 * this and costs 42 B. It is an own property, so it survives `mock.reset()`, `mock.restore()` and
 * `resetCalls()` — those replace the implementation and never touch the proxy — and it is
 * non-enumerable, so it never leaks into `Object.keys` or serialization.
 */
function nameImplementation(implementation: Func, name?: string): Func {
  if (name === undefined) {
    return implementation;
  }

  const named = {
    // eslint-disable-next-line object-shorthand -- a concise method is not constructable, and `mockConstructor` has the code under test call `new` on this; a function expression is, and is still named by its computed key.
    [name]: function (this: unknown, ...args: unknown[]): unknown {
      return implementation.apply(this, args);
    },
  };

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a computed key widens the literal to an index signature; the value read back is the function just built.
  return named[name] as Func;
}

function nameNodeMock(mockFn: MockFn, name?: string): MockFn {
  if (name !== undefined) {
    Object.defineProperty(mockFn, 'displayName', { value: name, configurable: true });
  }

  return mockFn;
}

/** Build a `node:test` {@link MockAdapter} from the runtime's `mock` primitive. */
export function createNodeMockAdapter(nodeTest: NodeTestApi): MockAdapter {
  return guardAccessorSpies(
    createRedefineMockAdapter({
      createMockFn: (implementation?: Func, name?: string): MockFn =>
        nameNodeMock(nodeTest.fn(nameImplementation(implementation ?? ((): void => undefined), name)), name),
      getCalls: (mockFn: MockFn): readonly unknown[][] => asNodeMock(mockFn).mock.calls.map((call) => call.arguments),
      reset: (mockFn: MockFn): void => asNodeMock(mockFn).mock.resetCalls(),
      // `node:test` mocks reset call history via `resetCalls()`; there is no
      // separate implementation to preserve, so clear maps to the same primitive.
      clear: (mockFn: MockFn): void => asNodeMock(mockFn).mock.resetCalls(),
      restoreImplementation: (mockFn: MockFn, implementation: Func): void => asNodeMock(mockFn).mock.mockImplementation(implementation),
    }),
  );
}
