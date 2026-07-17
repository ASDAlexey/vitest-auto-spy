/**
 * The default {@link MockAdapter}: Vitest's `vi.fn()` / `vi.spyOn()`.
 *
 * This is the only core module that imports `vitest`. It is pulled in solely by
 * the `vitest-auto-spy` (and `vitest-auto-spy/angular`) entries, which register
 * it on import — so a consumer that imports a different runtime entry never
 * pulls Vitest into their bundle.
 */
import { type Mock, vi } from 'vitest';

import type { MockAdapter, MockFn } from './mock-adapter';
import type { Func } from './types';

/** View a runtime-agnostic {@link MockFn} as the concrete Vitest mock it actually is here. */
function asVitestMock(mock: MockFn): Mock {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- every `MockFn` this adapter hands out is a `vi.fn()`; the registry type is intentionally runtime-agnostic, so reading `.mock`/resetting narrows the bare callable back to the concrete Vitest mock.
  return mock as any;
}

export const vitestMockAdapter: MockAdapter = {
  createMockFn(implementation?: Func, name?: string): MockFn {
    const mock = implementation ? vi.fn(implementation) : vi.fn();

    if (name !== undefined) {
      mock.mockName(name);
    }

    return mock;
  },

  spyOnGetter(target: object, property: string): MockFn {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `vi.spyOn`'s key parameter is typed against the static object shape, but `property` is only known at runtime; `as never` satisfies the accessor overload.
    return vi.spyOn(target as Record<string, unknown>, property as never, 'get');
  },

  spyOnSetter(target: object, property: string): MockFn {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see `spyOnGetter`: the key is a runtime-only string, narrowed via `as never` to satisfy `vi.spyOn`'s accessor overload.
    return vi.spyOn(target as Record<string, unknown>, property as never, 'set');
  },

  getCalls(mock: MockFn): readonly unknown[][] {
    return asVitestMock(mock).mock.calls;
  },

  reset(mock: MockFn): void {
    asVitestMock(mock).mockReset();
  },

  clear(mock: MockFn): void {
    asVitestMock(mock).mockClear();
  },
};
