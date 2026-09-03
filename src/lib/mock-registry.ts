/**
 * Keeping `@vitest/spy`'s registry of every mock ever created from growing for the whole run.
 *
 * `vi.fn()` and `vi.spyOn()` add the mock they create to one module-level `Set` inside
 * `@vitest/spy`, because that is what `vi.clearAllMocks()` walks. With `isolate: true` the module is
 * re-evaluated per file and the set starts empty every time. With `isolate: false` it is evaluated
 * once per worker and only ever grows: every mock of every file stays in it, and so does everything
 * the mock closes over — its recorded arguments, and through them whole component trees. Two things
 * follow, and a large suite feels both:
 *
 *  - `clearMocks: true` walks the entire accumulated set **before every single test**, so the cost
 *    of clearing grows with the number of tests already run.
 *  - the worker's heap holds every mock of the run at once.
 *
 * There is no API for that set. It is taken from the one thing that iterates it: `Set.forEach`
 * passes the set to its callback as the third argument, so calling `vi.clearAllMocks()` under a
 * briefly patched `Set.prototype.forEach` hands it over. The capture is verified against a probe
 * mock, and without a match nothing is pruned — a slower run beats a broken one.
 *
 * **What must not be pruned, and the reason this module exists at all.** Dropping a mock from the
 * registry means `vi.clearAllMocks()` and `clearMocks: true` can no longer see it, so its calls
 * accumulate silently. That is harmless for a mock that dies with the file that made it, and a bug
 * for one that outlives it — the module-level `vi.fn()` in a shared `__mocks__/some.mock.ts` that
 * six spec files import. The first file to import it creates it, a naive prune drops it when that
 * file ends, and every later file then sees calls left behind by its predecessors. It fails as an
 * assertion in whichever file happens to run second and reads as flakiness, because which file is
 * first depends on how the runner ordered them.
 *
 * The split is drawn where it is observable: a mock that exists when the file's hooks start was
 * created while the module graph was being evaluated, which is exactly what "lives in a module"
 * means, and it is kept. Everything created afterwards belongs to a test or a hook of that file and
 * is pruned when the file ends. A mock created at module scope by a dynamic `import()` inside a
 * test lands on the wrong side of that line — {@link keepMockRegistered} is the way to say so.
 *
 * **The other half of keeping a mock registered, and why it needs guarding.** Registered means
 * reachable, and `vi.clearAllMocks()` is not the only thing that walks the set: `vi.resetAllMocks()`
 * walks the same one and calls `mockReset()` on everything in it. `mockReset` puts an implementation
 * back only if it was passed to `vi.fn(implementation)` — a `vi.fn()` that got its behaviour from a
 * chained `.mockReturnValue(…)` or `.mockReturnThis()` is left answering `undefined`
 * (`@vitest/spy`: `resetToMockImplementation ? mockImplementation : undefined`). Under
 * `isolate: false` that is a cross-file failure with nothing to point at: one spec calls
 * `vi.resetAllMocks()` in its own `afterEach`, and a *different* file later in the same worker dies
 * inside application code because a shared double now answers `undefined`. It reads as a bug in the
 * component, it moves whenever the runner reorders files, and it never reproduces on the file that
 * caused it. `vi.restoreAllMocks()` does not do this — in Vitest 4 it walks `MOCK_RESTORE`, which
 * only `vi.spyOn` writes to — so a probe built around `restoreAllMocks` shows nothing, and that
 * asymmetry is what sends the search in the wrong direction.
 *
 * So the implementation a long-lived mock carries when it is first classified is remembered, and
 * {@link restoreLongLivedImplementations} puts it back before a test that would otherwise start
 * without it. Only when it has gone missing: a mock a spec deliberately re-implements is left alone,
 * and a mock that never carried an implementation is never touched. The hook is `beforeEach`,
 * because Vitest applies `restoreMocks`/`mockReset`/`clearMocks` from `onBeforeTryTask`, which runs
 * *before* the `beforeEach` hooks rather than after them.
 */
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';

import { SWEEP_SENTINEL } from './constants';

/** The registry, once captured. `undefined` until {@link captureMockRegistry} has run, and after a failed capture. */
let registry: Set<unknown> | undefined;

/** Whether a capture was already attempted — a failed one must not be retried per file. */
let captureAttempted = false;

