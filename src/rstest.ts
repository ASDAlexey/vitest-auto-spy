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
import { rstest } from '@rstest/core';

import { registerMockAdapter } from './lib/mock-adapter';
import { createRstestMockAdapter } from './lib/rstest-adapter';

registerMockAdapter(createRstestMockAdapter({ fn: (implementation) => rstest.fn(implementation) }));

export * from './auto-spy';
