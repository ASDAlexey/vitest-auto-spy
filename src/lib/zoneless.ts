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

/**
 * Flush effects, then await the fixture — the zoneless replacement for `fixture.detectChanges()`.
 *
 * ```ts
 * component.filter.set('open');
 * await stable(fixture);
 * expect(component.visible()).toEqual([openTask]);
 * ```
 */
export async function stable(fixture: ComponentFixture<unknown>): Promise<void> {
  flushEffects();
  await fixture.whenStable();
}