/**
 * Mocks that outlive the file that created them.
 *
 * A `WeakSet`: membership is all this needs, and a strong set would hold on to every module-level
 * mock of the run — the very thing the pruning is here to avoid.
 */
let longLived = new WeakSet<object>();

/**
 * A mock's implementation, as this module has to hand it back.
 *
 * `never[]` parameters: the value travels from `getMockImplementation()` straight into
 * `mockImplementation()` without ever being called here, and `never[]` is the one parameter list
 * every concrete signature is assignable to.
 */
type MockImplementation = (...args: never[]) => unknown;

/**
 * The two methods this module needs to keep a shared implementation alive, declared structurally.
 *
 * Method syntax, deliberately: its parameters are compared bivariantly, which is what lets a real
 * `Mock<…>` — whatever its own signature — satisfy this with no assertion anywhere.
 */
interface MockWithImplementation {
  getMockImplementation(): unknown;
  mockImplementation(implementation: MockImplementation): unknown;
}

/** A long-lived mock next to the implementation it carried when it was first classified. */
interface RememberedImplementation {
  readonly mock: MockWithImplementation;
  readonly implementation: MockImplementation;
}

/**
 * The long-lived mocks that carry an implementation, so the restore walks a handful rather than the
 * whole registry before every test.
 *
 * Strong references, unlike {@link longLived}, and that costs nothing: everything in here is also in
 * the registry, which is a strong `Set` that keeps it for the worker's life either way.
 */
let rememberedImplementations: RememberedImplementation[] = [];

/** The mocks already considered, so re-marking the same one every file stays a `WeakSet` lookup. */
let implementationsChecked = new WeakSet<object>();

/**
 * Whether this is the mock that carries the library's own sweep — the one entry pruning must leave
 * alone, because dropping it turns `vi.clearAllMocks()` into a silent no-op for every spy this
 * library built. See {@link SWEEP_SENTINEL}.
 */
function isSweepSentinel(mock: unknown): boolean {
  return (typeof mock === 'function' || (typeof mock === 'object' && mock !== null)) && SWEEP_SENTINEL in mock;
}

/** Whether a value can be a `WeakSet` key, which every mock is (they are functions). */
function isWeakKey(value: unknown): value is object {
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
}

/** Whether a value can be handed back to `mockImplementation`. */
function isMockImplementation(value: unknown): value is MockImplementation {
  return typeof value === 'function';
}

/** Whether a registry entry exposes the pair of methods {@link restoreLongLivedImplementations} uses. */
function hasImplementationControls(value: object): value is MockWithImplementation {
  const getter: unknown = Reflect.get(value, 'getMockImplementation');
  const setter: unknown = Reflect.get(value, 'mockImplementation');

  return typeof getter === 'function' && typeof setter === 'function';
}

/**
 * Remember what `mock` answers with, the first time it is classified as long-lived.
 *
 * First time only: the snapshot is meant to be the implementation the module graph installed, not
 * whatever the file running at the moment happens to have left on it.
 */
function rememberImplementation(mock: object): void {
  if (implementationsChecked.has(mock)) {
    return;
  }

  implementationsChecked.add(mock);

  if (!hasImplementationControls(mock)) {
    return;
  }

  const implementation: unknown = mock.getMockImplementation();

  if (isMockImplementation(implementation)) {
    rememberedImplementations.push({ mock, implementation });
  }
}

/**
 * Capture `@vitest/spy`'s mock registry, or return `undefined` if this runner does not expose one
 * the probe can confirm.
 *
 * Called once per worker: a second call hands back the first result, including a failed one.
 *
 * The capture clears every mock's recorded calls as a side effect, because `vi.clearAllMocks()` is
 * what makes the set iterate. That is why {@link trackMockRegistry} does it in `beforeAll`, where
 * no test has recorded anything yet.
 */
