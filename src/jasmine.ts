/**
 * `vitest-auto-spy/jasmine` — the drop-in surface for a suite coming from `jasmine-auto-spies`.
 *
 * ```ts
 * // before
 * import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
 * // after
 * import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
 * ```
 *
 * Importing this entry does two things: it registers the Vitest mock adapter (so the entry works on
 * its own, without also importing the core), and it installs the `.and`, `.calls` and `.withArgs`
 * namespaces on every spy built afterwards. Those three are the whole reason a jasmine suite cannot
 * simply point at `vitest-auto-spy`: upstream puts every async helper behind `.and`
 * (`spy.load.and.nextWith(…)`), because that is where jasmine's own spy strategies live.
 *
 * **On Bun or `node:test`**, import `enableJasmineCompat` from `vitest-auto-spy/bun` or
 * `vitest-auto-spy/node` instead and call it once in your setup — this entry pulls in Vitest, which
 * those runtimes cannot load.
 *
 * **Observables** still come from `vitest-auto-spy/rxjs`, imported once as usual; this entry adds no
 * rxjs of its own, and `createObservableWithValues` is exported from there.
 *
 * This is a bridge, not a destination. Everything it adds is a rename away from the library's own
 * API — `.and.returnValue(x)` is `.mockReturnValue(x)`, `.and.nextWith(x)` is `.nextWith(x)`,
 * `.calls.count()` is `.mock.calls.length` — and `npx vitest-auto-spy codemod --from jasmine` does
 * the renaming. Land the suite green first, then run the codemod and drop this import.
 */
import { enableJasmineCompat } from './lib/enable-jasmine';
import { useVitestAdapter } from './lib/use-vitest-adapter';

useVitestAdapter();
enableJasmineCompat();

export { createFunctionSpy, createSpyFromClass, createSpyObj, provideAutoSpy } from './lib/jasmine-factories';
export type { AngularValueProvider, JasmineClassSpyConfiguration, SpyObj } from './lib/jasmine-factories';

export { enableJasmineCompat } from './lib/enable-jasmine';

/**
 * The eight asymmetric matchers jasmine has and Vitest does not — `truthy`, `falsy`, `empty`,
 * `notEmpty`, `is`, `mapContaining`, `setContaining`, `arrayWithExactContents`. Call it once in your
 * setup file; it is not installed by importing this entry, because `expect.extend` is global and
 * permanent.
 */
export { registerJasmineMatchers } from './lib/jasmine-matchers';

/**
 * The `jasmine` global, as an import — `jasmine.objectContaining`, `jasmine.any`,
 * `jasmine.createSpyObj`, `jasmine.clock()`, the eight orphan matchers, and the rest.
 *
 * ```ts
 * import { jasmine } from 'vitest-auto-spy/jasmine';
 * ```
 *
 * One line per file makes a jasmine spec run under Vitest unchanged; the codemod deletes it again
 * once the calls have been rewritten to their `expect.*` / `vi.*` equivalents.
 */
export { jasmine, type JasmineClock } from './lib/jasmine-global';

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

/**
 * `Spy<T>` under the name a migrating suite already imports.
 *
 * The same object the core `Spy<T>` describes, plus `.and` / `.calls` / `.withArgs` on every method
 * — and, unlike the `Spy<T>` it replaces, it does not require `@types/jasmine` to typecheck.
 */
export type { JasmineSpy as Spy } from './lib/jasmine-types';

// The configuration keys are shared with the core, so a `ClassSpyConfiguration<T>` written for
// `jasmine-auto-spies` compiles unchanged — `providedMethodNames` included, via
// `JasmineClassSpyConfiguration`.
export type { ClassSpyConfiguration, ClassType, OnlyMethodKeysOf, OnlyObservablePropsOf, OnlyPropsOf } from './lib/types';
