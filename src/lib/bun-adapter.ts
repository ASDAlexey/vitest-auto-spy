/**
 * The Bun (`bun:test`) {@link MockAdapter}, built as a factory.
 *
 * `bun:test` only exists inside the Bun runtime, so — unlike the Vitest and
 * `node:test` adapters — this module never imports it. The `vitest-auto-spy/bun`
 * entry supplies the real `bun:test` primitives via {@link createBunMockAdapter},
 * which also keeps the factory unit-testable with a stub off Bun.
 *
 * Bun's `mock()` is Jest-compatible (bare-array `mock.calls`, `mockReset`), so
 * `getCalls` / `reset` map straight through; accessor spies reuse the shared
 * redefine helper.
 */
import type { MockAdapter, MockFn } from './mock-adapter';
import { spyOnAccessorByRedefine } from './redefine-accessor-spy';
import type { Func } from './types';

/** A Bun (`bun:test`) mock function — the surface this adapter relies on. */
export interface BunMock {
  (...args: unknown[]): unknown;
  /** Present on Bun mocks; named for diagnostics when available. */
  mockName?: (name: string) => void;
  mockReset: () => void;
  mock: { calls: unknown[][] };
}

/** The slice of `bun:test` the Bun entry injects. */
export interface BunTestApi {
  mock: (implementation?: Func) => BunMock;
}

/** View a runtime-agnostic {@link MockFn} as the concrete Bun mock it actually is here. */
function asBunMock(mockFn: MockFn): BunMock {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- every `MockFn` this adapter hands out is a `bun:test` `mock()`; reading its `mock.calls` / resetting narrows the bare callable back to the concrete mock.
  return mockFn as any;
}

/** Build a Bun {@link MockAdapter} from the runtime's `bun:test` primitives. */
export function createBunMockAdapter(bun: BunTestApi): MockAdapter {
  const createMockFn = (implementation?: Func, name?: string): MockFn => {
    const mockFn = bun.mock(implementation ?? ((): void => undefined));

    if (name !== undefined && mockFn.mockName) {
      mockFn.mockName(name);
    }

    return mockFn;
  };

  return {
    createMockFn,
    spyOnGetter: (target: object, property: string): MockFn => spyOnAccessorByRedefine(createMockFn, target, property, 'get'),
    spyOnSetter: (target: object, property: string): MockFn => spyOnAccessorByRedefine(createMockFn, target, property, 'set'),
    getCalls: (mockFn: MockFn): readonly unknown[][] => asBunMock(mockFn).mock.calls,
    reset: (mockFn: MockFn): void => asBunMock(mockFn).mockReset(),
  };
}