export function captureMockRegistry(): Set<unknown> | undefined {
  if (captureAttempted) {
    return registry;
  }

  captureAttempted = true;

  const probe = vi.fn();
  const originalForEach = Set.prototype.forEach;
  let captured: Set<unknown> | undefined;

  // `this` is handed to `remember` rather than read into a local: the first set `forEach` is called
  // on during the clear is the registry, and that is the only thing worth keeping from the patch.
  const remember = (set: Set<unknown>): void => {
    captured ??= set;
  };

  Set.prototype.forEach = function patchedForEach(this: Set<unknown>, ...args: Parameters<typeof originalForEach>): void {
    remember(this);
    originalForEach.apply(this, args);
  };

  try {
    vi.clearAllMocks();
  } finally {
    Set.prototype.forEach = originalForEach;
  }

  if (!captured?.has(probe)) {
    return undefined;
  }

  captured.delete(probe);
  registry = captured;

  return registry;
}

/**
 * Mark `mock` as one that outlives the file it was created in, so pruning never drops it.
 *
 * Needed only for a mock created inside a test or a hook and then shared with later files — a
 * module loaded by a dynamic `import()` in a test, or a fixture cached in a module-level variable
 * on first use. A `vi.fn()` at the top level of a module is kept without being told.
 *
 * @example
 * ```ts
 * // fixtures/navigation.mock.ts — imported by six spec files
 * export const navigation = { setFocus: keepMockRegistered(vi.fn()) };
 * ```
 */
export function keepMockRegistered<T>(mock: T): T {
  if (isWeakKey(mock)) {
    longLived.add(mock);
    rememberImplementation(mock);
  }

  return mock;
}

/**
 * Put back the implementation of every long-lived mock that has lost one, and report how many.
 *
 * The repair for a `vi.resetAllMocks()` — or a `mockReset: true` — reaching across files: it walks
 * only the mocks that carried an implementation when they were classified, and only replaces one
 * that is now missing, so a mock a test deliberately re-implements is left as the test left it.
 *
 * Installed on `beforeEach` by {@link trackMockRegistry}; call it directly to repair at some other
 * moment.
 */
export function restoreLongLivedImplementations(): number {
  let restored = 0;

  for (const remembered of rememberedImplementations) {
    if (remembered.mock.getMockImplementation() === undefined) {
      remembered.mock.mockImplementation(remembered.implementation);
      restored += 1;
    }
  }

  return restored;
}

/**
 * Mark everything currently in the registry as long-lived.
 *
 * Run at the start of a file, this is the whole classification: what exists now was created while
 * the modules were being evaluated, and everything added afterwards belongs to this file.
 */
export function keepRegisteredMocks(): void {
  registry?.forEach((mock) => {
    keepMockRegistered(mock);
  });
}

/**
 * Drop every mock that is not marked long-lived from the registry, and report how many went.
 *
 * Safe to call without a capture, and safe to call twice — the second call finds nothing to do.
 */
export function pruneMockRegistry(): number {
  if (!registry) {
    return 0;
  }

  let pruned = 0;

  for (const mock of registry) {
    if (isSweepSentinel(mock)) {
      continue;
    }

    if (!isWeakKey(mock) || !longLived.has(mock)) {
      registry.delete(mock);
      pruned += 1;
    }
  }

  return pruned;
}

/**
 * Keep the registry to the mocks that outlive a file: capture it, mark what each file inherits, and
 * prune what the file added once it is over.
 *
 * ```ts
 * // vitest.setup.ts
 * import { trackMockRegistry } from 'vitest-auto-spy/setup';
 *
 * trackMockRegistry();
 * ```
 *
 * This is what `setupAutoSpy({ pruneMockRegistry: true })` installs; call it directly to have it
 * without the rest.
 */
export function trackMockRegistry(): void {
  beforeAll(() => {
    captureMockRegistry();
    keepRegisteredMocks();
  });

  beforeEach(() => {
    restoreLongLivedImplementations();
  });

  afterAll(() => {
    pruneMockRegistry();
  });
}

/** How many mocks the registry holds, or `undefined` if it was never captured. For diagnostics. */
export function getMockRegistrySize(): number | undefined {
  return registry?.size;
}

/**
 * Forget the capture and every long-lived mark.
 *
 * A worker never needs this — the registry it captured is the one it keeps. This module's own spec
 * does, because it has to exercise both a successful and a failed capture in one process.
 */
export function resetMockRegistryTracking(): void {
  registry = undefined;
  captureAttempted = false;
  longLived = new WeakSet<object>();
  rememberedImplementations = [];
  implementationsChecked = new WeakSet<object>();
}
