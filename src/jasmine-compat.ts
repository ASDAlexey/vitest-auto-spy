/**
 * `vitest-auto-spy/jasmine-compat` — the `.and` / `.calls` / `.withArgs` layer, without a runner.
 *
 * `vitest-auto-spy/jasmine` is the entry a Vitest suite wants: it registers the Vitest adapter, so
 * the import swap is the whole migration step. That is exactly what makes it unusable on Bun and
 * `node:test`, which cannot load `vitest` — and it is why this entry exists rather than a re-export
 * from `…/bun` and `…/node`.
 *
 * The re-export was the first shape, and it was wrong for a reason worth recording: `/bun` and
 * `/node` are ordinary entries, so anything they export lands in the chunk **every** entry shares.
 * Re-exporting the compatibility layer from them put its ~5.5 kB into `vitest-auto-spy`,
 * `…/nestjs`, `…/console` and `…/setup` as well, for consumers who had never heard of jasmine.
 * A separate entry costs the people who ask for it and nobody else.
 *
 * ```ts
 * // bun test / node --test, once in the setup file
 * import { enableJasmineCompat } from 'vitest-auto-spy/jasmine-compat';
 *
 * enableJasmineCompat();
 * ```
 *
 * Import the runtime's own entry (`vitest-auto-spy/bun`, `…/node`) as usual for the spies
 * themselves — this one registers no adapter and deliberately has no opinion about the runner.
 */
export { enableJasmineCompat } from './lib/enable-jasmine';

export type {
  JasmineAccessorSpies,
  JasmineAccessorSpy,
  JasmineAnd,
  JasmineCallInfo,
  JasmineCalls,
  JasmineMethodSpy,
  JasmineNamespaces,
  JasmineSpy,
  JasmineStrategies,
  JasmineWithArgsAnd,
  JasmineWithArgsSync,
} from './lib/jasmine-types';
