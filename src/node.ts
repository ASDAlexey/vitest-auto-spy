/**
 * `vitest-auto-spy/node` — run the framework-agnostic core on `node:test`.
 *
 * ```ts
 * import { createSpyFromClass } from 'vitest-auto-spy/node';
 * ```
 *
 * Importing this entry registers the `node:test` mock adapter instead of the
 * default Vitest one, then re-exports the exact same public API. The auto-spy
 * helpers (`calledWith`, `resolveWith`, …) work unchanged; native mock methods
 * are `node:test`'s (`spy.method.mock.calls`, `mock.mockImplementation`).
 */
import { registerMockAdapter } from './lib/mock-adapter';
import { nodeMockAdapter } from './lib/node-adapter';

registerMockAdapter(nodeMockAdapter);

export * from './auto-spy';
