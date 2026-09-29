/**
 * `vitest-auto-spy/nestjs` — optional NestJS `Test.createTestingModule` helpers.
 *
 * ```ts
 * import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/nestjs';
 * ```
 *
 * This entry is dependency-free: `@nestjs/common` / `@nestjs/testing` are
 * optional peers and are never imported, and neither is `vitest` — on
 * `node:test`, Bun or Rstest it uses the adapter that runner's entry registered.
 * The core (`vitest-auto-spy`) stays framework-agnostic and never references NestJS.
 */
import { useRunnerAdapter } from './lib/vitest-runner-adapter';

// Never `useVitestAdapter()`: that imports `vitest`, and a Nest suite on `node --test` has none.
useRunnerAdapter();

export { injectSpy, provideAutoSpy, type NestModuleRef, type NestValueProvider } from './lib/nestjs';

// The unit built from the metadata Nest already emits — the answer to `@suites/unit`'s solitary and
// sociable models, reading `Reflect.getMetadata` structurally so `reflect-metadata` stays the
// consumer's dependency, as it already is for Nest itself.
export {
  createNestUnit,
  type CreateNestUnitOptions,
  type NestUnit,
  type NestUnitClass,
  type NestUnitProvider,
  type NestUnitSpies,
} from './lib/nest-unit';

// `{ provide, useFactory }` is valid in both frameworks (Angular's `deps` and Nest's `inject` are
// both optional), so the DI seam that records which collaborators an entry point asked for is one
// implementation exported from both entries rather than two that drift.
export { trackInjections, type InjectionLog, type TrackInjectionsOptions, type TrackedProvider } from './lib/track-injections';
