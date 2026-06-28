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
 *
 * `node:test` is a Node built-in that Vitest cannot bundle, so it is imported
 * only here (this entry never runs under Vitest) and injected into the adapter
 * factory — mirroring how the Bun entry injects `bun:test`.
 */
import { mock } from 'node:test';

import { registerMockAdapter } from './lib/mock-adapter';
import { createNodeMockAdapter } from './lib/node-adapter';

registerMockAdapter(createNodeMockAdapter(mock));

export * from './auto-spy';
