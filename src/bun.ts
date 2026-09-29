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
import * as bunTest from 'bun:test';

import { createBunMockAdapter } from './lib/bun-adapter';
import { registerMockAdapter } from './lib/mock-adapter';
import { registerRunnerHooks } from './lib/runner-hooks';

const { afterEach, beforeEach, mock, onTestFinished } = bunTest;

registerMockAdapter(createBunMockAdapter({ mock }));
// Off the namespace: on a Bun without `onTestFinished` a named import fails to link.
registerRunnerHooks(onTestFinished ? { beforeEach, afterEach, onTestFinished } : { beforeEach, afterEach });

export * from './auto-spy';
export {
  createNestUnit,
  type CreateNestUnitOptions,
  type NestUnit,
  type NestUnitClass,
  type NestUnitProvider,
  type NestUnitSpies,
} from './lib/nest-unit';
