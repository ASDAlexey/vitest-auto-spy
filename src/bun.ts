/**
 * `vitest-auto-spy/bun` — run the framework-agnostic core on Bun's `bun:test`.
 *
 * ```ts
 * import { createSpyFromClass } from 'vitest-auto-spy/bun';
 * ```
 *
 * Importing this entry registers the Bun mock adapter instead of the default
 * Vitest one, then re-exports the exact same public API. The auto-spy helpers
 * (`calledWith`, `resolveWith`, …) work unchanged; native mock methods are
 * Bun's (`spy.method.mock.calls`, `mockReturnValue`, …).
 */
import { mock } from 'bun:test';

import { createBunMockAdapter } from './lib/bun-adapter';
import { registerMockAdapter } from './lib/mock-adapter';

registerMockAdapter(createBunMockAdapter({ mock }));

export * from './auto-spy';
