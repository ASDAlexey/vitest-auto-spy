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
 *
 * The tracker the adapter is built on is resolved per call rather than captured,
 * so `trackNodeMocks()` can move spies onto a `MockTracker` this library owns
 * long after the adapter was built — see {@link createSwappableNodeTracker}.
 * Nothing changes until a suite asks for it.
 */
import { afterEach, mock } from 'node:test';

import { registerMockAdapter } from './lib/mock-adapter';
import { createNodeMockAdapter } from './lib/node-adapter';
import { createSwappableNodeTracker } from './lib/node-mock-tracker';

registerMockAdapter(createNodeMockAdapter(createSwappableNodeTracker({ mock, afterEach })));

export * from './auto-spy';
export { countNodeMocks, pruneNodeMocks, trackNodeMocks, type StopTrackingNodeMocks } from './lib/node-mock-tracker';
