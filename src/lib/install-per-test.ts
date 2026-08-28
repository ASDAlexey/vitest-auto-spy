/**
 * Re-install a stub before every test in the block that declares it.
 *
 * Every stub in this library is taken off again by `restoreMockedProps()` after each test — that is
 * what keeps it from leaking into the next file under `isolate: false`. The consequence is easy to
 * miss: a stub installed once at `describe` level, or in a `beforeAll`, is gone from the second
 * test on, and what fails is an assertion about the component ("expected 2 calls, got 0") with the
 * stub sitting ten lines above it, apparently in force.
 *
 * The second half of the same problem comes from the other direction. A project-wide setup file
 * installs default observers in a root `beforeEach`, and root hooks run *before* the file's own —
 * so a `beforeAll` in a spec loses to them silently, while a `beforeEach` in the same spec wins.
 * That ordering is a rule nobody can be expected to derive from a failing assertion.
 *
 * ```ts
 * const observers = installPerTest(() => stubIntersectionObserver({ autoEmit: true }));
 *
 * it('loads the section once it scrolls into view', () => {
 *   fixture.detectChanges();
 *   expect(observers().last.targets).toEqual([host]);
 * });
 * ```
 *
 * It lives in `vitest-auto-spy/setup` rather than the main entry because it registers a runner
 * hook, and the core has to stay importable from Bun and `node:test` without pulling Vitest in.
 */
import { beforeEach } from 'vitest';

/** Reads the handle belonging to the current test. */
export type PerTestHandle<T> = () => T;

/**
 * Run `install` before every test of the enclosing block, and hand back a reader for its result.
 *
 * A reader rather than the handle itself, because the handle is a *different object* each test —
 * a stub installed for the previous test is exactly what must not still be reachable. Calling the
 * reader outside a test says so, instead of returning a stale one.
 *
 * @param install Builds the stub. Anything the library installs works: `stubIntersectionObserver`,
 *   `stubMediaElement`, `stubAbortController`, `stubConstructor`, a `createSpyFromClass` fixture.
 */
export function installPerTest<T>(install: () => T): PerTestHandle<T> {
  let current: { value: T } | undefined;

  beforeEach(() => {
    current = { value: install() };
  });

  return () => {
    if (!current) {
      throw new Error(
        '[vitest-auto-spy] installPerTest: nothing is installed yet. Call the handle inside a test (or in a hook that ' +
          'runs after the one this registered) — at `describe` body time the stub for the first test does not exist yet.',
      );
    }

    return current.value;
  };
}
