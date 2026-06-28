/**
 * `vitest-auto-spy/nestjs` — optional NestJS `Test.createTestingModule` helpers.
 *
 * ```ts
 * import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/nestjs';
 * ```
 *
 * This entry is dependency-free: `@nestjs/common` / `@nestjs/testing` are
 * optional peers and are never imported. The core (`vitest-auto-spy`) stays
 * framework-agnostic and never references NestJS.
 */
import { registerMockAdapter } from './lib/mock-adapter';
import { vitestMockAdapter } from './lib/vitest-adapter';

// NestJS suites run on Vitest, and this entry may be imported without the core
// (`provideAutoSpy` builds spies on its own), so register the default adapter here too.
registerMockAdapter(vitestMockAdapter);

export { injectSpy, provideAutoSpy, type NestModuleRef, type NestValueProvider } from './lib/nestjs';
