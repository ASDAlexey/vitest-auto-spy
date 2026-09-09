/**
 * `vitest-auto-spy/rstest` — run the framework-agnostic core on Rstest.
 *
 * ```ts
 * import { createSpyFromClass } from 'vitest-auto-spy/rstest';
 * ```
 *
 * Importing this entry registers the Rstest mock adapter instead of the default
 * Vitest one, then re-exports the exact same public API. The auto-spy helpers
 * (`calledWith`, `resolveWith`, …) work unchanged; native mock methods are
 * Rstest's (`spy.method.mock.calls`, `mockReturnValue`, …).
 */
import { type Mock, rstest } from '@rstest/core';

import { registerMockAdapter } from './lib/mock-adapter';
import { createRstestMockAdapter } from './lib/rstest-adapter';

registerMockAdapter(
  createRstestMockAdapter({
    fn: (implementation) => rstest.fn(implementation),
    spyOn: (target, property, accessType) =>
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `rstest.spyOn`'s key parameter is typed against the static object shape, but `property` is only known at runtime; the downcast to the callable `Mock` is safe because every accessor spy is one.
      rstest.spyOn(target as Record<string, unknown>, property as never, accessType) as Mock,
  }),
);

export * from './auto-spy';
