/**
 * The `node:test` {@link MockAdapter}.
 *
 * `node:test` records each call as a `{ arguments, result, … }` object (not a
 * bare argument array) and resets via `mock.resetCalls()`, so `getCalls` /
 * `reset` adapt that shape. Accessor spies reuse the shared redefine helper.
 *
 * This is the only core module that imports `node:test`; it is pulled in solely
 * by the `vitest-auto-spy/node` entry.
 */
import { mock } from 'node:test';

import type { MockAdapter, MockFn } from './mock-adapter';
import { spyOnAccessorByRedefine } from './redefine-accessor-spy';
import type { Func } from './types';

/** The slice of a `node:test` mock this adapter reads. */
interface NodeMock {
  mock: { calls: { arguments: unknown[] }[]; resetCalls(): void };
}

/** View a runtime-agnostic {@link MockFn} as the concrete `node:test` mock it actually is here. */
function asNodeMock(mockFn: MockFn): NodeMock {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- every `MockFn` this adapter hands out is a `node:test` `mock.fn()`; reading its `{ arguments }`-shaped calls / resetting narrows the bare callable back to the concrete mock.
  return mockFn as any;
}

function createNodeMockFn(implementation?: Func): MockFn {
  return mock.fn(implementation ?? ((): void => undefined));
}

export const nodeMockAdapter: MockAdapter = {
  createMockFn: createNodeMockFn,
  spyOnGetter: (target: object, property: string): MockFn => spyOnAccessorByRedefine(createNodeMockFn, target, property, 'get'),
  spyOnSetter: (target: object, property: string): MockFn => spyOnAccessorByRedefine(createNodeMockFn, target, property, 'set'),
  getCalls: (mockFn: MockFn): readonly unknown[][] => asNodeMock(mockFn).mock.calls.map((call) => call.arguments),
  reset: (mockFn: MockFn): void => asNodeMock(mockFn).mock.resetCalls(),
};
