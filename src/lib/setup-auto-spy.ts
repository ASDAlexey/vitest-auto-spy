/**
 * `setupAutoSpy()` — the single line a project's Vitest setup file needs.
 *
 * Three pieces of hygiene are easy to get wrong and expensive to diagnose, and every project that
 * adopts this library ends up assembling them by hand:
 *
 *  1. **`restoreMockedProps()` after each test.** `vi.restoreAllMocks()` knows about spies, not
 *     about properties `mockReadonlyProp` / `mockValueProp` redefined. Under `isolate: false` an
 *     un-restored patch on a global, a prototype or a singleton leaks straight into the next file.
 *  2. **One copy of the library in the tree.** Two installs keep two sets of console spies and
 *     registries, and the failure reads as "tests fail depending on order".
 *  3. **Draining the runner's restore registry.** Every `vi.spyOn` adds an entry that only
 *     `vi.restoreAllMocks()` removes; with a shared environment that list grows for the whole run.
 */
import { afterEach, vi } from 'vitest';

import { describeDuplicateCopies } from './package-identity';
import { restoreMockedProps } from './prop-mock';

/** How `setupAutoSpy` should react to more than one install of the library. */
export type DuplicateCopiesReaction = 'off' | 'throw' | 'warn';

/** Options for {@link setupAutoSpy}. */
export interface SetupAutoSpyOptions {
  /** React to a duplicated install. Default `'throw'` — the failure it prevents is far worse than a loud start. */
  duplicateCopies?: DuplicateCopiesReaction;
  /** Undo `mock*Prop` patches after every test. Default `true`. */
  restoreProps?: boolean;
  /**
   * Call `vi.restoreAllMocks()` after every test. Default `false`, because it also drops `vi.spyOn`
   * stubs a suite may have installed in `beforeAll`. Turn it on when running with `isolate: false`,
   * where the runner's restore registry otherwise grows for the entire run.
   */
  restoreMocks?: boolean;
}

function reportDuplicateCopies(reaction: DuplicateCopiesReaction): void {
  if (reaction === 'off') {
    return;
  }

  const report = describeDuplicateCopies();

  if (!report) {
    return;
  }

  if (reaction === 'throw') {
    throw new Error(report);
  }

  // eslint-disable-next-line no-console -- the whole point of `'warn'` is to surface the report without failing the run.
  console.warn(report);
}

/**
 * Install the library's test-run hygiene.
 *
 * ```ts
 * // vitest.setup.ts
 * import { setupAutoSpy } from 'vitest-auto-spy/setup';
 *
 * setupAutoSpy();
 * ```
 */
export function setupAutoSpy(options: SetupAutoSpyOptions = {}): void {
  reportDuplicateCopies(options.duplicateCopies ?? 'throw');

  if (options.restoreProps ?? true) {
    afterEach(restoreMockedProps);
  }

  if (options.restoreMocks ?? false) {
    afterEach(() => {
      vi.restoreAllMocks();
    });
  }
}
