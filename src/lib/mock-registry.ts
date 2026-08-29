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
 */
import { afterAll, beforeAll, vi } from 'vitest';

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

/** Whether a value can be a `WeakSet` key, which every mock is (they are functions). */
function isWeakKey(value: unknown): value is object {
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
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
  }

  return mock;
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
}
