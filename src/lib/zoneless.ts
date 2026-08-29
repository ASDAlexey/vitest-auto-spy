/**
 * Zoneless waiting: one correct way to let Angular settle, instead of the three habits a zoneless
 * codebase accumulates.
 *
 * `fixture.detectChanges()` runs exactly one change-detection pass and does **not** flush pending
 * effects, so an assertion right after it reads state that has not finished computing. In a
 * zoneless app the state that matters is signal-derived, and effects are what push it forward.
 * {@link stable} does both, in the right order; {@link flushEffects} is the no-fixture half for
 * services, stores and `TestBed.runInInjectionContext` code.
 */
import { ApplicationRef } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { DOCS_LINKS, withDocs } from './docs-links';

/**
 * The real timers, captured at import time, for the same reason `expect-emission.ts` captures them:
 * a watchdog the code under test can stop is not a watchdog. `vi.useFakeTimers()` replaces
 * `setTimeout`, and a faked one never fires — the wait would then hang to the runner's own file
 * timeout, which is precisely the failure this timeout exists to replace.
 */
const setTimer: typeof setTimeout = globalThis.setTimeout.bind(globalThis);
const clearTimer: typeof clearTimeout = globalThis.clearTimeout.bind(globalThis);

/**
 * Run every pending effect and change-detection pass synchronously.
 *
 * Prefers `TestBed.tick()` (Angular ≥ 20), which also refreshes fixture views that were never
 * attached to the `ApplicationRef`; older versions fall back to `ApplicationRef.tick()`.
 *
 * @example
 * ```ts
 * store.filter.set('open');
 * flushEffects(); // the no-fixture half of `stable()` — services, stores, runInInjectionContext
 * ```
 */
export function flushEffects(): void {
  const testBed: { tick?: () => void } = TestBed;

  if (typeof testBed.tick === 'function') {
    testBed.tick();

    return;
  }

  TestBed.inject(ApplicationRef).tick();
}

/** Options for {@link stable}. */
export interface StableOptions {
  /**
   * Milliseconds to wait for the fixture before failing with the cause. Default `2000`.
   *
   * `0` disables the watchdog and restores the pre-v3.6.0 behaviour — an unbounded wait. There is
   * one reason to want that: a deliberately long real-timer test whose fixture legitimately stays
   * unstable for longer than the runner's own timeout allows anyway.
   */
  timeout?: number;
  /** Name used in the failure message instead of the generic "the fixture". */
  label?: string;
}

/**
 * Flush effects, then await the fixture — the zoneless replacement for `fixture.detectChanges()`.
 *
 * ```ts
 * component.filter.set('open');
 * await stable(fixture);
 * expect(component.visible()).toEqual([openTask]);
 * ```
 *
 * **The wait is bounded, and that is the whole of what the timeout buys.** A fixture that never
 * stabilises — an `HttpClient` request nothing flushed, a `PendingTasks` entry nothing completed, a
 * `setInterval` under real timers — used to hang here until Vitest reported a 5 s *file-level*
 * timeout naming neither the helper nor the fixture. That failure blames the file for the state of
 * one component. On expiry this throws the cause instead, and names the two things that produce it.
 *
 * Pass `{ label }` when a spec awaits more than one fixture, so the failure says which.
 */
export async function stable(fixture: ComponentFixture<unknown>, options: StableOptions = {}): Promise<void> {
  flushEffects();

  const timeout = options.timeout ?? 2000;

  if (timeout <= 0) {
    await fixture.whenStable();

    return;
  }

  // The handle is cleared on *both* paths: a watchdog left armed keeps the worker's event loop
  // alive past the test, which Vitest reports as a hanging process rather than as a leak here.
  let watchdog: ReturnType<typeof setTimer> | undefined = undefined;

  try {
    await Promise.race([
      fixture.whenStable(),
      new Promise<never>((_resolve, reject) => {
        watchdog = setTimer(() => reject(unstableError(timeout, options.label)), timeout);
      }),
    ]);
  } finally {
    clearTimer(watchdog);
  }
}

/** The failure `stable` throws on expiry — the cause, not "the test timed out". */
function unstableError(timeout: number, label: string | undefined): Error {
  const what = label ?? 'the fixture';

  return new Error(
    withDocs(
      `[vitest-auto-spy] stable: ${what} was still unstable after ${timeout} ms. ` +
        'A pending HttpClient request keeps a fixture unstable, and under `provideHttpClientTesting` only the spec can ' +
        'complete one — flush it before awaiting (`TestBed.inject(HttpTestingController).expectOne(url).flush(body)`), or ' +
        'use `settleResource()` if what you are waiting for is a resource. The other cause is a real timer: a `setInterval` ' +
        'or a long `setTimeout` the component started keeps Angular busy for as long as it runs, and `setupFakeTimers()` ' +
        'plus `advanceTimers()` is how a spec gets past that. Raise `{ timeout }` only once neither is true.',
      DOCS_LINKS.angular,
    ),
  );
}
