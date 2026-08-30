/**
 * Make a library helper's failure point at the *caller's* line.
 *
 * Every throw site in this package has the same defect: the frame the runner reports is the one
 * inside `node_modules/vitest-auto-spy`, not the spec line that called it. The message is right,
 * the location is useless — and a location inside a dependency is exactly the wrong invitation,
 * because the first thing both a person and an agent do with it is open that file.
 *
 * Vitest 4.1 added `vi.defineHelper(fn)` for this: it returns `fn` wrapped in a function literally
 * named `__VITEST_HELPER__`, and the stack-trace parser drops every frame up to and including the
 * last one with that name. Nothing else changes — same arguments, same return value, same `this`.
 *
 * It is found on the runtime rather than imported, for two reasons. The core is shared with the
 * `bun:test` and `node:test` entries, where importing `vitest` would not resolve at all; and even
 * on Vitest the version that ships `defineHelper` is 4.1, so an unconditional import would make an
 * older Vitest a hard failure instead of a missing nicety. `__vitest_index__` is the module
 * namespace Vitest installs on `globalThis` while setting up the test environment — before any
 * setup file or spec is evaluated — and it is there whether or not `globals` is enabled, which the
 * `vi` global is not.
 *
 * When nothing answers the probe (Bun, `node:test`, Vitest < 4.1, or a plain Node import of the
 * package outside a test run) this degrades to the identity function: the helper is returned
 * untouched, with no wrapper frame of its own to make the stack worse.
 */
import type { Func } from './types';

/** The shape of `vi.defineHelper`: a function in, the same function out. */
type HelperDefiner = <F extends Func>(fn: F) => F;

/** `defineHelper` off a candidate `vi`-like object, or `undefined` when it is not there. */
function readDefiner(candidate: unknown): HelperDefiner | undefined {
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }

  const define: unknown = Reflect.get(candidate, 'defineHelper');

  if (typeof define !== 'function') {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the runtime can only tell us that `defineHelper` is callable; its generic identity signature is Vitest's published contract for the name, and getting it wrong costs a stack frame, never correctness.
  return define as HelperDefiner;
}

/**
 * The active runner's `vi.defineHelper`, probed off a host object so no entry imports `vitest`.
 *
 * Internal — no public entry re-exports it. It takes the host rather than reading `globalThis`
 * itself because Vitest installs `__vitest_index__` as a *non-configurable* property, so a spec
 * cannot swap it to exercise the runtimes that have no definer.
 */
export function findHelperDefiner(host: object): HelperDefiner | undefined {
  const index: unknown = Reflect.get(host, '__vitest_index__');
  const namespace = typeof index === 'object' && index !== null ? Reflect.get(index, 'vi') : undefined;

  return readDefiner(namespace);
}

/**
 * Apply a definer, or hand the helper back untouched when there is none.
 *
 * Internal, and split out for the same reason as {@link findHelperDefiner}: inside a Vitest run the
 * definer is always found, so the fallback this package ships to Bun and `node:test` has no other
 * way to be executed by a test.
 */
export function applyHelperDefiner<F extends Func>(define: HelperDefiner | undefined, helper: F): F {
  return define ? define(helper) : helper;
}

/**
 * Wrap `helper` so a throw inside it is reported at the line that called it.
 *
 * ```ts
 * export const assertSomething = defineHelper((value: unknown): void => {
 *   throw new Error('…');
 * });
 * ```
 *
 * Wrap once, at the exported entry point — wrapping an inner function only moves the useless frame
 * one level down.
 */
export function defineHelper<F extends Func>(helper: F): F {
  return applyHelperDefiner(findHelperDefiner(globalThis), helper);
}
