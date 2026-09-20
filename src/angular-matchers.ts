/**
 * `vitest-auto-spy/angular/matchers` — the optional `expect` matcher registrars.
 *
 * ```ts
 * // vitest.setup.ts
 * import { registerDirectiveMatchers, registerResourceMatchers, registerSignalMatchers } from 'vitest-auto-spy/angular/matchers';
 * ```
 *
 * A companion to `vitest-auto-spy/angular`, under the same rule as `/angular-http`: a narrow entry
 * for helpers a suite registers once in its setup file rather than imports from every spec. They
 * left `/angular` in 6.0 so that importing spies does not evaluate matcher code the project never
 * registers.
 *
 * Each registrar augments the runner's `expect` on its own; register the one a suite wants and
 * leave the other two out.
 */
// Before the matcher modules: `@angular/platform-browser` (the `By` of `registerDirectiveMatchers`)
// JIT-compiles `PlatformLocation` while it loads, and unlike `/angular` nothing earlier in this
// entry's graph has pulled the compiler in yet — the same order `bun-angular` keeps.
import '@angular/compiler';

export { registerDirectiveMatchers } from './lib/directive-matchers';
export { registerResourceMatchers, type ResourceLike } from './lib/resource-matchers';
export { registerSignalMatchers, type SignalLike } from './lib/signal-matchers';
